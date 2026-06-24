import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { AGENCY_ACTIVITY_TYPES, NEGOTIATION_STATUSES, type AgencyActivityType } from "@/lib/constants";

const activityKeys = AGENCY_ACTIVITY_TYPES.map(([k]) => k) as [string, ...string[]];

// One schema, four flow variants identified by `flow`.
const baseSchema = z.object({
  consultant_email: z.string().email().max(320),
  consultant_name: z.string().trim().max(120).optional(),
  flow: z.enum(["attach_base", "new_agency", "fup", "kanban_move"]),
  agency_id: z.string().uuid().optional(),
  agency_name: z.string().max(200).optional(),
  cnpj: z.string().max(20).optional(),
  city: z.string().max(120).optional(),
  state: z.string().max(2).optional(),
  main_contact: z.string().max(200).optional(),
  contact_role: z.string().max(100).optional(),
  contact_phone: z.string().max(40).optional(),
  contact_email: z.string().email().max(320).optional().or(z.literal("")),
  current_guarantor: z.string().max(200).optional(),
  perceived_potential: z.string().max(100).optional(),
  initial_kanban_status: z.enum(NEGOTIATION_STATUSES).optional(),
  activity_type: z.enum(activityKeys).optional(),
  activity_type_detail: z.string().max(500).optional(),
  summary: z.string().max(5000).optional(),
  interaction_result: z.string().max(5000).optional(),
  next_steps: z.string().max(5000).optional(),
  next_step_date: z.string().date().optional().or(z.literal("")),
  c_level_support_needed: z.boolean().optional(),
  base_origin: z.string().max(500).optional(),
  notes: z.string().max(5000).optional(),
  requested_status: z.enum(NEGOTIATION_STATUSES).optional(),
});


function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "base-recebida";
}

export const Route = createFileRoute("/api/public/registro/submit")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: Record<string, unknown> = {};
        let file: File | null = null;
        const contentType = request.headers.get("content-type") ?? "";
        try {
          if (contentType.includes("multipart/form-data")) {
            const form = await request.formData();
            const raw = form.get("payload");
            if (typeof raw === "string") payload = JSON.parse(raw);
            const f = form.get("file");
            if (f instanceof File && f.size > 0) file = f;
          } else {
            payload = await request.json();
          }
        } catch {
          return Response.json({ ok: false, error: "invalid_body" }, { status: 400 });
        }

        const parsed = baseSchema.safeParse(payload);
        if (!parsed.success) {
          return Response.json({ ok: false, error: "invalid_payload", issues: parsed.error.flatten() }, { status: 400 });
        }
        const input = parsed.data;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Resolve consultant — auto-create if e-mail não está cadastrado.
        let { data: consultant } = await supabaseAdmin
          .from("consultants")
          .select("id, name, email, user_id")
          .ilike("email", input.consultant_email)
          .maybeSingle();

        if (!consultant) {
          const fallbackName =
            input.consultant_name?.trim() ||
            input.consultant_email.split("@")[0].replace(/[._-]+/g, " ").trim() ||
            input.consultant_email;
          const { data: created, error: createConsultantError } = await supabaseAdmin
            .from("consultants")
            .insert({
              name: fallbackName,
              email: input.consultant_email,
              active: true,
            })
            .select("id, name, email, user_id")
            .single();
          if (createConsultantError || !created) {
            return Response.json(
              { ok: false, error: "consultant_create_failed", detail: createConsultantError?.message },
              { status: 500 },
            );
          }
          consultant = created;
        } else if (!consultant.name && input.consultant_name?.trim()) {
          await supabaseAdmin
            .from("consultants")
            .update({ name: input.consultant_name.trim(), active: true })
            .eq("id", consultant.id);
        }


        // Resolve / create agency.
        let agency: { id: string; name: string; negotiation_status: string; consultant_id: string | null } | null = null;
        if (input.agency_id) {
          const { data } = await supabaseAdmin
            .from("real_estate_agencies")
            .select("id, name, negotiation_status, consultant_id")
            .eq("id", input.agency_id)
            .maybeSingle();
          agency = data ?? null;
        } else if (input.agency_name?.trim()) {
          const { data } = await supabaseAdmin
            .from("real_estate_agencies")
            .select("id, name, negotiation_status, consultant_id")
            .ilike("name", input.agency_name.trim())
            .maybeSingle();
          agency = data ?? null;
        }

        if (input.flow === "new_agency") {
          if (!input.agency_name?.trim() || !input.city?.trim() || !input.state?.trim()) {
            return Response.json({ ok: false, error: "agency_fields_required" }, { status: 400 });
          }
          if (!agency) {
            const { data: created, error: createError } = await supabaseAdmin
              .from("real_estate_agencies")
              .insert({
                name: input.agency_name.trim(),
                cnpj: input.cnpj?.replace(/\D+/g, "") || null,
                city: input.city.trim(),
                state: input.state.trim().toUpperCase(),
                main_contact: input.main_contact?.trim() || null,
                contact_role: input.contact_role?.trim() || null,
                contact_phone: input.contact_phone?.trim() || null,
                contact_email: input.contact_email?.trim() || null,
                current_guarantor: input.current_guarantor?.trim() || null,
                perceived_potential: input.perceived_potential?.trim() || null,
                negotiation_status: input.initial_kanban_status ?? undefined,
                consultant_id: consultant.id,
                created_by: consultant.user_id ?? null,
                updated_by: consultant.user_id ?? null,
              })
              .select("id, name, negotiation_status, consultant_id")
              .single();
            if (createError) return Response.json({ ok: false, error: "agency_create_failed", detail: createError.message }, { status: 500 });
            agency = created;
          }
        }

        if (!agency) {
          return Response.json({ ok: false, error: "agency_required" }, { status: 400 });
        }

        // Determine activity_type per flow.
        let activityType: AgencyActivityType;
        let summary = input.summary?.trim() || "";
        switch (input.flow) {
          case "attach_base":
            activityType = "client_base_received";
            summary ||= "Base de clientes recebida via formulário público";
            if (!file) return Response.json({ ok: false, error: "file_required" }, { status: 400 });
            break;
          case "new_agency":
            activityType = (input.activity_type as AgencyActivityType | undefined) ?? "cadastro_update";
            summary ||= "Cadastro de nova imobiliária via formulário público";
            break;
          case "fup":
            if (!input.activity_type) return Response.json({ ok: false, error: "activity_type_required" }, { status: 400 });
            activityType = input.activity_type as AgencyActivityType;
            summary ||= "Registro de atividade via formulário público";
            break;
          case "kanban_move":
            if (!input.requested_status) return Response.json({ ok: false, error: "requested_status_required" }, { status: 400 });
            activityType = "follow_up";
            summary ||= `Solicitação de mudança de etapa: ${agency.negotiation_status} → ${input.requested_status}`;
            break;
        }

        // Optional file upload (attach_base or any flow with file).
        let storedFilePath: string | null = null;
        let storedFileType: string | null = null;
        let storedFileSize: number | null = null;
        if (file) {
          if (file.size > 20 * 1024 * 1024) {
            return Response.json({ ok: false, error: "attachment_too_large" }, { status: 413 });
          }
          const allowed = ["application/pdf", "text/csv", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "image/jpeg", "image/png"];
          storedFileType = file.type || null;
          if (storedFileType && !allowed.includes(storedFileType)) {
            return Response.json({ ok: false, error: "attachment_type_not_allowed" }, { status: 415 });
          }
          const fileBytes = new Uint8Array(await file.arrayBuffer());
          const fileName = safeFileName(file.name);
          storedFilePath = `${agency.id}/${crypto.randomUUID()}-${fileName}`;
          storedFileSize = fileBytes.byteLength;
          const { error: uploadError } = await supabaseAdmin.storage
            .from("agency-files")
            .upload(storedFilePath, fileBytes, {
              contentType: storedFileType ?? "application/octet-stream",
              upsert: false,
            });
          if (uploadError) {
            return Response.json({ ok: false, error: "attachment_save_failed" }, { status: 500 });
          }
        }

        const { data: activity, error: activityError } = await supabaseAdmin
          .from("agency_activities")
          .insert({
            agency_id: agency.id,
            agency_name: agency.name,
            activity_type: activityType,
            activity_type_detail: input.activity_type_detail?.trim() || null,
            registered_by_user_id: consultant.user_id ?? null,
            registered_by_name: consultant.name,
            registered_by_email: input.consultant_email,
            summary,
            interaction_result: input.interaction_result?.trim() || null,
            next_steps: input.next_steps?.trim() || null,
            next_step_date: input.next_step_date || null,
            status_changed: false,
            previous_status: agency.negotiation_status as never,
            new_status: null,
            c_level_support_needed: Boolean(input.c_level_support_needed),
            attachment_url: storedFilePath,
            attachment_name: file?.name ?? null,
            base_origin: input.base_origin?.trim() || null,
            notes: input.notes?.trim() || null,
            source: "public_form",
          })
          .select("id")
          .single();

        if (activityError) {
          if (storedFilePath) await supabaseAdmin.storage.from("agency-files").remove([storedFilePath]);
          console.error("[registro.submit] insert failed", activityError.message);
          return Response.json({ ok: false, error: "save_failed", detail: activityError.message }, { status: 500 });
        }

        // Register file row so it appears in agency_files (triggers client_base_uploads too).
        if (storedFilePath) {
          await supabaseAdmin.from("agency_files").insert({
            agency_id: agency.id,
            activity_id: activity.id,
            uploaded_by: consultant.user_id ?? null,
            uploaded_by_name: consultant.name,
            uploaded_by_email: input.consultant_email,
            file_name: file?.name ?? storedFilePath.split("/").pop() ?? "base-recebida",
            file_url: storedFilePath,
            file_type: storedFileType,
            file_size: storedFileSize,
            processing_status: "pending",
          });
        }

        // Kanban move → pending approval request (mesma lógica do Forms).
        let pendingRequestId: string | null = null;
        if (input.flow === "kanban_move" && input.requested_status && input.requested_status !== agency.negotiation_status) {
          const { data: req } = await supabaseAdmin
            .from("kanban_change_requests")
            .insert({
              agency_id: agency.id,
              agency_name: agency.name,
              activity_id: activity.id,
              current_status: agency.negotiation_status as never,
              requested_status: input.requested_status,
              requested_by_email: input.consultant_email,
              requested_by_name: consultant.name,
              requested_by_user_id: consultant.user_id ?? null,
              source: "public_form",
              status: "pending",
            })
            .select("id")
            .single();
          pendingRequestId = req?.id ?? null;
        }

        return Response.json({
          ok: true,
          agency_id: agency.id,
          activity_id: activity.id,
          kanban_change_request_id: pendingRequestId,
        });
      },
    },
  },
});
