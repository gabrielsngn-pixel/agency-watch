
ALTER TABLE public.agency_interactions DROP CONSTRAINT agency_interactions_agency_id_fkey,
  ADD CONSTRAINT agency_interactions_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.real_estate_agencies(id) ON DELETE CASCADE;
ALTER TABLE public.bot_sessions DROP CONSTRAINT bot_sessions_agency_id_fkey,
  ADD CONSTRAINT bot_sessions_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.real_estate_agencies(id) ON DELETE SET NULL;
ALTER TABLE public.hubspot_mappings DROP CONSTRAINT hubspot_mappings_agency_id_fkey,
  ADD CONSTRAINT hubspot_mappings_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.real_estate_agencies(id) ON DELETE CASCADE;
ALTER TABLE public.client_base_uploads DROP CONSTRAINT client_base_uploads_agency_id_fkey,
  ADD CONSTRAINT client_base_uploads_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.real_estate_agencies(id) ON DELETE CASCADE;
ALTER TABLE public.agency_activities DROP CONSTRAINT agency_activities_agency_id_fkey,
  ADD CONSTRAINT agency_activities_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.real_estate_agencies(id) ON DELETE CASCADE;
ALTER TABLE public.agency_files DROP CONSTRAINT agency_files_agency_id_fkey,
  ADD CONSTRAINT agency_files_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.real_estate_agencies(id) ON DELETE CASCADE;
ALTER TABLE public.agency_audit_events DROP CONSTRAINT agency_audit_events_agency_id_fkey,
  ADD CONSTRAINT agency_audit_events_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.real_estate_agencies(id) ON DELETE CASCADE;
ALTER TABLE public.google_form_submissions DROP CONSTRAINT google_form_submissions_agency_id_fkey,
  ADD CONSTRAINT google_form_submissions_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.real_estate_agencies(id) ON DELETE SET NULL;
ALTER TABLE public.kanban_change_requests DROP CONSTRAINT kanban_change_requests_agency_id_fkey,
  ADD CONSTRAINT kanban_change_requests_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.real_estate_agencies(id) ON DELETE CASCADE;
ALTER TABLE public.kanban_sla_alert_log DROP CONSTRAINT kanban_sla_alert_log_agency_id_fkey,
  ADD CONSTRAINT kanban_sla_alert_log_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.real_estate_agencies(id) ON DELETE CASCADE;
