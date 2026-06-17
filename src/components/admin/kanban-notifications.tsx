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
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

type Settings = {
  stage_key: string;
  enabled: boolean;
  template_name: string;
  notify_consultant: boolean;
  notify_regional_director: boolean;
  notify_admins: boolean;
  extra_emails: string[];
};

const DEFAULT: Omit<Settings, "stage_key"> = {
  enabled: false,
  template_name: "kanban-stage-change",
  notify_consultant: true,
  notify_regional_director: false,
  notify_admins: false,
  extra_emails: [],
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

  if (stagesQuery.isLoading || settingsQuery.isLoading) {
    return <Loader2 className="h-5 w-5 animate-spin" />;
  }

  const stages = stagesQuery.data ?? [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Configure quais etapas do Kanban geram e-mail automático e quem é notificado quando uma imobiliária entra naquela etapa.
      </p>
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
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Template</Label>
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
