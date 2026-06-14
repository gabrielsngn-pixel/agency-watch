import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { AGENCY_ACTIVITY_TYPES, NEGOTIATION_STATUSES, type AgencyActivityType } from "@/lib/constants";

const payloadSchema = z.object({
  consultant_email: z.string().email().max(320),
  agency: z.string().min(1).max(200).optional(),
  agency_name: z.string().min(1).max(200).optional(),
  city: z.string().max(120).optional(),
  state: z.string().max(2).optional(),
  activity_type: z.enum(AGENCY_ACTIVITY_TYPES.map(([value]) => value) as [string, ...string[]]),
  summary: z.string().min(1).max(5000).optional(),
  activity_summary: z.string().min(1).max(5000).optional(),
  interaction_result: z.string().max(5000).nullish(),
  next_steps: z.string().max(5000).nullish(),
  next_step: z.string().max(5000).nullish(),
  next_step_date: z.string().date().nullish(),
  status_changed: z.boolean().default(false),
  kanban_changed: z.boolean().optional(),
  new_status: z.enum(NEGOTIATION_STATUSES).nullish(),
  c_level_support_needed: z.boolean().default(false),
  support_c_level: z.boolean().optional(),
  attachment_url: z.string().url().max(2000).nullish(),
  uploaded_file_url: z.string().url().max(2000).nullish(),
  attachment_name: z.string().max(255).nullish(),
  uploaded_file_name: z.string().max(255).nullish(),
  base_origin: z.string().max(500).nullish(),
  notes: z.string().max(5000).nullish(),
}).superRefine((value, context) => {
  if (!value.agency && !value.agency_name) context.addIssue({ code: "custom", message: "agency_name_required" });
  if (!value.summary && !value.activity_summary) context.addIssue({ code: "custom", message: "activity_summary_required" });
});

function secureEqual(received: string, expected: string) {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
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
        if (statusChanged && !input.new_status) {
          return Response.json({ ok: false, error: "new_status_required" }, { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: consultant } = await supabaseAdmin
          .from("consultants")
          .select("id, name, email, user_id")
          .ilike("email", input.consultant_email)
          .eq("active", true)
          .maybeSingle();

        const { data: existingAgency } = await supabaseAdmin
          .from("real_estate_agencies")
          .select("id, name, negotiation_status, consultant_id")
          .ilike("name", agencyName)
          .maybeSingle();

        let agency = existingAgency;
        if (!agency) {
          const { data: createdAgency, error: createError } = await supabaseAdmin
            .from("real_estate_agencies")
            .insert({
              name: agencyName,
              city: input.city?.trim() || "Não informado",
              state: input.state?.trim().toUpperCase() || "NI",
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
        if (statusChanged && input.new_status === agency.negotiation_status) {
          return Response.json({ ok: false, error: "status_unchanged" }, { status: 400 });
        }

        const { data: activity, error } = await supabaseAdmin.from("agency_activities").insert({
          agency_id: agency.id,
          agency_name: agency.name,
          activity_type: input.activity_type as AgencyActivityType,
          registered_by_user_id: consultant?.user_id ?? null,
          registered_by_name: consultant?.name ?? null,
          registered_by_email: input.consultant_email,
          summary,
          interaction_result: input.interaction_result ?? null,
          next_steps: input.next_step ?? input.next_steps ?? null,
          next_step_date: input.next_step_date ?? null,
          status_changed: statusChanged,
          previous_status: agency.negotiation_status,
          new_status: statusChanged ? input.new_status ?? null : null,
          c_level_support_needed: input.support_c_level ?? input.c_level_support_needed,
          attachment_url: input.uploaded_file_url ?? input.attachment_url ?? null,
          attachment_name: input.uploaded_file_name ?? input.attachment_name ?? null,
          base_origin: input.base_origin ?? null,
          notes: input.notes ?? null,
          source: "google_forms",
        }).select("id").single();
        if (error) {
          console.error("[google-forms.activities] insert failed", error.message);
          return Response.json({ ok: false, error: "save_failed" }, { status: 500 });
        }
        return Response.json({ ok: true, activity_id: activity.id, agency_id: agency.id });
      },
    },
  },
});