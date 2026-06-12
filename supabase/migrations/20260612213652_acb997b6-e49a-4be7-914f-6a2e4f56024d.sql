CREATE OR REPLACE FUNCTION public.apply_agency_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_status public.negotiation_status;
BEGIN
  SELECT negotiation_status INTO v_current_status
  FROM public.real_estate_agencies
  WHERE id = NEW.agency_id
  FOR UPDATE;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'Imobiliária não encontrada';
  END IF;

  NEW.previous_status := v_current_status;
  IF NOT NEW.status_changed THEN
    NEW.new_status := NULL;
  ELSIF NEW.new_status = v_current_status THEN
    NEW.status_changed := false;
    NEW.new_status := NULL;
  END IF;

  UPDATE public.real_estate_agencies
  SET
    negotiation_status = CASE WHEN NEW.status_changed THEN NEW.new_status ELSE negotiation_status END,
    last_interaction_date = NEW.activity_date,
    total_interactions = COALESCE(total_interactions, 0) + 1,
    next_steps = COALESCE(NULLIF(NEW.next_steps, ''), next_steps),
    next_step_date = COALESCE(NEW.next_step_date, next_step_date),
    c_level_support_needed = CASE WHEN NEW.c_level_support_needed THEN true ELSE c_level_support_needed END,
    feedback = COALESCE(NULLIF(NEW.interaction_result, ''), feedback),
    updated_by = COALESCE(NEW.registered_by_user_id, updated_by),
    updated_at = now()
  WHERE id = NEW.agency_id;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_agency_activity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_client_base_upload_from_activity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_agency_on_interaction() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_agency_changes() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_kanban_snapshot() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_stale_bot_sessions() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;