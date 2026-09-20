import { defineConfig } from "astro/config";
import react from "@astrojs/react";

export default defineConfig({
  site: process.env.PUBLIC_SITE_URL || "https://example.pages.dev",
  integrations: [react()],
  vite: {
    resolve: {
      alias: {
        "@launchloom/runtime": new URL(
          "./src/lib/creative-runtime.tsx",
          import.meta.url,
        ).pathname,
      },
    },
  },
});
