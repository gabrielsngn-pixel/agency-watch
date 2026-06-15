CREATE OR REPLACE FUNCTION public.prevent_agency_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.allow_audit_cleanup', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Eventos de auditoria são imutáveis';
END;
$$;

CREATE OR REPLACE FUNCTION public.prune_google_form_submissions(
  p_spreadsheet text,
  p_sheet text,
  p_keep_hashes text[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_submissions int := 0;
  v_deleted_activities int := 0;
  v_deleted_agencies int := 0;
  v_activity_ids uuid[];
  v_agency_ids uuid[];
  v_submission_ids uuid[];
  v_agency uuid;
BEGIN
  SELECT
    array_agg(id),
    array_agg(activity_id) FILTER (WHERE activity_id IS NOT NULL),
    array_agg(DISTINCT agency_id) FILTER (WHERE agency_id IS NOT NULL)
    INTO v_submission_ids, v_activity_ids, v_agency_ids
  FROM public.google_form_submissions
  WHERE spreadsheet_id = p_spreadsheet
    AND sheet_name = p_sheet
    AND processing_status <> 'processing'
    AND NOT (payload_hash = ANY (COALESCE(p_keep_hashes, ARRAY[]::text[])));

  IF v_submission_ids IS NULL OR array_length(v_submission_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('submissions', 0, 'activities', 0, 'agencies', 0);
  END IF;

  PERFORM set_config('app.allow_audit_cleanup', 'on', true);

  IF v_activity_ids IS NOT NULL THEN
    DELETE FROM public.client_base_uploads WHERE activity_id = ANY(v_activity_ids);
    DELETE FROM public.agency_files WHERE activity_id = ANY(v_activity_ids);
    DELETE FROM public.agency_audit_events WHERE activity_id = ANY(v_activity_ids);
    DELETE FROM public.agency_activities WHERE id = ANY(v_activity_ids);
    GET DIAGNOSTICS v_deleted_activities = ROW_COUNT;
  END IF;

  DELETE FROM public.google_form_submissions WHERE id = ANY(v_submission_ids);
  GET DIAGNOSTICS v_deleted_submissions = ROW_COUNT;

  IF v_agency_ids IS NOT NULL THEN
    FOREACH v_agency IN ARRAY v_agency_ids LOOP
      IF NOT EXISTS (SELECT 1 FROM public.agency_activities WHERE agency_id = v_agency)
         AND NOT EXISTS (SELECT 1 FROM public.agency_files WHERE agency_id = v_agency)
         AND NOT EXISTS (SELECT 1 FROM public.google_form_submissions WHERE agency_id = v_agency)
      THEN
        DELETE FROM public.agency_audit_events WHERE agency_id = v_agency;
        DELETE FROM public.agency_change_log WHERE agency_id = v_agency;
        DELETE FROM public.kanban_stage_snapshots WHERE agency_id = v_agency;
        DELETE FROM public.client_base_uploads WHERE agency_id = v_agency;
        DELETE FROM public.agency_interactions WHERE agency_id = v_agency;
        DELETE FROM public.hubspot_mappings WHERE agency_id = v_agency;
        UPDATE public.bot_sessions SET agency_id = NULL WHERE agency_id = v_agency;
        DELETE FROM public.real_estate_agencies WHERE id = v_agency;
        v_deleted_agencies := v_deleted_agencies + 1;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'submissions', v_deleted_submissions,
    'activities', v_deleted_activities,
    'agencies', v_deleted_agencies
  );
END;
$$;

REVOKE ALL ON FUNCTION public.prune_google_form_submissions(text, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prune_google_form_submissions(text, text, text[]) TO service_role;