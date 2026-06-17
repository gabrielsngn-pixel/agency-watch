import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { GripVertical, Plus, Save, Trash2, Loader2, Pencil, Copy, MessageSquare, Mail } from "lucide-react";
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
        description="Configure status do Kanban, SLAs e templates de comunicação."
      />
      <div className="p-6 lg:p-10">
        <Tabs defaultValue="kanban" className="space-y-6">
          <TabsList>
            <TabsTrigger value="kanban">Status do Kanban</TabsTrigger>
            <TabsTrigger value="templates">Templates de comunicação</TabsTrigger>
            <TabsTrigger value="email-test">Teste de E-mail</TabsTrigger>
          </TabsList>
          <TabsContent value="kanban" className="space-y-6">
            <KanbanStagesAdmin />
          </TabsContent>
          <TabsContent value="templates" className="space-y-6">
            <TemplatesAdmin />
          </TabsContent>
          <TabsContent value="email-test" className="space-y-6">
            <EmailTestAdmin />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ---------- Kanban Stages with drag-and-drop ----------

function KanbanStagesAdmin() {
  const qc = useQueryClient();
  const { data: stages = [], isLoading } = useKanbanStages();
  const [draft, setDraft] = useState<Record<string, Partial<KanbanStage>>>({});
  const [newLabel, setNewLabel] = useState("");
  const [newSla, setNewSla] = useState(7);
  const [newColor, setNewColor] = useState<(typeof COLORS)[number]>("neutral");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const updateMut = useMutation({
    mutationFn: async (s: KanbanStage) => {
      const patch = draft[s.id] ?? {};
      const { error } = await supabase
        .from("kanban_stages")
        .update({
          label: patch.label ?? s.label,
          sla_days: patch.sla_days ?? s.sla_days,
          color: patch.color ?? s.color,
          is_visible: patch.is_visible ?? s.is_visible,
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

  const reorderMut = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      // Atribui novas posições em múltiplos de 10
      await Promise.all(
        orderedIds.map((id, i) =>
          supabase.from("kanban_stages").update({ position: (i + 1) * 10 }).eq("id", id),
        ),
      );
    },
    onSuccess: () => {
      toast.success("Ordem atualizada.");
      qc.invalidateQueries({ queryKey: ["kanban-stages"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao reordenar."),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("delete_kanban_stage", { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Etapa removida.");
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
      toast.success("Etapa criada.");
      qc.invalidateQueries({ queryKey: ["kanban-stages"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao criar etapa."),
  });

  const setDraftField = (id: string, k: keyof KanbanStage, v: any) =>
    setDraft((d) => ({ ...d, [id]: { ...(d[id] ?? {}), [k]: v } }));

  const sorted = [...stages].sort((a, b) => a.position - b.position);

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = sorted.findIndex((s) => s.id === active.id);
    const newIdx = sorted.findIndex((s) => s.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const next = arrayMove(sorted, oldIdx, newIdx);
    qc.setQueryData(["kanban-stages"], next.map((s, i) => ({ ...s, position: (i + 1) * 10 })));
    reorderMut.mutate(next.map((s) => s.id));
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-5">
        <div>
          <h3 className="font-display font-semibold text-base">Status do Kanban</h3>
          <p className="text-xs text-muted-foreground">
            Arraste pelas alças para reordenar. Edite SLA, cor e visibilidade. Alterações estruturais geram alerta no Mission Control.
          </p>
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Carregando…</div>
        ) : (
          <div className="overflow-x-auto">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"></TableHead>
                    <TableHead>Rótulo</TableHead>
                    <TableHead className="w-32">SLA (dias)</TableHead>
                    <TableHead className="w-40">Cor</TableHead>
                    <TableHead className="w-28">Visível</TableHead>
                    <TableHead className="w-48 text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <SortableContext items={sorted.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                  <TableBody>
                    {sorted.map((s) => {
                      const dirty = !!draft[s.id];
                      const cur = { ...s, ...(draft[s.id] ?? {}) };
                      return (
                        <SortableStageRow
                          key={s.id}
                          stage={cur}
                          isSystem={s.is_system}
                          dirty={dirty}
                          saving={updateMut.isPending}
                          onField={(k, v) => setDraftField(s.id, k, v)}
                          onSave={() => updateMut.mutate(s)}
                          onDelete={() => {
                            if (window.confirm(`Excluir "${s.label}"?`)) deleteMut.mutate(s.id);
                          }}
                        />
                      );
                    })}
                  </TableBody>
                </SortableContext>
              </Table>
            </DndContext>
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
        </div>
      </CardContent>
    </Card>
  );
}

function SortableStageRow({
  stage,
  isSystem,
  dirty,
  saving,
  onField,
  onSave,
  onDelete,
}: {
  stage: KanbanStage;
  isSystem: boolean;
  dirty: boolean;
  saving: boolean;
  onField: (k: keyof KanbanStage, v: any) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stage.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <TableRow ref={setNodeRef} style={style}>
      <TableCell>
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-1"
          aria-label="Arrastar para reordenar"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </TableCell>
      <TableCell>
        <Input value={stage.label} onChange={(e) => onField("label", e.target.value)} />
        {isSystem && <div className="text-[10px] text-muted-foreground mt-1">Sistema</div>}
      </TableCell>
      <TableCell>
        <Input
          type="number"
          min={1}
          value={stage.sla_days}
          onChange={(e) => onField("sla_days", Number(e.target.value))}
        />
      </TableCell>
      <TableCell>
        <Select value={stage.color} onValueChange={(v) => onField("color", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {COLORS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Switch checked={stage.is_visible} onCheckedChange={(v) => onField("is_visible", v)} />
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="outline" disabled={!dirty || saving} onClick={onSave}>
            <Save className="h-3.5 w-3.5 mr-1" /> Salvar
          </Button>
          <Button size="sm" variant="ghost" disabled={isSystem} onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

// ---------- Communication Templates ----------

type MessageTemplate = {
  id: string;
  name: string;
  channel: string;
  trigger: string;
  subject: string | null;
  body: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const TRIGGERS = [
  { value: "manual", label: "Envio manual" },
  { value: "sla_breach", label: "SLA estourado (automático)" },
  { value: "first_contact", label: "Primeiro contato" },
  { value: "follow_up", label: "Follow-up" },
  { value: "proposal_sent", label: "Proposta enviada" },
  { value: "closing", label: "Fechamento" },
];

const PLACEHOLDERS = [
  "{{agency_name}}",
  "{{contact_name}}",
  "{{consultant_name}}",
  "{{status}}",
  "{{next_step}}",
  "{{days_in_stage}}",
];

function TemplatesAdmin() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<MessageTemplate | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["message-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("message_templates")
        .select("*")
        .order("channel")
        .order("name");
      if (error) throw error;
      return (data ?? []) as MessageTemplate[];
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("message_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Template removido.");
      qc.invalidateQueries({ queryKey: ["message-templates"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao excluir."),
  });

  const byChannel = (ch: string) => templates.filter((t) => t.channel === ch);

  return (
    <>
      <Card>
        <CardContent className="p-6 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-display font-semibold text-base">Templates de comunicação</h3>
              <p className="text-xs text-muted-foreground">
                Modelos de mensagem para WhatsApp e e-mail. Use variáveis como{" "}
                <code className="text-[11px]">{"{{agency_name}}"}</code> para personalização.
              </p>
            </div>
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Novo template
            </Button>
          </div>

          {isLoading ? (
            <div className="text-sm text-muted-foreground">Carregando…</div>
          ) : templates.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center border rounded-md">
              Nenhum template cadastrado. Crie o primeiro para padronizar a comunicação.
            </div>
          ) : (
            <div className="space-y-6">
              {["whatsapp", "email"].map((ch) => (
                <div key={ch}>
                  <div className="flex items-center gap-2 mb-2">
                    {ch === "whatsapp" ? <MessageSquare className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                    <h4 className="font-medium text-sm capitalize">{ch === "email" ? "E-mail" : "WhatsApp"}</h4>
                    <Badge variant="secondary" className="text-[10px]">{byChannel(ch).length}</Badge>
                  </div>
                  {byChannel(ch).length === 0 ? (
                    <div className="text-xs text-muted-foreground border rounded-md p-3">Nenhum template neste canal.</div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nome</TableHead>
                          <TableHead className="w-48">Gatilho</TableHead>
                          {ch === "email" && <TableHead>Assunto</TableHead>}
                          <TableHead className="w-24">Ativo</TableHead>
                          <TableHead className="w-32 text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {byChannel(ch).map((t) => (
                          <TableRow key={t.id}>
                            <TableCell className="font-medium">{t.name}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {TRIGGERS.find((tr) => tr.value === t.trigger)?.label ?? t.trigger}
                            </TableCell>
                            {ch === "email" && (
                              <TableCell className="text-xs text-muted-foreground truncate max-w-xs">
                                {t.subject ?? "—"}
                              </TableCell>
                            )}
                            <TableCell>
                              <Badge variant={t.is_active ? "default" : "secondary"} className="text-[10px]">
                                {t.is_active ? "Sim" : "Não"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button size="icon" variant="ghost" onClick={() => setEditing(t)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => {
                                    if (window.confirm(`Excluir "${t.name}"?`)) deleteMut.mutate(t.id);
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {(editing || creating) && (
        <TemplateDialog
          template={editing}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
        />
      )}
    </>
  );
}

function TemplateDialog({
  template,
  onClose,
}: {
  template: MessageTemplate | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const isNew = !template;
  const [name, setName] = useState(template?.name ?? "");
  const [channel, setChannel] = useState(template?.channel ?? "whatsapp");
  const [trigger, setTrigger] = useState(template?.trigger ?? "manual");
  const [subject, setSubject] = useState(template?.subject ?? "");
  const [body, setBody] = useState(template?.body ?? "");
  const [isActive, setIsActive] = useState(template?.is_active ?? true);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Informe o nome.");
      if (!body.trim()) throw new Error("Informe o conteúdo.");
      const payload = {
        name: name.trim(),
        channel,
        trigger,
        subject: channel === "email" ? subject.trim() || null : null,
        body: body.trim(),
        is_active: isActive,
      };
      if (isNew) {
        const { error } = await supabase.from("message_templates").insert(payload);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("message_templates")
          .update(payload)
          .eq("id", template!.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(isNew ? "Template criado." : "Template atualizado.");
      qc.invalidateQueries({ queryKey: ["message-templates"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar."),
  });

  const insertVar = (v: string) => setBody((b) => b + v);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isNew ? "Novo template" : "Editar template"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Boas-vindas" />
            </div>
            <div>
              <Label className="text-xs">Canal</Label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="email">E-mail</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs">Gatilho</Label>
              <Select value={trigger} onValueChange={setTrigger}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TRIGGERS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {channel === "email" && (
            <div>
              <Label className="text-xs">Assunto</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Assunto do e-mail" />
            </div>
          )}

          <div>
            <Label className="text-xs">Conteúdo</Label>
            <Textarea
              rows={8}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Olá {{contact_name}}, ..."
              className="font-mono text-sm"
            />
            <div className="flex flex-wrap gap-1 mt-2">
              <span className="text-[11px] text-muted-foreground mr-1">Variáveis:</span>
              {PLACEHOLDERS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => insertVar(p)}
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded border bg-muted hover:bg-accent"
                >
                  {p}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(body);
                  toast.success("Copiado.");
                }}
                className="ml-auto text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <Copy className="h-3 w-3" /> Copiar
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={isActive} onCheckedChange={setIsActive} />
            <Label className="text-xs">Ativo</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            {saveMut.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Email Test Admin ----------

function EmailTestAdmin() {
  const [recipientEmail, setRecipientEmail] = useState("");
  const [testName, setTestName] = useState("");
  const [testMessage, setTestMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success?: boolean; message?: string } | null>(null);

  const handleSendTest = async () => {
    if (!recipientEmail.trim() || !recipientEmail.includes("@")) {
      toast.error("Informe um e-mail válido.");
      return;
    }
    setSending(true);
    setResult(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        toast.error("Sessão expirada. Faça login novamente.");
        setSending(false);
        return;
      }

      const res = await fetch("/lovable/email/transactional/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          templateName: "test-email",
          recipientEmail: recipientEmail.trim(),
          idempotencyKey: `test-${Date.now()}`,
          templateData: {
            name: testName.trim() || undefined,
            message: testMessage.trim() || undefined,
          },
        }),
      });

      const data = await res.json().catch(() => ({ error: "Resposta inválida" }));
      if (res.ok && data.success) {
        setResult({ success: true, message: "E-mail enfileirado com sucesso! Verifique a caixa de entrada em alguns minutos." });
        toast.success("E-mail de teste enviado!");
      } else {
        setResult({ success: false, message: data.error || "Falha ao enviar e-mail." });
        toast.error(data.error || "Falha ao enviar e-mail.");
      }
    } catch (e: any) {
      setResult({ success: false, message: e?.message || "Erro inesperado." });
      toast.error(e?.message || "Erro inesperado.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-6 space-y-5">
        <div>
          <h3 className="font-display font-semibold text-base">Teste de E-mail</h3>
          <p className="text-xs text-muted-foreground">
            Envie um e-mail de teste para verificar se a infraestrutura está funcionando.
            O domínio ainda está em verificação DNS — e-mails só serão entregues após a verificação completa.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Label className="text-xs">E-mail do destinatário</Label>
            <Input
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="seu@email.com"
            />
          </div>
          <div>
            <Label className="text-xs">Nome (opcional)</Label>
            <Input
              value={testName}
              onChange={(e) => setTestName(e.target.value)}
              placeholder="João Silva"
            />
          </div>
          <div>
            <Label className="text-xs">Mensagem personalizada (opcional)</Label>
            <Input
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
              placeholder="Sua mensagem aqui..."
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={handleSendTest} disabled={sending}>
            {sending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Mail className="h-3.5 w-3.5 mr-1" />}
            Enviar teste
          </Button>
        </div>

        {result && (
          <div className={`p-3 rounded-md text-sm ${result.success ? "bg-success/10 text-success border border-success/30" : "bg-destructive/10 text-destructive border border-destructive/30"}`}>
            {result.message}
          </div>
        )}

        <div className="text-xs text-muted-foreground border-t pt-4 mt-2">
          <p><strong>Status do domínio:</strong> Verificando DNS (notify.outreach.loftinsights.com.br)</p>
          <p className="mt-1">O envio funciona mesmo antes da verificação, mas a entrega só ocorre após o DNS ser confirmado.</p>
          <p className="mt-1">Monitoramento em: <strong>Cloud → Emails</strong></p>
        </div>
      </CardContent>
    </Card>
  );
}
