REVOKE ALL ON FUNCTION public.audit_agency_activity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_agency_file() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_agency_audit_mutation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_agency_activity() TO service_role;
GRANT EXECUTE ON FUNCTION public.audit_agency_file() TO service_role;