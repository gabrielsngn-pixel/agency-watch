import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "node:crypto";
import { NEGOTIATION_STATUSES, type NegotiationStatus } from "@/lib/constants";

const SPREADSHEET_ID = "1caah-49ESwqIip27EUzkkEK7Mjhd7V-hGneqGog_AlU";
const SHEET_NAME = "Respostas ao formulário 1";
const SHEETS_GATEWAY = "https://connector-gateway.lovable.dev/google_sheets/v4";

const ACTIVITY_TYPES: Record<string, string> = {
  "ligação": "call",
  whatsapp: "whatsapp",
  "e-mail": "email",
  email: "email",
  "reunião": "meeting",
  "visita presencial": "in_person_visit",
  "proposta enviada": "proposal_sent",
  "recebimento de base de clientes": "client_base_received",
  "base de clientes recebida": "client_base_received",
  treinamento: "training",
  "follow-up": "follow_up",
  "apoio c-level": "c_level_support",
  "observação interna": "internal_note",
  "atualização cadastral": "cadastro_update",
  outro: "other",
};

// Aliases (lower-cased, accent-folded) → canonical NEGOTIATION_STATUSES value.
const KANBAN_STATUS_ALIASES: Record<string, NegotiationStatus> = {
  "sem interesse": "Sem interesse",
  "nao tem interesse": "Sem interesse",
  "nao tem iteresse": "Sem interesse",
  "nao ha interesse": "Sem interesse",
  "sem interesse na parceria": "Sem interesse",
  "nao interessado": "Sem interesse",
  "sem iteresse": "Sem interesse",
  "pipeline de prospeccao": "Pipeline de Prospecção",
  "pipeline": "Pipeline de Prospecção",
  "prospeccao": "Pipeline de Prospecção",
  "conversas iniciadas": "Conversas iniciadas",
  "reuniao agendada": "Reunião agendada",
  "aguardando base": "Aguardando base",
  "stand by": "Stand by",
  "proposta enviada": "Proposta enviada",
  "em negociacao": "Em negociação",
  "convertida": "Convertida",
};

function foldKey(value: string) {
  return value
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKanbanStatus(value?: string): NegotiationStatus | undefined {
  if (!value) return undefined;
  const folded = foldKey(value);
  if (!folded) return undefined;
  // Exact match against canonical first.
  const direct = NEGOTIATION_STATUSES.find((s) => foldKey(s) === folded);
  if (direct) return direct;
  return KANBAN_STATUS_ALIASES[folded];
}

function cell(row: string[], index: number) {
  return row[index]?.trim() || undefined;
}

// The form's "Status atual da imobiliária (Kanban)" column position has
// changed over time (currently last column, was column 25). Scan the row
// from the end and return the first cell whose value normalizes to a known
// kanban status, ignoring cells already consumed as activity_type/result.
function detectInitialKanbanStatus(row: string[], ignoreIndexes: number[]): NegotiationStatus | undefined {
  const ignore = new Set(ignoreIndexes);
  for (let i = row.length - 1; i >= 0; i -= 1) {
    if (ignore.has(i)) continue;
    const status = normalizeKanbanStatus(cell(row, i));
    if (status) return status;
  }
  return undefined;
}

function yes(value?: string) {
  return value?.toLocaleLowerCase("pt-BR") === "sim";
}

function parseBrazilianDate(value?: string, includeTime = false) {
  if (!value) return undefined;
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?$/);
  if (!match) return undefined;
  const [, day, month, year, hour = "12", minute = "00", second = "00"] = match;
  return includeTime
    ? `${year}-${month}-${day}T${hour}:${minute}:${second}-03:00`
    : `${year}-${month}-${day}`;
}

function normalizeActivityType(value?: string) {
  if (!value) return "other";
  return ACTIVITY_TYPES[value.toLocaleLowerCase("pt-BR")] ?? "other";
}

function fileUrl(value?: string) {
  if (!value) return undefined;
  return value.split(",").map((item) => item.trim()).find(Boolean);
}

function buildPayload(row: string[], rowNumber: number, payloadHash: string) {
  // Sheet column layout (after form simplification — see "situação atual forms"):
  //  0 Timestamp
  //  1 E-mail do Consultor
  //  2 Nome da Imobiliária (dropdown existente)
  //  3 Tipo de Atividade
  //  4 Resumo da Atividade
  //  5 Resultado da Interação
  //  6 Precisa de apoio C-Level?
  //  7 Observações
  //  8 Próximo Passo
  //  9 Data do Próximo Passo
  // 10 Status atual da imobiliária (Kanban)  ← imobiliária existente
  // 11 Receber Base de Clientes (arquivo)
  // 12 Origem da Base
  // 13 Observações da Base
  // 14 Nome da Imobiliária (nova)
  // 15 Cidade
  // 16 UF
  // 17 Contato Principal
  // 18 Cargo
  // 19 Telefone
  // 20 Email
  // 21 Garantidor Atual
  // 22 Potencial Percebido
  // 23 Etapa atual  ← imobiliária nova
  const existingAgencyName = cell(row, 2);
  const newAgencyName = cell(row, 14);
  const rawActivityType = cell(row, 3);
  const attachment = fileUrl(cell(row, 11));
  const activityType = normalizeActivityType(rawActivityType);
  const kanbanExisting = normalizeKanbanStatus(cell(row, 10));
  const kanbanNew = normalizeKanbanStatus(cell(row, 23));

  return {
    consultant_email: cell(row, 1),
    agency_name: newAgencyName ?? existingAgencyName,
    city: cell(row, 15),
    state: cell(row, 16),
    main_contact: cell(row, 17),
    contact_role: cell(row, 18),
    contact_phone: cell(row, 19),
    contact_email: cell(row, 20),
    current_guarantor: cell(row, 21),
    perceived_potential: cell(row, 22),
    activity_type: activityType,
    activity_type_detail: activityType === "other" ? rawActivityType ?? "Prospecção de nova imobiliária" : undefined,
    summary: cell(row, 4) ?? "Cadastro de nova imobiliária via prospecção",
    interaction_result: cell(row, 5),
    c_level_support_needed: yes(cell(row, 6)),
    notes: [cell(row, 7), cell(row, 13)].filter(Boolean).join("\n") || undefined,
    next_steps: cell(row, 8),
    next_step_date: parseBrazilianDate(cell(row, 9)),
    // Fluxo single-field — o consultor marca UM kanban; a comparação com o
    // CRM e a criação do pedido de aprovação acontecem em activities.ts.
    status_changed: false,
    uploaded_file_url: attachment,
    uploaded_file_name: attachment ? `base-resposta-${rowNumber}` : undefined,
    base_origin: cell(row, 12),
    initial_kanban_status: kanbanExisting ?? kanbanNew ?? detectInitialKanbanStatus(row, [3, 4, 5]),
    activity_date: parseBrazilianDate(cell(row, 0), true),
    google_submission: {
      spreadsheet_id: SPREADSHEET_ID,
      sheet_name: SHEET_NAME,
      row_number: rowNumber,
      response_timestamp: parseBrazilianDate(cell(row, 0), true),
      payload_hash: payloadHash,
      payload: row,
    },
  };
}

async function runSync(request: Request) {
  const expectedKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const receivedKey = request.headers.get("apikey");
  if (!expectedKey || receivedKey !== expectedKey) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const lovableKey = process.env.LOVABLE_API_KEY;
  const sheetsKey = process.env.GOOGLE_SHEETS_API_KEY;
  const webhookSecret = process.env.GOOGLE_FORMS_WEBHOOK_SECRET;
  if (!lovableKey || !sheetsKey || !webhookSecret) {
    return Response.json({ ok: false, error: "integration_not_configured" }, { status: 503 });
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Read the entire sheet so we can detect deleted rows.
  const range = `'${SHEET_NAME}'!A2:AE`;
  const response = await fetch(`${SHEETS_GATEWAY}/spreadsheets/${SPREADSHEET_ID}/values/${range}?valueRenderOption=FORMATTED_VALUE`, {
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": sheetsKey,
    },
  });
  if (!response.ok) {
    console.error("[google-forms.sync] sheets read failed", response.status, await response.text());
    return Response.json({ ok: false, error: "sheet_read_failed" }, { status: 502 });
  }

  const body = await response.json() as { values?: string[][] };
  const rows = body.values ?? [];

  // Compute hash for every non-empty row currently in the sheet.
  const liveRows: Array<{ rowNumber: number; row: string[]; hash: string }> = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row?.some((value) => value?.trim())) continue;
    const hash = createHash("sha256").update(JSON.stringify(row)).digest("hex");
    liveRows.push({ rowNumber: index + 2, row, hash });
  }
  const liveHashes = liveRows.map((r) => r.hash);

  // Destructive sync: remove submissions (+ activities, orphan agencies) that
  // no longer exist in the sheet.
  const { data: pruneResult, error: pruneError } = await supabaseAdmin.rpc(
    "prune_google_form_submissions",
    {
      p_spreadsheet: SPREADSHEET_ID,
      p_sheet: SHEET_NAME,
      p_keep_hashes: liveHashes,
    },
  );
  if (pruneError) {
    console.error("[google-forms.sync] prune failed", pruneError.message);
  }

  // Skip rows we have already processed (by hash).
  const { data: processedRows } = await supabaseAdmin
    .from("google_form_submissions")
    .select("payload_hash")
    .eq("spreadsheet_id", SPREADSHEET_ID)
    .eq("sheet_name", SHEET_NAME)
    .eq("processing_status", "processed");
  const processedHashes = new Set((processedRows ?? []).map((r) => r.payload_hash));

  const activityEndpoint = new URL("/api/public/google-forms/activities", request.url);
  let processed = 0;
  let failed = 0;
  let skipped = 0;

  for (const { rowNumber, row, hash } of liveRows) {
    if (processedHashes.has(hash)) {
      skipped += 1;
      continue;
    }
    const result = await fetch(activityEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-webhook-secret": webhookSecret },
      body: JSON.stringify(buildPayload(row, rowNumber, hash)),
    });
    if (result.ok) processed += 1;
    else {
      failed += 1;
      console.error("[google-forms.sync] row failed", rowNumber, result.status, await result.text());
    }
  }

  return Response.json({
    ok: failed === 0,
    sheet_rows: liveRows.length,
    processed,
    failed,
    skipped,
    pruned: pruneResult ?? null,
  });
}

export const Route = createFileRoute("/api/public/google-forms/sync")({
  server: {
    handlers: {
      GET: async ({ request }) => runSync(request),
      POST: async ({ request }) => runSync(request),
    },
  },
});
