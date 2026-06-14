ALTER TABLE public.agency_activities
  ADD COLUMN IF NOT EXISTS base_origin text,
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.agency_activities
  DROP CONSTRAINT IF EXISTS agency_activities_agency_id_fkey;

ALTER TABLE public.agency_activities
  ADD CONSTRAINT agency_activities_agency_id_fkey
  FOREIGN KEY (agency_id)
  REFERENCES public.real_estate_agencies(id)
  ON DELETE RESTRICT;

DROP POLICY IF EXISTS "activities delete by leadership" ON public.agency_activities;
REVOKE DELETE ON public.agency_activities FROM authenticated;

CREATE INDEX IF NOT EXISTS agency_activities_consultant_email_idx
  ON public.agency_activities (registered_by_email);
CREATE INDEX IF NOT EXISTS agency_activities_agency_name_idx
  ON public.agency_activities (lower(agency_name));
CREATE INDEX IF NOT EXISTS agency_activities_source_idx
  ON public.agency_activities (source, activity_date DESC);