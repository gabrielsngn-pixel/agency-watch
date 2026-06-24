import { CREDIPRONTO_COLUMNS, type CredprontoColumn } from "./template";

export function normalizeHeader(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

// Aliases por coluna — extensível. Cobre português coloquial + variantes
// comuns de exports de CRMs e planilhas livres.
const ALIASES: Record<CredprontoColumn, string[]> = {
  documento: ["documento", "cpf", "cnpj", "cpfcnpj", "doc", "cpfdoinquilino", "cpfinquilino"],
  nome_completo: ["nomecompleto", "nome", "inquilino", "cliente", "locatario", "nomeinquilino", "nomecliente"],
  data_nascimento: ["datanascimento", "datadenascimento", "nascimento", "dtnascimento", "dn"],
  mail_inquilino: ["mail", "email", "mailinquilino", "emailinquilino", "emaildocliente", "emaildoinquilino", "correioeletronico"],
  telefone_inquilino: ["telefone", "celular", "fone", "telefoneinquilino", "telefonedoinquilino", "telinquilino", "whatsapp", "tel"],
  tipo_imovel: ["tipoimovel", "tipodoimovel", "tipo", "categoriaimovel"],
  cep: ["cep", "codigopostal"],
  numero_imovel: ["numero", "numeroimovel", "numerodoimovel", "n", "num"],
  complemento: ["complemento", "compl", "complementoimovel"],
  subtipo_imovel: ["subtipoimovel", "subtipo", "subtipodoimovel"],
  valor_aluguel: ["valoraluguel", "aluguel", "valordoaluguel", "rent", "valormensal"],
  valor_condominio: ["valorcondominio", "condominio", "valordocondominio", "cond"],
  valor_taxas: ["valortaxas", "taxas", "valordastaxas", "iptu", "valordetaxas"],
  produto_fianca_loft: ["produtofiancaloft", "fianca", "produtofianca", "produto"],
  taxa_setup: ["taxasetup", "setup", "taxadeinstalacao"],
  meio_pagamento: ["meiopagamento", "formapagamento", "pagamento", "meiodepagamento", "meioformadepagamento"],
  ramo: ["ramo", "segmento"],
  logradouro_opcional: ["logradouro", "endereco", "rua", "logradourooopcional", "logradouroopcional"],
  bairro_opcional: ["bairro", "bairroopcional"],
  cidade_imovel: ["cidade", "cidadeimovel", "cidadedoimovel", "municipio"],
  estado_imovel: ["estado", "uf", "estadoimovel", "estadodoimovel"],
  contrato: ["contrato", "numerocontrato", "numerodocontrato", "contratonumero"],
  garantidor: ["garantidor", "fiador", "garantia"],
  taxa_garantia: ["taxagarantia", "taxadegarantia"],
  data_assinatura: ["dataassinatura", "datadeassinatura", "assinatura", "dtassinatura"],
  vigencia_cobertura: ["vigenciacobertura", "vigenciadacobertura", "vigencia"],
  valor_pacote: ["valorpacote", "valordopacote", "pacote"],
  cobertura_aluguel: ["coberturaaluguel", "coberturadealuguel"],
  cobertura_danos: ["coberturadanos", "coberturadedanos"],
  observacao: ["observacao", "obs", "observacoes", "comentario", "comentarios", "notas"],
};

// Constrói o índice reverso: alias normalizado → coluna canônica.
const ALIAS_INDEX: Record<string, CredprontoColumn> = (() => {
  const out: Record<string, CredprontoColumn> = {};
  for (const col of CREDIPRONTO_COLUMNS) {
    for (const a of ALIASES[col]) out[normalizeHeader(a)] = col;
    out[normalizeHeader(col)] = col; // o próprio nome canônico
  }
  return out;
})();

/** Mapeia cabeçalhos detectados → colunas canônicas (heurística pura). */
export function mapHeaders(headers: string[]): Record<string, CredprontoColumn | null> {
  const out: Record<string, CredprontoColumn | null> = {};
  for (const h of headers) {
    if (!h) continue;
    out[h] = ALIAS_INDEX[normalizeHeader(h)] ?? null;
  }
  return out;
}

// ============== Normalizadores de valor ==============

export function onlyDigits(s: unknown): string {
  return String(s ?? "").replace(/\D+/g, "");
}

/** Formata CPF (11) ou CNPJ (14). Retorna o input limpo se não bater. */
export function formatDocumento(raw: unknown): string {
  const d = onlyDigits(raw);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return d;
}

export function isValidCPF(raw: unknown): boolean {
  const d = onlyDigits(raw);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const calc = (slice: number) => {
    let sum = 0;
    for (let i = 0; i < slice; i++) sum += parseInt(d[i]) * (slice + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === parseInt(d[9]) && calc(10) === parseInt(d[10]);
}

export function isValidCNPJ(raw: unknown): boolean {
  const d = onlyDigits(raw);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (len: number, weights: number[]) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += parseInt(d[i]) * weights[i];
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  return calc(12, w1) === parseInt(d[12]) && calc(13, w2) === parseInt(d[13]);
}

export function isValidDocumento(raw: unknown): boolean {
  const d = onlyDigits(raw);
  if (d.length === 11) return isValidCPF(d);
  if (d.length === 14) return isValidCNPJ(d);
  return false;
}

export function formatTelefone(raw: unknown): string {
  const d = onlyDigits(raw);
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  if (d.length === 13 && d.startsWith("55")) {
    return d.replace(/55(\d{2})(\d{5})(\d{4})/, "+55 ($1) $2-$3");
  }
  return String(raw ?? "").trim();
}

export function formatCEP(raw: unknown): string {
  const d = onlyDigits(raw);
  if (d.length === 8) return d.replace(/(\d{5})(\d{3})/, "$1-$2");
  return String(raw ?? "").trim();
}

/** Aceita "1.234,56" | "1234,56" | "1234.56" | "1234" | number → number. */
export function parseCurrency(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return isFinite(raw) ? raw : null;
  const s = String(raw)
    .trim()
    // PDFs tabulares às vezes trazem bordas/traços junto do texto: "-R$ 7.000,00-".
    // Mantém só dígitos e separadores numéricos para não perder o valor importado.
    .replace(/[R$\s]/g, "")
    .replace(/(?!^)-/g, "")
    .replace(/^-+(?=\D*\d)/, "")
    .replace(/[^0-9.,-]/g, "");
  if (!s) return null;
  // Se tem vírgula E ponto → ponto é separador de milhar, vírgula decimal (pt-BR)
  const hasDot = s.includes(".");
  const hasComma = s.includes(",");
  let normalized = s;
  if (hasDot && hasComma) normalized = s.replace(/\./g, "").replace(",", ".");
  else if (hasComma) normalized = s.replace(",", ".");
  const n = Number(normalized);
  return isNaN(n) ? null : n;
}

/** Aceita "dd/mm/yyyy", "yyyy-mm-dd", serial Excel; retorna ISO yyyy-mm-dd. */
export function parseDate(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") {
    // Serial Excel → epoch (1899-12-30)
    const ms = (raw - 25569) * 86400 * 1000;
    const d = new Date(ms);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  const s = String(raw).trim();
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (br) {
    const [, dd, mm, yy] = br;
    const y = yy.length === 2 ? 2000 + parseInt(yy) : parseInt(yy);
    const iso = `${y.toString().padStart(4, "0")}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    return isNaN(new Date(iso).getTime()) ? null : iso;
  }
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return s.slice(0, 10);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** Renderiza de volta para o formato esperado pelo template (dd/mm/yyyy). */
export function formatDateBR(iso: string | null): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}
