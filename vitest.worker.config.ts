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
          REVIEW_SIGNING_SECRET: "test-review-secret",
          LEAD_SIGNING_SECRET: "test-lead-secret",
          OPENROUTER_API_KEY: "test-openrouter-key",
          ONBOARDING_INVITE_SIGNING_SECRET: "test-onboarding-invite-secret",
          ONBOARDING_ORIGIN: "https://onboard.example.test",
          ONBOARDING_ADMIN_EMAILS: "admin@example.test",
          ONBOARDING_ACCESS_AUD: "launchloom-local-onboarding-admin",
          GOOGLE_PLACES_API_KEY: "test-google-places-key",
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
