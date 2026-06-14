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

REVOKE ALL ON FUNCTION public.audit_agency_activity() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_agency_activity() TO service_role;

CREATE OR REPLACE FUNCTION public.audit_agency_kanban_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.negotiation_status IS DISTINCT FROM OLD.negotiation_status THEN
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

REVOKE ALL ON FUNCTION public.audit_agency_kanban_movement() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_agency_kanban_movement() TO service_role;

CREATE TRIGGER audit_agency_kanban_after_update
AFTER UPDATE OF negotiation_status ON public.real_estate_agencies
FOR EACH ROW EXECUTE FUNCTION public.audit_agency_kanban_movement();