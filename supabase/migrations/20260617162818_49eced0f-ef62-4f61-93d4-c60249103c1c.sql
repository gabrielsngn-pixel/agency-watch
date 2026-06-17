DROP POLICY IF EXISTS "interactions select" ON public.agency_interactions;

CREATE POLICY "interactions select" ON public.agency_interactions
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR agency_id IN (
    SELECT id FROM public.real_estate_agencies WHERE consultant_id = auth.uid()
  )
);