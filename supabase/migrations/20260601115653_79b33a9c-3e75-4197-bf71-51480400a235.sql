
DROP POLICY IF EXISTS "changelog insert" ON public.agency_change_log;
REVOKE INSERT ON public.agency_change_log FROM authenticated;
