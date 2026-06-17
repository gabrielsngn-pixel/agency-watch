
-- 1. Add SLA columns to kanban_stage_notifications
ALTER TABLE public.kanban_stage_notifications
  ADD COLUMN IF NOT EXISTS sla_stage_days integer,
  ADD COLUMN IF NOT EXISTS sla_no_interaction_days integer,
  ADD COLUMN IF NOT EXISTS sla_template_name text NOT NULL DEFAULT 'kanban-sla-alert';

-- 2. Alert log (dedup)
CREATE TABLE IF NOT EXISTS public.kanban_sla_alert_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.real_estate_agencies(id) ON DELETE CASCADE,
  stage_key text NOT NULL,
  alert_type text NOT NULL CHECK (alert_type IN ('stage_idle','no_interaction')),
  anchor_at timestamptz NOT NULL,
  threshold_days integer NOT NULL,
  recipients text[] NOT NULL DEFAULT ARRAY[]::text[],
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency_id, stage_key, alert_type, anchor_at, threshold_days)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kanban_sla_alert_log TO authenticated;
GRANT ALL ON public.kanban_sla_alert_log TO service_role;
ALTER TABLE public.kanban_sla_alert_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read sla alert log" ON public.kanban_sla_alert_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Service role manages sla alert log" ON public.kanban_sla_alert_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_kanban_sla_alert_log_agency ON public.kanban_sla_alert_log (agency_id, sent_at DESC);

-- 3. Processor function
CREATE OR REPLACE FUNCTION public.process_kanban_sla_alerts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_cfg public.kanban_stage_notifications;
  v_recipients text[];
  v_consultant_email text;
  v_email text;
  v_payload jsonb;
  v_template_enabled boolean;
  v_anchor timestamptz;
  v_days integer;
  v_alert_type text;
  v_threshold integer;
  v_sent_count integer := 0;
  v_skipped integer := 0;
BEGIN
  FOR r IN
    SELECT a.*
    FROM public.real_estate_agencies a
    WHERE a.negotiation_status IS NOT NULL
  LOOP
    SELECT * INTO v_cfg
    FROM public.kanban_stage_notifications
    WHERE stage_key = r.negotiation_status::text;

    IF v_cfg IS NULL OR NOT v_cfg.enabled THEN CONTINUE; END IF;
    IF v_cfg.sla_stage_days IS NULL AND v_cfg.sla_no_interaction_days IS NULL THEN CONTINUE; END IF;

    SELECT COALESCE(enabled, true) INTO v_template_enabled
    FROM public.email_template_settings WHERE template_name = v_cfg.sla_template_name;
    IF v_template_enabled IS NOT NULL AND NOT v_template_enabled THEN CONTINUE; END IF;

    -- check each alert type
    FOR v_alert_type, v_threshold, v_anchor IN
      SELECT 'stage_idle', v_cfg.sla_stage_days, COALESCE(r.last_stage_change_at, r.created_at)
      WHERE v_cfg.sla_stage_days IS NOT NULL
      UNION ALL
      SELECT 'no_interaction', v_cfg.sla_no_interaction_days, COALESCE(r.last_interaction_date, r.created_at)
      WHERE v_cfg.sla_no_interaction_days IS NOT NULL
    LOOP
      v_days := EXTRACT(DAY FROM (now() - v_anchor))::integer;
      IF v_days < v_threshold THEN
        v_skipped := v_skipped + 1; CONTINUE;
      END IF;

      -- already alerted for this anchor?
      IF EXISTS (
        SELECT 1 FROM public.kanban_sla_alert_log
        WHERE agency_id = r.id
          AND stage_key = r.negotiation_status::text
          AND alert_type = v_alert_type
          AND anchor_at = v_anchor
          AND threshold_days = v_threshold
      ) THEN
        v_skipped := v_skipped + 1; CONTINUE;
      END IF;

      -- build recipients
      v_recipients := ARRAY[]::text[];

      IF v_cfg.notify_consultant AND COALESCE(r.notify_consultant_on_change, true) AND r.consultant_id IS NOT NULL THEN
        SELECT email INTO v_consultant_email FROM public.consultants WHERE id = r.consultant_id;
        IF v_consultant_email IS NOT NULL AND length(trim(v_consultant_email)) > 0 THEN
          v_recipients := array_append(v_recipients, v_consultant_email);
        END IF;
      END IF;

      IF v_cfg.notify_regional_director AND r.regional_director IS NOT NULL AND position('@' in r.regional_director) > 0 THEN
        v_recipients := array_append(v_recipients, r.regional_director);
      END IF;

      IF v_cfg.notify_admins THEN
        FOR v_email IN
          SELECT u.email FROM auth.users u
          JOIN public.user_roles ur ON ur.user_id = u.id
          WHERE ur.role = 'admin' AND u.email IS NOT NULL
        LOOP
          v_recipients := array_append(v_recipients, v_email);
        END LOOP;
      END IF;

      IF v_cfg.extra_emails IS NOT NULL THEN
        v_recipients := v_recipients || v_cfg.extra_emails;
      END IF;

      SELECT array_agg(DISTINCT e) INTO v_recipients
      FROM unnest(v_recipients) e
      WHERE e IS NOT NULL AND length(trim(e)) > 0;

      IF v_recipients IS NULL OR array_length(v_recipients,1) IS NULL THEN
        v_skipped := v_skipped + 1; CONTINUE;
      END IF;

      FOREACH v_email IN ARRAY v_recipients LOOP
        v_payload := jsonb_build_object(
          'template_name', v_cfg.sla_template_name,
          'recipient_email', v_email,
          'idempotency_key', 'sla-' || r.id || '-' || v_alert_type || '-' || extract(epoch from v_anchor)::bigint || '-' || v_threshold || '-' || md5(v_email),
          'template_data', jsonb_build_object(
            'agency_name', r.name,
            'agency_city', r.city,
            'agency_state', r.state,
            'stage', r.negotiation_status::text,
            'alert_type', v_alert_type,
            'days_idle', v_days,
            'threshold_days', v_threshold,
            'anchor_at', v_anchor,
            'agency_id', r.id
          )
        );
        PERFORM public.enqueue_email('transactional_emails', v_payload);
        v_sent_count := v_sent_count + 1;
      END LOOP;

      INSERT INTO public.kanban_sla_alert_log
        (agency_id, stage_key, alert_type, anchor_at, threshold_days, recipients)
      VALUES
        (r.id, r.negotiation_status::text, v_alert_type, v_anchor, v_threshold, v_recipients);
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('enqueued', v_sent_count, 'skipped', v_skipped, 'processed_at', now());
END;
$$;

REVOKE ALL ON FUNCTION public.process_kanban_sla_alerts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_kanban_sla_alerts() TO service_role;

-- 4. Schedule daily
DO $$
BEGIN
  PERFORM cron.unschedule('process-kanban-sla-alerts');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'process-kanban-sla-alerts',
  '0 13 * * *',
  $$ SELECT public.process_kanban_sla_alerts(); $$
);
