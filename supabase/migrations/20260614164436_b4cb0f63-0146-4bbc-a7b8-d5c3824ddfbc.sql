DROP POLICY IF EXISTS "agency file objects insert by authenticated" ON storage.objects;

CREATE POLICY "agency file objects insert by portfolio"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'agency-files'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR EXISTS (
      SELECT 1 FROM public.real_estate_agencies a
      WHERE a.id::text = (storage.foldername(name))[1]
        AND a.consultant_id IN (
          SELECT c.id FROM public.consultants c WHERE c.user_id = auth.uid()
        )
    )
  )
);