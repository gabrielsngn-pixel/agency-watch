import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Download, MessageSquarePlus } from "lucide-react";
import { ACTIVITY_TYPE_LABEL, AGENCY_ACTIVITY_TYPES, NEGOTIATION_STATUSES, type AgencyActivityType } from "@/lib/constants";

type Agency = { id: string; name: string; negotiation_status: string };

export function NewAgencyActivityDialog({ agency, onSaved }: { agency: Agency; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    activity_type: "follow_up" as AgencyActivityType,
    activity_type_detail: "",
    summary: "",
    interaction_result: "",
    next_steps: "",
    next_step_date: "",
    status_changed: false,
    new_status: agency.negotiation_status,
    c_level_support_needed: false,
    attach_as_client_base: false,
  });
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [key]: value }));


  const submit = async () => {
    if (!form.summary.trim()) return toast.error("Descreva o resumo da atividade.");
    if (form.activity_type === "other" && !form.activity_type_detail.trim()) return toast.error("Descreva o tipo de atividade escolhido como Outro.");
    if (form.status_changed && form.new_status === agency.negotiation_status) return toast.error("Selecione uma nova etapa diferente da atual.");
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessão expirada.");
      const isReceivedBase = form.interaction_result.trim().toLocaleLowerCase("pt-BR") === "base recebida";
      let attachmentUrl: string | null = null;
      if (file) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        attachmentUrl = isReceivedBase
          ? `${agency.id}/${crypto.randomUUID()}-${safeName}`
          : `${user.id}/activities/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await supabase.storage.from(isReceivedBase ? "agency-files" : "client-imports").upload(attachmentUrl, file);
        if (uploadError) throw uploadError;
      }
      const name = String(user.user_metadata?.full_name ?? user.email ?? "Usuário");
      const { data: activity, error } = await supabase.from("agency_activities").insert({
        agency_id: agency.id,
        agency_name: agency.name,
        activity_type: form.activity_type,
        activity_type_detail: form.activity_type === "other" ? form.activity_type_detail.trim() : null,
        registered_by_user_id: user.id,
        registered_by_name: name,
        registered_by_email: user.email ?? null,
        summary: form.summary.trim(),
        interaction_result: form.interaction_result.trim() || null,
        next_steps: form.next_steps.trim() || null,
        next_step_date: form.next_step_date || null,
        status_changed: form.status_changed,
        new_status: form.status_changed ? form.new_status as (typeof NEGOTIATION_STATUSES)[number] : null,
        c_level_support_needed: form.c_level_support_needed,
        attachment_url: attachmentUrl,
        attachment_name: file?.name ?? null,
        source: "web",
      }).select("id").single();
      if (error) throw error;
      if (file && attachmentUrl && isReceivedBase) {
        const { error: fileError } = await supabase.from("agency_files").insert({
          agency_id: agency.id,
          activity_id: activity.id,
          uploaded_by: user.id,
          uploaded_by_name: name,
          uploaded_by_email: user.email ?? null,
          file_name: file.name,
          file_url: attachmentUrl,
          file_type: file.type || null,
          file_size: file.size,
          processing_status: "pending",
        });
        if (fileError) throw fileError;
      }
      toast.success("Atividade registrada na timeline.");
      setOpen(false);
      setFile(null);
      setForm((current) => ({ ...current, activity_type_detail: "", summary: "", interaction_result: "", next_steps: "", next_step_date: "", status_changed: false, c_level_support_needed: false }));
      onSaved();
    } catch (error: any) {
      toast.error(error?.message ?? "Não foi possível registrar a atividade.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><MessageSquarePlus className="h-4 w-4 mr-1.5" /> Registrar atividade / FUP</Button></DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Atividade da imobiliária</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Tipo de atividade">
            <Select value={form.activity_type} onValueChange={(value) => set("activity_type", value as AgencyActivityType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{AGENCY_ACTIVITY_TYPES.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          {form.activity_type === "other" && <Field label="Descreva o tipo de atividade *"><Input value={form.activity_type_detail} onChange={(event) => set("activity_type_detail", event.target.value)} maxLength={500} /></Field>}
          <Field label="Data da próxima ação"><Input type="date" value={form.next_step_date} onChange={(event) => set("next_step_date", event.target.value)} /></Field>
          <Field label="Resumo da atividade *" full><Textarea rows={3} value={form.summary} onChange={(event) => set("summary", event.target.value)} placeholder="O que aconteceu com esta imobiliária?" /></Field>
          <Field label="Resultado da interação" full><Textarea rows={2} value={form.interaction_result} onChange={(event) => set("interaction_result", event.target.value)} /></Field>
          <Field label="Próximo passo" full><Textarea rows={2} value={form.next_steps} onChange={(event) => set("next_steps", event.target.value)} /></Field>
          <div className="md:col-span-2 rounded-lg border border-border p-4 space-y-4">
            <div className="flex items-center justify-between gap-3"><Label>Mudou de etapa no Kanban?</Label><Switch checked={form.status_changed} onCheckedChange={(value) => set("status_changed", value)} /></div>
            {form.status_changed && <Field label="Nova etapa"><Select value={form.new_status} onValueChange={(value) => set("new_status", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{NEGOTIATION_STATUSES.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent></Select></Field>}
          </div>
          <div className="flex items-center gap-3"><Switch checked={form.c_level_support_needed} onCheckedChange={(value) => set("c_level_support_needed", value)} /><Label className="font-normal">Precisa de apoio C-Level</Label></div>
          <Field label="Anexo / base de clientes"><Input type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></Field>
        </div>
        <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={submit} disabled={saving}>{saving ? "Salvando…" : "Registrar atividade"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AgencyActivityTimeline({ activities }: { activities: any[] }) {
  const download = async (activity: any) => {
    if (!activity.attachment_url) return;
    const bucket = activity.interaction_result?.trim().toLocaleLowerCase("pt-BR") === "base recebida" ? "agency-files" : "client-imports";
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(activity.attachment_url, 60);
    if (error || !data?.signedUrl) return toast.error("Não foi possível abrir o anexo.");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };
  if (!activities.length) return <div className="text-sm text-muted-foreground py-8 text-center">Nenhuma atividade registrada para esta imobiliária.</div>;
  return <div className="space-y-0">{activities.map((activity) => (
    <article key={activity.id} className="relative border-l-2 border-primary/25 pl-5 pb-7 last:pb-1">
      <span className="absolute -left-[5px] top-1 h-2 w-2 rounded-full bg-primary shadow-[0_0_8px_var(--primary)]" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="border-primary/30 text-primary">{ACTIVITY_TYPE_LABEL[activity.activity_type as AgencyActivityType] ?? activity.activity_type}</Badge>{activity.status_changed && <Badge className="bg-info/15 text-info border-info/30">Mudança de etapa</Badge>}</div>
        <time className="text-xs text-muted-foreground">{new Date(activity.activity_date).toLocaleString("pt-BR")}</time>
      </div>
      <h3 className="font-medium mt-3">{activity.summary}</h3>
      <div className="mt-2 grid gap-1.5 text-sm text-muted-foreground">
        {activity.activity_type_detail && <p><b className="text-foreground/80">Tipo:</b> {activity.activity_type_detail}</p>}
        {activity.interaction_result && <p><b className="text-foreground/80">Resultado:</b> {activity.interaction_result}{activity.interaction_result_detail ? ` — ${activity.interaction_result_detail}` : ""}</p>}
        {activity.next_steps && <p><b className="text-foreground/80">Próximo passo:</b> {activity.next_steps}{activity.next_step_date ? ` · ${new Date(`${activity.next_step_date}T12:00:00`).toLocaleDateString("pt-BR")}` : ""}</p>}
        {activity.status_changed && <p className="flex items-center gap-1.5"><b className="text-foreground/80">Etapa:</b> {activity.previous_status} → {activity.new_status}</p>}
        {activity.base_origin && <p><b className="text-foreground/80">Origem da base:</b> {activity.base_origin}</p>}
        {activity.notes && <p><b className="text-foreground/80">Observações:</b> {activity.notes}</p>}
        <p className="text-xs">Registrado por {activity.registered_by_name || activity.registered_by_email || "—"} · origem {activity.source}</p>
      </div>
      {activity.attachment_url && <Button variant="outline" size="sm" className="mt-3" onClick={() => download(activity)}><Download className="h-3.5 w-3.5 mr-1.5" /> {activity.attachment_name || "Abrir anexo"}</Button>}
      {activity.c_level_support_needed && <div className="mt-3 text-xs text-warning">Apoio C-Level solicitado nesta atividade</div>}
    </article>
  ))}</div>;
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return <div className={full ? "md:col-span-2 space-y-1.5" : "space-y-1.5"}><Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>{children}</div>;
}