
-- 1) Novo valor no enum de status (precisa ser antes de qualquer função usar)
ALTER TYPE public.negotiation_status ADD VALUE IF NOT EXISTS 'Em precificação' BEFORE 'Em negociação';

-- 2) Coluna de SLA por etapa em real_estate_agencies
ALTER TABLE public.real_estate_agencies
  ADD COLUMN IF NOT EXISTS last_stage_change_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Trigger: atualiza last_stage_change_at quando o negotiation_status mudar
CREATE OR REPLACE FUNCTION public.touch_last_stage_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.negotiation_status IS DISTINCT FROM OLD.negotiation_status THEN
    NEW.last_stage_change_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_real_estate_agencies_stage_change ON public.real_estate_agencies;
CREATE TRIGGER trg_real_estate_agencies_stage_change
BEFORE UPDATE ON public.real_estate_agencies
FOR EACH ROW EXECUTE FUNCTION public.touch_last_stage_change();

-- 3) Tabela kanban_stages
CREATE TABLE IF NOT EXISTS public.kanban_stages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stage_key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  position INTEGER NOT NULL,
  sla_days INTEGER NOT NULL DEFAULT 7,
  color TEXT NOT NULL DEFAULT 'neutral',
  is_visible BOOLEAN NOT NULL DEFAULT true,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.kanban_stages TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.kanban_stages TO authenticated;
GRANT ALL ON public.kanban_stages TO service_role;

ALTER TABLE public.kanban_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read kanban_stages"
  ON public.kanban_stages FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage kanban_stages"
  ON public.kanban_stages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_kanban_stages_updated_at
BEFORE UPDATE ON public.kanban_stages
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed inicial com todos os status do enum (incluindo o novo). Todos com SLA 7 e is_system=true.
INSERT INTO public.kanban_stages (stage_key, label, position, sla_days, color, is_system)
VALUES
  ('Pipeline de Prospecção', 'Pipeline de Prospecção', 10, 7, 'neutral', true),
  ('Conversas iniciadas',    'Conversas iniciadas',    20, 7, 'info',    true),
  ('Reunião agendada',       'Reunião agendada',       30, 7, 'info',    true),
  ('Aguardando base',        'Aguardando base',        40, 7, 'warning', true),
  ('Em precificação',        'Em precificação',        45, 7, 'info',    true),
  ('Proposta enviada',       'Proposta enviada',       50, 7, 'info',    true),
  ('Em negociação',          'Em negociação',          60, 7, 'info',    true),
  ('Stand by',               'Stand by',               70, 7, 'warning', true),
  ('Sem interesse',          'Sem interesse',          80, 7, 'destructive', true),
  ('Convertida',             'Convertida',             90, 7, 'success', true)
ON CONFLICT (stage_key) DO NOTHING;

-- 4) Mission control alerts
CREATE TABLE IF NOT EXISTS public.mission_control_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  alert_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  severity TEXT NOT NULL DEFAULT 'info',
  target_user_id UUID,
  created_by UUID,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_control_alerts TO authenticated;
GRANT ALL ON public.mission_control_alerts TO service_role;

ALTER TABLE public.mission_control_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read own or admin alerts"
  ON public.mission_control_alerts FOR SELECT TO authenticated
  USING (
    target_user_id IS NULL
    OR target_user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
  );

CREATE POLICY "Authenticated create alerts"
  ON public.mission_control_alerts FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Update own or admin alerts"
  ON public.mission_control_alerts FOR UPDATE TO authenticated
  USING (
    target_user_id IS NULL
    OR target_user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Admins delete alerts"
  ON public.mission_control_alerts FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_mission_control_alerts_updated_at
BEFORE UPDATE ON public.mission_control_alerts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5) Templates de mensagem (e-mail / whatsapp)
CREATE TABLE IF NOT EXISTS public.message_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email','whatsapp')),
  subject TEXT,
  body TEXT NOT NULL,
  trigger TEXT NOT NULL DEFAULT 'manual',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_message_templates_trigger ON public.message_templates (trigger) WHERE is_active;

GRANT SELECT ON public.message_templates TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.message_templates TO authenticated;
GRANT ALL ON public.message_templates TO service_role;

ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read templates"
  ON public.message_templates FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage templates"
  ON public.message_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_message_templates_updated_at
BEFORE UPDATE ON public.message_templates
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
