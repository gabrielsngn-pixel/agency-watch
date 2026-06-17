import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, RefreshCw } from "lucide-react";
import {
  getEmailSendLog,
  getSuppressedEmails,
} from "@/lib/email-admin.functions";

const STATUS_COLORS: Record<string, string> = {
  sent: "bg-emerald-100 text-emerald-700 border-emerald-200",
  pending: "bg-amber-100 text-amber-700 border-amber-200",
  dlq: "bg-red-100 text-red-700 border-red-200",
  failed: "bg-red-100 text-red-700 border-red-200",
  bounced: "bg-red-100 text-red-700 border-red-200",
  complained: "bg-red-100 text-red-700 border-red-200",
  suppressed: "bg-yellow-100 text-yellow-700 border-yellow-200",
};

const PRESETS = [
  { key: "24h", label: "24 horas", hours: 24 },
  { key: "7d", label: "7 dias", hours: 24 * 7 },
  { key: "30d", label: "30 dias", hours: 24 * 30 },
] as const;

export function EmailMonitoring() {
  const [rangeKey, setRangeKey] = useState<(typeof PRESETS)[number]["key"]>("7d");
  const [template, setTemplate] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");

  const sinceIso = useMemo(() => {
    const hours = PRESETS.find((p) => p.key === rangeKey)?.hours ?? 168;
    return new Date(Date.now() - hours * 3600 * 1000).toISOString();
  }, [rangeKey]);

  const fetchLog = useServerFn(getEmailSendLog);
  const fetchSuppressed = useServerFn(getSuppressedEmails);

  const logQuery = useQuery({
    queryKey: ["email-log", sinceIso, template, status],
    queryFn: () =>
      fetchLog({
        data: {
          sinceIso,
          template: template === "all" ? null : template,
          status: status === "all" ? null : status,
          limit: 500,
        },
      }),
  });

  const suppressedQuery = useQuery({
    queryKey: ["suppressed-emails"],
    queryFn: () => fetchSuppressed(),
  });

  const templates = useMemo(() => {
    const set = new Set<string>();
    logQuery.data?.rows.forEach((r) => set.add(r.template_name));
    return Array.from(set).sort();
  }, [logQuery.data]);

  const summary = logQuery.data?.summary ?? {
    total: 0,
    sent: 0,
    failed: 0,
    suppressed: 0,
    pending: 0,
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Monitoramento de e-mails</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              logQuery.refetch();
              suppressedQuery.refetch();
            }}
            disabled={logQuery.isFetching}
          >
            {logQuery.isFetching ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Atualizar
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Período</div>
              <Select value={rangeKey} onValueChange={(v: any) => setRangeKey(v)}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRESETS.map((p) => (
                    <SelectItem key={p.key} value={p.key}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Template</div>
              <Select value={template} onValueChange={setTemplate}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Status</div>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="sent">Enviado</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="dlq">Falha</SelectItem>
                  <SelectItem value="suppressed">Suprimido</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <StatCard label="Total" value={summary.total} />
            <StatCard label="Enviados" value={summary.sent} tone="success" />
            <StatCard label="Pendentes" value={summary.pending} tone="warning" />
            <StatCard label="Falhas" value={summary.failed} tone="danger" />
            <StatCard label="Suprimidos" value={summary.suppressed} tone="warning" />
          </div>

          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Destinatário</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Erro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Carregando…
                    </TableCell>
                  </TableRow>
                ) : (logQuery.data?.rows.length ?? 0) === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Nenhum envio no período selecionado.
                    </TableCell>
                  </TableRow>
                ) : (
                  logQuery.data?.rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {new Date(r.created_at).toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-xs font-mono">{r.template_name}</TableCell>
                      <TableCell className="text-xs">{r.recipient_email}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={STATUS_COLORS[r.status] ?? ""}>
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-red-600 max-w-[280px] truncate">
                        {r.error_message ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>E-mails suprimidos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppressedQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                      Carregando…
                    </TableCell>
                  </TableRow>
                ) : (suppressedQuery.data?.length ?? 0) === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                      Nenhum endereço suprimido.
                    </TableCell>
                  </TableRow>
                ) : (
                  suppressedQuery.data?.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs">{r.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={STATUS_COLORS[r.reason] ?? ""}>
                          {r.reason}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {new Date(r.created_at).toLocaleString("pt-BR")}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "warning" | "danger";
}) {
  const color =
    tone === "success"
      ? "text-emerald-600"
      : tone === "warning"
      ? "text-amber-600"
      : tone === "danger"
      ? "text-red-600"
      : "text-foreground";
  return (
    <div className="border rounded-md p-4 bg-card">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}
