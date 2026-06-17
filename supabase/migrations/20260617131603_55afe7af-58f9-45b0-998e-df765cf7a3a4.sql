
CREATE OR REPLACE FUNCTION public.add_kanban_stage(
  p_label TEXT,
  p_sla_days INTEGER DEFAULT 7,
  p_color TEXT DEFAULT 'neutral'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_key TEXT;
  v_id UUID;
  v_pos INTEGER;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_key := trim(p_label);
  IF v_key = '' THEN RAISE EXCEPTION 'label required'; END IF;

  -- Adiciona valor ao enum (no-op se já existir).
  EXECUTE format('ALTER TYPE public.negotiation_status ADD VALUE IF NOT EXISTS %L', v_key);

  SELECT COALESCE(MAX(position), 0) + 10 INTO v_pos FROM public.kanban_stages;

  INSERT INTO public.kanban_stages (stage_key, label, position, sla_days, color, is_system)
  VALUES (v_key, p_label, v_pos, p_sla_days, p_color, false)
  RETURNING id INTO v_id;

  INSERT INTO public.mission_control_alerts (alert_type, title, description, severity, created_by, metadata)
  VALUES (
    'kanban_stage_added',
    'Novo status criado no Kanban: ' || p_label,
    'Lembre-se de ajustar o Forms para refletir essa nova etapa do funil.',
    'warning',
    auth.uid(),
    jsonb_build_object('stage_key', v_key, 'sla_days', p_sla_days)
  );

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.add_kanban_stage(TEXT, INTEGER, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.add_kanban_stage(TEXT, INTEGER, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_kanban_stage(p_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_stage RECORD;
  v_in_use INTEGER;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_stage FROM public.kanban_stages WHERE id = p_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_stage.is_system THEN RAISE EXCEPTION 'Status do sistema não pode ser excluído'; END IF;

  SELECT COUNT(*) INTO v_in_use FROM public.real_estate_agencies
    WHERE negotiation_status::text = v_stage.stage_key;
  IF v_in_use > 0 THEN
    RAISE EXCEPTION 'Status em uso por % imobiliárias', v_in_use;
  END IF;

  DELETE FROM public.kanban_stages WHERE id = p_id;

  INSERT INTO public.mission_control_alerts (alert_type, title, description, severity, created_by, metadata)
  VALUES (
    'kanban_stage_removed',
    'Status removido do Kanban: ' || v_stage.label,
    'Lembre-se de ajustar o Forms para remover essa etapa do funil.',
    'warning',
    auth.uid(),
    jsonb_build_object('stage_key', v_stage.stage_key)
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_kanban_stage(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.delete_kanban_stage(UUID) TO authenticated;
