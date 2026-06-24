CREATE OR REPLACE FUNCTION public.prevent_agency_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  -- Always allow DELETEs (cascade cleanup when an agency/activity is removed).
  -- Block only UPDATEs to keep audit rows immutable.
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  IF current_setting('app.allow_audit_cleanup', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Eventos de auditoria são imutáveis';
END;
$function$;