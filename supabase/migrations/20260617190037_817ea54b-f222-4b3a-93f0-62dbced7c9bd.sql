
CREATE OR REPLACE FUNCTION public.alert_new_agency_registered()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source text;
  v_location text;
BEGIN
  v_source := COALESCE(NULLIF(current_setting('app.change_source', true), ''), 'manual');
  v_location := COALESCE(
    NULLIF(trim(both ' ' from concat_ws('/', NEW.city, NEW.state)), '/'),
    'localização não informada'
  );

  INSERT INTO public.mission_control_alerts (alert_type, title, description, severity, created_by, metadata)
  VALUES (
    'new_agency_registered',
    'Nova imobiliária cadastrada: ' || NEW.name || ' (' || v_location || ')',
    'Lembre-se de incluir esta imobiliária no Google Forms para que ela apareça nas próximas atualizações. Marque como resolvido após adicionar.',
    'warning',
    NEW.created_by,
    jsonb_build_object(
      'agency_id', NEW.id,
      'agency_name', NEW.name,
      'city', NEW.city,
      'state', NEW.state,
      'source', v_source
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_alert_new_agency_registered ON public.real_estate_agencies;
CREATE TRIGGER trg_alert_new_agency_registered
AFTER INSERT ON public.real_estate_agencies
FOR EACH ROW
EXECUTE FUNCTION public.alert_new_agency_registered();
