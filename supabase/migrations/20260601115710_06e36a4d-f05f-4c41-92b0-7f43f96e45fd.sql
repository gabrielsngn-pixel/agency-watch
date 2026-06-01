
REVOKE EXECUTE ON FUNCTION public.log_agency_changes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_kanban_snapshot() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_kanban_snapshot() TO service_role;
