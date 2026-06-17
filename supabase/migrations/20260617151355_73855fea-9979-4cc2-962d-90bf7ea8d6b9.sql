
CREATE OR REPLACE FUNCTION public.alert_kanban_stage_renamed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.label IS DISTINCT FROM OLD.label THEN
    INSERT INTO public.mission_control_alerts (alert_type, title, description, severity, created_by, metadata)
    VALUES (
      'kanban_stage_renamed',
      'Status do Kanban renomeado: ' || OLD.label || ' → ' || NEW.label,
      'Lembre-se de ajustar o Forms para refletir o novo nome dessa etapa do funil.',
      'warning',
      auth.uid(),
      jsonb_build_object('stage_key', NEW.stage_key, 'old_label', OLD.label, 'new_label', NEW.label)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_alert_kanban_stage_renamed ON public.kanban_stages;
CREATE TRIGGER trg_alert_kanban_stage_renamed
AFTER UPDATE ON public.kanban_stages
FOR EACH ROW
EXECUTE FUNCTION public.alert_kanban_stage_renamed();
