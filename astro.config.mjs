import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import sentry from "@sentry/astro";
import tailwindcss from "@tailwindcss/vite";

const hasSentryBuildCredentials = Boolean(
  process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG,
);

const sentryBuildOptions = {
  sourcemaps: { disable: !hasSentryBuildCredentials },
  release: {
    create: hasSentryBuildCredentials,
    finalize: hasSentryBuildCredentials,
  },
  ...(hasSentryBuildCredentials
    ? {
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT || "javascript-astro",
        authToken: process.env.SENTRY_AUTH_TOKEN,
      }
    : {}),
};

export default defineConfig({
  integrations: [react(), sentry(sentryBuildOptions)],
  vite: {
    plugins: [tailwindcss()],
  },
});
