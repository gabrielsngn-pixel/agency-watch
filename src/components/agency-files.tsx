import { Download, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type AgencyFile = Database["public"]["Tables"]["agency_files"]["Row"];

const STATUS_LABEL: Record<AgencyFile["processing_status"], string> = {
  pending: "Aguardando processamento",
  processing: "Processando",
  processed: "Processado",
  failed: "Falha no processamento",
};

function formatSize(bytes: number | null) {
  if (bytes === null) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AgencyFilesList({ files }: { files: AgencyFile[] }) {
  const download = async (file: AgencyFile) => {
    const { data, error } = await supabase.storage.from("agency-files").createSignedUrl(file.file_url, 60, {
      download: file.file_name,
    });
    if (error || !data?.signedUrl) return toast.error("Não foi possível baixar esta base.");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  if (!files.length) {
    return <div className="py-8 text-center text-sm text-muted-foreground">Nenhuma base recebida para esta imobiliária.</div>;
  }

  return (
    <div className="divide-y divide-border">
      {files.map((file) => (
        <article key={file.id} className="py-4 first:pt-0 last:pb-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 gap-3">
              <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{file.file_name}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Base enviada em {new Date(file.uploaded_at).toLocaleString("pt-BR")}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Consultor: {file.uploaded_by_name || file.uploaded_by_email || "Não identificado"}
                  {formatSize(file.file_size) ? ` · ${formatSize(file.file_size)}` : ""}
                </div>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => download(file)}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> Download
            </Button>
          </div>
          <Badge variant="outline" className="mt-3 text-xs">{STATUS_LABEL[file.processing_status]}</Badge>
        </article>
      ))}
    </div>
  );
}