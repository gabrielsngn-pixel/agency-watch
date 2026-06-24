import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatCard } from "@/components/stat-card";
import { ArrowRight } from "lucide-react";

export type DrilldownAgency = {
  id: string;
  name: string;
  hint?: string | null;
};

export function DrilldownStat({
  label,
  value,
  hint,
  icon,
  tone,
  items,
  dialogTitle,
  emptyMessage = "Nenhuma imobiliária neste indicador.",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tone?: "default" | "warning" | "destructive" | "success" | "info";
  items: DrilldownAgency[];
  dialogTitle?: string;
  emptyMessage?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-2xl"
        title="Clique para ver detalhes"
      >
        <StatCard label={label} value={value} hint={hint} icon={icon} tone={tone} />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialogTitle ?? label}</DialogTitle>
          </DialogHeader>
          {items.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">{emptyMessage}</div>
          ) : (
            <ul className="divide-y divide-border/60">
              {items.map((item) => (
                <li key={item.id}>
                  <Link
                    to="/portfolio/$agencyId"
                    params={{ agencyId: item.id }}
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-between gap-3 py-3 hover:bg-accent/30 rounded-md px-2 -mx-2"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{item.name}</div>
                      {item.hint && <div className="text-xs text-muted-foreground truncate">{item.hint}</div>}
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
