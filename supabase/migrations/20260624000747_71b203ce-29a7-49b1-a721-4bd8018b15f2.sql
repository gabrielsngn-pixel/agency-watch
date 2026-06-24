
ALTER TABLE public.real_estate_agencies ADD COLUMN IF NOT EXISTS cnpj text;
CREATE INDEX IF NOT EXISTS real_estate_agencies_cnpj_idx ON public.real_estate_agencies (cnpj) WHERE cnpj IS NOT NULL;

ALTER TABLE public.agency_files ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'imported';
ALTER TABLE public.agency_files DROP CONSTRAINT IF EXISTS agency_files_category_check;
ALTER TABLE public.agency_files ADD CONSTRAINT agency_files_category_check CHECK (category IN ('imported','processed','result'));
