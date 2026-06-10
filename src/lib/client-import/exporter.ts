import * as XLSX from "xlsx";
import { CREDIPRONTO_COLUMNS, COLUMN_LABELS, type CredprontoColumn } from "./template";

export type StandardRow = Partial<Record<CredprontoColumn, string | number>>;

/** Gera o XLSX no formato Credipronto/Cury (cabeçalhos = nomes canônicos). */
export function buildCrediprontoXlsx(rows: StandardRow[]): Blob {
  const data = rows.map((r) => {
    const out: Record<string, any> = {};
    for (const c of CREDIPRONTO_COLUMNS) out[c] = r[c] ?? "";
    return out;
  });
  const ws = XLSX.utils.json_to_sheet(data, { header: [...CREDIPRONTO_COLUMNS] });
  // Larguras razoáveis
  ws["!cols"] = CREDIPRONTO_COLUMNS.map((c) => ({ wch: Math.max(12, COLUMN_LABELS[c].length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Clientes");
  const arr = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Blob([arr], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
