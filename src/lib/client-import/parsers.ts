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

async function parsePdf(file: File): Promise<ParsedTable> {
  const pdfjs: any = await import("pdfjs-dist");
  if (pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  }
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;

  // Coleta todos os itens de texto (com x,y) de todas as páginas, agrupando por linha (Y).
  type Item = { x: number; xEnd: number; s: string };
  const allRows: Item[][] = [];
  const Y_TOL = 3;

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const byY = new Map<number, Item[]>();
    for (const item of content.items as any[]) {
      const s = String(item.str ?? "");
      if (!s.trim()) continue;
      const x = item.transform[4];
      const width = item.width ?? 0;
      const yRaw = item.transform[5];
      const y = Math.round(yRaw / Y_TOL) * Y_TOL;
      const arr = byY.get(y) ?? [];
      arr.push({ x, xEnd: x + width, s });
      byY.set(y, arr);
    }
    const ys = Array.from(byY.keys()).sort((a, b) => b - a);
    for (const y of ys) {
      const row = byY.get(y)!.sort((a, b) => a.x - b.x);
      allRows.push(row);
    }
  }

  if (!allRows.length) return { headers: [], rows: [], sourceFormat: "pdf" };

  // Linha de cabeçalho: primeira linha com >=2 itens cujo texto não é majoritariamente numérico.
  let headerIdx = 0;
  for (let i = 0; i < Math.min(allRows.length, 10); i++) {
    const r = allRows[i];
    if (r.length < 2) continue;
    const textish = r.filter((it) => /[A-Za-zÀ-ÿ_]/.test(it.s)).length;
    if (textish >= 2) {
      headerIdx = i;
      break;
    }
  }

  // Define âncoras de coluna a partir dos centros dos itens de cabeçalho.
  const headerRow = allRows[headerIdx];
  const anchors = headerRow.map((it) => (it.x + it.xEnd) / 2);
  const headers = headerRow.map((it) => it.s.trim());

  // Para cada linha, distribui itens na coluna cuja âncora está mais próxima do centro do item.
  // Concatena múltiplos itens na mesma coluna com espaço.
  const rows: Record<string, any>[] = [];
  for (let i = headerIdx + 1; i < allRows.length; i++) {
    const r = allRows[i];
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
    // Ignora linhas totalmente vazias ou que repetem o cabeçalho.
    if (cells.every((c) => !c.trim())) continue;
    if (cells.every((c, idx) => c.trim() === headers[idx])) continue;
    const obj: Record<string, any> = {};
    headers.forEach((h, j) => (obj[h] = cells[j] ?? ""));
    rows.push(obj);
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
