// Credipronto / Cury template — 20 colunas na ordem oficial.
// Não alterar a ordem nem o nome das chaves: o XLSX gerado deve bater 1-para-1.
export const CREDIPRONTO_COLUMNS = [
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
] as const;

export type CredprontoColumn = (typeof CREDIPRONTO_COLUMNS)[number];

export const COLUMN_LABELS: Record<CredprontoColumn, string> = {
  documento: "CPF / CNPJ",
  nome_completo: "Nome completo",
  data_nascimento: "Data de nascimento",
  mail_inquilino: "E-mail",
  telefone_inquilino: "Telefone",
  tipo_imovel: "Tipo do imóvel",
  cep: "CEP",
  numero_imovel: "Número",
  complemento: "Complemento",
  subtipo_imovel: "Subtipo do imóvel",
  valor_aluguel: "Valor do aluguel",
  valor_condominio: "Valor do condomínio",
  valor_taxas: "Valor das taxas",
  produto_fianca_loft: "Produto fiança Loft",
  taxa_setup: "Taxa de setup",
  meio_pagamento: "Meio de pagamento",
  ramo: "Ramo",
  logradouro_opcional: "Logradouro (opcional)",
  bairro_opcional: "Bairro (opcional)",
  observacao: "Observação",
};

// Campos obrigatórios para uma linha ser considerada válida.
export const REQUIRED_COLUMNS: CredprontoColumn[] = [
  "documento",
  "nome_completo",
  "valor_aluguel",
];
