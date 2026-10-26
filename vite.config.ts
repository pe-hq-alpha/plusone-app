import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// In production Cloudflare serves /ingest (functions/ingest); locally Vite stands in for it.
const posthog = (region: "eu" | "us") => ({
  [`/ingest/${region}/static`]: {
    target: `https://${region}-assets.i.posthog.com`,
    changeOrigin: true,
    rewrite: (path: string) => path.replace(`/ingest/${region}`, ""),
  },
  [`/ingest/${region}`]: {
    target: `https://${region}.i.posthog.com`,
    changeOrigin: true,
    rewrite: (path: string) => path.replace(`/ingest/${region}`, ""),
  },
});

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, proxy: { ...posthog("eu"), ...posthog("us") } },
});
