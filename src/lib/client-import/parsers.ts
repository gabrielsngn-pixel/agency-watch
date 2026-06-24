import * as XLSX from "xlsx";

export type ParsedTable = {
  headers: string[];
  rows: Record<string, any>[];
  sourceFormat: "xlsx" | "csv" | "pdf" | "docx" | "txt";
};

/** Detecta o formato a partir da extensão / mime. */
export function detectFormat(file: File): ParsedTable["sourceFormat"] | null {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) return "xlsx";
  if (name.endsWith(".csv")) return "csv";
  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".docx")) return "docx";
  if (name.endsWith(".txt")) return "txt";
  return null;
}

/** Parser entrypoint. Heurística 100% local, sem IA externa. */
export async function parseFile(file: File): Promise<ParsedTable> {
  const fmt = detectFormat(file);
  if (!fmt) throw new Error("Formato não suportado. Use XLSX, CSV, PDF, DOCX ou TXT.");

  if (fmt === "xlsx" || fmt === "csv") return parseSpreadsheet(file, fmt);
  if (fmt === "docx") return parseDocx(file);
  if (fmt === "pdf") return parsePdf(file);
  return parseDelimitedText(await file.text(), "txt");
}

async function parseSpreadsheet(file: File, fmt: "xlsx" | "csv"): Promise<ParsedTable> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { headers: [], rows: [], sourceFormat: fmt };
  const aoa = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "", blankrows: false });
  return aoaToTable(aoa, fmt);
}

/** Converte array-de-arrays em {headers, rows}, detectando a linha de cabeçalho. */
function aoaToTable(aoa: any[][], fmt: ParsedTable["sourceFormat"]): ParsedTable {
  if (!aoa.length) return { headers: [], rows: [], sourceFormat: fmt };
  // Heurística: linha de cabeçalho = primeira linha com >=2 células de texto não-vazias.
  let headerIdx = 0;
  for (let i = 0; i < Math.min(aoa.length, 10); i++) {
    const cells = aoa[i].filter((c) => String(c ?? "").trim() !== "");
    const textCells = cells.filter((c) => isNaN(Number(String(c).replace(",", "."))));
    if (textCells.length >= 2) {
      headerIdx = i;
      break;
    }
  }
  const headers = aoa[headerIdx].map((h, i) => String(h ?? `col_${i}`).trim());
  const rows: Record<string, any>[] = [];
  for (let i = headerIdx + 1; i < aoa.length; i++) {
    const row = aoa[i];
    if (!row || row.every((c) => String(c ?? "").trim() === "")) continue;
    const obj: Record<string, any> = {};
    headers.forEach((h, j) => (obj[h] = row[j] ?? ""));
    rows.push(obj);
  }
  return { headers, rows, sourceFormat: fmt };
}

async function parseDocx(file: File): Promise<ParsedTable> {
  // mammoth é browser-friendly (UMD ESM).
  const mammoth = await import("mammoth/mammoth.browser");
  const buf = await file.arrayBuffer();
  // Extrai como HTML para preservar tabelas, depois parseia tabelas via DOM.
  const { value: html } = await (mammoth as any).convertToHtml({ arrayBuffer: buf });
  const doc = new DOMParser().parseFromString(html, "text/html");
  const table = doc.querySelector("table");
  if (table) {
    const trs = Array.from(table.querySelectorAll("tr"));
    const aoa = trs.map((tr) => Array.from(tr.querySelectorAll("th,td")).map((c) => c.textContent?.trim() ?? ""));
    return aoaToTable(aoa, "docx");
  }
  // Sem tabela → tenta texto delimitado linha a linha.
  const text = doc.body.textContent ?? "";
  return parseDelimitedText(text, "docx");
}

type PdfItem = { x: number; xEnd: number; s: string };
type PdfRow = PdfItem[];
type PdfStripe = { headers: string[]; anchors: number[]; dataRows: PdfRow[] };

/** Heurística: linha "parece" cabeçalho se a maioria dos itens é texto (sem dígitos/símbolos). */
function looksLikeHeaderRow(r: PdfRow): boolean {
  if (r.length < 2) return false;
  const textish = r.filter(
    (it) => /[A-Za-zÀ-ÿ_]/.test(it.s) && !/\d/.test(it.s) && !/[@.\-/]/.test(it.s),
  ).length;
  return textish >= Math.max(2, Math.ceil(r.length * 0.6));
}

function rowsToRecords(headers: string[], anchors: number[], dataRows: PdfRow[]): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  for (const r of dataRows) {
    if (!r.length) continue;
    const cells: string[] = headers.map(() => "");
    for (const it of r) {
      const center = (it.x + it.xEnd) / 2;
      let best = 0;
      let bestDist = Infinity;
      for (let k = 0; k < anchors.length; k++) {
        const d = Math.abs(anchors[k] - center);
        if (d < bestDist) {
          bestDist = d;
          best = k;
        }
      }
      cells[best] = cells[best] ? `${cells[best]} ${it.s.trim()}` : it.s.trim();
    }
    if (cells.every((c) => !c.trim())) continue;
    if (cells.every((c, idx) => c.trim() === headers[idx])) continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, j) => (obj[h] = cells[j] ?? ""));
    out.push(obj);
  }
  return out;
}

async function parsePdf(file: File): Promise<ParsedTable> {
  const pdfjs: any = await import("pdfjs-dist");
  if (pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  }
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;

  const Y_TOL = 3;

  // Coleta páginas como listas de linhas (cada linha = itens ordenados por X).
  const pages: PdfRow[][] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const byY = new Map<number, PdfItem[]>();
    for (const item of content.items as any[]) {
      const s = String(item.str ?? "");
      if (!s.trim()) continue;
      const x = item.transform[4];
      const width = item.width ?? 0;
      const y = Math.round(item.transform[5] / Y_TOL) * Y_TOL;
      const arr = byY.get(y) ?? [];
      arr.push({ x, xEnd: x + width, s });
      byY.set(y, arr);
    }
    const ys = Array.from(byY.keys()).sort((a, b) => b - a); // top-to-bottom
    pages.push(ys.map((y) => byY.get(y)!.sort((a, b) => a.x - b.x)));
  }

  if (!pages.length) return { headers: [], rows: [], sourceFormat: "pdf" };

  // Agrupa páginas em "stripes": cada stripe começa numa página cujo topo é cabeçalho.
  // Páginas seguintes sem cabeçalho são continuação vertical da mesma stripe.
  const stripes: PdfStripe[] = [];
  for (const pageRows of pages) {
    if (!pageRows.length) continue;
    const first = pageRows[0];
    if (looksLikeHeaderRow(first)) {
      const headers = first.map((it) => it.s.trim());
      const anchors = first.map((it) => (it.x + it.xEnd) / 2);
      stripes.push({ headers, anchors, dataRows: pageRows.slice(1) });
    } else if (stripes.length) {
      // continuação da última stripe
      stripes[stripes.length - 1].dataRows.push(...pageRows);
    } else {
      // sem cabeçalho ainda visto: trata primeira linha como cabeçalho fallback
      const headers = first.map((it) => it.s.trim());
      const anchors = first.map((it) => (it.x + it.xEnd) / 2);
      stripes.push({ headers, anchors, dataRows: pageRows.slice(1) });
    }
  }

  // Converte cada stripe em registros.
  const stripeRecords = stripes.map((s) => ({
    headers: s.headers,
    rows: rowsToRecords(s.headers, s.anchors, s.dataRows),
  }));

  // Cabeçalhos combinados (deduplicados, mantendo ordem).
  const seen = new Set<string>();
  const headers: string[] = [];
  for (const s of stripeRecords) {
    for (const h of s.headers) {
      if (h && !seen.has(h)) {
        seen.add(h);
        headers.push(h);
      }
    }
  }

  // Mescla horizontalmente: linha i de cada stripe corresponde ao mesmo registro.
  const maxLen = stripeRecords.reduce((m, s) => Math.max(m, s.rows.length), 0);
  const rows: Record<string, string>[] = [];
  for (let i = 0; i < maxLen; i++) {
    const merged: Record<string, string> = {};
    headers.forEach((h) => (merged[h] = ""));
    for (const s of stripeRecords) {
      const r = s.rows[i];
      if (!r) continue;
      for (const h of s.headers) {
        if (r[h] && !merged[h]) merged[h] = r[h];
      }
    }
    if (Object.values(merged).some((v) => String(v).trim() !== "")) rows.push(merged);
  }

  return { headers, rows, sourceFormat: "pdf" };
}


/** Heurística para PDF/TXT/DOCX-sem-tabela: detecta delimitador automático. */
function parseDelimitedText(text: string, fmt: ParsedTable["sourceFormat"]): ParsedTable {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (!lines.length) return { headers: [], rows: [], sourceFormat: fmt };
  // Detecta delimitador testando contagem de ocorrências na primeira linha.
  const candidates = ["\t", ";", ",", "|"];
  const delim = candidates
    .map((d) => ({ d, n: (lines[0].match(new RegExp(`\\${d}`, "g")) ?? []).length }))
    .sort((a, b) => b.n - a.n)[0];
  const sep = delim.n > 0 ? delim.d : /\s{2,}/; // fallback: espaços múltiplos
  const aoa = lines.map((l) => (typeof sep === "string" ? l.split(sep) : l.split(sep)).map((c) => c.trim()));
  return aoaToTable(aoa, fmt);
}
