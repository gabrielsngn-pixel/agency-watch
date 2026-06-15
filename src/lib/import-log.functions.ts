import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  agency_id: z.string().uuid(),
  agency_name: z.string().min(1).max(200),
  action: z.enum(["create", "update"]),
  file_name: z.string().max(255).optional(),
});

/**
 * Logs a synthetic "import" event in agency_change_log so the Movement tab
 * reflects rows that were created or refreshed via the spreadsheet importer,
 * even when the negotiation_status itself did not change.
 */
export const logImportEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => schema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    const { data: isManager } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "manager",
    });
    if (!isAdmin && !isManager) throw new Error("forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("agency_change_log").insert({
      agency_id: data.agency_id,
      agency_name: data.agency_name,
      field_name: "imported",
      old_value: null,
      new_value: data.action === "create" ? "criada via importação" : "atualizada via importação",
      change_source: "import",
      changed_by: userId,
      changed_by_name: data.file_name ?? null,
    });
    if (error) throw new Error("log_failed");
    return { ok: true };
  });
