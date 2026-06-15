CREATE OR REPLACE FUNCTION public.audit_manual_agency_kanban_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.negotiation_status IS DISTINCT FROM OLD.negotiation_status
     AND pg_trigger_depth() = 1 THEN
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

REVOKE ALL ON FUNCTION public.audit_manual_agency_kanban_movement() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_manual_agency_kanban_movement() TO service_role;