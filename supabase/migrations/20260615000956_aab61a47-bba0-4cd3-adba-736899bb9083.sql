CREATE TABLE public.google_form_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  spreadsheet_id text NOT NULL,
  sheet_name text NOT NULL,
  row_number integer NOT NULL CHECK (row_number >= 2),
  response_timestamp timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload_hash text NOT NULL,
  processing_status text NOT NULL DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'processed', 'failed', 'ignored')),
  agency_id uuid REFERENCES public.real_estate_agencies(id) ON DELETE SET NULL,
  activity_id uuid REFERENCES public.agency_activities(id) ON DELETE SET NULL,
  error_code text,
  attempt_count integer NOT NULL DEFAULT 0,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (spreadsheet_id, sheet_name, row_number)
);

GRANT SELECT ON public.google_form_submissions TO authenticated;
GRANT ALL ON public.google_form_submissions TO service_role;

ALTER TABLE public.google_form_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leadership can view form submissions"
ON public.google_form_submissions
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'manager')
);

CREATE INDEX google_form_submissions_status_row_idx
ON public.google_form_submissions (processing_status, row_number);

CREATE INDEX google_form_submissions_agency_idx
ON public.google_form_submissions (agency_id, created_at DESC)
WHERE agency_id IS NOT NULL;

CREATE TRIGGER set_google_form_submissions_updated_at
BEFORE UPDATE ON public.google_form_submissions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();