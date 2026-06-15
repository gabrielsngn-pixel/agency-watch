REVOKE ALL ON FUNCTION public.audit_agency_creation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_manual_agency_kanban_movement() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_agency_creation() TO service_role;
GRANT EXECUTE ON FUNCTION public.audit_manual_agency_kanban_movement() TO service_role;