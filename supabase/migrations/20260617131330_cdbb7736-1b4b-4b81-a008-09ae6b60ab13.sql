
DROP POLICY IF EXISTS "Authenticated create alerts" ON public.mission_control_alerts;
CREATE POLICY "Authenticated create alerts"
  ON public.mission_control_alerts FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (target_user_id IS NULL OR target_user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  );
