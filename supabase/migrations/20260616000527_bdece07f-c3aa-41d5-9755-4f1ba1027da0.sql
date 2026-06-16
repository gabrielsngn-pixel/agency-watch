CREATE OR REPLACE FUNCTION public.prune_google_form_submissions(p_spreadsheet text, p_sheet text, p_keep_hashes text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted_submissions int := 0;
  v_deleted_activities int := 0;
  v_deleted_agencies int := 0;
  v_activity_ids uuid[];
  v_agency_ids uuid[];
  v_submission_ids uuid[];
  v_agency uuid;
  v_created_by_forms boolean;
  v_last_manual_status public.negotiation_status;
  v_last_activity record;
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
      SELECT EXISTS (
        SELECT 1 FROM public.agency_audit_events
        WHERE agency_id = v_agency
          AND event_type = 'agency_created'
          AND source = 'google_forms'
      ) INTO v_created_by_forms;

      IF v_created_by_forms
         AND NOT EXISTS (SELECT 1 FROM public.agency_activities WHERE agency_id = v_agency)
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
      ELSE
        -- Surviving agency: recompute derived fields from remaining (manual) activities.
        SELECT activity_date, next_steps, next_step_date, interaction_result, c_level_support_needed, new_status, status_changed
          INTO v_last_activity
        FROM public.agency_activities
        WHERE agency_id = v_agency
        ORDER BY activity_date DESC, created_at DESC
        LIMIT 1;

        -- Revert form-driven negotiation_status: find last non-form value in change log.
        SELECT (old_value)::public.negotiation_status INTO v_last_manual_status
        FROM public.agency_change_log
        WHERE agency_id = v_agency
          AND field_name = 'negotiation_status'
          AND change_source = 'google_forms'
        ORDER BY created_at ASC
        LIMIT 1;

        UPDATE public.real_estate_agencies
        SET
          last_interaction_date = v_last_activity.activity_date,
          total_interactions = (SELECT COUNT(*) FROM public.agency_activities WHERE agency_id = v_agency),
          next_steps = v_last_activity.next_steps,
          next_step_date = v_last_activity.next_step_date,
          feedback = v_last_activity.interaction_result,
          c_level_support_needed = COALESCE(v_last_activity.c_level_support_needed, false),
          negotiation_status = COALESCE(v_last_manual_status, negotiation_status),
          updated_at = now()
        WHERE id = v_agency;

        -- Clear the form-sourced entries from the change log so the movement page reflects reality.
        DELETE FROM public.agency_change_log
        WHERE agency_id = v_agency AND change_source = 'google_forms';
        DELETE FROM public.agency_audit_events
        WHERE agency_id = v_agency AND source = 'google_forms';
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'submissions', v_deleted_submissions,
    'activities', v_deleted_activities,
    'agencies', v_deleted_agencies
  );
END;
$function$;