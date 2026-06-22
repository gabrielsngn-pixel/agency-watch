import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AGENCY_ACTIVITY_TYPES, BR_STATES } from "@/lib/constants";

export const Route = createFileRoute("/registro")({
  head: () => ({
    meta: [
      { title: "Registro rápido — Imobiliárias" },
      { name: "description", content: "Página para registrar atividades, bases e movimentações de imobiliárias sem precisar acessar o CRM." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: RegistroPage,
});

type AgencyOption = { id: string; name: string; city: string; state: string | null; negotiation_status?: string | null };
type StageOption = { stage_key: string; label: string; color: string };


const CONSULTANT_KEY = "registro:consultant_email";

function RegistroPage() {
  const [email, setEmail] = useState("");
  const [consultantName, setConsultantName] = useState<string | null>(null);
  const [consultantStatus, setConsultantStatus] = useState<"idle" | "checking" | "found" | "new" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [stages, setStages] = useState<StageOption[]>([]);
  const [tab, setTab] = useState("attach_base");

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(CONSULTANT_KEY) : null;
    if (saved) setEmail(saved);
  }, []);

  useEffect(() => {
    fetch("/api/public/registro/lookup?type=stages")
      .then((r) => r.json())
      .then((d) => { if (d.ok) setStages(d.items); })
      .catch(() => {});
  }, []);

  // Validate consultant email (debounced).
  useEffect(() => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.includes("@")) {
      setConsultantName(null);
      setConsultantStatus("idle");
      setStatusMessage(null);
      return;
    }
    setConsultantStatus("checking");
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/public/registro/lookup?type=consultant&email=${encodeURIComponent(trimmed)}`);
        const d = await res.json();
        window.localStorage.setItem(CONSULTANT_KEY, trimmed);
        if (d.ok && d.found) {
          setConsultantName(d.consultant.name);
          setConsultantStatus("found");
          setStatusMessage(null);
        } else {
          setConsultantName(null);
          setConsultantStatus("new");
          setStatusMessage("E-mail novo: será cadastrado automaticamente ao enviar o primeiro registro.");
        }
      } catch {
        setConsultantStatus("error");
        setStatusMessage("Não foi possível validar o e-mail agora.");
      }
    }, 400);
    return () => clearTimeout(t);
  }, [email]);

  const isNewConsultant = consultantStatus === "new";
  const canSubmit =
    consultantStatus === "found" ||
    (consultantStatus === "new" && newName.trim().length >= 2);

  return (
    <div className="min-h-screen bg-muted/30 py-6 px-4 sm:py-10">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold sm:text-3xl">Registro rápido</h1>
          <p className="text-sm text-muted-foreground">
            Anexe bases, cadastre imobiliárias, registre FUP ou solicite movimentação no Kanban. Tudo cai direto no CRM.
          </p>
        </header>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Quem está registrando?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="consultant_email">E-mail do consultor</Label>
              <Input
                id="consultant_email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu.email@empresa.com"
              />
              {consultantStatus === "found" && consultantName && (
                <p className="text-xs text-emerald-600">Identificado como <strong>{consultantName}</strong>.</p>
              )}
              {consultantStatus === "checking" && (
                <p className="text-xs text-muted-foreground">Validando…</p>
              )}
              {statusMessage && consultantStatus !== "found" && (
                <p className={`text-xs ${consultantStatus === "error" ? "text-destructive" : "text-amber-600"}`}>{statusMessage}</p>
              )}
            </div>
            {isNewConsultant && (
              <div className="space-y-2">
                <Label htmlFor="consultant_name">Seu nome completo *</Label>
                <Input
                  id="consultant_name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Como devemos te identificar no CRM"
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-3 h-auto">
            <TabsTrigger value="attach_base" className="text-xs sm:text-sm">Anexar base</TabsTrigger>
            <TabsTrigger value="new_agency" className="text-xs sm:text-sm">Nova imobiliária</TabsTrigger>
            <TabsTrigger value="fup" className="text-xs sm:text-sm">Atividade / FUP</TabsTrigger>
          </TabsList>

          <TabsContent value="attach_base">
            <AttachBaseForm email={email} disabled={!canSubmit} consultantName={isNewConsultant ? newName : undefined} onGoNewAgency={() => setTab("new_agency")} />
          </TabsContent>
          <TabsContent value="new_agency">
            <NewAgencyForm email={email} disabled={!canSubmit} stages={stages} consultantName={isNewConsultant ? newName : undefined} />
          </TabsContent>
          <TabsContent value="fup">
            <FupForm email={email} disabled={!canSubmit} stages={stages} consultantName={isNewConsultant ? newName : undefined} onGoNewAgency={() => setTab("new_agency")} />
          </TabsContent>
        </Tabs>

      </div>
    </div>
  );
}


// --- Shared agency autocomplete ---------------------------------------------

function AgencyPicker({ value, onChange, onNotFound }: { value: AgencyOption | null; onChange: (a: AgencyOption | null) => void; onNotFound?: () => void }) {
  const [query, setQuery] = useState(value?.name ?? "");
  const [options, setOptions] = useState<AgencyOption[]>([]);
  const [open, setOpen] = useState(false);
  const [searched, setSearched] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setQuery(value?.name ?? ""); }, [value]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (query.trim().length < 2) { setOptions([]); setSearched(false); return; }
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/public/registro/lookup?type=agencies&q=${encodeURIComponent(query.trim())}`);
        const d = await r.json();
        if (d.ok) { setOptions(d.items); setSearched(true); }
      } catch {}
    }, 250);
  }, [query]);

  const showNotFound = !value && searched && options.length === 0 && query.trim().length >= 2;

  return (
    <div className="space-y-1">
      <div className="relative">
        <Input
          value={query}
          onChange={(e) => { setQuery(e.target.value); onChange(null); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Digite o nome da imobiliária"
        />
        {open && options.length > 0 && (
          <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md max-h-64 overflow-auto">
            {options.map((opt) => (
              <button
                type="button"
                key={opt.id}
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                onMouseDown={(e) => { e.preventDefault(); onChange(opt); setQuery(opt.name); setOpen(false); }}
              >
                <div className="font-medium">{opt.name}</div>
                <div className="text-xs text-muted-foreground">{opt.city}{opt.state ? ` / ${opt.state}` : ""}</div>
              </button>
            ))}
          </div>
        )}
      </div>
      {showNotFound && onNotFound && (
        <p className="text-xs text-muted-foreground">
          Não encontrou a imobiliária?{" "}
          <button type="button" onClick={onNotFound} className="text-primary underline underline-offset-2 hover:opacity-80">
            Cadastre aqui
          </button>
        </p>
      )}
    </div>
  );
}


// --- Helpers ----------------------------------------------------------------

async function submit(payload: Record<string, unknown>, file?: File | null) {
  const form = new FormData();
  form.append("payload", JSON.stringify(payload));
  if (file) form.append("file", file);
  const res = await fetch("/api/public/registro/submit", { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error ?? "Falha ao salvar");
  return data;
}

function SuccessPanel({ message, onReset }: { message: string; onReset: () => void }) {
  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm space-y-3">
      <p className="text-emerald-800">{message}</p>
      <Button size="sm" variant="outline" onClick={onReset}>Registrar outro</Button>
    </div>
  );
}

// --- 1) Anexar base ---------------------------------------------------------

function AttachBaseForm({ email, disabled, consultantName, onGoNewAgency }: { email: string; disabled: boolean; consultantName?: string; onGoNewAgency?: () => void }) {
  const [agency, setAgency] = useState<AgencyOption | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [baseOrigin, setBaseOrigin] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const reset = () => { setAgency(null); setFile(null); setBaseOrigin(""); setNotes(""); setSuccess(null); };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agency) return toast.error("Selecione a imobiliária.");
    if (!file) return toast.error("Anexe o arquivo da base.");
    setLoading(true);
    try {
      await submit({
        consultant_email: email.trim().toLowerCase(),
        consultant_name: consultantName,
        flow: "attach_base",
        agency_id: agency.id,
        base_origin: baseOrigin || undefined,
        notes: notes || undefined,
      }, file);

      setSuccess(`Base de ${agency.name} enviada com sucesso.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar");
    } finally {
      setLoading(false);
    }
  };

  if (success) return <Card className="mt-4"><CardContent className="pt-6"><SuccessPanel message={success} onReset={reset} /></CardContent></Card>;

  return (
    <Card className="mt-4">
      <CardHeader><CardTitle className="text-base">Anexar base de clientes</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Imobiliária *</Label>
            <AgencyPicker value={agency} onChange={setAgency} onNotFound={onGoNewAgency} />

          </div>
          <div className="space-y-2">
            <Label htmlFor="file">Arquivo da base * (XLSX, CSV, PDF até 20MB)</Label>
            <Input id="file" type="file" accept=".xlsx,.csv,.pdf,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="base_origin">Origem da base</Label>
            <Input id="base_origin" value={baseOrigin} onChange={(e) => setBaseOrigin(e.target.value)} placeholder="Ex: Sistema XYZ, planilha enviada por e-mail..." />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Observações</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
          <Button type="submit" disabled={disabled || loading} className="w-full">
            {loading ? "Enviando..." : "Enviar base"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// --- 2) Nova imobiliária ----------------------------------------------------

function NewAgencyForm({ email, disabled, stages, consultantName }: { email: string; disabled: boolean; stages: StageOption[]; consultantName?: string }) {
  const [form, setForm] = useState({
    agency_name: "", city: "", state: "",
    main_contact: "", contact_role: "", contact_phone: "", contact_email: "",
    current_guarantor: "", perceived_potential: "",
    initial_kanban_status: "Pipeline de Prospecção",
    notes: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [attachBase, setAttachBase] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const reset = () => {
    setForm({ agency_name: "", city: "", state: "", main_contact: "", contact_role: "", contact_phone: "", contact_email: "", current_guarantor: "", perceived_potential: "", initial_kanban_status: "Pipeline de Prospecção", notes: "" });
    setFile(null); setAttachBase(false); setSuccess(null);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.agency_name.trim() || !form.city.trim() || !form.state) return toast.error("Nome, cidade e UF são obrigatórios.");
    if (attachBase && !file) return toast.error("Anexe o arquivo da base.");
    setLoading(true);
    try {
      await submit({
        consultant_email: email.trim().toLowerCase(),
        consultant_name: consultantName,
        flow: "new_agency",
        ...form,
      }, attachBase ? file : null);

      setSuccess(`Imobiliária ${form.agency_name} cadastrada.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally { setLoading(false); }
  };

  if (success) return <Card className="mt-4"><CardContent className="pt-6"><SuccessPanel message={success} onReset={reset} /></CardContent></Card>;

  return (
    <Card className="mt-4">
      <CardHeader><CardTitle className="text-base">Cadastrar nova imobiliária</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-2">
              <Label>Nome *</Label>
              <Input value={form.agency_name} onChange={(e) => set("agency_name", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>UF *</Label>
              <Select value={form.state} onValueChange={(v) => set("state", v)}>
                <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                <SelectContent>{BR_STATES.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Cidade *</Label>
            <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Contato principal</Label><Input value={form.main_contact} onChange={(e) => set("main_contact", e.target.value)} /></div>
            <div className="space-y-2"><Label>Cargo</Label><Input value={form.contact_role} onChange={(e) => set("contact_role", e.target.value)} /></div>
            <div className="space-y-2"><Label>Telefone</Label><Input value={form.contact_phone} onChange={(e) => set("contact_phone", e.target.value)} /></div>
            <div className="space-y-2"><Label>E-mail</Label><Input type="email" value={form.contact_email} onChange={(e) => set("contact_email", e.target.value)} /></div>
            <div className="space-y-2"><Label>Garantidor atual</Label><Input value={form.current_guarantor} onChange={(e) => set("current_guarantor", e.target.value)} /></div>
            <div className="space-y-2"><Label>Potencial percebido</Label><Input value={form.perceived_potential} onChange={(e) => set("perceived_potential", e.target.value)} /></div>
          </div>
          <div className="space-y-2">
            <Label>Etapa inicial no Kanban</Label>
            <Select value={form.initial_kanban_status} onValueChange={(v) => set("initial_kanban_status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{stages.map((s) => <SelectItem key={s.stage_key} value={s.stage_key}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label>Anexar base de clientes junto</Label>
              <p className="text-xs text-muted-foreground">Opcional: envie a base já no cadastro.</p>
            </div>
            <Switch checked={attachBase} onCheckedChange={setAttachBase} />
          </div>
          {attachBase && (
            <Input type="file" accept=".xlsx,.csv,.pdf,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          )}
          <Button type="submit" disabled={disabled || loading} className="w-full">{loading ? "Salvando..." : "Cadastrar imobiliária"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}

// --- 3) FUP -----------------------------------------------------------------

function FupForm({ email, disabled, consultantName }: { email: string; disabled: boolean; consultantName?: string }) {
  const [agency, setAgency] = useState<AgencyOption | null>(null);
  const [activityType, setActivityType] = useState<string>("call");
  const [activityTypeDetail, setActivityTypeDetail] = useState("");
  const [summary, setSummary] = useState("");
  const [interactionResult, setInteractionResult] = useState("");
  const [nextSteps, setNextSteps] = useState("");
  const [nextStepDate, setNextStepDate] = useState("");
  const [cLevel, setCLevel] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const reset = () => { setAgency(null); setActivityType("call"); setActivityTypeDetail(""); setSummary(""); setInteractionResult(""); setNextSteps(""); setNextStepDate(""); setCLevel(false); setSuccess(null); };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agency) return toast.error("Selecione a imobiliária.");
    if (!summary.trim()) return toast.error("Descreva a atividade.");
    if (activityType === "other" && !activityTypeDetail.trim()) return toast.error("Descreva o tipo de atividade.");
    setLoading(true);
    try {
      await submit({
        consultant_email: email.trim().toLowerCase(),
        consultant_name: consultantName,
        flow: "fup",
        agency_id: agency.id,
        activity_type: activityType,
        activity_type_detail: activityTypeDetail || undefined,
        summary,
        interaction_result: interactionResult || undefined,
        next_steps: nextSteps || undefined,
        next_step_date: nextStepDate || undefined,
        c_level_support_needed: cLevel,
      });

      setSuccess(`Atividade registrada em ${agency.name}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally { setLoading(false); }
  };

  const types = useMemo(() => AGENCY_ACTIVITY_TYPES.filter(([k]) => k !== "client_base_received"), []);

  if (success) return <Card className="mt-4"><CardContent className="pt-6"><SuccessPanel message={success} onReset={reset} /></CardContent></Card>;

  return (
    <Card className="mt-4">
      <CardHeader><CardTitle className="text-base">Registrar atividade / FUP</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2"><Label>Imobiliária *</Label><AgencyPicker value={agency} onChange={setAgency} /></div>
          <div className="space-y-2">
            <Label>Tipo de atividade *</Label>
            <Select value={activityType} onValueChange={setActivityType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{types.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {activityType === "other" && (
            <div className="space-y-2"><Label>Especifique o tipo *</Label><Input value={activityTypeDetail} onChange={(e) => setActivityTypeDetail(e.target.value)} /></div>
          )}
          <div className="space-y-2"><Label>Resumo *</Label><Textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} /></div>
          <div className="space-y-2"><Label>Resultado da interação</Label><Input value={interactionResult} onChange={(e) => setInteractionResult(e.target.value)} /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Próximo passo</Label><Input value={nextSteps} onChange={(e) => setNextSteps(e.target.value)} /></div>
            <div className="space-y-2"><Label>Data do próximo passo</Label><Input type="date" value={nextStepDate} onChange={(e) => setNextStepDate(e.target.value)} /></div>
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <Label>Precisa de apoio C-Level?</Label>
            <Switch checked={cLevel} onCheckedChange={setCLevel} />
          </div>
          <Button type="submit" disabled={disabled || loading} className="w-full">{loading ? "Salvando..." : "Registrar atividade"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}

// --- 4) Mover etapa ---------------------------------------------------------

function KanbanMoveForm({ email, disabled, stages, consultantName }: { email: string; disabled: boolean; stages: StageOption[]; consultantName?: string }) {
  const [agency, setAgency] = useState<AgencyOption | null>(null);
  const [requestedStatus, setRequestedStatus] = useState<string>("");
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const reset = () => { setAgency(null); setRequestedStatus(""); setSummary(""); setSuccess(null); };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agency) return toast.error("Selecione a imobiliária.");
    if (!requestedStatus) return toast.error("Escolha a etapa de destino.");
    setLoading(true);
    try {
      await submit({
        consultant_email: email.trim().toLowerCase(),
        consultant_name: consultantName,
        flow: "kanban_move",
        agency_id: agency.id,
        requested_status: requestedStatus,
        summary: summary || undefined,
      });

      setSuccess(`Solicitação enviada. Um admin irá aprovar a mudança no CRM.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar");
    } finally { setLoading(false); }
  };

  if (success) return <Card className="mt-4"><CardContent className="pt-6"><SuccessPanel message={success} onReset={reset} /></CardContent></Card>;

  return (
    <Card className="mt-4">
      <CardHeader><CardTitle className="text-base">Solicitar movimentação no Kanban</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2"><Label>Imobiliária *</Label><AgencyPicker value={agency} onChange={setAgency} /></div>
          <div className="space-y-2">
            <Label>Etapa de destino *</Label>
            <Select value={requestedStatus} onValueChange={setRequestedStatus}>
              <SelectTrigger><SelectValue placeholder="Selecione a nova etapa" /></SelectTrigger>
              <SelectContent>{stages.map((s) => <SelectItem key={s.stage_key} value={s.stage_key}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Justificativa</Label>
            <Textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Por que a imobiliária deve mudar de etapa?" />
          </div>
          <p className="text-xs text-muted-foreground">
            A mudança não é aplicada automaticamente — fica pendente de aprovação no CRM.
          </p>
          <Button type="submit" disabled={disabled || loading} className="w-full">{loading ? "Enviando..." : "Solicitar mudança"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
