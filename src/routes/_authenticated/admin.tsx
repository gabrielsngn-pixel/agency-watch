import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowDown, ArrowUp, Plus, Save, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useKanbanStages, type KanbanStage } from "@/hooks/use-kanban-stages";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPanel,
});

const COLORS = ["neutral", "info", "warning", "success", "destructive"] as const;

function AdminPanel() {
  const { isAdmin, loading } = useCurrentUser();
  if (!loading && !isAdmin) {
    return (
      <div className="p-10">
        <PageHeader title="Acesso restrito" description="Somente administradores acessam o painel." />
      </div>
    );
  }
  return (
    <div>
      <PageHeader
        title="Painel Administrativo"
        description="Configure status do Kanban, SLAs e parâmetros operacionais."
      />
      <div className="p-6 lg:p-10 space-y-6">
        <KanbanStagesAdmin />
      </div>
    </div>
  );
}

function KanbanStagesAdmin() {
  const qc = useQueryClient();
  const { data: stages = [], isLoading } = useKanbanStages();
  const [draft, setDraft] = useState<Record<string, Partial<KanbanStage>>>({});
  const [newLabel, setNewLabel] = useState("");
  const [newSla, setNewSla] = useState(7);
  const [newColor, setNewColor] = useState<(typeof COLORS)[number]>("neutral");

  const updateMut = useMutation({
    mutationFn: async (s: KanbanStage & Partial<KanbanStage>) => {
      const patch = draft[s.id] ?? {};
      const { error } = await supabase
        .from("kanban_stages")
        .update({
          label: patch.label ?? s.label,
          sla_days: patch.sla_days ?? s.sla_days,
          color: patch.color ?? s.color,
          is_visible: patch.is_visible ?? s.is_visible,
          position: patch.position ?? s.position,
        })
        .eq("id", s.id);
      if (error) throw error;
    },
    onSuccess: (_d, s) => {
      setDraft((d) => {
        const next = { ...d };
        delete next[s.id];
        return next;
      });
      toast.success("Etapa salva.");
      qc.invalidateQueries({ queryKey: ["kanban-stages"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar."),
  });

  const moveMut = useMutation({
    mutationFn: async ({ id, direction }: { id: string; direction: "up" | "down" }) => {
      const sorted = [...stages].sort((a, b) => a.position - b.position);
      const idx = sorted.findIndex((s) => s.id === id);
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return;
      const a = sorted[idx];
      const b = sorted[swapIdx];
      const { error } = await supabase.from("kanban_stages").upsert([
        { id: a.id, position: b.position },
        { id: b.id, position: a.position },
      ]);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kanban-stages"] }),
    onError: (e: any) => toast.error(e?.message ?? "Falha ao reordenar."),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("delete_kanban_stage", { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Etapa removida. Verifique alerta no Mission Control.");
      qc.invalidateQueries({ queryKey: ["kanban-stages"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao excluir."),
  });

  const createMut = useMutation({
    mutationFn: async () => {
      if (!newLabel.trim()) throw new Error("Informe o rótulo do status.");
      const { error } = await supabase.rpc("add_kanban_stage", {
        p_label: newLabel.trim(),
        p_sla_days: newSla,
        p_color: newColor,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewLabel("");
      setNewSla(7);
      setNewColor("neutral");
      toast.success("Etapa criada. Verifique alerta no Mission Control.");
      qc.invalidateQueries({ queryKey: ["kanban-stages"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao criar etapa."),
  });

  const setDraftField = (id: string, k: keyof KanbanStage, v: any) =>
    setDraft((d) => ({ ...d, [id]: { ...(d[id] ?? {}), [k]: v } }));

  const sorted = [...stages].sort((a, b) => a.position - b.position);

  return (
    <Card>
      <CardContent className="p-6 space-y-5">
        <div>
          <h3 className="font-display font-semibold text-base">Status do Kanban</h3>
          <p className="text-xs text-muted-foreground">
            Ordene, edite, oculte ou exclua etapas. Cada alteração estrutural gera um alerta no Mission Control.
          </p>
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Carregando…</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Ordem</TableHead>
                  <TableHead>Rótulo</TableHead>
                  <TableHead className="w-32">SLA (dias)</TableHead>
                  <TableHead className="w-40">Cor</TableHead>
                  <TableHead className="w-28">Visível</TableHead>
                  <TableHead className="w-48 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((s, i) => {
                  const dirty = !!draft[s.id];
                  const cur = { ...s, ...(draft[s.id] ?? {}) };
                  return (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="icon" variant="outline" disabled={i === 0} onClick={() => moveMut.mutate({ id: s.id, direction: "up" })}>
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="outline" disabled={i === sorted.length - 1} onClick={() => moveMut.mutate({ id: s.id, direction: "down" })}>
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input value={cur.label} onChange={(e) => setDraftField(s.id, "label", e.target.value)} />
                        {s.is_system && <div className="text-[10px] text-muted-foreground mt-1">Sistema</div>}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={1}
                          value={cur.sla_days}
                          onChange={(e) => setDraftField(s.id, "sla_days", Number(e.target.value))}
                        />
                      </TableCell>
                      <TableCell>
                        <Select value={cur.color} onValueChange={(v) => setDraftField(s.id, "color", v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {COLORS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Switch checked={cur.is_visible} onCheckedChange={(v) => setDraftField(s.id, "is_visible", v)} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" disabled={!dirty || updateMut.isPending} onClick={() => updateMut.mutate(s)}>
                            <Save className="h-3.5 w-3.5 mr-1" /> Salvar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={s.is_system}
                            onClick={() => {
                              if (window.confirm(`Excluir "${s.label}"?`)) deleteMut.mutate(s.id);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="border-t pt-5 space-y-3">
          <h4 className="font-medium text-sm">Adicionar novo status</h4>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">Rótulo</Label>
              <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Ex.: Em onboarding" />
            </div>
            <div>
              <Label className="text-xs">SLA (dias)</Label>
              <Input type="number" min={1} value={newSla} onChange={(e) => setNewSla(Number(e.target.value))} />
            </div>
            <div>
              <Label className="text-xs">Cor</Label>
              <Select value={newColor} onValueChange={(v) => setNewColor(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COLORS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={() => createMut.mutate()} disabled={createMut.isPending || !newLabel.trim()} className="w-full">
                {createMut.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                Criar etapa
              </Button>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Ao criar ou excluir uma etapa, um alerta aparece no Mission Control lembrando de ajustar o Forms.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
