import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type KanbanStage = {
  id: string;
  stage_key: string;
  label: string;
  position: number;
  sla_days: number;
  color: string;
  is_visible: boolean;
  is_system: boolean;
};

export function useKanbanStages() {
  return useQuery({
    queryKey: ["kanban-stages"],
    queryFn: async (): Promise<KanbanStage[]> => {
      const { data, error } = await supabase
        .from("kanban_stages")
        .select("*")
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as KanbanStage[];
    },
    staleTime: 60_000,
  });
}

/** Dias decorridos desde uma data ISO. */
export function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/** Avalia SLA: { used, remaining, breached } */
export function evaluateSla(
  lastStageChangeAt: string | null | undefined,
  slaDays: number,
): { used: number; remaining: number; breached: boolean } {
  const used = daysSince(lastStageChangeAt) ?? 0;
  const remaining = slaDays - used;
  return { used, remaining, breached: remaining < 0 };
}
