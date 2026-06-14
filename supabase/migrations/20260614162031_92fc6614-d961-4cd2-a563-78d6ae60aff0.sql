DROP POLICY IF EXISTS "activities update by owner or leadership" ON public.agency_activities;
REVOKE UPDATE ON public.agency_activities FROM authenticated;