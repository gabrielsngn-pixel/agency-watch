import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { FileSpreadsheet, CheckCircle2, AlertCircle, Download, Loader2, Info, ShieldCheck, MapPin } from "lucide-react";
import { parseFile, type ParsedTable } from "@/lib/client-import/parsers";
import {
  formatCEP,
  formatDateBR,
  formatDocumento,
  formatTelefone,
  isValidDocumento,
  mapHeaders,
  onlyDigits,
  parseCurrency,
  parseDate,
} from "@/lib/client-import/heuristics";
import {
  COLUMN_LABELS,
  TEMPLATES,
  type ImportColumn,
  type TemplateKey,
} from "@/lib/client-import/template";
import { buildImportCsv, type StandardRow } from "@/lib/client-import/exporter";

export const Route = createFileRoute("/_authenticated/import-clients")({
  component: ImportClientsPage,
});

type PreviewRow = StandardRow & {
  _errors: string[];
  _idx: number;
  /** Campos preenchidos via ViaCEP (não vieram da planilha original). */
  _cepDerived: Partial<Record<ImportColumn, boolean>>;
};

function ImportClientsPage() {
  const { user, isAdmin, isManager, isConsultant, loading } = useCurrentUser();
  const allowed = isAdmin || isManager || isConsultant;

  const [templateKey, setTemplateKey] = useState<TemplateKey>("simplified");
  const [parsed, setParsed] = useState<ParsedTable | null>(null);
  const [mapping, setMapping] = useState<Record<string, ImportColumn | "">>({});
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [agencyName, setAgencyName] = useState("");
  const [filename, setFilename] = useState("");
  const [busy, setBusy] = useState(false);
  const [cepLookupBusy, setCepLookupBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const template = TEMPLATES[templateKey];

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
      const mapInit: Record<string, ImportColumn | ""> = {};
      for (const h of result.headers) mapInit[h] = (initial[h] ?? "") as ImportColumn | "";
      setMapping(mapInit);
      rebuildPreview(result, mapInit, templateKey);
      toast.success(`${result.rows.length} linhas carregadas. Confira o mapeamento.`);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao ler o arquivo.");
    } finally {
      setBusy(false);
    }
  };

  const computeErrors = (std: StandardRow, tplKey: TemplateKey): string[] => {
    const errors: string[] = [];
    for (const req of TEMPLATES[tplKey].required) {
      const v = std[req];
      if (v === undefined || v === null || v === "") errors.push(`${COLUMN_LABELS[req]} faltando`);
    }
    if (std.documento && !isValidDocumento(std.documento)) errors.push("CPF/CNPJ inválido");
    return errors;
  };

  const rebuildPreview = (p: ParsedTable, m: Record<string, ImportColumn | "">, tplKey: TemplateKey) => {
    const next: PreviewRow[] = [];
    p.rows.forEach((raw, idx) => {
      // Limpeza: ignorar linhas em que TODAS as células estejam vazias/whitespace.
      const hasAnyValue = Object.values(raw).some(
        (v) => v !== null && v !== undefined && String(v).trim() !== "",
      );
      if (!hasAnyValue) return;

      const std: StandardRow = {};
      for (const [srcHeader, target] of Object.entries(m)) {
        if (!target) continue;
        std[target] = normalizeValue(target, raw[srcHeader]);
      }

      // Regra de negócio: imóvel comercial força subtipo "Casa".
      const tipo = String(std.tipo_imovel ?? "").toLowerCase();
      if (tipo.includes("comercial")) {
        std.subtipo_imovel = "Casa";
      }

      next.push({ ...std, _errors: computeErrors(std, tplKey), _idx: idx, _cepDerived: {} });
    });
    setRows(next);
  };

  // Ao trocar de template, recalcula erros (e mantém os dados/mapping existentes).
  useEffect(() => {
    if (!parsed) return;
    rebuildPreview(parsed, mapping, templateKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateKey]);

  const setMappingFor = (header: string, target: ImportColumn | "") => {
    const next = { ...mapping, [header]: target };
    setMapping(next);
    if (parsed) rebuildPreview(parsed, next, templateKey);
  };

  const editCell = (idx: number, col: ImportColumn, value: string) => {
    setRows((rs) =>
      rs.map((r) => {
        if (r._idx !== idx) return r;
        const updated: PreviewRow = {
          ...r,
          [col]: normalizeValue(col, value),
          _cepDerived: { ...r._cepDerived, [col]: false },
        };
        // Imóvel comercial força subtipo "Casa".
        const tipo = String(updated.tipo_imovel ?? "").toLowerCase();
        if (tipo.includes("comercial")) {
          updated.subtipo_imovel = "Casa";
        }
        updated._errors = computeErrors(updated, templateKey);
        return updated;
      })
    );
  };

  // ============ ViaCEP autofill ============
  const cepCache = useRef<Record<string, { city: string; state: string; logradouro: string; bairro: string } | null>>({});

  const lookupCep = async (cep: string) => {
    const key = onlyDigits(cep);
    if (key.length !== 8) return null;
    if (key in cepCache.current) return cepCache.current[key];
    try {
      const res = await fetch(`https://viacep.com.br/ws/${key}/json/`);
      const json = await res.json();
      if (json?.erro) {
        cepCache.current[key] = null;
        return null;
      }
      const info = {
        city: String(json.localidade ?? ""),
        state: String(json.uf ?? ""),
        logradouro: String(json.logradouro ?? ""),
        bairro: String(json.bairro ?? ""),
      };
      cepCache.current[key] = info;
      return info;
    } catch {
      cepCache.current[key] = null;
      return null;
    }
  };

  const runCepAutofill = async () => {
    setCepLookupBusy(true);
    let filled = 0;
    try {
      const updated: PreviewRow[] = [];
      for (const r of rows) {
        const cep = r.cep ? String(r.cep) : "";
        const needsCity = !r.cidade_imovel;
        const needsState = !r.estado_imovel;
        if (!cep || (!needsCity && !needsState)) {
          updated.push(r);
          continue;
        }
        const info = await lookupCep(cep);
        if (!info) {
          updated.push(r);
          continue;
        }
        const derived = { ...r._cepDerived };
        const patched: PreviewRow = { ...r };
        if (needsCity && info.city) {
          patched.cidade_imovel = info.city;
          derived.cidade_imovel = true;
          filled++;
        }
        if (needsState && info.state) {
          patched.estado_imovel = info.state;
          derived.estado_imovel = true;
          filled++;
        }
        patched._cepDerived = derived;
        patched._errors = computeErrors(patched, templateKey);
        updated.push(patched);
      }
      setRows(updated);
      toast.success(filled ? `${filled} campos preenchidos via CEP.` : "Nada a preencher via CEP.");
    } finally {
      setCepLookupBusy(false);
    }
  };

  // Auto-roda o lookup quando entra no template completo e há CEPs com cidade/UF faltando.
  useEffect(() => {
    if (templateKey !== "complete" || !rows.length) return;
    const needs = rows.some((r) => r.cep && (!r.cidade_imovel || !r.estado_imovel));
    if (needs) void runCepAutofill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateKey, parsed]);

  const stats = useMemo(() => {
    const valid = rows.filter((r) => r._errors.length === 0).length;
    return { total: rows.length, valid, invalid: rows.length - valid };
  }, [rows]);

  const handleDownload = async () => {
    if (!user) return;
    if (!rows.length) {
      toast.error("Nenhuma linha para exportar.");
      return;
    }
    setBusy(true);
    try {
      // Exporta TODAS as linhas — pendências são apontadas mas não impedem.
      const allRows: StandardRow[] = rows.map(({ _errors, _idx, _cepDerived, ...rest }) => rest);
      const blob = buildImportCsv(allRows, templateKey);

      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const safeName = (filename || "import").replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9-_]+/g, "_");
      const path = `${user.id}/${ts}__${templateKey}__${safeName}.csv`;
      const { error: upErr } = await supabase.storage
        .from("client-imports")
        .upload(path, blob, {
          contentType: "text/csv;charset=utf-8;",
          upsert: false,
        });
      if (upErr) throw upErr;

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

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${templateKey === "complete" ? "completo" : "simplificado"}_${safeName}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success(
        `Arquivo gerado (${rows.length} linhas${stats.invalid ? `, ${stats.invalid} com pendência` : ""}).`,
      );
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao gerar arquivo.");
    } finally {
      setBusy(false);
    }
  };

  const cepDerivedCount = useMemo(
    () => rows.reduce((acc, r) => acc + Object.values(r._cepDerived).filter(Boolean).length, 0),
    [rows],
  );

  return (
    <div>
      <PageHeader
        title="Importar Base de Clientes"
        description="Upload de qualquer base (XLSX, CSV, PDF, DOCX, TXT). Escolha o template, revise o mapeamento e baixe o XLSX padronizado. O arquivo original é descartado."
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
              onClick={() => inputRef.current?.click()}
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
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-2">
                    <h3 className="font-display font-semibold text-base">Template de exportação</h3>
                    <Tabs value={templateKey} onValueChange={(v) => setTemplateKey(v as TemplateKey)}>
                      <TabsList>
                        <TabsTrigger value="simplified">{TEMPLATES.simplified.label}</TabsTrigger>
                        <TabsTrigger value="complete">{TEMPLATES.complete.label}</TabsTrigger>
                      </TabsList>
                    </Tabs>
                    <p className="text-xs text-muted-foreground">{template.description}</p>
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
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="space-y-1">
                    <h3 className="font-display font-semibold text-base">Mapeamento de colunas</h3>
                    <p className="text-xs text-muted-foreground">Ajuste qualquer mapeamento incorreto detectado pela heurística.</p>
                  </div>
                  {templateKey === "complete" && (
                    <Button variant="outline" size="sm" onClick={runCepAutofill} disabled={cepLookupBusy}>
                      {cepLookupBusy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <MapPin className="h-3.5 w-3.5 mr-1" />}
                      Preencher Cidade/UF via CEP
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {parsed.headers.map((h) => (
                    <div key={h} className="flex items-center gap-2">
                      <div className="text-xs text-muted-foreground truncate flex-1" title={h}>{h}</div>
                      <Select value={mapping[h] || "__ignore"} onValueChange={(v) => setMappingFor(h, v === "__ignore" ? "" : (v as ImportColumn))}>
                        <SelectTrigger className="w-[60%]">
                          <SelectValue placeholder="— ignorar —" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__ignore">— ignorar —</SelectItem>
                          {template.columns.map((c) => (
                            <SelectItem key={c} value={c}>
                              {COLUMN_LABELS[c]}
                              {template.required.includes(c) && <span className="text-destructive ml-1">*</span>}
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
              <div className="flex gap-2 flex-wrap">
                <Badge variant="outline">{stats.total} linhas</Badge>
                <Badge variant="outline" className="text-success border-success/40">{stats.valid} válidas</Badge>
                {stats.invalid > 0 && (
                  <Badge variant="outline" className="text-destructive border-destructive/40">{stats.invalid} com pendência</Badge>
                )}
                {cepDerivedCount > 0 && (
                  <Badge variant="outline" className="text-info border-info/40">
                    <MapPin className="h-3 w-3 mr-1" />
                    {cepDerivedCount} campos via CEP
                  </Badge>
                )}
              </div>
              <Button onClick={handleDownload} disabled={busy || rows.length === 0}>
                {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
                Gerar XLSX {templateKey === "complete" ? "Completo" : "Simplificado"} ({rows.length})
              </Button>
            </div>

            <Card className="overflow-hidden">
              <div className="overflow-x-auto max-h-[60vh]">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="w-10"></TableHead>
                      {template.columns.map((c) => (
                        <TableHead key={c} className="whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            {COLUMN_LABELS[c]}
                            {template.required.includes(c) && <span className="text-destructive">*</span>}
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
                        {template.columns.map((c) => {
                          const fromCep = !!r._cepDerived[c];
                          return (
                            <TableCell key={c} className="p-1">
                              <div className="relative">
                                <Input
                                  value={r[c] !== undefined && r[c] !== null ? String(r[c]) : ""}
                                  onChange={(e) => editCell(r._idx, c, e.target.value)}
                                  className={`h-8 text-xs border-transparent hover:border-border focus:border-primary min-w-[120px] ${
                                    fromCep ? "bg-info/10 border-info/30" : "bg-transparent"
                                  }`}
                                  title={fromCep ? "Preenchido automaticamente via CEP" : undefined}
                                />
                                {fromCep && (
                                  <MapPin className="absolute right-1 top-1/2 -translate-y-1/2 h-3 w-3 text-info pointer-events-none" />
                                )}
                              </div>
                            </TableCell>
                          );
                        })}
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
                <strong>Pendências não bloqueiam a exportação.</strong> Os campos destacados em azul com{" "}
                <MapPin className="inline h-3 w-3" /> foram preenchidos automaticamente a partir do CEP informado na planilha. O arquivo original é descartado — apenas o XLSX padronizado fica salvo em pasta privada do seu usuário no storage.
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function normalizeValue(col: ImportColumn, raw: any): string | number {
  if (raw === null || raw === undefined) return "";
  switch (col) {
    case "documento":
      return formatDocumento(raw);
    case "telefone_inquilino":
      return formatTelefone(raw);
    case "cep":
      return formatCEP(raw);
    case "data_nascimento":
    case "data_assinatura":
      return formatDateBR(parseDate(raw));
    case "valor_aluguel":
    case "valor_condominio":
    case "valor_taxas":
    case "taxa_setup":
    case "valor_pacote":
    case "taxa_garantia":
    case "cobertura_aluguel":
    case "cobertura_danos": {
      const n = parseCurrency(raw);
      return n === null ? "" : n;
    }
    case "estado_imovel":
      return String(raw).trim().toUpperCase().slice(0, 2);
    default:
      return String(raw).trim();
  }
}
