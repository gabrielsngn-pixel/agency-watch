import * as XLSX from "xlsx";
import {
  COLUMN_LABELS,
  TEMPLATES,
  type ImportColumn,
  type TemplateKey,
} from "./template";

export type StandardRow = Partial<Record<ImportColumn, string | number>>;

/** Gera o CSV padronizado conforme o template selecionado. */
export function buildImportCsv(rows: StandardRow[], templateKey: TemplateKey = "simplified"): Blob {
  const cols = TEMPLATES[templateKey].columns;
  const data = rows.map((r) => {
    const out: Record<string, any> = {};
    for (const c of cols) out[c] = r[c] ?? "";
    return out;
  });
  const ws = XLSX.utils.json_to_sheet(data, { header: [...cols] });
  const csv = XLSX.utils.sheet_to_csv(ws, { FS: ",", RS: "\n" });
  // BOM para Excel reconhecer UTF-8 corretamente
  return new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
}

/** Compat com nomes antigos. */
export const buildImportXlsx = buildImportCsv;
export const buildCrediprontoXlsx = (rows: StandardRow[]) => buildImportCsv(rows, "simplified");

