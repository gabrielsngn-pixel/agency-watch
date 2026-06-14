CREATE UNIQUE INDEX IF NOT EXISTS real_estate_agencies_normalized_name_uidx
  ON public.real_estate_agencies (lower(btrim(name)));