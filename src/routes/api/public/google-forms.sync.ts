import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "node:crypto";

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

function cell(row: string[], index: number) {
  return row[index]?.trim() || undefined;
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

function buildPayload(row: string[], rowNumber: number) {
  const existingAgencyName = cell(row, 2);
  const prospectAgencyName = cell(row, 16);
  const rawActivityType = cell(row, 3);
  const attachment = fileUrl(cell(row, 13));
  const activityType = normalizeActivityType(rawActivityType);

  return {
    consultant_email: cell(row, 1),
    agency_name: prospectAgencyName ?? existingAgencyName,
    city: cell(row, 17),
    state: cell(row, 18),
    main_contact: cell(row, 19),
    contact_role: cell(row, 20),
    contact_phone: cell(row, 21),
    contact_email: cell(row, 22),
    current_guarantor: cell(row, 23),
    perceived_potential: cell(row, 24),
    activity_type: activityType,
    activity_type_detail: activityType === "other" ? rawActivityType ?? "Prospecção de nova imobiliária" : undefined,
    summary: cell(row, 4) ?? "Cadastro de nova imobiliária via prospecção",
    interaction_result: cell(row, 5),
    c_level_support_needed: yes(cell(row, 6)),
    notes: [cell(row, 7), cell(row, 15)].filter(Boolean).join("\n") || undefined,
    next_steps: cell(row, 8),
    next_step_date: parseBrazilianDate(cell(row, 9)),
    status_changed: yes(cell(row, 10)),
    previous_status: cell(row, 11),
    new_status: cell(row, 12),
    uploaded_file_url: attachment,
    uploaded_file_name: attachment ? `base-resposta-${rowNumber}` : undefined,
    base_origin: cell(row, 14),
    activity_date: parseBrazilianDate(cell(row, 0), true),
    google_submission: {
      spreadsheet_id: SPREADSHEET_ID,
      sheet_name: SHEET_NAME,
      row_number: rowNumber,
      response_timestamp: parseBrazilianDate(cell(row, 0), true),
      payload_hash: createHash("sha256").update(JSON.stringify(row)).digest("hex"),
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
  const { data: latest } = await supabaseAdmin
    .from("google_form_submissions")
    .select("row_number")
    .eq("spreadsheet_id", SPREADSHEET_ID)
    .eq("sheet_name", SHEET_NAME)
    .eq("processing_status", "processed")
    .order("row_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const startRow = Math.max(2, (latest?.row_number ?? 1) + 1);
  const range = `'${SHEET_NAME}'!A${startRow}:AE`;
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
  const activityEndpoint = new URL("/api/public/google-forms/activities", request.url);
  let processed = 0;
  let failed = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const rowNumber = startRow + index;
    const row = rows[index];
    if (!row?.some((value) => value?.trim())) continue;
    const result = await fetch(activityEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-webhook-secret": webhookSecret },
      body: JSON.stringify(buildPayload(row, rowNumber)),
    });
    if (result.ok) processed += 1;
    else {
      failed += 1;
      console.error("[google-forms.sync] row failed", rowNumber, result.status, await result.text());
    }
  }

  return Response.json({ ok: failed === 0, start_row: startRow, found: rows.length, processed, failed });
}

export const Route = createFileRoute("/api/public/google-forms/sync")({
  server: {
    handlers: {
      GET: async ({ request }) => runSync(request),
      POST: async ({ request }) => runSync(request),
    },
  },
});