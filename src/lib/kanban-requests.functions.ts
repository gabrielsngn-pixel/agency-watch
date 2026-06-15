import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const reviewSchema = z.object({
  request_id: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
  notes: z.string().max(1000).optional(),
});

export const reviewKanbanRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => reviewSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin, error: roleError } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (roleError) throw new Error("role_check_failed");
    if (!isAdmin) throw new Error("forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: req, error: fetchError } = await supabaseAdmin
      .from("kanban_change_requests")
      .select("id, agency_id, requested_status, current_status, status")
      .eq("id", data.request_id)
      .maybeSingle();
    if (fetchError || !req) throw new Error("request_not_found");
    if (req.status !== "pending") throw new Error("already_reviewed");

    if (data.decision === "approved") {
      const { error: updateAgencyError } = await supabaseAdmin
        .from("real_estate_agencies")
        .update({
          negotiation_status: req.requested_status,
          updated_by: userId,
        })
        .eq("id", req.agency_id);
      if (updateAgencyError) throw new Error("agency_update_failed");
    }

    const { error: updateReqError } = await supabaseAdmin
      .from("kanban_change_requests")
      .update({
        status: data.decision,
        reviewed_by_user_id: userId,
        reviewed_at: new Date().toISOString(),
        review_notes: data.notes ?? null,
      })
      .eq("id", data.request_id);
    if (updateReqError) throw new Error("review_save_failed");

    return { ok: true };
  });
