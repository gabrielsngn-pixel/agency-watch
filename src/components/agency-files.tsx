import { useState } from "react";
import { Download, FileSpreadsheet, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type AgencyFile = Database["public"]["Tables"]["agency_files"]["Row"] & { category?: string | null };

export type FileCategory = "imported" | "processed" | "result";

const CATEGORY_LABEL: Record<FileCategory, string> = {
  imported: "Base importada",
  processed: "Base tratada",
  result: "Resultado da base",
};

const CATEGORY_DESCRIPTION: Record<FileCategory, string> = {
  imported: "Arquivo bruto enviado pela imobiliária.",
  processed: "Arquivo após higienização / tratamento.",
  result: "Planilha ou relatório final entregue à imobiliária.",
};

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

export function AgencyFilesList({
  files,
  agencyId,
  onUploaded,
}: {
  files: AgencyFile[];
  agencyId?: string;
  onUploaded?: () => void;
}) {
  const grouped: Record<FileCategory, AgencyFile[]> = {
    imported: [],
    processed: [],
    result: [],
  };
  for (const f of files) {
    const cat = ((f.category as FileCategory) ?? "imported") as FileCategory;
    (grouped[cat] ?? grouped.imported).push(f);
  }

  return (
    <Tabs defaultValue="imported">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="imported" className="text-xs">
          Importada ({grouped.imported.length})
        </TabsTrigger>
        <TabsTrigger value="processed" className="text-xs">
          Tratada ({grouped.processed.length})
        </TabsTrigger>
        <TabsTrigger value="result" className="text-xs">
          Resultado ({grouped.result.length})
        </TabsTrigger>
      </TabsList>
      {(["imported", "processed", "result"] as FileCategory[]).map((cat) => (
        <TabsContent key={cat} value={cat} className="mt-4 space-y-3">
          <p className="text-xs text-muted-foreground">{CATEGORY_DESCRIPTION[cat]}</p>
          {agencyId && <UploadBox agencyId={agencyId} category={cat} onUploaded={onUploaded} />}
          <CategoryFileList files={grouped[cat]} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function CategoryFileList({ files }: { files: AgencyFile[] }) {
  const download = async (file: AgencyFile) => {
    const { data, error } = await supabase.storage.from("agency-files").createSignedUrl(file.file_url, 60, {
      download: file.file_name,
    });
    if (error || !data?.signedUrl) return toast.error("Não foi possível baixar este arquivo.");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  if (!files.length) {
    return (
      <div className="py-6 text-center text-xs text-muted-foreground border border-dashed rounded-md">
        Nenhum arquivo nesta categoria.
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {files.map((file) => (
        <article key={file.id} className="py-3 first:pt-0 last:pb-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 gap-3">
              <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{file.file_name}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Enviado em {new Date(file.uploaded_at).toLocaleString("pt-BR")}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Por: {file.uploaded_by_name || file.uploaded_by_email || "Não identificado"}
                  {formatSize(file.file_size) ? ` · ${formatSize(file.file_size)}` : ""}
                </div>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => download(file)}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> Baixar
            </Button>
          </div>
          <Badge variant="outline" className="mt-3 text-xs">
            {STATUS_LABEL[file.processing_status]}
          </Badge>
        </article>
      ))}
    </div>
  );
}

function UploadBox({
  agencyId,
  category,
  onUploaded,
}: {
  agencyId: string;
  category: FileCategory;
  onUploaded?: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!file) return toast.error("Selecione um arquivo.");
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessão expirada.");
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${agencyId}/${category}/${crypto.randomUUID()}-${safeName}`;
      const { error: upErr } = await supabase.storage.from("agency-files").upload(path, file, {
        contentType: file.type || "application/octet-stream",
      });
      if (upErr) throw upErr;
      const name = String(user.user_metadata?.full_name ?? user.email ?? "Usuário");
      const { error: insErr } = await supabase.from("agency_files").insert({
        agency_id: agencyId,
        uploaded_by: user.id,
        uploaded_by_name: name,
        uploaded_by_email: user.email ?? null,
        file_name: file.name,
        file_url: path,
        file_type: file.type || null,
        file_size: file.size,
        processing_status: "pending",
        category,
      } as never);
      if (insErr) throw insErr;
      toast.success(`${CATEGORY_LABEL[category]} anexada.`);
      setFile(null);
      onUploaded?.();
    } catch (err: any) {
      toast.error(err?.message ?? "Não foi possível anexar o arquivo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-md border border-dashed border-primary/30 bg-primary/5 p-3 space-y-2">
      <div className="text-xs font-medium">Anexar {CATEGORY_LABEL[category].toLowerCase()}</div>
      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-xs"
          disabled={busy}
        />
        <Button size="sm" onClick={submit} disabled={!file || busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
          Enviar
        </Button>
      </div>
    </div>
  );
}
