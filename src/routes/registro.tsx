import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

const NEW_URL = "https://pixel-watch-guardian.lovable.app/registro";

export const Route = createFileRoute("/registro")({
  head: () => ({
    meta: [
      { title: "Redirecionando…" },
      { name: "robots", content: "noindex" },
      { httpEquiv: "refresh", content: `0; url=${NEW_URL}` },
    ],
    links: [{ rel: "canonical", href: NEW_URL }],
  }),
  component: RegistroRedirect,
});

function RegistroRedirect() {
  useEffect(() => {
    window.location.replace(NEW_URL);
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-xl font-semibold">Este formulário mudou de endereço</h1>
        <p className="text-sm text-muted-foreground">
          Redirecionando você para o novo formulário de registro…
        </p>
        <a
          href={NEW_URL}
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Ir agora
        </a>
      </div>
    </div>
  );
}
