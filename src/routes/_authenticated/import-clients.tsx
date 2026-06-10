import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Download, Loader2, Info, ShieldCheck } from "lucide-react";
import { parseFile, type ParsedTable } from "@/lib/client-import/parsers";
import {
  formatCEP,
  formatDateBR,
  formatDocumento,
  formatTelefone,
  isValidDocumento,
  mapHeaders,
  parseCurrency,
  parseDate,
} from "@/lib/client-import/heuristics";
import { CREDIPRONTO_COLUMNS, COLUMN_LABELS, REQUIRED_COLUMNS, type CredprontoColumn } from "@/lib/client-import/template";
import { buildCrediprontoXlsx, type StandardRow } from "@/lib/client-import/exporter";

export const Route = createFileRoute("/_authenticated/import-clients")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    // Acesso liberado para todos os autenticados; restrição final via role check no componente.
  },
  component: ImportClientsPage,
});

type PreviewRow = StandardRow & { _errors: string[]; _idx: number };

function ImportClientsPage() {
  const { user, isAdmin, isManager, isConsultant, loading } = useCurrentUser();
  const allowed = isAdmin || isManager || isConsultant;

  const [parsed, setParsed] = useState<ParsedTable | null>(null);
  const [mapping, setMapping] = useState<Record<string, CredprontoColumn | "">>({});
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [agencyName, setAgencyName] = useState("");
  const [filename, setFilename] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!loading && !allowed) {
    return (
      <div className="p-10">
        <PageHeader title="Acesso restrito" description="Você não tem permissão para esta tela." />
      </div>
    );
  }

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      setFilename(file.name);
      const result = await parseFile(file);
      if (!result.rows.length) {
        toast.error("Nenhuma linha encontrada no arquivo.");
        setParsed(null);
        return;
      }
      setParsed(result);
      const initial = mapHeaders(result.headers);
      const mapInit: Record<string, CredprontoColumn | ""> = {};
      for (const h of result.headers) mapInit[h] = (initial[h] ?? "") as CredprontoColumn | "";
      setMapping(mapInit);
      rebuildPreview(result, mapInit);
      toast.success(`${result.rows.length} linhas carregadas. Confira o mapeamento.`);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao ler o arquivo.");
    } finally {
      setBusy(false);
    }
  };

  const rebuildPreview = (p: ParsedTable, m: Record<string, CredprontoColumn | "">) => {
    const next: PreviewRow[] = p.rows.map((raw, idx) => {
      const std: StandardRow = {};
      for (const [srcHeader, target] of Object.entries(m)) {
        if (!target) continue;
        const value = raw[srcHeader];
        std[target] = normalizeValue(target, value);
      }
      const errors: string[] = [];
      for (const req of REQUIRED_COLUMNS) {
        if (std[req] === undefined || std[req] === null || std[req] === "") {
          errors.push(`${COLUMN_LABELS[req]} faltando`);
        }
      }
      if (std.documento && !isValidDocumento(std.documento)) errors.push("CPF/CNPJ inválido");
      return { ...std, _errors: errors, _idx: idx };
    });
    setRows(next);
  };

  const setMappingFor = (header: string, target: CredprontoColumn | "") => {
    const next = { ...mapping, [header]: target };
    setMapping(next);
    if (parsed) rebuildPreview(parsed, next);
  };

  const editCell = (idx: number, col: CredprontoColumn, value: string) => {
    setRows((rs) =>
      rs.map((r) => {
        if (r._idx !== idx) return r;
        const updated: PreviewRow = { ...r, [col]: normalizeValue(col, value) };
        // Recalcula erros desta linha.
        const errors: string[] = [];
        for (const req of REQUIRED_COLUMNS) {
          const v = updated[req];
          if (v === undefined || v === null || v === "") errors.push(`${COLUMN_LABELS[req]} faltando`);
        }
        if (updated.documento && !isValidDocumento(updated.documento)) errors.push("CPF/CNPJ inválido");
        updated._errors = errors;
        return updated;
      })
    );
  };

  const stats = useMemo(() => {
    const valid = rows.filter((r) => r._errors.length === 0).length;
    return { total: rows.length, valid, invalid: rows.length - valid };
  }, [rows]);

  const handleDownload = async () => {
    if (!user) return;
    if (!stats.valid) {
      toast.error("Nenhuma linha válida para exportar.");
      return;
    }
    setBusy(true);
    try {
      const valid: StandardRow[] = rows
        .filter((r) => r._errors.length === 0)
        .map(({ _errors, _idx, ...rest }) => rest);
      const blob = buildCrediprontoXlsx(valid);

      // Sobe para storage privado em pasta do usuário.
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const safeName = (filename || "import").replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9-_]+/g, "_");
      const path = `${user.id}/${ts}__${safeName}.xlsx`;
      const { error: upErr } = await supabase.storage
        .from("client-imports")
        .upload(path, blob, { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", upsert: false });
      if (upErr) throw upErr;

      // Registra metadados (descarta o arquivo original — só guardamos o padronizado).
      const { error: histErr } = await supabase.from("client_import_history").insert({
        user_id: user.id,
        user_email: user.email ?? null,
        agency_name: agencyName || null,
        original_filename: filename,
        original_format: parsed?.sourceFormat ?? null,
        total_rows: stats.total,
        valid_rows: stats.valid,
        invalid_rows: stats.invalid,
        standardized_file_path: path,
      });
      if (histErr) throw histErr;

      // Download local imediato.
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `credipronto_${safeName}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success(`Arquivo padronizado gerado (${stats.valid} linhas). Original descartado.`);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao gerar arquivo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Importar Base de Clientes"
        description="Upload de qualquer base (XLSX, CSV, PDF, DOCX, TXT). O sistema mapeia, valida e gera o XLSX padrão Credipronto. Apenas o arquivo padronizado é armazenado — o original é descartado."
      />
      <div className="p-6 lg:p-10 space-y-6">
        <Card>
          <CardContent className="p-6 space-y-4">
            <label
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) handleFile(f);
              }}
              className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl p-10 cursor-pointer hover:bg-accent/30 transition-colors"
            >
              {busy ? <Loader2 className="h-10 w-10 animate-spin text-muted-foreground mb-3" /> : <FileSpreadsheet className="h-10 w-10 text-muted-foreground mb-3" />}
              <div className="font-medium">{filename || "Arraste o arquivo ou clique para selecionar"}</div>
              <div className="text-xs text-muted-foreground mt-1">Aceita XLSX, XLS, CSV, PDF, DOCX, TXT</div>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls,.csv,.pdf,.docx,.txt"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </label>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-success" />
              Processamento 100% local + storage privado. O arquivo original não é salvo.
            </div>
          </CardContent>
        </Card>

        {parsed && (
          <>
            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="space-y-1">
                    <h3 className="font-display font-semibold text-base">Mapeamento de colunas</h3>
                    <p className="text-xs text-muted-foreground">Ajuste qualquer mapeamento incorreto detectado pela heurística.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Imobiliária (opcional)"
                      value={agencyName}
                      onChange={(e) => setAgencyName(e.target.value)}
                      className="w-56"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {parsed.headers.map((h) => (
                    <div key={h} className="flex items-center gap-2">
                      <div className="text-xs text-muted-foreground truncate flex-1" title={h}>{h}</div>
                      <Select value={mapping[h] ?? ""} onValueChange={(v) => setMappingFor(h, v as CredprontoColumn | "")}>
                        <SelectTrigger className="w-[60%]">
                          <SelectValue placeholder="— ignorar —" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__ignore">— ignorar —</SelectItem>
                          {CREDIPRONTO_COLUMNS.map((c) => (
                            <SelectItem key={c} value={c}>
                              {COLUMN_LABELS[c]}
                              {REQUIRED_COLUMNS.includes(c) && <span className="text-destructive ml-1">*</span>}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex gap-2">
                <Badge variant="outline">{stats.total} linhas</Badge>
                <Badge variant="outline" className="text-success border-success/40">{stats.valid} válidas</Badge>
                {stats.invalid > 0 && (
                  <Badge variant="outline" className="text-destructive border-destructive/40">{stats.invalid} com pendência</Badge>
                )}
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button onClick={handleDownload} disabled={busy || stats.valid === 0}>
                      {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
                      Gerar XLSX Credipronto ({stats.valid})
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Apenas linhas sem pendência são exportadas. O original não é salvo.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            <Card className="overflow-hidden">
              <div className="overflow-x-auto max-h-[60vh]">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="w-10"></TableHead>
                      {CREDIPRONTO_COLUMNS.map((c) => (
                        <TableHead key={c} className="whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            {COLUMN_LABELS[c]}
                            {REQUIRED_COLUMNS.includes(c) && <span className="text-destructive">*</span>}
                          </div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.slice(0, 300).map((r) => (
                      <TableRow key={r._idx} className={r._errors.length ? "bg-destructive/5" : undefined}>
                        <TableCell>
                          {r._errors.length ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <AlertCircle className="h-4 w-4 text-destructive" />
                                </TooltipTrigger>
                                <TooltipContent>{r._errors.join("; ")}</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <CheckCircle2 className="h-4 w-4 text-success" />
                          )}
                        </TableCell>
                        {CREDIPRONTO_COLUMNS.map((c) => (
                          <TableCell key={c} className="p-1">
                            <Input
                              value={r[c] !== undefined && r[c] !== null ? String(r[c]) : ""}
                              onChange={(e) => editCell(r._idx, c, e.target.value)}
                              className="h-8 text-xs border-transparent hover:border-border focus:border-primary bg-transparent min-w-[120px]"
                            />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {rows.length > 300 && (
                <div className="p-3 text-xs text-muted-foreground text-center border-t">
                  Mostrando 300 de {rows.length} linhas (todas serão exportadas).
                </div>
              )}
            </Card>

            <div className="flex items-start gap-2 text-xs text-muted-foreground p-3 rounded-lg bg-muted/30 border border-border">
              <Info className="h-3.5 w-3.5 mt-0.5 text-info shrink-0" />
              <div>
                <strong>LGPD:</strong> o arquivo original é descartado após o processamento. Apenas o XLSX padronizado fica salvo em pasta privada do seu usuário no storage.
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function normalizeValue(col: CredprontoColumn, raw: any): string | number {
  if (raw === null || raw === undefined) return "";
  switch (col) {
    case "documento":
      return formatDocumento(raw);
    case "telefone_inquilino":
      return formatTelefone(raw);
    case "cep":
      return formatCEP(raw);
    case "data_nascimento":
      return formatDateBR(parseDate(raw));
    case "valor_aluguel":
    case "valor_condominio":
    case "valor_taxas":
    case "taxa_setup": {
      const n = parseCurrency(raw);
      return n === null ? "" : n;
    }
    default:
      return String(raw).trim();
  }
}
