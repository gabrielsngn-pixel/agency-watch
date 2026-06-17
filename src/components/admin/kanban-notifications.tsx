import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useKanbanStages } from "@/hooks/use-kanban-stages";
import { TEMPLATES } from "@/lib/email-templates/registry";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Play, Save } from "lucide-react";
import { toast } from "sonner";

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

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Configure quais etapas do Kanban geram e-mail automático ao mudar de etapa
          <strong> e</strong> os alertas de SLA (dias parada na etapa ou sem interação).
          O processamento de SLA roda automaticamente todo dia às 10h (Brasília).
        </p>
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

      {stages.map((stage) => {
        const d = drafts[stage.stage_key];
        if (!d) return null;
        const setD = (patch: Partial<Settings>) =>
          setDrafts((prev) => ({
            ...prev,
            [stage.stage_key]: { ...prev[stage.stage_key], ...patch },
          }));
        return (
          <Card key={stage.id}>
            <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
              <div>
                <CardTitle className="text-base">{stage.label}</CardTitle>
                <div className="text-xs text-muted-foreground font-mono">{stage.stage_key}</div>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-sm">Ativo</Label>
                <Switch
                  checked={d.enabled}
                  onCheckedChange={(v) => setD({ enabled: v })}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Template (mudança de etapa)</Label>
                  <Select
                    value={d.template_name}
                    onValueChange={(v) => setD({ template_name: v })}
                  >
                    <SelectTrigger>
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
                <div className="space-y-1">
                  <Label>E-mails extras (separados por vírgula)</Label>
                  <Input
                    placeholder="diretoria@empresa.com, outro@empresa.com"
                    value={d.extra_emails.join(", ")}
                    onChange={(e) =>
                      setD({
                        extra_emails: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-6">
                <ToggleField
                  label="Notificar consultor da imobiliária"
                  value={d.notify_consultant}
                  onChange={(v) => setD({ notify_consultant: v })}
                />
                <ToggleField
                  label="Notificar diretor regional"
                  value={d.notify_regional_director}
                  onChange={(v) => setD({ notify_regional_director: v })}
                />
                <ToggleField
                  label="Notificar administradores"
                  value={d.notify_admins}
                  onChange={(v) => setD({ notify_admins: v })}
                />
              </div>

              <div className="rounded-md border border-amber-200 bg-amber-50/40 p-4 space-y-3">
                <div className="text-sm font-medium text-amber-900">
                  Alertas de SLA (usa os mesmos destinatários acima)
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <Label>Dias parada na etapa</Label>
                    <Input
                      type="number"
                      min={1}
                      placeholder="ex: 7 (vazio = desativado)"
                      value={d.sla_stage_days ?? ""}
                      onChange={(e) =>
                        setD({
                          sla_stage_days: e.target.value === "" ? null : Math.max(1, Number(e.target.value)),
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Dias sem interação</Label>
                    <Input
                      type="number"
                      min={1}
                      placeholder="ex: 14 (vazio = desativado)"
                      value={d.sla_no_interaction_days ?? ""}
                      onChange={(e) =>
                        setD({
                          sla_no_interaction_days:
                            e.target.value === "" ? null : Math.max(1, Number(e.target.value)),
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Template de SLA</Label>
                    <Select
                      value={d.sla_template_name}
                      onValueChange={(v) => setD({ sla_template_name: v })}
                    >
                      <SelectTrigger>
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
                <p className="text-xs text-amber-800/80">
                  Cada alerta é enviado uma única vez por imobiliária e período (sem spam).
                  Ao mover a imobiliária de etapa ou registrar uma interação, o relógio reinicia.
                </p>
              </div>

              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={() => saveMutation.mutate(d)}
                  disabled={saveMutation.isPending}
                >
                  {saveMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Salvar
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
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
    <div className="flex items-center gap-2">
      <Switch checked={value} onCheckedChange={onChange} />
      <Label className="text-sm">{label}</Label>
    </div>
  );
}
