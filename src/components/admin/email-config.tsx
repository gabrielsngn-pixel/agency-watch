import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TEMPLATES } from "@/lib/email-templates/registry";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import {
  getEmailSendState,
  updateEmailSendState,
} from "@/lib/email-admin.functions";

export function EmailConfig() {
  const qc = useQueryClient();
  const fetchState = useServerFn(getEmailSendState);
  const saveState = useServerFn(updateEmailSendState);

  const stateQuery = useQuery({
    queryKey: ["email-send-state"],
    queryFn: () => fetchState(),
  });

  const [form, setForm] = useState({
    batch_size: 10,
    send_delay_ms: 200,
    auth_email_ttl_minutes: 15,
    transactional_email_ttl_minutes: 60,
  });

  useEffect(() => {
    if (stateQuery.data) {
      setForm({
        batch_size: stateQuery.data.batch_size,
        send_delay_ms: stateQuery.data.send_delay_ms,
        auth_email_ttl_minutes: stateQuery.data.auth_email_ttl_minutes,
        transactional_email_ttl_minutes: stateQuery.data.transactional_email_ttl_minutes,
      });
    }
  }, [stateQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () => saveState({ data: form }),
    onSuccess: () => {
      toast.success("Configuração salva");
      qc.invalidateQueries({ queryKey: ["email-send-state"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao salvar"),
  });

  // Template enable/disable
  const templateQuery = useQuery({
    queryKey: ["email-template-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_template_settings")
        .select("*");
      if (error) throw error;
      return data;
    },
  });

  const toggleTemplate = useMutation({
    mutationFn: async ({ name, enabled }: { name: string; enabled: boolean }) => {
      const { error } = await supabase
        .from("email_template_settings")
        .upsert({ template_name: name, enabled }, { onConflict: "template_name" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["email-template-settings"] }),
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  const templateEnabledMap = new Map(
    (templateQuery.data ?? []).map((t: any) => [t.template_name, t.enabled])
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Parâmetros do cron de envio</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {stateQuery.isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field
                  label="Tamanho do lote por execução"
                  hint="Quantos e-mails sair por execução do cron (a cada 5s)."
                  value={form.batch_size}
                  onChange={(v) => setForm((f) => ({ ...f, batch_size: v }))}
                  min={1}
                  max={500}
                />
                <Field
                  label="Delay entre envios (ms)"
                  hint="Pausa entre cada envio dentro do lote."
                  value={form.send_delay_ms}
                  onChange={(v) => setForm((f) => ({ ...f, send_delay_ms: v }))}
                  min={0}
                  max={5000}
                />
                <Field
                  label="TTL e-mails de autenticação (min)"
                  hint="Tempo máximo na fila antes de descartar."
                  value={form.auth_email_ttl_minutes}
                  onChange={(v) =>
                    setForm((f) => ({ ...f, auth_email_ttl_minutes: v }))
                  }
                  min={1}
                  max={1440}
                />
                <Field
                  label="TTL e-mails da aplicação (min)"
                  hint="Tempo máximo na fila antes de descartar."
                  value={form.transactional_email_ttl_minutes}
                  onChange={(v) =>
                    setForm((f) => ({ ...f, transactional_email_ttl_minutes: v }))
                  }
                  min={1}
                  max={1440}
                />
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                >
                  {saveMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Salvar parâmetros
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Templates de e-mail</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Desative para impedir que disparos automáticos usem o template. Não afeta envios manuais de teste.
          </p>
          <div className="space-y-3">
            {Object.entries(TEMPLATES).map(([name, tpl]) => {
              const enabled = templateEnabledMap.get(name) ?? true;
              return (
                <div
                  key={name}
                  className="flex items-center justify-between border rounded-md p-3"
                >
                  <div>
                    <div className="font-medium">{tpl.displayName ?? name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{name}</div>
                  </div>
                  <Switch
                    checked={enabled}
                    onCheckedChange={(v) =>
                      toggleTemplate.mutate({ name, enabled: v })
                    }
                  />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
