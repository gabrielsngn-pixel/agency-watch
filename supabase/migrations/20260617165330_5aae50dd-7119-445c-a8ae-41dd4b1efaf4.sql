
-- 1. Template settings
CREATE TABLE public.email_template_settings (
  template_name text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_template_settings TO authenticated;
GRANT ALL ON public.email_template_settings TO service_role;
ALTER TABLE public.email_template_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage email_template_settings" ON public.email_template_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_email_template_settings_updated_at
  BEFORE UPDATE ON public.email_template_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Kanban stage notifications
CREATE TABLE public.kanban_stage_notifications (
  stage_key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  template_name text NOT NULL DEFAULT 'kanban-stage-change',
  notify_consultant boolean NOT NULL DEFAULT true,
  notify_regional_director boolean NOT NULL DEFAULT false,
  notify_admins boolean NOT NULL DEFAULT false,
  extra_emails text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kanban_stage_notifications TO authenticated;
GRANT ALL ON public.kanban_stage_notifications TO service_role;
ALTER TABLE public.kanban_stage_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage kanban_stage_notifications" ON public.kanban_stage_notifications
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_kanban_stage_notifications_updated_at
  BEFORE UPDATE ON public.kanban_stage_notifications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Per-agency notify toggle
ALTER TABLE public.real_estate_agencies
  ADD COLUMN IF NOT EXISTS notify_consultant_on_change boolean NOT NULL DEFAULT true;

-- 4. Trigger function that enqueues an email when negotiation_status changes
CREATE OR REPLACE FUNCTION public.notify_stage_change_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfg  public.kanban_stage_notifications;
  v_consultant_email text;
  v_recipients text[] := ARRAY[]::text[];
  v_email text;
  v_payload jsonb;
  v_template_enabled boolean;
  v_actor_name text;
BEGIN
  IF NEW.negotiation_status IS NOT DISTINCT FROM OLD.negotiation_status THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_cfg
  FROM public.kanban_stage_notifications
  WHERE stage_key = NEW.negotiation_status::text;

  IF v_cfg IS NULL OR NOT v_cfg.enabled THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(enabled, true) INTO v_template_enabled
  FROM public.email_template_settings
  WHERE template_name = v_cfg.template_name;
  IF v_template_enabled IS NOT NULL AND NOT v_template_enabled THEN
    RETURN NEW;
  END IF;

  IF v_cfg.notify_consultant AND COALESCE(NEW.notify_consultant_on_change, true) AND NEW.consultant_id IS NOT NULL THEN
    SELECT email INTO v_consultant_email
    FROM public.consultants
    WHERE id = NEW.consultant_id;
    IF v_consultant_email IS NOT NULL AND length(trim(v_consultant_email)) > 0 THEN
      v_recipients := array_append(v_recipients, v_consultant_email);
    END IF;
  END IF;

  IF v_cfg.notify_regional_director AND NEW.regional_director IS NOT NULL THEN
    -- regional_director stores a name, not an email; skip unless email pattern
    IF position('@' in NEW.regional_director) > 0 THEN
      v_recipients := array_append(v_recipients, NEW.regional_director);
    END IF;
  END IF;

  IF v_cfg.notify_admins THEN
    FOR v_email IN
      SELECT u.email
      FROM auth.users u
      JOIN public.user_roles r ON r.user_id = u.id
      WHERE r.role = 'admin'
        AND u.email IS NOT NULL
    LOOP
      v_recipients := array_append(v_recipients, v_email);
    END LOOP;
  END IF;

  IF v_cfg.extra_emails IS NOT NULL THEN
    v_recipients := v_recipients || v_cfg.extra_emails;
  END IF;

  -- dedupe
  SELECT array_agg(DISTINCT e) INTO v_recipients
  FROM unnest(v_recipients) e
  WHERE e IS NOT NULL AND length(trim(e)) > 0;

  IF v_recipients IS NULL OR array_length(v_recipients, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(raw_user_meta_data->>'full_name',''), email)
    INTO v_actor_name
  FROM auth.users WHERE id = NEW.updated_by;

  FOREACH v_email IN ARRAY v_recipients LOOP
    v_payload := jsonb_build_object(
      'template_name', v_cfg.template_name,
      'recipient_email', v_email,
      'idempotency_key', 'kanban-' || NEW.id || '-' || NEW.negotiation_status::text || '-' || extract(epoch from now())::bigint || '-' || md5(v_email),
      'template_data', jsonb_build_object(
        'agency_name', NEW.name,
        'agency_city', NEW.city,
        'agency_state', NEW.state,
        'previous_status', OLD.negotiation_status::text,
        'new_status', NEW.negotiation_status::text,
        'moved_by', COALESCE(v_actor_name, 'sistema'),
        'agency_id', NEW.id
      )
    );
    PERFORM public.enqueue_email('transactional_emails', v_payload);
  END LOOP;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- never block the kanban move because of email issues
  RAISE WARNING 'notify_stage_change_email failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_stage_change_email ON public.real_estate_agencies;
CREATE TRIGGER trg_notify_stage_change_email
  AFTER UPDATE OF negotiation_status ON public.real_estate_agencies
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_stage_change_email();
