-- Pending kanban status change requests originated from Google Forms
CREATE TABLE public.kanban_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.real_estate_agencies(id) ON DELETE CASCADE,
  agency_name text NOT NULL,
  activity_id uuid REFERENCES public.agency_activities(id) ON DELETE SET NULL,
  current_status public.negotiation_status NOT NULL,
  requested_status public.negotiation_status NOT NULL,
  requested_by_email text,
  requested_by_name text,
  requested_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'google_forms',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kanban_change_requests TO authenticated;
GRANT ALL ON public.kanban_change_requests TO service_role;

ALTER TABLE public.kanban_change_requests ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can view (they need to see pending in dashboard)
CREATE POLICY "Authenticated can view kanban requests"
ON public.kanban_change_requests FOR SELECT
TO authenticated
USING (true);

-- Only admins can update (approve/reject)
CREATE POLICY "Admins can update kanban requests"
ON public.kanban_change_requests FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX kanban_change_requests_status_idx ON public.kanban_change_requests(status, created_at DESC);
CREATE INDEX kanban_change_requests_agency_idx ON public.kanban_change_requests(agency_id);

CREATE TRIGGER set_kanban_change_requests_updated_at
BEFORE UPDATE ON public.kanban_change_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();