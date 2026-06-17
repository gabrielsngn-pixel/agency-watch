import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useKanbanStages } from "@/hooks/use-kanban-stages";
import { TEMPLATES } from "@/lib/email-templates/registry";
import { previewEmailTemplate } from "@/lib/email-admin.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowRightLeft,
  Clock,
  Eye,
  Loader2,
  Mail,
  Play,
  Save,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Settings = {
  stage_key: string;
  enabled: boolean;
  template_name: string;
  notify_consultant: boolean;
  notify_regional_director: boolean;
  notify_admins: boolean;
  extra_emails: string[];
  sla_stage_days: number | null;
  sla_no_interaction_days: number | null;
  sla_template_name: string;
};

const DEFAULT: Omit<Settings, "stage_key"> = {
  enabled: false,
  template_name: "kanban-stage-change",
  notify_consultant: true,
  notify_regional_director: false,
  notify_admins: false,
  extra_emails: [],
  sla_stage_days: null,
  sla_no_interaction_days: null,
  sla_template_name: "kanban-sla-alert",
};

export function KanbanNotifications() {
  const qc = useQueryClient();
  const stagesQuery = useKanbanStages();

  const settingsQuery = useQuery({
    queryKey: ["kanban-stage-notifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kanban_stage_notifications")
        .select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  const [drafts, setDrafts] = useState<Record<string, Settings>>({});

  useEffect(() => {
    if (!stagesQuery.data || !settingsQuery.data) return;
    const byKey = new Map(settingsQuery.data.map((s: any) => [s.stage_key, s]));
    const next: Record<string, Settings> = {};
    for (const stage of stagesQuery.data) {
      const existing = byKey.get(stage.stage_key) as any;
      next[stage.stage_key] = {
        stage_key: stage.stage_key,
        enabled: existing?.enabled ?? DEFAULT.enabled,
        template_name: existing?.template_name ?? DEFAULT.template_name,
        notify_consultant: existing?.notify_consultant ?? DEFAULT.notify_consultant,
        notify_regional_director:
          existing?.notify_regional_director ?? DEFAULT.notify_regional_director,
        notify_admins: existing?.notify_admins ?? DEFAULT.notify_admins,
        extra_emails: existing?.extra_emails ?? DEFAULT.extra_emails,
        sla_stage_days: existing?.sla_stage_days ?? DEFAULT.sla_stage_days,
        sla_no_interaction_days:
          existing?.sla_no_interaction_days ?? DEFAULT.sla_no_interaction_days,
        sla_template_name: existing?.sla_template_name ?? DEFAULT.sla_template_name,
      };
    }
    setDrafts(next);
  }, [stagesQuery.data, settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async (s: Settings) => {
      const { error } = await supabase
        .from("kanban_stage_notifications")
        .upsert(s, { onConflict: "stage_key" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Notificação salva");
      qc.invalidateQueries({ queryKey: ["kanban-stage-notifications"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  const runSlaNow = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("process_kanban_sla_alerts" as any);
      if (error) throw error;
      return data as any;
    },
    onSuccess: (data: any) => {
      toast.success(
        `Processado: ${data?.enqueued ?? 0} e-mail(s) enfileirado(s), ${data?.skipped ?? 0} ignorado(s).`,
      );
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao processar SLAs"),
  });

  if (stagesQuery.isLoading || settingsQuery.isLoading) {
    return <Loader2 className="h-5 w-5 animate-spin" />;
  }

  const stages = stagesQuery.data ?? [];
  const activeCount = Object.values(drafts).filter((d) => d.enabled).length;

  return (
    <div className="space-y-6">
      {/* Header / explainer */}
      <Card className="border-border/60">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1">
              <h3 className="text-base font-semibold">Notificações por etapa do Kanban</h3>
              <p className="text-sm text-muted-foreground max-w-2xl">
                Para cada etapa você define <strong>dois tipos</strong> de e-mail
                automático e <strong>quem recebe</strong>. Etapas desativadas não disparam nada.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="font-normal">
                {activeCount} de {stages.length} ativas
              </Badge>
              <Button
                size="sm"
                variant="outline"
                onClick={() => runSlaNow.mutate()}
                disabled={runSlaNow.isPending}
              >
                {runSlaNow.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Rodar SLA agora
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <LegendCard
              icon={<ArrowRightLeft className="h-4 w-4" />}
              title="Mudança de etapa"
              description="Dispara no momento em que a imobiliária entra nesta etapa."
            />
            <LegendCard
              icon={<Clock className="h-4 w-4" />}
              title="Alerta de SLA"
              description="Dispara quando a imobiliária fica parada na etapa ou sem interação. Roda 1×/dia às 10h (Brasília)."
            />
          </div>
        </CardContent>
      </Card>

      {/* Stage list */}
      <Accordion type="multiple" className="space-y-3">
        {stages.map((stage) => {
          const d = drafts[stage.stage_key];
          if (!d) return null;
          return (
            <StageItem
              key={stage.id}
              stage={stage}
              draft={d}
              onChange={(patch) =>
                setDrafts((prev) => ({
                  ...prev,
                  [stage.stage_key]: { ...prev[stage.stage_key], ...patch },
                }))
              }
              onSave={() => saveMutation.mutate(d)}
              saving={saveMutation.isPending}
            />
          );
        })}
      </Accordion>
    </div>
  );
}

function LegendCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-border/60 bg-muted/30 p-3">
      <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="space-y-0.5">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
    </div>
  );
}

function StageItem({
  stage,
  draft,
  onChange,
  onSave,
  saving,
}: {
  stage: any;
  draft: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const d = draft;
  const recipientCount = useMemo(() => {
    return (
      (d.notify_consultant ? 1 : 0) +
      (d.notify_regional_director ? 1 : 0) +
      (d.notify_admins ? 1 : 0) +
      d.extra_emails.length
    );
  }, [d]);

  const slaActive = (d.sla_stage_days ?? 0) > 0 || (d.sla_no_interaction_days ?? 0) > 0;

  return (
    <AccordionItem
      value={stage.stage_key}
      className={cn(
        "rounded-lg border bg-card transition-colors",
        d.enabled ? "border-border" : "border-border/50 opacity-80",
      )}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <Switch
          checked={d.enabled}
          onCheckedChange={(v) => onChange({ enabled: v })}
          onClick={(e) => e.stopPropagation()}
          aria-label="Ativar notificações desta etapa"
        />
        <AccordionTrigger className="flex-1 py-0 hover:no-underline [&>svg]:ml-2">
          <div className="flex w-full items-center justify-between gap-3 pr-2">
            <div className="text-left">
              <div className="text-sm font-semibold leading-tight">{stage.label}</div>
              <div className="text-[11px] text-muted-foreground font-mono">
                {stage.stage_key}
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              {!d.enabled && (
                <Badge variant="outline" className="text-xs font-normal">
                  Desativada
                </Badge>
              )}
              {d.enabled && (
                <>
                  <Badge variant="secondary" className="text-xs font-normal gap-1">
                    <Users className="h-3 w-3" />
                    {recipientCount} destinatário{recipientCount === 1 ? "" : "s"}
                  </Badge>
                  {slaActive && (
                    <Badge className="text-xs font-normal gap-1 bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500/15 border-amber-500/30">
                      <Clock className="h-3 w-3" />
                      SLA ativo
                    </Badge>
                  )}
                </>
              )}
            </div>
          </div>
        </AccordionTrigger>
      </div>

      <AccordionContent className="px-4 pb-4 pt-0">
        <Separator className="mb-5" />

        <div className="space-y-6">
          {/* Section 1 — Recipients */}
          <Section
            step="1"
            icon={<Users className="h-4 w-4" />}
            title="Quem recebe"
            description="Estes destinatários valem tanto para a mudança de etapa quanto para os alertas de SLA."
          >
            <div className="flex flex-wrap gap-x-6 gap-y-3">
              <ToggleField
                label="Consultor da imobiliária"
                value={d.notify_consultant}
                onChange={(v) => onChange({ notify_consultant: v })}
              />
              <ToggleField
                label="Diretor regional"
                value={d.notify_regional_director}
                onChange={(v) => onChange({ notify_regional_director: v })}
              />
              <ToggleField
                label="Administradores"
                value={d.notify_admins}
                onChange={(v) => onChange({ notify_admins: v })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                E-mails adicionais (separe por vírgula)
              </Label>
              <Input
                placeholder="diretoria@empresa.com, outro@empresa.com"
                value={d.extra_emails.join(", ")}
                onChange={(e) =>
                  onChange({
                    extra_emails: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
              />
            </div>
          </Section>

          {/* Section 2 — Stage change email */}
          <Section
            step="2"
            icon={<ArrowRightLeft className="h-4 w-4" />}
            title="E-mail de mudança de etapa"
            description="Enviado uma vez, no momento em que uma imobiliária entra nesta etapa."
          >
            <div className="space-y-1.5 max-w-md">
              <Label className="text-xs text-muted-foreground">Template</Label>
              <Select
                value={d.template_name}
                onValueChange={(v) => onChange({ template_name: v })}
              >
                <SelectTrigger>
                  <Mail className="h-4 w-4 mr-2 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TEMPLATES).map(([name, tpl]) => (
                    <SelectItem key={name} value={name}>
                      {tpl.displayName ?? name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </Section>

          {/* Section 3 — SLA */}
          <Section
            step="3"
            icon={<Clock className="h-4 w-4" />}
            title="Alertas de SLA"
            description="Avisa quando a imobiliária está estagnada. Cada alerta é enviado uma única vez por imobiliária e período — o relógio reinicia quando ela muda de etapa ou recebe uma interação."
            accent
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Dias parada na etapa
                </Label>
                <Input
                  type="number"
                  min={1}
                  placeholder="vazio = desativado"
                  value={d.sla_stage_days ?? ""}
                  onChange={(e) =>
                    onChange({
                      sla_stage_days:
                        e.target.value === ""
                          ? null
                          : Math.max(1, Number(e.target.value)),
                    })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Dias sem interação
                </Label>
                <Input
                  type="number"
                  min={1}
                  placeholder="vazio = desativado"
                  value={d.sla_no_interaction_days ?? ""}
                  onChange={(e) =>
                    onChange({
                      sla_no_interaction_days:
                        e.target.value === ""
                          ? null
                          : Math.max(1, Number(e.target.value)),
                    })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Template do alerta</Label>
                <Select
                  value={d.sla_template_name}
                  onValueChange={(v) => onChange({ sla_template_name: v })}
                >
                  <SelectTrigger>
                    <Mail className="h-4 w-4 mr-2 text-muted-foreground" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TEMPLATES).map(([name, tpl]) => (
                      <SelectItem key={name} value={name}>
                        {tpl.displayName ?? name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Section>

          <div className="flex justify-end pt-2">
            <Button size="sm" onClick={onSave} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Salvar etapa
            </Button>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

function Section({
  step,
  icon,
  title,
  description,
  accent,
  children,
}: {
  step: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-md border p-4 space-y-4",
        accent
          ? "border-amber-500/30 bg-amber-500/5"
          : "border-border/60 bg-muted/20",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold",
            accent
              ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
              : "bg-primary/10 text-primary",
          )}
        >
          {step}
        </div>
        <div className="space-y-0.5 flex-1">
          <div className="flex items-center gap-2 text-sm font-medium">
            {icon}
            <span>{title}</span>
          </div>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="space-y-4 pl-10">{children}</div>
    </section>
  );
}

function ToggleField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <Switch checked={value} onCheckedChange={onChange} />
      <span className="text-sm">{label}</span>
    </label>
  );
}
