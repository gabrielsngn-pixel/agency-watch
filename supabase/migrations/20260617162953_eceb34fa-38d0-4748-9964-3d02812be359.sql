-- consultants: restrict to admin/manager/self
DROP POLICY IF EXISTS "auth read consultants" ON public.consultants;
CREATE POLICY "auth read consultants" ON public.consultants
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR user_id = auth.uid()
);

-- kanban_change_requests: restrict to admin/manager/requester
DROP POLICY IF EXISTS "Authenticated can view kanban requests" ON public.kanban_change_requests;
CREATE POLICY "Authenticated can view kanban requests" ON public.kanban_change_requests
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR requested_by_user_id = auth.uid()
);

-- hubspot_mappings: restrict to admin/manager
DROP POLICY IF EXISTS "hubspot select" ON public.hubspot_mappings;
CREATE POLICY "hubspot select" ON public.hubspot_mappings
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
);