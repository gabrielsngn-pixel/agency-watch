import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { AGENCY_ACTIVITY_TYPES, NEGOTIATION_STATUSES, type AgencyActivityType } from "@/lib/constants";

const payloadSchema = z.object({
  consultant_email: z.string().email().max(320),
  agency: z.string().min(1).max(200),
  activity_type: z.enum(AGENCY_ACTIVITY_TYPES.map(([value]) => value) as [string, ...string[]]),
  summary: z.string().min(1).max(5000),
  interaction_result: z.string().max(5000).nullish(),
  next_steps: z.string().max(5000).nullish(),
  next_step_date: z.string().date().nullish(),
  status_changed: z.boolean().default(false),
  new_status: z.enum(NEGOTIATION_STATUSES).nullish(),
  c_level_support_needed: z.boolean().default(false),
  attachment_url: z.string().url().max(2000).nullish(),
  attachment_name: z.string().max(255).nullish(),
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
        if (input.status_changed && !input.new_status) {
          return Response.json({ ok: false, error: "new_status_required" }, { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: consultant } = await supabaseAdmin
          .from("consultants")
          .select("id, name, email, user_id")
          .ilike("email", input.consultant_email)
          .eq("active", true)
          .maybeSingle();
        if (!consultant) {
          return Response.json({ ok: false, error: "consultant_not_found" }, { status: 404 });
        }

        const { data: agencies } = await supabaseAdmin
          .from("real_estate_agencies")
          .select("id, name, negotiation_status, consultant_id")
          .ilike("name", input.agency)
          .limit(2);
        if (!agencies?.length) {
          return Response.json({ ok: false, error: "agency_not_found" }, { status: 404 });
        }
        if (agencies.length > 1) {
          return Response.json({ ok: false, error: "agency_ambiguous" }, { status: 409 });
        }
        const agency = agencies[0];
        const { data: privileged } = consultant.user_id
          ? await supabaseAdmin.rpc("has_role", { _user_id: consultant.user_id, _role: "admin" })
          : { data: false };
        const { data: manager } = consultant.user_id
          ? await supabaseAdmin.rpc("has_role", { _user_id: consultant.user_id, _role: "manager" })
          : { data: false };
        if (!privileged && !manager && agency.consultant_id !== consultant.id) {
          return Response.json({ ok: false, error: "agency_not_authorized" }, { status: 403 });
        }
        if (input.status_changed && input.new_status === agency.negotiation_status) {
          return Response.json({ ok: false, error: "status_unchanged" }, { status: 400 });
        }

        const { error } = await supabaseAdmin.from("agency_activities").insert({
          agency_id: agency.id,
          agency_name: agency.name,
          activity_type: input.activity_type as AgencyActivityType,
          registered_by_user_id: consultant.user_id,
          registered_by_name: consultant.name,
          registered_by_email: consultant.email,
          summary: input.summary,
          interaction_result: input.interaction_result ?? null,
          next_steps: input.next_steps ?? null,
          next_step_date: input.next_step_date ?? null,
          status_changed: input.status_changed,
          previous_status: agency.negotiation_status,
          new_status: input.status_changed ? input.new_status ?? null : null,
          c_level_support_needed: input.c_level_support_needed,
          attachment_url: input.attachment_url ?? null,
          attachment_name: input.attachment_name ?? null,
          source: "google_forms",
        });
        if (error) {
          console.error("[google-forms.activities] insert failed", error.message);
          return Response.json({ ok: false, error: "save_failed" }, { status: 500 });
        }
        return Response.json({ ok: true });
      },
    },
  },
});