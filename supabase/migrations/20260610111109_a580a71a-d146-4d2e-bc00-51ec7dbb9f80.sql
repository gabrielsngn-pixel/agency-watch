
CREATE TABLE public.client_import_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email text,
  agency_name text,
  original_filename text NOT NULL,
  original_format text,
  total_rows integer NOT NULL DEFAULT 0,
  valid_rows integer NOT NULL DEFAULT 0,
  invalid_rows integer NOT NULL DEFAULT 0,
  standardized_file_path text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.client_import_history TO authenticated;
GRANT ALL ON public.client_import_history TO service_role;

ALTER TABLE public.client_import_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own or admin/manager can read history"
  ON public.client_import_history FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
  );

CREATE POLICY "authenticated insert history as self"
  ON public.client_import_history FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_client_import_history_user ON public.client_import_history(user_id, created_at DESC);

-- Storage policies for the client-imports bucket
CREATE POLICY "users read own client-imports files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'client-imports' AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'manager')
    )
  );

CREATE POLICY "users upload to own client-imports folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'client-imports'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "users delete own client-imports files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'client-imports' AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin')
    )
  );
