ALTER TABLE public.agency_activities
  ADD COLUMN google_submission_id uuid REFERENCES public.google_form_submissions(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX agency_activities_google_submission_unique
ON public.agency_activities (google_submission_id)
WHERE google_submission_id IS NOT NULL;