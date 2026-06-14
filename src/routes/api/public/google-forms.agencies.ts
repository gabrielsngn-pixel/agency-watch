import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

function secureEqual(received: string, expected: string) {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/google-forms/agencies")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const expectedSecret = process.env.GOOGLE_FORMS_WEBHOOK_SECRET;
        const receivedSecret = request.headers.get("x-webhook-secret") ?? "";
        if (!expectedSecret || !secureEqual(receivedSecret, expectedSecret)) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("real_estate_agencies")
          .select("id, name, city, state")
          .order("name", { ascending: true });
        if (error) return Response.json({ ok: false, error: "catalog_unavailable" }, { status: 500 });

        return Response.json({
          ok: true,
          agencies: (data ?? []).map((agency) => ({
            id: agency.id,
            name: agency.name,
            label: `${agency.name} — ${agency.city}${agency.state ? `/${agency.state}` : ""}`,
          })),
          synced_at: new Date().toISOString(),
        });
      },
    },
  },
});