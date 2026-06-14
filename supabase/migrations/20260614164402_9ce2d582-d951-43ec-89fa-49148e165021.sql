CREATE TYPE public.agency_file_processing_status AS ENUM ('pending', 'processing', 'processed', 'failed');

CREATE TABLE public.agency_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.real_estate_agencies(id) ON DELETE RESTRICT,
  activity_id uuid REFERENCES public.agency_activities(id) ON DELETE SET NULL,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_by_name text,
  uploaded_by_email text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  file_name text NOT NULL CHECK (length(btrim(file_name)) > 0),
  file_url text NOT NULL UNIQUE CHECK (length(btrim(file_url)) > 0),
  file_type text,
  file_size bigint CHECK (file_size IS NULL OR file_size >= 0),
  processing_status public.agency_file_processing_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.agency_files TO authenticated;
GRANT ALL ON public.agency_files TO service_role;

ALTER TABLE public.agency_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agency files select by portfolio"
ON public.agency_files FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'manager')
  OR agency_id IN (
    SELECT a.id FROM public.real_estate_agencies a
    WHERE a.consultant_id IN (
      SELECT c.id FROM public.consultants c WHERE c.user_id = auth.uid()
    )
  )
);

CREATE POLICY "agency files insert by portfolio"
ON public.agency_files FOR INSERT TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR agency_id IN (
      SELECT a.id FROM public.real_estate_agencies a
      WHERE a.consultant_id IN (
        SELECT c.id FROM public.consultants c WHERE c.user_id = auth.uid()
      )
    )
  )
);

CREATE INDEX agency_files_agency_uploaded_idx ON public.agency_files (agency_id, uploaded_at DESC);
CREATE INDEX agency_files_processing_idx ON public.agency_files (processing_status, uploaded_at);
CREATE INDEX agency_files_activity_idx ON public.agency_files (activity_id) WHERE activity_id IS NOT NULL;

CREATE TRIGGER set_agency_files_updated_at
BEFORE UPDATE ON public.agency_files
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "agency file objects select by portfolio"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'agency-files'
  AND EXISTS (
    SELECT 1 FROM public.agency_files af
    WHERE af.file_url = name
      AND (
        public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'manager')
        OR af.agency_id IN (
          SELECT a.id FROM public.real_estate_agencies a
          WHERE a.consultant_id IN (
            SELECT c.id FROM public.consultants c WHERE c.user_id = auth.uid()
          )
        )
      )
  )
);

CREATE POLICY "agency file objects insert by authenticated"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'agency-files' AND auth.uid() IS NOT NULL);