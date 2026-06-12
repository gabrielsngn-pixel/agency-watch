CREATE TYPE public.agency_activity_type AS ENUM ('call', 'whatsapp', 'email', 'meeting', 'in_person_visit', 'proposal_sent', 'client_base_received', 'training', 'follow_up', 'c_level_support', 'internal_note', 'cadastro_update', 'other');

ALTER TABLE public.real_estate_agencies
  ADD COLUMN next_step_date date;

CREATE TABLE public.agency_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.real_estate_agencies(id) ON DELETE CASCADE,
  agency_name text NOT NULL,
  activity_type public.agency_activity_type NOT NULL,
  activity_date timestamptz NOT NULL DEFAULT now(),
  registered_by_user_id uuid,
  registered_by_name text,
  registered_by_email text,
  summary text NOT NULL,
  interaction_result text,
  next_steps text,
  next_step_date date,
  status_changed boolean NOT NULL DEFAULT false,
  previous_status public.negotiation_status,
  new_status public.negotiation_status,
  c_level_support_needed boolean NOT NULL DEFAULT false,
  attachment_url text,
  attachment_name text,
  source text NOT NULL DEFAULT 'web' CHECK (source IN ('web', 'slack', 'google_forms', 'whatsapp', 'import', 'other')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agency_activities_status_consistency CHECK (
    (status_changed = false AND new_status IS NULL)
    OR (status_changed = true AND new_status IS NOT NULL)
  )
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agency_activities TO authenticated;
GRANT ALL ON public.agency_activities TO service_role;
ALTER TABLE public.agency_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "activities select by portfolio" ON public.agency_activities
FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'manager')
  OR agency_id IN (
    SELECT a.id FROM public.real_estate_agencies a
    WHERE a.consultant_id IN (SELECT c.id FROM public.consultants c WHERE c.user_id = auth.uid())
  )
);
CREATE POLICY "activities insert by portfolio" ON public.agency_activities
FOR INSERT TO authenticated WITH CHECK (
  registered_by_user_id = auth.uid()
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR agency_id IN (
      SELECT a.id FROM public.real_estate_agencies a
      WHERE a.consultant_id IN (SELECT c.id FROM public.consultants c WHERE c.user_id = auth.uid())
    )
  )
);
CREATE POLICY "activities update by owner or leadership" ON public.agency_activities
FOR UPDATE TO authenticated USING (
  registered_by_user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'manager')
) WITH CHECK (
  registered_by_user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'manager')
);
CREATE POLICY "activities delete by leadership" ON public.agency_activities
FOR DELETE TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')
);
CREATE INDEX agency_activities_agency_date_idx ON public.agency_activities(agency_id, activity_date DESC);
CREATE INDEX agency_activities_date_type_idx ON public.agency_activities(activity_date DESC, activity_type);
CREATE INDEX agency_activities_next_step_idx ON public.agency_activities(next_step_date) WHERE next_step_date IS NOT NULL;

CREATE TABLE public.client_base_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.real_estate_agencies(id) ON DELETE CASCADE,
  activity_id uuid NOT NULL UNIQUE REFERENCES public.agency_activities(id) ON DELETE CASCADE,
  uploaded_by_user_id uuid,
  file_name text NOT NULL,
  file_path text NOT NULL,
  source text NOT NULL DEFAULT 'web',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.client_base_uploads TO authenticated;
GRANT ALL ON public.client_base_uploads TO service_role;
ALTER TABLE public.client_base_uploads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "base uploads select by portfolio" ON public.client_base_uploads
FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'manager')
  OR agency_id IN (
    SELECT a.id FROM public.real_estate_agencies a
    WHERE a.consultant_id IN (SELECT c.id FROM public.consultants c WHERE c.user_id = auth.uid())
  )
);
CREATE POLICY "base uploads insert by portfolio" ON public.client_base_uploads
FOR INSERT TO authenticated WITH CHECK (
  uploaded_by_user_id = auth.uid()
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR agency_id IN (
      SELECT a.id FROM public.real_estate_agencies a
      WHERE a.consultant_id IN (SELECT c.id FROM public.consultants c WHERE c.user_id = auth.uid())
    )
  )
);
CREATE POLICY "base uploads delete by owner or leadership" ON public.client_base_uploads
FOR DELETE TO authenticated USING (
  uploaded_by_user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'manager')
);

CREATE OR REPLACE FUNCTION public.apply_agency_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_status public.negotiation_status;
BEGIN
  SELECT negotiation_status INTO v_current_status
  FROM public.real_estate_agencies
  WHERE id = NEW.agency_id
  FOR UPDATE;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'Imobiliária não encontrada';
  END IF;

  NEW.previous_status := v_current_status;
  IF NOT NEW.status_changed THEN
    NEW.new_status := NULL;
  ELSIF NEW.new_status = v_current_status THEN
    NEW.status_changed := false;
    NEW.new_status := NULL;
  END IF;

  UPDATE public.real_estate_agencies
  SET
    agency_name = agency_name,
    negotiation_status = CASE WHEN NEW.status_changed THEN NEW.new_status ELSE negotiation_status END,
    last_interaction_date = NEW.activity_date,
    total_interactions = COALESCE(total_interactions, 0) + 1,
    next_steps = COALESCE(NULLIF(NEW.next_steps, ''), next_steps),
    next_step_date = COALESCE(NEW.next_step_date, next_step_date),
    c_level_support_needed = CASE WHEN NEW.c_level_support_needed THEN true ELSE c_level_support_needed END,
    feedback = COALESCE(NULLIF(NEW.interaction_result, ''), feedback),
    updated_by = COALESCE(NEW.registered_by_user_id, updated_by),
    updated_at = now()
  WHERE id = NEW.agency_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER apply_agency_activity_before_insert
BEFORE INSERT ON public.agency_activities
FOR EACH ROW EXECUTE FUNCTION public.apply_agency_activity();

CREATE TRIGGER set_agency_activities_updated_at
BEFORE UPDATE ON public.agency_activities
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.create_client_base_upload_from_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.activity_type = 'client_base_received'
     AND NEW.attachment_url IS NOT NULL
     AND NEW.attachment_name IS NOT NULL THEN
    INSERT INTO public.client_base_uploads (
      agency_id, activity_id, uploaded_by_user_id, file_name, file_path, source
    ) VALUES (
      NEW.agency_id, NEW.id, NEW.registered_by_user_id, NEW.attachment_name, NEW.attachment_url, NEW.source
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER create_client_base_upload_after_activity
AFTER INSERT ON public.agency_activities
FOR EACH ROW EXECUTE FUNCTION public.create_client_base_upload_from_activity();

CREATE POLICY "activity attachments insert own folder" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'client-imports'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
CREATE POLICY "activity attachments select authorized" ON storage.objects
FOR SELECT TO authenticated USING (
  bucket_id = 'client-imports'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
  )
);
CREATE POLICY "activity attachments delete own folder" ON storage.objects
FOR DELETE TO authenticated USING (
  bucket_id = 'client-imports'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
  )
);