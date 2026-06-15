-- Backfill the missing kanban change request for Vila Rica
INSERT INTO public.kanban_change_requests (
  agency_id, agency_name, activity_id,
  current_status, requested_status,
  requested_by_email, source, status
)
SELECT
  a.id, a.name, '71736e33-91bb-4c86-9683-47b4d9eb8bcb'::uuid,
  a.negotiation_status, 'Conversas iniciadas'::public.negotiation_status,
  'gabrielsngn@gmail.com', 'google_forms', 'pending'
FROM public.real_estate_agencies a
WHERE a.id = '25d1d07b-8c70-4b25-972b-5fb5de29ae4d'
  AND a.negotiation_status <> 'Conversas iniciadas'
  AND NOT EXISTS (
    SELECT 1 FROM public.kanban_change_requests k
    WHERE k.activity_id = '71736e33-91bb-4c86-9683-47b4d9eb8bcb'
  );