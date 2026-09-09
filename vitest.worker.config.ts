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
          LEAD_SIGNING_SECRET: "test-lead-secret",
          OPENROUTER_API_KEY: "test-openrouter-key",
          RESEND_API_KEY: "test-resend-key",
          LAUNCHLOOM_FROM_EMAIL: "LaunchLoom <info@example.com>",
          LAUNCHLOOM_FEEDBACK_EMAIL: "developer@example.com",
        },
      },
    }),
  ],
  test: {
    include: ["worker/test/**/*.test.ts"],
    setupFiles: ["./worker/test/setup.ts"],
  },
});
