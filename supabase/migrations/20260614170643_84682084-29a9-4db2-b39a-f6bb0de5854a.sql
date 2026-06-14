ALTER TABLE public.real_estate_agencies
  ALTER COLUMN state DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS registration_incomplete boolean NOT NULL DEFAULT false;

UPDATE public.real_estate_agencies
SET state = NULL,
    registration_incomplete = true
WHERE state IN ('NI', '') OR state IS NULL;

ALTER TABLE public.agency_activities
  ADD COLUMN IF NOT EXISTS activity_type_detail text,
  ADD COLUMN IF NOT EXISTS interaction_result_detail text;

CREATE TABLE public.agency_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.real_estate_agencies(id) ON DELETE RESTRICT,
  activity_id uuid REFERENCES public.agency_activities(id) ON DELETE SET NULL,
  file_id uuid REFERENCES public.agency_files(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('activity_created', 'kanban_moved', 'client_base_received', 'c_level_support_requested', 'agency_created', 'agency_updated')),
  source text NOT NULL DEFAULT 'web',
  actor_user_id uuid,
  actor_name text,
  actor_email text,
  previous_status public.negotiation_status,
  new_status public.negotiation_status,
  event_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.agency_audit_events TO authenticated;
GRANT ALL ON public.agency_audit_events TO service_role;
ALTER TABLE public.agency_audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit events select by portfolio"
ON public.agency_audit_events
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.real_estate_agencies a
    WHERE a.id = agency_audit_events.agency_id
      AND (
        public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'manager')
        OR EXISTS (
          SELECT 1 FROM public.consultants c
          WHERE c.id = a.consultant_id AND c.user_id = auth.uid()
        )
      )
  )
);

CREATE INDEX agency_audit_events_agency_occurred_idx
  ON public.agency_audit_events (agency_id, occurred_at DESC);
CREATE INDEX agency_audit_events_type_occurred_idx
  ON public.agency_audit_events (event_type, occurred_at DESC);
CREATE INDEX agency_audit_events_activity_idx
  ON public.agency_audit_events (activity_id)
  WHERE activity_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.prevent_agency_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Eventos de auditoria são imutáveis';
END;
$$;

CREATE TRIGGER prevent_agency_audit_update
BEFORE UPDATE ON public.agency_audit_events
FOR EACH ROW EXECUTE FUNCTION public.prevent_agency_audit_mutation();

CREATE TRIGGER prevent_agency_audit_delete
BEFORE DELETE ON public.agency_audit_events
FOR EACH ROW EXECUTE FUNCTION public.prevent_agency_audit_mutation();

CREATE OR REPLACE FUNCTION public.audit_agency_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.agency_audit_events (
    agency_id, activity_id, event_type, source,
    actor_user_id, actor_name, actor_email,
    previous_status, new_status, event_data, occurred_at
  ) VALUES (
    NEW.agency_id, NEW.id, 'activity_created', NEW.source,
    NEW.registered_by_user_id, NEW.registered_by_name, NEW.registered_by_email,
    NEW.previous_status, NEW.new_status,
    jsonb_build_object(
      'activity_type', NEW.activity_type,
      'activity_type_detail', NEW.activity_type_detail,
      'summary', NEW.summary,
      'interaction_result', NEW.interaction_result,
      'interaction_result_detail', NEW.interaction_result_detail,
      'next_steps', NEW.next_steps,
      'next_step_date', NEW.next_step_date,
      'c_level_support_needed', NEW.c_level_support_needed
    ),
    NEW.activity_date
  );

  IF NEW.status_changed AND NEW.new_status IS NOT NULL THEN
    INSERT INTO public.agency_audit_events (
      agency_id, activity_id, event_type, source,
      actor_user_id, actor_name, actor_email,
      previous_status, new_status, event_data, occurred_at
    ) VALUES (
      NEW.agency_id, NEW.id, 'kanban_moved', NEW.source,
      NEW.registered_by_user_id, NEW.registered_by_name, NEW.registered_by_email,
      NEW.previous_status, NEW.new_status,
      jsonb_build_object('summary', NEW.summary),
      NEW.activity_date
    );
  END IF;

  IF NEW.c_level_support_needed THEN
    INSERT INTO public.agency_audit_events (
      agency_id, activity_id, event_type, source,
      actor_user_id, actor_name, actor_email, event_data, occurred_at
    ) VALUES (
      NEW.agency_id, NEW.id, 'c_level_support_requested', NEW.source,
      NEW.registered_by_user_id, NEW.registered_by_name, NEW.registered_by_email,
      jsonb_build_object('summary', NEW.summary, 'interaction_result', NEW.interaction_result),
      NEW.activity_date
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER audit_agency_activity_after_insert
AFTER INSERT ON public.agency_activities
FOR EACH ROW EXECUTE FUNCTION public.audit_agency_activity();

CREATE OR REPLACE FUNCTION public.audit_agency_file()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.agency_audit_events (
    agency_id, activity_id, file_id, event_type, source,
    actor_user_id, actor_name, actor_email, event_data, occurred_at
  ) VALUES (
    NEW.agency_id, NEW.activity_id, NEW.id, 'client_base_received', 'google_forms',
    NEW.uploaded_by, NEW.uploaded_by_name, NEW.uploaded_by_email,
    jsonb_build_object(
      'file_name', NEW.file_name,
      'file_type', NEW.file_type,
      'file_size', NEW.file_size,
      'processing_status', NEW.processing_status
    ),
    NEW.uploaded_at
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER audit_agency_file_after_insert
AFTER INSERT ON public.agency_files
FOR EACH ROW EXECUTE FUNCTION public.audit_agency_file();