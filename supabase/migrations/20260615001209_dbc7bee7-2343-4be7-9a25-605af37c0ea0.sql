DROP TRIGGER IF EXISTS apply_agency_activity_before_insert ON public.agency_activities;
CREATE TRIGGER apply_agency_activity_before_insert
BEFORE INSERT ON public.agency_activities
FOR EACH ROW EXECUTE FUNCTION public.apply_agency_activity();

DROP TRIGGER IF EXISTS audit_agency_activity_after_insert ON public.agency_activities;
CREATE TRIGGER audit_agency_activity_after_insert
AFTER INSERT ON public.agency_activities
FOR EACH ROW EXECUTE FUNCTION public.audit_agency_activity();

DROP TRIGGER IF EXISTS audit_agency_file_after_insert ON public.agency_files;
CREATE TRIGGER audit_agency_file_after_insert
AFTER INSERT ON public.agency_files
FOR EACH ROW EXECUTE FUNCTION public.audit_agency_file();

CREATE OR REPLACE FUNCTION public.audit_agency_creation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.agency_audit_events (
    agency_id, event_type, source, actor_user_id, event_data, occurred_at
  ) VALUES (
    NEW.id,
    'agency_created',
    COALESCE(NULLIF(current_setting('app.change_source', true), ''), 'manual'),
    NEW.created_by,
    jsonb_build_object(
      'agency_name', NEW.name,
      'city', NEW.city,
      'state', NEW.state,
      'registration_incomplete', NEW.registration_incomplete,
      'negotiation_status', NEW.negotiation_status
    ),
    NEW.created_at
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_agency_creation_after_insert ON public.real_estate_agencies;
CREATE TRIGGER audit_agency_creation_after_insert
AFTER INSERT ON public.real_estate_agencies
FOR EACH ROW EXECUTE FUNCTION public.audit_agency_creation();

CREATE OR REPLACE FUNCTION public.audit_manual_agency_kanban_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.negotiation_status IS DISTINCT FROM OLD.negotiation_status
     AND COALESCE(NULLIF(current_setting('app.change_source', true), ''), 'manual') <> 'google_forms_activity' THEN
    INSERT INTO public.agency_audit_events (
      agency_id, event_type, source, actor_user_id,
      previous_status, new_status, event_data, occurred_at
    ) VALUES (
      NEW.id, 'kanban_moved',
      COALESCE(NULLIF(current_setting('app.change_source', true), ''), 'manual'),
      NEW.updated_by, OLD.negotiation_status, NEW.negotiation_status,
      jsonb_build_object('agency_name', NEW.name), now()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_manual_agency_kanban_after_update ON public.real_estate_agencies;
CREATE TRIGGER audit_manual_agency_kanban_after_update
AFTER UPDATE OF negotiation_status ON public.real_estate_agencies
FOR EACH ROW EXECUTE FUNCTION public.audit_manual_agency_kanban_movement();