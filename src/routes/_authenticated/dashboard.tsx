import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Building2, Briefcase, Target, AlertTriangle, ArrowRight, CalendarClock,
  Activity, Zap, TrendingUp, CalendarCheck, RefreshCw, FileUp, ClipboardList,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  RadialBarChart, RadialBar, PolarAngleAxis,
} from "recharts";
import { ACTIVITY_TYPE_LABEL, AGENCY_ACTIVITY_TYPES, BR_STATES, NEGOTIATION_STATUSES, STATUS_TONE, daysSince, type AgencyActivityType } from "@/lib/constants";
import { KanbanApprovalsCard } from "@/components/kanban-approvals-card";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

const TONE_COLOR: Record<string, string> = {
  neutral: "var(--muted-foreground)",
  info: "var(--info)",
  warning: "var(--warning)",
  success: "var(--success)",
  destructive: "var(--destructive)",
};

function DashboardPage() {
  const [agencyFilter, setAgencyFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [nextActionFilter, setNextActionFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [cLevelFilter, setCLevelFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [directorFilter, setDirectorFilter] = useState("all");
  const { data: agencies = [], isLoading } = useQuery({
    queryKey: ["agencies-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("real_estate_agencies")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: activities = [] } = useQuery({
    queryKey: ["activities-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("agency_activities").select("*").order("activity_date", { ascending: false }).limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: missionAlerts = [] } = useQuery({
    queryKey: ["mission-control-alerts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mission_control_alerts")
        .select("id, alert_type, title, description, severity, metadata, created_at, resolved_at")
        .is("resolved_at", null)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) return [];
      return data ?? [];
    },
  });

  const total = agencies.length;
  const converted = agencies.filter((a) => a.negotiation_status === "Convertida").length;
  const inNegotiation = agencies.filter((a) =>
    ["Em negociação", "Proposta enviada", "Reunião agendada"].includes(a.negotiation_status as string)
  ).length;
  const cLevel = agencies.filter((a) => a.c_level_support_needed).length;
  const stale = agencies.filter((a) => {
    const d = daysSince(a.last_interaction_date);
    return d === null || d > 14;
  }).length;
  const stockTotal = agencies.reduce((acc, a) => acc + (a.contract_stock ?? 0), 0);
  const convertedStock = agencies
    .filter((a) => a.negotiation_status === "Convertida")
    .reduce((acc, a) => acc + (a.contract_stock ?? 0), 0);
  const convRate = total > 0 ? Math.round((converted / total) * 100) : 0;
  const healthScore = total === 0 ? 0 : Math.max(0, Math.min(100, Math.round(100 - (stale / total) * 70 - (cLevel / total) * 30)));

  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const startWeek = new Date(startToday); startWeek.setDate(startToday.getDate() - ((startToday.getDay() + 6) % 7));
  const endWeek = new Date(startWeek); endWeek.setDate(startWeek.getDate() + 7);
  const agencyById = useMemo(() => new Map(agencies.map((agency: any) => [agency.id, agency])), [agencies]);
  const todayAgencyIds = new Set(activities.filter((item: any) => new Date(item.activity_date) >= startToday).map((item: any) => item.agency_id));
  const weekAgencyIds = new Set(activities.filter((item: any) => new Date(item.activity_date) >= startWeek).map((item: any) => item.agency_id));
  const noActivity7 = agencies.filter((agency: any) => { const days = daysSince(agency.last_interaction_date); return days === null || days >= 7; }).length;
  const noActivity15 = agencies.filter((agency: any) => { const days = daysSince(agency.last_interaction_date); return days === null || days >= 15; }).length;
  const withoutStageChange = activities.filter((item: any) => !item.status_changed).length;
  const stageChanges = activities.filter((item: any) => item.status_changed).length;
  const todayKey = startToday.toISOString().slice(0, 10);
  const overdue = agencies.filter((agency: any) => agency.next_step_date && agency.next_step_date < todayKey).length;
  const weekEndKey = endWeek.toISOString().slice(0, 10);
  const nextThisWeek = agencies.filter((agency: any) => agency.next_step_date && agency.next_step_date >= todayKey && agency.next_step_date < weekEndKey).length;
  const clientBases = activities.filter((item: any) => item.activity_type === "client_base_received").length;
  const directors = [...new Set(agencies.map((agency: any) => agency.regional_director).filter(Boolean))].sort();
  const filteredActivities = useMemo(() => activities.filter((item: any) => {
    const agency: any = agencyById.get(item.agency_id);
    if (agencyFilter && !item.agency_name.toLowerCase().includes(agencyFilter.toLowerCase())) return false;
    if (statusFilter !== "all" && agency?.negotiation_status !== statusFilter) return false;
    if (typeFilter !== "all" && item.activity_type !== typeFilter) return false;
    if (dateFilter && item.activity_date.slice(0, 10) !== dateFilter) return false;
    if (nextActionFilter === "overdue" && !(item.next_step_date && item.next_step_date < todayKey)) return false;
    if (nextActionFilter === "week" && !(item.next_step_date && item.next_step_date >= todayKey && item.next_step_date < weekEndKey)) return false;
    if (sourceFilter !== "all" && item.source !== sourceFilter) return false;
    if (cLevelFilter !== "all" && item.c_level_support_needed !== (cLevelFilter === "yes")) return false;
    if (stateFilter !== "all" && agency?.state !== stateFilter) return false;
    if (directorFilter !== "all" && agency?.regional_director !== directorFilter) return false;
    return true;
  }), [activities, agencyById, agencyFilter, statusFilter, typeFilter, dateFilter, nextActionFilter, sourceFilter, cLevelFilter, stateFilter, directorFilter, todayKey, weekEndKey]);

  const funnelData = NEGOTIATION_STATUSES.map((s) => ({
    name: s,
    value: agencies.filter((a) => a.negotiation_status === s).length,
    tone: STATUS_TONE[s as keyof typeof STATUS_TONE] ?? "neutral",
  })).filter((d) => d.value > 0);

  const stateData = Object.entries(
    agencies.reduce<Record<string, number>>((acc, a) => {
      const k = a.state ?? "—";
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {})
  )
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  const stalest = [...agencies]
    .filter((a) => !["Convertida", "Sem interesse"].includes(a.negotiation_status as string))
    .sort((a, b) => {
      const da = a.last_interaction_date ? new Date(a.last_interaction_date).getTime() : 0;
      const db = b.last_interaction_date ? new Date(b.last_interaction_date).getTime() : 0;
      return da - db;
    })
    .slice(0, 6);

  // synthetic 30-day trend from updated_at
  const today = new Date();
  const trend = Array.from({ length: 14 }, (_, i) => {
    const day = new Date(today);
    day.setDate(today.getDate() - (13 - i));
    const key = day.toISOString().slice(0, 10);
    const count = agencies.filter((a) => a.updated_at?.slice(0, 10) === key).length;
    return { day: day.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), value: count };
  });

  return (
    <div className="grid-bg min-h-full">
      <PageHeader
        eyebrow="Mission Control"
        title="Cockpit de Operação Comercial"
        description="Pipeline, risco de carteira, prioridades e próximas ações em tempo real."
        actions={
          <Button asChild className="gap-1.5 bg-primary/90 hover:bg-primary text-primary-foreground border border-primary/30 glow-primary">
            <Link to="/portfolio">Abrir carteira <ArrowRight className="h-4 w-4" /></Link>
          </Button>
        }
      />

      <div className="p-6 lg:p-10 space-y-6">
        <KanbanApprovalsCard />

        <div>
          <h2 className="font-display text-lg font-semibold">Gestão de Atividades</h2>
          <p className="text-xs text-muted-foreground mt-1">Saúde, movimento e próximas ações da carteira de imobiliárias.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          <StatCard label="Atividade hoje" value={todayAgencyIds.size} icon={<Activity className="h-4 w-4" />} hint="imobiliárias movimentadas" />
          <StatCard label="Atividade na semana" value={weekAgencyIds.size} icon={<CalendarCheck className="h-4 w-4" />} tone="info" hint="imobiliárias movimentadas" />
          <StatCard label="Sem atividade há 7 dias" value={noActivity7} icon={<CalendarClock className="h-4 w-4" />} tone="warning" hint="pedem acompanhamento" />
          <StatCard label="Sem atividade há 15 dias" value={noActivity15} icon={<AlertTriangle className="h-4 w-4" />} tone="destructive" hint="risco de carteira" />
          <StatCard label="Sem mudança de etapa" value={withoutStageChange} icon={<RefreshCw className="h-4 w-4" />} hint="atividades registradas" />
          <StatCard label="Mudanças no Kanban" value={stageChanges} icon={<TrendingUp className="h-4 w-4" />} tone="success" hint="mudanças de etapa" />
          <StatCard label="Próximos passos vencidos" value={overdue} icon={<AlertTriangle className="h-4 w-4" />} tone="destructive" hint="ação imediata" />
          <StatCard label="Próximos passos da semana" value={nextThisWeek} icon={<CalendarClock className="h-4 w-4" />} tone="info" hint="agenda da carteira" />
          <StatCard label="Bases recebidas" value={clientBases} icon={<FileUp className="h-4 w-4" />} hint="atividades com base" />
        </div>

        {missionAlerts.length > 0 && (
          <Card className="border-warning/40">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="flex items-center gap-2 font-display">
                  <AlertTriangle className="h-4 w-4 text-warning" /> Alertas de configuração
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Mudanças no Kanban que exigem ajuste no Google Forms
                </p>
              </div>
              <Badge variant="outline" className="tabular-nums">{missionAlerts.length}</Badge>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-border/50">
                {missionAlerts.map((alert: any) => {
                  const tone = alert.severity === "critical" ? "destructive" : alert.severity === "warning" ? "warning" : "info";
                  const toneClass = tone === "destructive" ? "text-destructive border-destructive/40" : tone === "warning" ? "text-warning border-warning/40" : "text-info border-info/40";
                  return (
                    <div key={alert.id} className="flex flex-wrap items-start justify-between gap-3 py-3 px-2 -mx-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={toneClass}>{alert.severity}</Badge>
                          <div className="font-medium">{alert.title}</div>
                        </div>
                        {alert.description && (
                          <div className="text-xs text-muted-foreground mt-1">{alert.description}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground tabular-nums">{new Date(alert.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            await supabase.from("mission_control_alerts").update({ resolved_at: new Date().toISOString() }).eq("id", alert.id);
                            queryClient.invalidateQueries({ queryKey: ["mission-control-alerts"] });
                          }}
                        >
                          Resolver
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}


        <Card>
          <CardHeader><CardTitle className="font-display">Atividades da carteira</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-3">
              <Input placeholder="Imobiliária" value={agencyFilter} onChange={(event) => setAgencyFilter(event.target.value)} />
              <FilterSelect value={statusFilter} onChange={setStatusFilter} label="Status atual" options={NEGOTIATION_STATUSES.map((value) => [value, value])} />
              <FilterSelect value={typeFilter} onChange={setTypeFilter} label="Tipo de atividade" options={AGENCY_ACTIVITY_TYPES.map(([value, label]) => [value, label])} />
              <Input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} />
              <FilterSelect value={nextActionFilter} onChange={setNextActionFilter} label="Próxima ação" options={[["overdue", "Vencida"], ["week", "Nesta semana"]]} />
              <FilterSelect value={sourceFilter} onChange={setSourceFilter} label="Origem" options={[["web", "Web"], ["slack", "Slack"], ["google_forms", "Google Forms"], ["whatsapp", "WhatsApp"]]} />
              <FilterSelect value={cLevelFilter} onChange={setCLevelFilter} label="Apoio C-Level" options={[["yes", "Sim"], ["no", "Não"]]} />
              <FilterSelect value={stateFilter} onChange={setStateFilter} label="UF" options={BR_STATES.map((value) => [value, value])} />
              <FilterSelect value={directorFilter} onChange={setDirectorFilter} label="Diretor regional" options={directors.map((value: any) => [value, value])} />
            </div>
            <div className="divide-y divide-border/50">
              {filteredActivities.slice(0, 20).map((item: any) => <Link key={item.id} to="/portfolio/$agencyId" params={{ agencyId: item.agency_id }} className="flex flex-wrap items-center justify-between gap-3 py-3 hover:bg-accent/20 px-2 -mx-2 rounded-lg"><div><div className="font-medium">{item.agency_name}</div><div className="text-xs text-muted-foreground mt-1">{item.summary} · {item.registered_by_name || item.registered_by_email || "—"}</div></div><div className="flex items-center gap-2"><Badge variant="outline">{ACTIVITY_TYPE_LABEL[item.activity_type as AgencyActivityType] ?? item.activity_type}</Badge><span className="text-xs text-muted-foreground">{new Date(item.activity_date).toLocaleDateString("pt-BR")}</span></div></Link>)}
              {!filteredActivities.length && <div className="py-8 text-center text-sm text-muted-foreground">Nenhuma atividade encontrada com estes filtros.</div>}
            </div>
          </CardContent>
        </Card>

        {/* Operational row: pulse + health */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2 overflow-hidden">
            <CardHeader className="flex flex-row items-start justify-between pb-2">
              <div>
                <CardTitle className="flex items-center gap-2 font-display">
                  <Activity className="h-4 w-4 text-primary" /> Pulso operacional
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">Atualizações de carteira nas últimas 2 semanas</p>
              </div>
              <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">14d</span>
            </CardHeader>
            <CardContent className="h-64 pl-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="pulseGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip
                    cursor={{ stroke: "var(--primary)", strokeOpacity: 0.3, strokeDasharray: "3 3" }}
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12, boxShadow: "var(--shadow-elevated)" }}
                    labelStyle={{ color: "var(--muted-foreground)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em" }}
                  />
                  <Area type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={2} fill="url(#pulseGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="overflow-hidden relative">
            <div className="pointer-events-none absolute -top-20 -right-20 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 font-display">
                <Zap className="h-4 w-4 text-primary" /> Contratos em jogo
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">Volume total de contratos na carteira</p>
            </CardHeader>
            <CardContent className="h-64 flex flex-col items-center justify-center relative gap-4">
              <div className="flex flex-col items-center">
                <div className="font-display text-6xl font-semibold tabular-nums text-gradient-primary leading-none">
                  {stockTotal.toLocaleString("pt-BR")}
                </div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mt-2">contratos</div>
              </div>
              <div className="grid grid-cols-2 gap-3 w-full px-2 mt-2">
                <div className="rounded-lg border border-border/60 bg-background/40 p-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Fechados</div>
                  <div className="font-display text-xl font-semibold tabular-nums text-success mt-1">
                    {convertedStock.toLocaleString("pt-BR")}
                  </div>
                </div>
                <div className="rounded-lg border border-border/60 bg-background/40 p-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Em disputa</div>
                  <div className="font-display text-xl font-semibold tabular-nums text-primary mt-1">
                    {(stockTotal - convertedStock).toLocaleString("pt-BR")}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

        </div>

        {/* Pipeline + Geo */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="font-display flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> Pipeline intelligence</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">Distribuição por estágio de negociação</p>
              </div>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {isLoading ? (
                <div className="text-sm text-muted-foreground">Carregando…</div>
              ) : funnelData.length === 0 ? (
                <div className="text-sm text-muted-foreground">Sem dados de pipeline.</div>
              ) : (
                funnelData.map((d) => {
                  const max = Math.max(...funnelData.map((x) => x.value));
                  const pct = Math.round((d.value / max) * 100);
                  const color = TONE_COLOR[d.tone] ?? TONE_COLOR.neutral;
                  return (
                    <div key={d.name} className="group">
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
                          <span className="font-medium text-foreground/90">{d.name}</span>
                        </div>
                        <span className="tabular-nums text-muted-foreground">{d.value}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${pct}%`,
                            background: `linear-gradient(90deg, ${color}, color-mix(in oklab, ${color} 40%, transparent))`,
                            boxShadow: `0 0 12px color-mix(in oklab, ${color} 50%, transparent)`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="font-display">Top UFs</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">Concentração geográfica</p>
            </CardHeader>
            <CardContent className="space-y-2">
              {stateData.length === 0 ? (
                <div className="text-sm text-muted-foreground">Sem dados.</div>
              ) : stateData.map((s, i) => {
                const max = stateData[0].value;
                const pct = Math.round((s.value / max) * 100);
                return (
                  <div key={s.name} className="flex items-center gap-3 text-xs">
                    <span className="w-8 font-mono text-muted-foreground/80">{String(i + 1).padStart(2, "0")}</span>
                    <span className="w-8 font-display font-semibold">{s.name}</span>
                    <div className="flex-1 h-1 rounded-full bg-muted/40 overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-primary to-primary/30" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="tabular-nums w-8 text-right text-muted-foreground">{s.value}</span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        {/* Priorities */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 font-display">
                <CalendarClock className="h-4 w-4 text-warning" /> Próximas ações prioritárias
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">Imobiliárias sem update há mais tempo — recomendado contato imediato</p>
            </div>
            <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
              <Link to="/portfolio">Ver carteira <ArrowRight className="h-3.5 w-3.5 ml-1" /></Link>
            </Button>
          </CardHeader>
          <CardContent>
            {stalest.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">Nenhuma pendência crítica.</div>
            ) : (
              <div className="divide-y divide-border/50">
                {stalest.map((a) => {
                  const d = daysSince(a.last_interaction_date);
                  const critical = d === null || d > 30;
                  return (
                    <Link
                      key={a.id}
                      to="/portfolio/$agencyId"
                      params={{ agencyId: a.id }}
                      className="group flex items-center justify-between py-3 px-3 -mx-3 rounded-lg hover:bg-accent/30 transition-colors"
                    >
                      <div className="min-w-0 flex items-center gap-3">
                        <span className={`h-8 w-1 rounded-full ${critical ? "bg-destructive shadow-[0_0_10px_var(--destructive)]" : "bg-warning shadow-[0_0_10px_var(--warning)]"}`} />
                        <div className="min-w-0">
                          <div className="font-medium truncate group-hover:text-primary transition-colors">{a.name}</div>
                          <div className="text-xs text-muted-foreground">{a.city} · {a.state} · {a.contract_stock ?? 0} contratos</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <StatusBadge status={a.negotiation_status as string} />
                        <span className={`text-xs tabular-nums font-medium ${critical ? "text-destructive" : "text-warning"}`}>
                          {d === null ? "Sem registro" : `${d}d`}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function FilterSelect({ value, onChange, label, options }: { value: string; onChange: (value: string) => void; label: string; options: readonly (readonly [string, string])[] }) {
  return <Select value={value} onValueChange={onChange}><SelectTrigger><SelectValue placeholder={label} /></SelectTrigger><SelectContent><SelectItem value="all">{label}: todos</SelectItem>{options.map(([optionValue, optionLabel]) => <SelectItem key={optionValue} value={optionValue}>{optionLabel}</SelectItem>)}</SelectContent></Select>;
}
