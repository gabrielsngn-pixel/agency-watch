// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";
import path from "path";

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
const env = loadEnv(process.env.NODE_ENV || "development", path.resolve(process.cwd(), "."), "");

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    define: {
      "import.meta.env.LOVABLE_API_KEY": JSON.stringify(env.LOVABLE_API_KEY),
      "import.meta.env.SUPABASE_SERVICE_ROLE_KEY": JSON.stringify(env.SUPABASE_SERVICE_ROLE_KEY),
    },
    resolve: {
      alias: {
        "entities/lib/decode.js": path.resolve("./node_modules/entities/lib/decode.js"),
        "entities/lib/encode.js": path.resolve("./node_modules/entities/lib/encode.js"),
        entities: path.resolve("./node_modules/entities"),
      },
    },
    optimizeDeps: {
      include: ["@dnd-kit/core", "@dnd-kit/sortable", "recharts", "xlsx"],
    },
  },
});
