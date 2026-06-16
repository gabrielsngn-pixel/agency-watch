import * as XLSX from "xlsx";
import {
  COLUMN_LABELS,
  TEMPLATES,
  type ImportColumn,
  type TemplateKey,
} from "./template";

export type StandardRow = Partial<Record<ImportColumn, string | number>>;

/** Gera o XLSX padronizado conforme o template selecionado. */
export function buildImportXlsx(rows: StandardRow[], templateKey: TemplateKey = "simplified"): Blob {
  const cols = TEMPLATES[templateKey].columns;
  const data = rows.map((r) => {
    const out: Record<string, any> = {};
    for (const c of cols) out[c] = r[c] ?? "";
    return out;
  });
  const ws = XLSX.utils.json_to_sheet(data, { header: [...cols] });
  ws["!cols"] = cols.map((c) => ({ wch: Math.max(12, COLUMN_LABELS[c].length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Clientes");
  const arr = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Blob([arr], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** Compat com nome antigo. */
export const buildCrediprontoXlsx = (rows: StandardRow[]) => buildImportXlsx(rows, "simplified");
