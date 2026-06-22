import { createFileRoute } from "@tanstack/react-router";

// Public read-only autocomplete for the /registro page.
// Returns only safe projections; uses supabaseAdmin server-side so we never
// expose service-role keys and don't need anon RLS policies.
export const Route = createFileRoute("/api/public/registro/lookup")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const type = url.searchParams.get("type") ?? "";
        const q = (url.searchParams.get("q") ?? "").trim();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        if (type === "agencies") {
          let query = supabaseAdmin
            .from("real_estate_agencies")
            .select("id, name, city, state, negotiation_status")
            .order("name", { ascending: true })
            .limit(20);
          if (q.length >= 2) query = query.ilike("name", `%${q}%`);
          const { data, error } = await query;
          if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
          return Response.json({ ok: true, items: data ?? [] }, {
            headers: { "cache-control": "no-store" },
          });
        }


        if (type === "stages") {
          const { data, error } = await supabaseAdmin
            .from("kanban_stages")
            .select("stage_key, label, position, color, is_visible")
            .order("position", { ascending: true });
          if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
          return Response.json({ ok: true, items: (data ?? []).filter((s) => s.is_visible) });
        }

        if (type === "consultant") {
          const email = (url.searchParams.get("email") ?? "").trim().toLowerCase();
          if (!email) return Response.json({ ok: false, error: "email_required" }, { status: 400 });
          const { data } = await supabaseAdmin
            .from("consultants")
            .select("id, name, email, active")
            .ilike("email", email)
            .maybeSingle();
          if (!data || !data.active) return Response.json({ ok: false, found: false });
          return Response.json({ ok: true, found: true, consultant: { id: data.id, name: data.name, email: data.email } });
        }

        return Response.json({ ok: false, error: "invalid_type" }, { status: 400 });
      },
    },
  },
});
