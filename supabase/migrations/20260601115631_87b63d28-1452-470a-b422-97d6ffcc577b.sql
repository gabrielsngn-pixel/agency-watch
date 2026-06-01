
-- 1. kanban_stage_snapshots
CREATE TABLE public.kanban_stage_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date timestamptz NOT NULL DEFAULT now(),
  week_start date NOT NULL,
  week_end date NOT NULL,
  agency_id uuid NOT NULL,
  agency_name text NOT NULL,
  status negotiation_status NOT NULL,
  consultant_id uuid,
  regional_director text,
  contract_stock integer NOT NULL DEFAULT 0,
  c_level_support_needed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency_id, week_start)
);

CREATE INDEX idx_snapshots_week ON public.kanban_stage_snapshots(week_start);
CREATE INDEX idx_snapshots_status_week ON public.kanban_stage_snapshots(status, week_start);
CREATE INDEX idx_snapshots_agency_week ON public.kanban_stage_snapshots(agency_id, week_start);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kanban_stage_snapshots TO authenticated;
GRANT ALL ON public.kanban_stage_snapshots TO service_role;

ALTER TABLE public.kanban_stage_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "snapshots select" ON public.kanban_stage_snapshots
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR consultant_id IN (SELECT id FROM consultants WHERE user_id = auth.uid())
  );

CREATE POLICY "snapshots admin write" ON public.kanban_stage_snapshots
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- 2. agency_change_log
CREATE TABLE public.agency_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL,
  agency_name text NOT NULL,
  field_name text NOT NULL,
  old_value text,
  new_value text,
  previous_status negotiation_status,
  new_status negotiation_status,
  is_stage_change boolean NOT NULL DEFAULT false,
  change_source text NOT NULL DEFAULT 'manual',
  changed_by uuid,
  changed_by_name text,
  slack_user_id text,
  consultant_id uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_changelog_changed_at ON public.agency_change_log(changed_at DESC);
CREATE INDEX idx_changelog_agency ON public.agency_change_log(agency_id, changed_at DESC);
CREATE INDEX idx_changelog_stage ON public.agency_change_log(is_stage_change, changed_at DESC);

GRANT SELECT, INSERT ON public.agency_change_log TO authenticated;
GRANT ALL ON public.agency_change_log TO service_role;

ALTER TABLE public.agency_change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "changelog select" ON public.agency_change_log
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR agency_id IN (
      SELECT id FROM real_estate_agencies
      WHERE consultant_id IN (SELECT id FROM consultants WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "changelog insert" ON public.agency_change_log
  FOR INSERT TO authenticated WITH CHECK (true);

-- 3. Trigger function
CREATE OR REPLACE FUNCTION public.log_agency_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source text;
  v_user_name text;
  v_consultant_name text;
BEGIN
  v_source := COALESCE(current_setting('app.change_source', true), 'manual');
  IF v_source = '' THEN v_source := 'manual'; END IF;

  -- negotiation_status
  IF NEW.negotiation_status IS DISTINCT FROM OLD.negotiation_status THEN
    INSERT INTO public.agency_change_log
      (agency_id, agency_name, field_name, old_value, new_value,
       previous_status, new_status, is_stage_change,
       change_source, changed_by, consultant_id)
    VALUES
      (NEW.id, NEW.name, 'negotiation_status', OLD.negotiation_status::text, NEW.negotiation_status::text,
       OLD.negotiation_status, NEW.negotiation_status, true,
       v_source, NEW.updated_by, NEW.consultant_id);
  END IF;

  IF NEW.contract_stock IS DISTINCT FROM OLD.contract_stock THEN
    INSERT INTO public.agency_change_log
      (agency_id, agency_name, field_name, old_value, new_value, change_source, changed_by, consultant_id)
    VALUES (NEW.id, NEW.name, 'contract_stock', OLD.contract_stock::text, NEW.contract_stock::text, v_source, NEW.updated_by, NEW.consultant_id);
  END IF;

  IF COALESCE(NEW.next_steps,'') IS DISTINCT FROM COALESCE(OLD.next_steps,'') THEN
    INSERT INTO public.agency_change_log
      (agency_id, agency_name, field_name, old_value, new_value, change_source, changed_by, consultant_id)
    VALUES (NEW.id, NEW.name, 'next_steps', OLD.next_steps, NEW.next_steps, v_source, NEW.updated_by, NEW.consultant_id);
  END IF;

  IF COALESCE(NEW.feedback,'') IS DISTINCT FROM COALESCE(OLD.feedback,'') THEN
    INSERT INTO public.agency_change_log
      (agency_id, agency_name, field_name, old_value, new_value, change_source, changed_by, consultant_id)
    VALUES (NEW.id, NEW.name, 'feedback', OLD.feedback, NEW.feedback, v_source, NEW.updated_by, NEW.consultant_id);
  END IF;

  IF COALESCE(NEW.current_offer,'') IS DISTINCT FROM COALESCE(OLD.current_offer,'') THEN
    INSERT INTO public.agency_change_log
      (agency_id, agency_name, field_name, old_value, new_value, change_source, changed_by, consultant_id)
    VALUES (NEW.id, NEW.name, 'current_offer', OLD.current_offer, NEW.current_offer, v_source, NEW.updated_by, NEW.consultant_id);
  END IF;

  IF NEW.c_level_support_needed IS DISTINCT FROM OLD.c_level_support_needed THEN
    INSERT INTO public.agency_change_log
      (agency_id, agency_name, field_name, old_value, new_value, change_source, changed_by, consultant_id)
    VALUES (NEW.id, NEW.name, 'c_level_support_needed', OLD.c_level_support_needed::text, NEW.c_level_support_needed::text, v_source, NEW.updated_by, NEW.consultant_id);
  END IF;

  IF COALESCE(NEW.main_contact,'') IS DISTINCT FROM COALESCE(OLD.main_contact,'') THEN
    INSERT INTO public.agency_change_log
      (agency_id, agency_name, field_name, old_value, new_value, change_source, changed_by, consultant_id)
    VALUES (NEW.id, NEW.name, 'main_contact', OLD.main_contact, NEW.main_contact, v_source, NEW.updated_by, NEW.consultant_id);
  END IF;

  IF NEW.consultant_id IS DISTINCT FROM OLD.consultant_id THEN
    INSERT INTO public.agency_change_log
      (agency_id, agency_name, field_name, old_value, new_value, change_source, changed_by, consultant_id)
    VALUES (NEW.id, NEW.name, 'consultant_id', OLD.consultant_id::text, NEW.consultant_id::text, v_source, NEW.updated_by, NEW.consultant_id);
  END IF;

  IF COALESCE(NEW.regional_director,'') IS DISTINCT FROM COALESCE(OLD.regional_director,'') THEN
    INSERT INTO public.agency_change_log
      (agency_id, agency_name, field_name, old_value, new_value, change_source, changed_by, consultant_id)
    VALUES (NEW.id, NEW.name, 'regional_director', OLD.regional_director, NEW.regional_director, v_source, NEW.updated_by, NEW.consultant_id);
  END IF;

  IF NEW.guarantor_type IS DISTINCT FROM OLD.guarantor_type THEN
    INSERT INTO public.agency_change_log
      (agency_id, agency_name, field_name, old_value, new_value, change_source, changed_by, consultant_id)
    VALUES (NEW.id, NEW.name, 'guarantor_type', OLD.guarantor_type::text, NEW.guarantor_type::text, v_source, NEW.updated_by, NEW.consultant_id);
  END IF;

  IF COALESCE(NEW.current_guarantor,'') IS DISTINCT FROM COALESCE(OLD.current_guarantor,'') THEN
    INSERT INTO public.agency_change_log
      (agency_id, agency_name, field_name, old_value, new_value, change_source, changed_by, consultant_id)
    VALUES (NEW.id, NEW.name, 'current_guarantor', OLD.current_guarantor, NEW.current_guarantor, v_source, NEW.updated_by, NEW.consultant_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_agency_changes ON public.real_estate_agencies;
CREATE TRIGGER trg_log_agency_changes
  AFTER UPDATE ON public.real_estate_agencies
  FOR EACH ROW EXECUTE FUNCTION public.log_agency_changes();

-- 4. Snapshot function
CREATE OR REPLACE FUNCTION public.generate_kanban_snapshot()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_week_start date := date_trunc('week', now())::date;
  v_week_end date := (date_trunc('week', now()) + interval '6 days')::date;
  v_count integer;
BEGIN
  INSERT INTO public.kanban_stage_snapshots
    (snapshot_date, week_start, week_end, agency_id, agency_name, status,
     consultant_id, regional_director, contract_stock, c_level_support_needed)
  SELECT now(), v_week_start, v_week_end, id, name, negotiation_status,
         consultant_id, regional_director, contract_stock, c_level_support_needed
  FROM public.real_estate_agencies
  ON CONFLICT (agency_id, week_start) DO UPDATE SET
    snapshot_date = EXCLUDED.snapshot_date,
    status = EXCLUDED.status,
    consultant_id = EXCLUDED.consultant_id,
    regional_director = EXCLUDED.regional_director,
    contract_stock = EXCLUDED.contract_stock,
    c_level_support_needed = EXCLUDED.c_level_support_needed,
    agency_name = EXCLUDED.agency_name;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
