// Templates de importação de clientes.
// Dois modelos: "simplified" (Credipronto/Cury - 20 colunas) e "complete" (todos os
// campos da nova + antiga planilha — 30 colunas). A ordem das colunas é canônica
// e o XLSX gerado bate 1-para-1 com o template selecionado.

export type ImportColumn =
  // Identificação
  | "documento"
  | "nome_completo"
  | "data_nascimento"
  | "mail_inquilino"
  | "telefone_inquilino"
  // Imóvel
  | "tipo_imovel"
  | "subtipo_imovel"
  | "cep"
  | "numero_imovel"
  | "complemento"
  | "logradouro_opcional"
  | "bairro_opcional"
  | "cidade_imovel"
  | "estado_imovel"
  // Valores
  | "valor_aluguel"
  | "valor_condominio"
  | "valor_taxas"
  // Produto
  | "produto_fianca_loft"
  | "taxa_setup"
  | "meio_pagamento"
  | "ramo"
  // Contrato / Cobertura (somente template completo)
  | "contrato"
  | "garantidor"
  | "taxa_garantia"
  | "data_assinatura"
  | "vigencia_cobertura"
  | "valor_pacote"
  | "cobertura_aluguel"
  | "cobertura_danos"
  // Livre
  | "observacao";

// Compat: alias do tipo antigo.
export type CredprontoColumn = ImportColumn;

export const COLUMN_LABELS: Record<ImportColumn, string> = {
  documento: "CPF / CNPJ",
  nome_completo: "Nome completo",
  data_nascimento: "Data de nascimento",
  mail_inquilino: "E-mail do inquilino",
  telefone_inquilino: "Telefone do inquilino",
  tipo_imovel: "Tipo do imóvel",
  subtipo_imovel: "Subtipo do imóvel",
  cep: "CEP",
  numero_imovel: "Número",
  complemento: "Complemento",
  logradouro_opcional: "Logradouro (opcional)",
  bairro_opcional: "Bairro (opcional)",
  cidade_imovel: "Cidade do imóvel",
  estado_imovel: "Estado do imóvel",
  valor_aluguel: "Valor do aluguel",
  valor_condominio: "Valor do condomínio",
  valor_taxas: "Valor das taxas",
  produto_fianca_loft: "Produto fiança Loft",
  taxa_setup: "Taxa de setup",
  meio_pagamento: "Meio / forma de pagamento",
  ramo: "Ramo",
  contrato: "Contrato",
  garantidor: "Garantidor",
  taxa_garantia: "Taxa garantia",
  data_assinatura: "Data de assinatura",
  vigencia_cobertura: "Vigência da cobertura",
  valor_pacote: "Valor do pacote",
  cobertura_aluguel: "Cobertura de aluguel",
  cobertura_danos: "Cobertura de danos",
  observacao: "Observação",
};

// ===== Template "simplified" (planilha antiga / Credipronto - 20 campos) =====
export const SIMPLIFIED_COLUMNS: ImportColumn[] = [
  "documento",
  "nome_completo",
  "data_nascimento",
  "mail_inquilino",
  "telefone_inquilino",
  "tipo_imovel",
  "cep",
  "numero_imovel",
  "complemento",
  "subtipo_imovel",
  "valor_aluguel",
  "valor_condominio",
  "valor_taxas",
  "produto_fianca_loft",
  "taxa_setup",
  "meio_pagamento",
  "ramo",
  "logradouro_opcional",
  "bairro_opcional",
  "observacao",
];

// ===== Template "complete" (todos os campos do print de referência) =====
export const COMPLETE_COLUMNS: ImportColumn[] = [
  "documento",
  "nome_completo",
  "data_nascimento",
  "mail_inquilino",
  "telefone_inquilino",
  "tipo_imovel",
  "subtipo_imovel",
  "cep",
  "logradouro_opcional",
  "numero_imovel",
  "complemento",
  "bairro_opcional",
  "cidade_imovel",
  "estado_imovel",
  "meio_pagamento",
  "contrato",
  "garantidor",
  "taxa_garantia",
  "data_assinatura",
  "vigencia_cobertura",
  "valor_pacote",
  "cobertura_aluguel",
  "cobertura_danos",
  "valor_aluguel",
  "valor_condominio",
  "valor_taxas",
  "produto_fianca_loft",
  "taxa_setup",
  "ramo",
  "observacao",
];

export type TemplateKey = "simplified" | "complete";

export const TEMPLATES: Record<
  TemplateKey,
  { label: string; description: string; columns: ImportColumn[]; required: ImportColumn[] }
> = {
  simplified: {
    label: "Informações simplificadas",
    description: "Modelo Credipronto/Cury (20 campos).",
    columns: SIMPLIFIED_COLUMNS,
    required: ["documento", "nome_completo", "valor_aluguel", "tipo_imovel", "numero_imovel"],
  },
  complete: {
    label: "Informações completas",
    description: "Inclui contrato, cobertura, garantidor e cidade/UF (30 campos).",
    columns: COMPLETE_COLUMNS,
    required: ["documento", "cep", "tipo_imovel", "numero_imovel"],
  },

};

// Compat com código antigo.
export const CREDIPRONTO_COLUMNS = SIMPLIFIED_COLUMNS;
export const REQUIRED_COLUMNS = TEMPLATES.simplified.required;
