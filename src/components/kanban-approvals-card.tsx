import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Check, X, ArrowRight, ShieldAlert } from "lucide-react";
import { reviewKanbanRequest } from "@/lib/kanban-requests.functions";
import { toast } from "sonner";

export function KanbanApprovalsCard() {
  const queryClient = useQueryClient();
  const reviewFn = useServerFn(reviewKanbanRequest);
  const [notesById, setNotesById] = useState<Record<string, string>>({});

  const { data: isAdmin = false } = useQuery({
    queryKey: ["is-admin"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;
      const { data } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
      return Boolean(data);
    },
  });

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["kanban-change-requests", "pending"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kanban_change_requests")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30_000,
  });

  const mutation = useMutation({
    mutationFn: async (vars: { request_id: string; decision: "approved" | "rejected"; notes?: string }) =>
      reviewFn({ data: vars }),
    onSuccess: (_, vars) => {
      toast.success(vars.decision === "approved" ? "Mudança aprovada" : "Mudança rejeitada");
      queryClient.invalidateQueries({ queryKey: ["kanban-change-requests"] });
      queryClient.invalidateQueries({ queryKey: ["agencies-all"] });
      queryClient.invalidateQueries({ queryKey: ["activities-all"] });
    },
    onError: (error: Error) => toast.error(`Falha ao revisar: ${error.message}`),
  });

  const count = requests.length;
  const headerNote = useMemo(() => {
    if (isLoading) return "Carregando…";
    if (!count) return "Nenhuma solicitação pendente.";
    return `${count} mudança${count === 1 ? "" : "s"} aguardando aprovação`;
  }, [count, isLoading]);

  if (!count && !isLoading) return null;

  return (
    <Card className="border-warning/40">
      <CardHeader className="pb-3">
        <CardTitle className="font-display flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-warning" />
          Aprovações de Kanban
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">{headerNote}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {requests.map((req: any) => {
          const notes = notesById[req.id] ?? "";
          return (
            <div key={req.id} className="rounded-lg border border-border/60 bg-background/40 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-medium">{req.agency_name}</div>
                  <div className="text-xs text-muted-foreground">
                    Solicitado por {req.requested_by_name ?? req.requested_by_email ?? "—"} ·{" "}
                    {new Date(req.created_at).toLocaleString("pt-BR")}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Badge variant="outline">{req.current_status}</Badge>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <Badge className="bg-primary/20 text-primary border-primary/30">{req.requested_status}</Badge>
                </div>
              </div>
              {isAdmin ? (
                <>
                  <Textarea
                    placeholder="Notas (opcional)"
                    value={notes}
                    onChange={(e) => setNotesById((m) => ({ ...m, [req.id]: e.target.value }))}
                    rows={2}
                    className="text-xs"
                  />
                  <div className="flex gap-2 justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={mutation.isPending}
                      onClick={() => mutation.mutate({ request_id: req.id, decision: "rejected", notes: notes || undefined })}
                    >
                      <X className="h-3.5 w-3.5 mr-1" /> Reprovar
                    </Button>
                    <Button
                      size="sm"
                      disabled={mutation.isPending}
                      onClick={() => mutation.mutate({ request_id: req.id, decision: "approved", notes: notes || undefined })}
                    >
                      <Check className="h-3.5 w-3.5 mr-1" /> Aprovar
                    </Button>
                  </div>
                </>
              ) : (
                <div className="text-xs text-muted-foreground italic">Apenas administradores podem aprovar.</div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
