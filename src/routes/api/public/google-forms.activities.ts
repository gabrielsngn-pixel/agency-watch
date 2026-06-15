import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { AGENCY_ACTIVITY_TYPES, NEGOTIATION_STATUSES, type AgencyActivityType } from "@/lib/constants";

const payloadSchema = z.object({
  consultant_email: z.string().email().max(320),
  agency: z.string().min(1).max(200).optional(),
  agency_name: z.string().min(1).max(200).optional(),
  agency_id: z.string().uuid().optional(),
  city: z.string().max(120).optional(),
  state: z.string().max(2).optional(),
  main_contact: z.string().max(200).nullish(),
  contact_role: z.string().max(100).nullish(),
  contact_phone: z.string().max(40).nullish(),
  contact_email: z.string().email().max(320).nullish(),
  current_guarantor: z.string().max(120).nullish(),
  current_guarantor_detail: z.string().max(500).nullish(),
  perceived_potential: z.string().max(100).nullish(),
  activity_type: z.enum(AGENCY_ACTIVITY_TYPES.map(([value]) => value) as [string, ...string[]]),
  activity_type_detail: z.string().max(500).nullish(),
  summary: z.string().min(1).max(5000).optional(),
  activity_summary: z.string().min(1).max(5000).optional(),
  interaction_result: z.string().max(5000).nullish(),
  interaction_result_detail: z.string().max(500).nullish(),
  next_steps: z.string().max(5000).nullish(),
  next_step: z.string().max(5000).nullish(),
  next_step_date: z.string().date().nullish(),
  activity_date: z.string().datetime({ offset: true }).nullish(),
  status_changed: z.boolean().default(false),
  kanban_changed: z.boolean().optional(),
  new_status: z.enum(NEGOTIATION_STATUSES).nullish(),
  previous_status: z.enum(NEGOTIATION_STATUSES).nullish(),
  c_level_support_needed: z.boolean(),
  attachment_url: z.string().url().max(2000).nullish(),
  uploaded_file_url: z.string().url().max(2000).nullish(),
  uploaded_file_base64: z.string().max(28_000_000).nullish(),
  attachment_name: z.string().max(255).nullish(),
  uploaded_file_name: z.string().max(255).nullish(),
  base_origin: z.string().max(500).nullish(),
  initial_kanban_status: z.enum(NEGOTIATION_STATUSES).nullish(),
  notes: z.string().max(5000).nullish(),
  google_submission: z.object({
    spreadsheet_id: z.string().min(1).max(200),
    sheet_name: z.string().min(1).max(200),
    row_number: z.number().int().min(2),
    response_timestamp: z.string().datetime({ offset: true }).nullish(),
    payload_hash: z.string().length(64),
    payload: z.array(z.string()).max(100),
  }).optional(),
}).superRefine((value, context) => {
  if (!value.agency_id && !value.agency && !value.agency_name) context.addIssue({ code: "custom", message: "agency_required" });
  if (!value.summary && !value.activity_summary) context.addIssue({ code: "custom", message: "activity_summary_required" });
  if (value.activity_type === "other" && !value.activity_type_detail?.trim()) context.addIssue({ code: "custom", message: "activity_type_detail_required" });
  if (value.interaction_result?.trim().toLocaleLowerCase("pt-BR") === "outro" && !value.interaction_result_detail?.trim()) context.addIssue({ code: "custom", message: "interaction_result_detail_required" });
  if (value.current_guarantor?.trim().toLocaleLowerCase("pt-BR") === "outro" && !value.current_guarantor_detail?.trim()) context.addIssue({ code: "custom", message: "current_guarantor_detail_required" });
});

function secureEqual(received: string, expected: string) {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "base-recebida";
}

function googleDriveFileId(value: string) {
  try {
    const url = new URL(value);
    return url.pathname.match(/\/d\/([^/]+)/)?.[1] ?? url.searchParams.get("id") ?? undefined;
  } catch {
    return undefined;
  }
}

export const Route = createFileRoute("/api/public/google-forms/activities")({
  server: {
    handlers: {
      GET: async () => Response.json({ ok: true, service: "agency-activities" }),
      POST: async ({ request }) => {
        const expectedSecret = process.env.GOOGLE_FORMS_WEBHOOK_SECRET;
        const receivedSecret = request.headers.get("x-webhook-secret") ?? "";
        if (!expectedSecret || !secureEqual(receivedSecret, expectedSecret)) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }

        const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return Response.json({ ok: false, error: "invalid_payload" }, { status: 400 });
        }
        const input = parsed.data;
        const agencyName = (input.agency_name ?? input.agency ?? "").trim();
        const summary = (input.activity_summary ?? input.summary ?? "").trim();
        const statusChanged = input.kanban_changed ?? input.status_changed;
        if (statusChanged && (!input.previous_status || !input.new_status)) {
          return Response.json({ ok: false, error: "kanban_statuses_required" }, { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        let submissionId: string | null = null;
        if (input.google_submission) {
          const submission = input.google_submission;
          const { data: existingSubmission } = await supabaseAdmin
            .from("google_form_submissions")
            .select("id, processing_status, agency_id, activity_id")
            .eq("spreadsheet_id", submission.spreadsheet_id)
            .eq("sheet_name", submission.sheet_name)
            .eq("row_number", submission.row_number)
            .maybeSingle();
          if (existingSubmission?.processing_status === "processed") {
            return Response.json({ ok: true, duplicate: true, activity_id: existingSubmission.activity_id, agency_id: existingSubmission.agency_id });
          }
          if (existingSubmission) {
            submissionId = existingSubmission.id;
            await supabaseAdmin.from("google_form_submissions").update({
              payload: submission.payload,
              payload_hash: submission.payload_hash,
              response_timestamp: submission.response_timestamp ?? null,
              processing_status: "processing",
              error_code: null,
              attempt_count: 1,
            }).eq("id", existingSubmission.id);
          } else {
            const { data: createdSubmission, error: submissionError } = await supabaseAdmin
              .from("google_form_submissions")
              .insert({
                spreadsheet_id: submission.spreadsheet_id,
                sheet_name: submission.sheet_name,
                row_number: submission.row_number,
                response_timestamp: submission.response_timestamp ?? null,
                payload: submission.payload,
                payload_hash: submission.payload_hash,
                processing_status: "processing",
                attempt_count: 1,
              })
              .select("id")
              .single();
            if (submissionError) return Response.json({ ok: false, error: "submission_register_failed" }, { status: 500 });
            submissionId = createdSubmission.id;
          }
        }
        const { data: consultant } = await supabaseAdmin
          .from("consultants")
          .select("id, name, email, user_id")
          .ilike("email", input.consultant_email)
          .eq("active", true)
          .maybeSingle();

        const agencyQuery = supabaseAdmin
          .from("real_estate_agencies")
          .select("id, name, negotiation_status, consultant_id");
        const { data: existingAgency } = input.agency_id
          ? await agencyQuery.eq("id", input.agency_id).maybeSingle()
          : await agencyQuery.ilike("name", agencyName).maybeSingle();

        let agency = existingAgency;
        if (!agency) {
          const { data: createdAgency, error: createError } = await supabaseAdmin
            .from("real_estate_agencies")
            .insert({
              name: agencyName,
              city: input.city?.trim() || "Não informado",
              state: input.state?.trim().toUpperCase() || null,
              registration_incomplete: !input.state?.trim(),
              main_contact: input.main_contact?.trim() || null,
              contact_role: input.contact_role?.trim() || null,
              contact_phone: input.contact_phone?.trim() || null,
              contact_email: input.contact_email?.trim() || null,
              current_guarantor: input.current_guarantor?.trim().toLocaleLowerCase("pt-BR") === "outro"
                ? input.current_guarantor_detail?.trim()
                : input.current_guarantor?.trim() || null,
              perceived_potential: input.perceived_potential?.trim() || null,
              consultant_id: consultant?.id ?? null,
              created_by: consultant?.user_id ?? null,
              updated_by: consultant?.user_id ?? null,
            })
            .select("id, name, negotiation_status, consultant_id")
            .single();
          if (createError) {
            const { data: concurrentAgency } = await supabaseAdmin
              .from("real_estate_agencies")
              .select("id, name, negotiation_status, consultant_id")
              .ilike("name", agencyName)
              .maybeSingle();
            agency = concurrentAgency;
          } else {
            agency = createdAgency;
          }
        }
        if (!agency) {
          return Response.json({ ok: false, error: "agency_create_failed" }, { status: 500 });
        }
        if (statusChanged && input.previous_status !== agency.negotiation_status) {
          return Response.json({ ok: false, error: "stale_previous_status" }, { status: 409 });
        }
        if (statusChanged && input.new_status === agency.negotiation_status) {
          return Response.json({ ok: false, error: "status_unchanged" }, { status: 400 });
        }

        const remoteFileUrl = input.uploaded_file_url ?? input.attachment_url;
        const originalFileName = input.uploaded_file_name ?? input.attachment_name;
        const isReceivedBase = Boolean(remoteFileUrl || input.uploaded_file_base64)
          || input.activity_type === "client_base_received"
          || (input.interaction_result ?? "").trim().toLocaleLowerCase("pt-BR") === "base recebida";
        if (isReceivedBase && !(remoteFileUrl || input.uploaded_file_base64)) {
          return Response.json({ ok: false, error: "attachment_required" }, { status: 400 });
        }
        let storedFilePath: string | null = null;
        let storedFileType: string | null = null;
        let storedFileSize: number | null = null;

        if (isReceivedBase && (remoteFileUrl || input.uploaded_file_base64)) {
          let fileBytes: Uint8Array;
          if (input.uploaded_file_base64) {
            fileBytes = Uint8Array.from(Buffer.from(input.uploaded_file_base64, "base64"));
          } else {
            const driveId = remoteFileUrl ? googleDriveFileId(remoteFileUrl) : undefined;
            const driveKey = process.env.GOOGLE_DRIVE_API_KEY;
            const lovableKey = process.env.LOVABLE_API_KEY;
            const downloadUrl = driveId
              ? `https://connector-gateway.lovable.dev/google_drive/drive/v3/files/${driveId}?alt=media`
              : remoteFileUrl ?? "";
            const fileResponse = await fetch(downloadUrl, {
              redirect: "follow",
              headers: driveId && driveKey && lovableKey ? {
                Authorization: `Bearer ${lovableKey}`,
                "X-Connection-Api-Key": driveKey,
              } : undefined,
            });
            if (!fileResponse.ok) {
              return Response.json({ ok: false, error: "attachment_download_failed" }, { status: 502 });
            }
            fileBytes = new Uint8Array(await fileResponse.arrayBuffer());
            storedFileType = fileResponse.headers.get("content-type")?.split(";")[0] ?? null;
          }
          if (fileBytes.byteLength > 20 * 1024 * 1024) {
            return Response.json({ ok: false, error: "attachment_too_large" }, { status: 413 });
          }
          const fallbackName = remoteFileUrl ? new URL(remoteFileUrl).pathname.split("/").pop() : null;
          const fileName = safeFileName(originalFileName ?? fallbackName ?? "base-recebida");
          storedFilePath = `${agency.id}/${crypto.randomUUID()}-${fileName}`;
          storedFileSize = fileBytes.byteLength;
          const { error: uploadError } = await supabaseAdmin.storage.from("agency-files").upload(storedFilePath, fileBytes, {
            contentType: storedFileType ?? "application/octet-stream",
            upsert: false,
          });
          if (uploadError) {
            console.error("[google-forms.activities] file upload failed", uploadError.message);
            return Response.json({ ok: false, error: "attachment_save_failed" }, { status: 500 });
          }
        }

        const { data: activity, error } = await supabaseAdmin.from("agency_activities").insert({
          agency_id: agency.id,
          agency_name: agency.name,
          activity_type: input.activity_type as AgencyActivityType,
          activity_type_detail: input.activity_type_detail?.trim() || null,
          registered_by_user_id: consultant?.user_id ?? null,
          registered_by_name: consultant?.name ?? null,
          registered_by_email: input.consultant_email,
          summary,
          interaction_result: input.interaction_result ?? null,
          interaction_result_detail: input.interaction_result_detail?.trim() || null,
          next_steps: input.next_step ?? input.next_steps ?? null,
          next_step_date: input.next_step_date ?? null,
          status_changed: statusChanged,
          previous_status: agency.negotiation_status,
          new_status: statusChanged ? input.new_status ?? null : null,
          c_level_support_needed: input.c_level_support_needed,
          attachment_url: storedFilePath ?? input.uploaded_file_url ?? input.attachment_url ?? null,
          attachment_name: input.uploaded_file_name ?? input.attachment_name ?? null,
          base_origin: input.base_origin ?? null,
          notes: input.notes ?? null,
          source: "google_forms",
          activity_date: input.activity_date ?? undefined,
          google_submission_id: submissionId,
        }).select("id").single();
        if (error) {
          if (storedFilePath) await supabaseAdmin.storage.from("agency-files").remove([storedFilePath]);
          console.error("[google-forms.activities] insert failed", error.message);
          if (submissionId) await supabaseAdmin.from("google_form_submissions").update({ processing_status: "failed", error_code: "activity_save_failed" }).eq("id", submissionId);
          return Response.json({ ok: false, error: "save_failed" }, { status: 500 });
        }
        if (storedFilePath) {
          const { error: fileRecordError } = await supabaseAdmin.from("agency_files").insert({
            agency_id: agency.id,
            activity_id: activity.id,
            uploaded_by: consultant?.user_id ?? null,
            uploaded_by_name: consultant?.name ?? null,
            uploaded_by_email: input.consultant_email,
            file_name: originalFileName ?? storedFilePath.split("/").pop() ?? "base-recebida",
            file_url: storedFilePath,
            file_type: storedFileType,
            file_size: storedFileSize,
            processing_status: "pending",
          });
          if (fileRecordError) {
            await supabaseAdmin.storage.from("agency-files").remove([storedFilePath]);
            console.error("[google-forms.activities] file record failed", fileRecordError.message);
            return Response.json({ ok: false, error: "attachment_record_failed" }, { status: 500 });
          }
        }
        if (submissionId) {
          await supabaseAdmin.from("google_form_submissions").update({
            processing_status: "processed",
            agency_id: agency.id,
            activity_id: activity.id,
            processed_at: new Date().toISOString(),
            error_code: null,
          }).eq("id", submissionId);
        }
        return Response.json({ ok: true, activity_id: activity.id, agency_id: agency.id });
      },
    },
  },
});