import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import {
  Activity, ArrowRight, ArrowUpRight, ArrowDownRight, Minus,
  TrendingUp, TrendingDown, Clock, GitBranch, Zap, AlertTriangle, Building2,
} from "lucide-react";
import { NEGOTIATION_STATUSES, daysSince, type NegotiationStatus } from "@/lib/constants";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard/movement")({
  component: MovementPage,
});

type ChangeLog = {
  id: string;
  agency_id: string;
  agency_name: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  previous_status: string | null;
  new_status: string | null;
  is_stage_change: boolean;
  change_source: string;
  changed_by: string | null;
  changed_by_name: string | null;
  slack_user_id: string | null;
  consultant_id: string | null;
  changed_at: string;
};

type Snapshot = {
  agency_id: string;
  agency_name: string;
  status: string;
  week_start: string;
  contract_stock: number;
};

type Agency = {
  id: string;
  name: string;
  negotiation_status: string;
  consultant_id: string | null;
  regional_director: string | null;
  contract_stock: number | null;
  c_level_support_needed: boolean;
  last_interaction_date: string | null;
  next_steps: string | null;
  feedback: string | null;
  created_at: string;
  updated_at: string;
  state: string | null;
  city: string | null;
};

const FIELD_LABEL: Record<string, string> = {
  negotiation_status: "Status",
  contract_stock: "Estoque",
  next_steps: "Próximos passos",
  feedback: "Feedback",
  current_offer: "Oferta atual",
  c_level_support_needed: "Apoio C-Level",
  main_contact: "Contato principal",
  consultant_id: "Consultor",
  regional_director: "Diretor regional",
  guarantor_type: "Tipo garantidor",
  current_guarantor: "Garantidor atual",
};

const SOURCE_LABEL: Record<string, { label: string; tone: string }> = {
  slack: { label: "Slack", tone: "bg-info/15 text-info border-info/30" },
  manual: { label: "Manual", tone: "bg-primary/15 text-primary border-primary/30" },
  import: { label: "Importação", tone: "bg-warning/15 text-warning border-warning/30" },
  bot: { label: "Bot", tone: "bg-accent/30 text-foreground border-border" },
};

function fmtValue(field: string, v: string | null, consultantsById: Map<string, string>) {
  if (v === null || v === "") return "—";
  if (field === "consultant_id") return consultantsById.get(v) ?? v.slice(0, 8);
  if (field === "c_level_support_needed") return v === "true" ? "Sim" : "Não";
  return v;
}

function weekStartOf(date: Date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 sun..6 sat
  const diff = (day + 6) % 7; // days since Monday
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function MovementPage() {
  const [period, setPeriod] = useState<"7" | "14" | "30">("7");
  const [consultantFilter, setConsultantFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [compositionStage, setCompositionStage] = useState<NegotiationStatus | null>(null);

  const sinceISO = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - parseInt(period));
    return d.toISOString();
  }, [period]);

  const { data: agencies = [] } = useQuery({
    queryKey: ["movement-agencies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("real_estate_agencies").select("*");
      if (error) throw error;
      return (data ?? []) as Agency[];
    },
  });

  const { data: consultants = [] } = useQuery({
    queryKey: ["movement-consultants"],
    queryFn: async () => {
      const { data, error } = await supabase.from("consultants").select("id, name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const consultantsById = useMemo(
    () => new Map(consultants.map((c: any) => [c.id, c.name as string])),
    [consultants],
  );

  const { data: changes = [], isLoading: changesLoading } = useQuery({
    queryKey: ["movement-changes", sinceISO],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agency_change_log")
        .select("*")
        .gte("changed_at", sinceISO)
        .order("changed_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as ChangeLog[];
    },
  });

  // last week snapshot (Monday of previous week)
  const lastWeekStart = useMemo(() => {
    const w = weekStartOf(new Date());
    w.setDate(w.getDate() - 7);
    return w.toISOString().slice(0, 10);
  }, []);

  const { data: lastSnapshot = [] } = useQuery({
    queryKey: ["movement-snapshot", lastWeekStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kanban_stage_snapshots")
        .select("agency_id, agency_name, status, week_start, contract_stock")
        .eq("week_start", lastWeekStart);
      if (error) throw error;
      return (data ?? []) as Snapshot[];
    },
  });

  // ---------- derived ----------

  const filteredChanges = useMemo(() => {
    return changes.filter((c) => {
      if (consultantFilter !== "all" && c.consultant_id !== consultantFilter) return false;
      if (sourceFilter !== "all" && c.change_source !== sourceFilter) return false;
      if (stageFilter !== "all" && !(c.is_stage_change && (c.new_status === stageFilter || c.previous_status === stageFilter))) return false;
      return true;
    });
  }, [changes, consultantFilter, sourceFilter, stageFilter]);

  const stageChanges = filteredChanges.filter((c) => c.is_stage_change);

  const agenciesUpdatedSet = new Set(filteredChanges.map((c) => c.agency_id));
  const updatedCount = agenciesUpdatedSet.size;
  const stageChangeCount = stageChanges.length;

  const newAgencies = agencies.filter((a) => new Date(a.created_at).getTime() > Date.now() - parseInt(period) * 86400000).length;
  const staleCount = agencies.filter((a) => {
    const d = daysSince(a.last_interaction_date);
    return d === null || d > 15;
  }).length;

  // current stage counts
  const currentByStage = useMemo(() => {
    const m = new Map<string, Agency[]>();
    NEGOTIATION_STATUSES.forEach((s) => m.set(s, []));
    agencies.forEach((a) => {
      const list = m.get(a.negotiation_status) ?? [];
      list.push(a);
      m.set(a.negotiation_status, list);
    });
    return m;
  }, [agencies]);

  // last week stage counts
  const lastByStage = useMemo(() => {
    const m = new Map<string, Snapshot[]>();
    NEGOTIATION_STATUSES.forEach((s) => m.set(s, []));
    lastSnapshot.forEach((s) => {
      const list = m.get(s.status) ?? [];
      list.push(s);
      m.set(s.status, list);
    });
    return m;
  }, [lastSnapshot]);

  const weeklyComparison = useMemo(() => {
    return NEGOTIATION_STATUSES.map((stage) => {
      const now = currentByStage.get(stage) ?? [];
      const prev = lastByStage.get(stage) ?? [];
      const nowIds = new Set(now.map((a) => a.id));
      const prevIds = new Set(prev.map((s) => s.agency_id));
      const stayed = [...nowIds].filter((id) => prevIds.has(id));
      const entered = [...nowIds].filter((id) => !prevIds.has(id));
      const left = [...prevIds].filter((id) => !nowIds.has(id));
      const delta = now.length - prev.length;
      const pct = prev.length === 0 ? (now.length > 0 ? 100 : 0) : Math.round((delta / prev.length) * 100);
      return { stage, current: now.length, previous: prev.length, delta, pct, entered: entered.length, left: left.length, stayed: stayed.length };
    });
  }, [currentByStage, lastByStage]);

  const stagesGain = weeklyComparison.filter((w) => w.delta > 0).length;
  const stagesLoss = weeklyComparison.filter((w) => w.delta < 0).length;

  // sankey flow: edges previous_status -> new_status
  const flowEdges = useMemo(() => {
    const map = new Map<string, number>();
    stageChanges.forEach((c) => {
      if (!c.previous_status || !c.new_status) return;
      const key = `${c.previous_status}→${c.new_status}`;
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return [...map.entries()]
      .map(([k, v]) => {
        const [from, to] = k.split("→");
        return { from, to, count: v };
      })
      .sort((a, b) => b.count - a.count);
  }, [stageChanges]);

  // aging by stage: avg days since last_interaction
  const aging = useMemo(() => {
    return NEGOTIATION_STATUSES.map((stage) => {
      const list = currentByStage.get(stage) ?? [];
      const days = list.map((a) => daysSince(a.last_interaction_date) ?? 0);
      const avg = days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : 0;
      return { stage, avg, count: list.length };
    }).filter((x) => x.count > 0);
  }, [currentByStage]);

  // composition drawer data
  const compositionData = useMemo(() => {
    if (!compositionStage) return null;
    const now = currentByStage.get(compositionStage) ?? [];
    const prev = lastByStage.get(compositionStage) ?? [];
    const nowIds = new Set(now.map((a) => a.id));
    const prevIds = new Set(prev.map((s) => s.agency_id));
    const stayed = now.filter((a) => prevIds.has(a.id));
    const entered = now.filter((a) => !prevIds.has(a.id));
    const left = prev.filter((s) => !nowIds.has(s.agency_id));
    return { stayed, entered, left };
  }, [compositionStage, currentByStage, lastByStage]);

  // ---------- render ----------

  return (
    <div className="grid-bg min-h-full">
      <PageHeader
        eyebrow="Inteligência operacional"
        title="Movimentação da Carteira"
        description="Entenda o que mudou na carteira, quem avançou no funil e onde a operação está parada."
        actions={
          <Button asChild variant="ghost">
            <Link to="/dashboard">Mission Control <ArrowRight className="h-4 w-4 ml-1" /></Link>
          </Button>
        }
      />

      <div className="p-6 lg:p-10 space-y-6">
        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <Select value={period} onValueChange={(v) => setPeriod(v as any)}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="14">Últimos 14 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
            </SelectContent>
          </Select>
          <Select value={consultantFilter} onValueChange={setConsultantFilter}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Consultor" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os consultores</SelectItem>
              {consultants.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Origem" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toda origem</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
              <SelectItem value="slack">Slack</SelectItem>
              <SelectItem value="import">Importação</SelectItem>
            </SelectContent>
          </Select>
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Etapa" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as etapas</SelectItem>
              {NEGOTIATION_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <StatCard label="Atualizadas no período" value={updatedCount} icon={<Activity className="h-4 w-4" />} hint={`${filteredChanges.length} alterações`} />
          <StatCard label="Mudanças de etapa" value={stageChangeCount} icon={<GitBranch className="h-4 w-4" />} tone="info" hint="movimentos no funil" />
          <StatCard label="Novas imobiliárias" value={newAgencies} icon={<Building2 className="h-4 w-4" />} tone="success" hint="cadastradas no período" />
          <StatCard label="Sem update 15+ dias" value={staleCount} icon={<AlertTriangle className="h-4 w-4" />} tone="warning" hint="paradas na carteira" />
          <StatCard label="Etapas ganhando volume" value={stagesGain} icon={<TrendingUp className="h-4 w-4" />} tone="success" hint="vs semana passada" />
          <StatCard label="Etapas perdendo volume" value={stagesLoss} icon={<TrendingDown className="h-4 w-4" />} tone="destructive" hint="vs semana passada" />
        </div>

        {/* Weekly comparison */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="font-display flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" /> Comparativo semanal por etapa
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Atual vs semana anterior — clique em uma linha para ver a composição
            </p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Etapa</TableHead>
                  <TableHead className="text-right">Hoje</TableHead>
                  <TableHead className="text-right">Semana passada</TableHead>
                  <TableHead className="text-right">Δ Abs</TableHead>
                  <TableHead className="text-right">Δ %</TableHead>
                  <TableHead className="text-right">Entraram</TableHead>
                  <TableHead className="text-right">Saíram</TableHead>
                  <TableHead className="text-right">Permaneceram</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {weeklyComparison.map((row) => (
                  <TableRow
                    key={row.stage}
                    className="cursor-pointer hover:bg-accent/30"
                    onClick={() => setCompositionStage(row.stage)}
                  >
                    <TableCell><StatusBadge status={row.stage} /></TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{row.current}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{row.previous}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <DeltaPill value={row.delta} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs">
                      <span className={row.delta > 0 ? "text-success" : row.delta < 0 ? "text-destructive" : "text-muted-foreground"}>
                        {row.delta > 0 ? "+" : ""}{row.pct}%
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-success">{row.entered || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums text-destructive">{row.left || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{row.stayed || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Flow + Aging */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="font-display flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-primary" /> Fluxo de movimentação
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">Para onde as imobiliárias se moveram no funil</p>
            </CardHeader>
            <CardContent>
              {flowEdges.length === 0 ? (
                <div className="text-sm text-muted-foreground py-8 text-center">Nenhum movimento no período.</div>
              ) : (
                <SankeyFlow edges={flowEdges} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="font-display flex items-center gap-2">
                <Clock className="h-4 w-4 text-warning" /> Aging por etapa
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">Tempo médio sem atualização nas imobiliárias de cada etapa</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {aging.length === 0 ? (
                <div className="text-sm text-muted-foreground py-8 text-center">Sem dados.</div>
              ) : (
                aging.map((a) => {
                  const max = Math.max(...aging.map((x) => x.avg), 1);
                  const pct = Math.round((a.avg / max) * 100);
                  const tone = a.avg > 30 ? "destructive" : a.avg > 15 ? "warning" : "primary";
                  const color = `var(--${tone})`;
                  return (
                    <div key={a.stage}>
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="font-medium">{a.stage}</span>
                        <span className="tabular-nums text-muted-foreground">{a.avg}d médios · {a.count} imob.</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${pct}%`,
                            background: `linear-gradient(90deg, ${color}, color-mix(in oklab, ${color} 30%, transparent))`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>

        {/* Timeline */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="font-display flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" /> Timeline de mudanças
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Últimas atualizações em ordem cronológica</p>
          </CardHeader>
          <CardContent>
            {changesLoading ? (
              <div className="text-sm text-muted-foreground py-6">Carregando…</div>
            ) : filteredChanges.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">Nenhuma mudança no período.</div>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-2">
                {filteredChanges.slice(0, 50).map((c) => {
                  const src = SOURCE_LABEL[c.change_source] ?? SOURCE_LABEL.manual;
                  const when = new Date(c.changed_at);
                  return (
                    <Link
                      key={c.id}
                      to="/portfolio/$agencyId"
                      params={{ agencyId: c.agency_id }}
                      className="flex items-start gap-3 py-2.5 px-3 rounded-lg hover:bg-accent/40 transition-colors group"
                    >
                      <div className={cn(
                        "h-8 w-8 rounded-lg flex items-center justify-center shrink-0 border",
                        c.is_stage_change ? "bg-primary/15 border-primary/30 text-primary" : "bg-muted/40 border-border text-muted-foreground"
                      )}>
                        {c.is_stage_change ? <GitBranch className="h-4 w-4" /> : <Activity className="h-4 w-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate group-hover:text-primary transition-colors">{c.agency_name}</span>
                          <Badge variant="outline" className={cn("text-[10px]", src.tone)}>{src.label}</Badge>
                          {c.is_stage_change && <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">Etapa</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          <span className="font-medium text-foreground/80">{FIELD_LABEL[c.field_name] ?? c.field_name}:</span>{" "}
                          <span className="line-through opacity-60">{fmtValue(c.field_name, c.old_value, consultantsById)}</span>
                          <ArrowRight className="inline h-3 w-3 mx-1" />
                          <span className="text-foreground/90">{fmtValue(c.field_name, c.new_value, consultantsById)}</span>
                        </div>
                      </div>
                      <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                        {when.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tables */}
        <Tabs defaultValue="updates">
          <TabsList>
            <TabsTrigger value="updates">Atualizações recentes</TabsTrigger>
            <TabsTrigger value="stages">Movimentações de Kanban</TabsTrigger>
          </TabsList>

          <TabsContent value="updates">
            <Card className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data/hora</TableHead>
                    <TableHead>Imobiliária</TableHead>
                    <TableHead>Consultor</TableHead>
                    <TableHead>Campo</TableHead>
                    <TableHead>Anterior</TableHead>
                    <TableHead>Novo</TableHead>
                    <TableHead>Origem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredChanges.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Sem alterações.</TableCell></TableRow>
                  ) : filteredChanges.slice(0, 100).map((c) => {
                    const src = SOURCE_LABEL[c.change_source] ?? SOURCE_LABEL.manual;
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="text-xs text-muted-foreground tabular-nums">
                          {new Date(c.changed_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </TableCell>
                        <TableCell>
                          <Link to="/portfolio/$agencyId" params={{ agencyId: c.agency_id }} className="font-medium hover:underline">
                            {c.agency_name}
                          </Link>
                        </TableCell>
                        <TableCell className="text-xs">{c.consultant_id ? consultantsById.get(c.consultant_id) ?? "—" : "—"}</TableCell>
                        <TableCell className="text-xs font-medium">{FIELD_LABEL[c.field_name] ?? c.field_name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">{fmtValue(c.field_name, c.old_value, consultantsById)}</TableCell>
                        <TableCell className="text-xs max-w-[160px] truncate">{fmtValue(c.field_name, c.new_value, consultantsById)}</TableCell>
                        <TableCell><Badge variant="outline" className={cn("text-[10px]", src.tone)}>{src.label}</Badge></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          <TabsContent value="stages">
            <Card className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Imobiliária</TableHead>
                    <TableHead>Consultor</TableHead>
                    <TableHead>Etapa anterior</TableHead>
                    <TableHead>Nova etapa</TableHead>
                    <TableHead className="text-right">Estoque</TableHead>
                    <TableHead className="text-center">C-Level</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stageChanges.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Sem mudanças de etapa.</TableCell></TableRow>
                  ) : stageChanges.slice(0, 100).map((c) => {
                    const agency = agencies.find((a) => a.id === c.agency_id);
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="text-xs text-muted-foreground tabular-nums">
                          {new Date(c.changed_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </TableCell>
                        <TableCell>
                          <Link to="/portfolio/$agencyId" params={{ agencyId: c.agency_id }} className="font-medium hover:underline">
                            {c.agency_name}
                          </Link>
                        </TableCell>
                        <TableCell className="text-xs">{c.consultant_id ? consultantsById.get(c.consultant_id) ?? "—" : "—"}</TableCell>
                        <TableCell>{c.previous_status && <StatusBadge status={c.previous_status} />}</TableCell>
                        <TableCell>{c.new_status && <StatusBadge status={c.new_status} />}</TableCell>
                        <TableCell className="text-right tabular-nums">{agency?.contract_stock ?? "—"}</TableCell>
                        <TableCell className="text-center">{agency?.c_level_support_needed ? <AlertTriangle className="h-4 w-4 text-warning inline" /> : <Minus className="h-3 w-3 text-muted-foreground inline" />}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Composition drawer */}
      <Sheet open={!!compositionStage} onOpenChange={(o) => !o && setCompositionStage(null)}>
        <SheetContent className="sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              Composição da etapa {compositionStage && <StatusBadge status={compositionStage} />}
            </SheetTitle>
            <SheetDescription>Quem permaneceu, entrou e saiu desta etapa desde a semana passada.</SheetDescription>
          </SheetHeader>
          {compositionData && (
            <div className="mt-6 space-y-6">
              <CompositionList title="Permaneceram" tone="muted" items={compositionData.stayed.map((a) => ({ id: a.id, name: a.name, hint: `${a.contract_stock ?? 0} contratos` }))} />
              <CompositionList title="Entraram nesta etapa" tone="success" items={compositionData.entered.map((a) => ({ id: a.id, name: a.name, hint: `${a.contract_stock ?? 0} contratos` }))} />
              <CompositionList title="Saíram desta etapa" tone="destructive" items={compositionData.left.map((s) => ({ id: s.agency_id, name: s.agency_name, hint: "" }))} />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DeltaPill({ value }: { value: number }) {
  if (value === 0) return <span className="text-muted-foreground inline-flex items-center gap-1"><Minus className="h-3 w-3" />0</span>;
  if (value > 0) return <span className="text-success inline-flex items-center gap-1"><ArrowUpRight className="h-3 w-3" />+{value}</span>;
  return <span className="text-destructive inline-flex items-center gap-1"><ArrowDownRight className="h-3 w-3" />{value}</span>;
}

function CompositionList({ title, tone, items }: { title: string; tone: "muted" | "success" | "destructive"; items: { id: string; name: string; hint?: string }[] }) {
  const dot = tone === "success" ? "bg-success" : tone === "destructive" ? "bg-destructive" : "bg-muted-foreground";
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className={cn("h-2 w-2 rounded-full", dot)} />
        <h4 className="text-sm font-medium">{title}</h4>
        <span className="text-xs text-muted-foreground tabular-nums">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground pl-4">—</p>
      ) : (
        <div className="space-y-1">
          {items.map((i) => (
            <Link
              key={i.id}
              to="/portfolio/$agencyId"
              params={{ agencyId: i.id }}
              className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-accent/40 text-sm"
            >
              <span className="truncate">{i.name}</span>
              {i.hint && <span className="text-xs text-muted-foreground shrink-0 ml-2">{i.hint}</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ----- Sankey -----

function SankeyFlow({ edges }: { edges: { from: string; to: string; count: number } }[]>) {
  const max = Math.max(...edges.map((e) => e.count), 1);
  return (
    <div className="space-y-2">
      {edges.slice(0, 12).map((e, i) => {
        const w = Math.max(4, Math.round((e.count / max) * 100));
        return (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-[140px] truncate text-right text-muted-foreground">{e.from}</span>
            <div className="flex-1 h-6 relative rounded overflow-hidden bg-muted/30">
              <div
                className="h-full rounded-r bg-gradient-to-r from-primary/60 to-primary/20 flex items-center justify-end pr-2"
                style={{ width: `${w}%` }}
              >
                <span className="text-[10px] font-medium tabular-nums text-primary-foreground/90">{e.count}</span>
              </div>
            </div>
            <span className="w-[140px] truncate text-foreground/90">{e.to}</span>
          </div>
        );
      })}
    </div>
  );
}
