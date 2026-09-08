import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          GITHUB_ORG_TOKEN: "test-github-token",
          REVISION_COORDINATOR_SECRET: "test-coordinator-secret",
        },
      },
    }),
  ],
  test: {
    include: ["worker/test/**/*.test.ts"],
    setupFiles: ["./worker/test/setup.ts"],
  },
});
