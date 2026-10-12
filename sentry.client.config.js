import * as Sentry from "@sentry/astro";

Sentry.init({
  dsn: import.meta.env.PUBLIC_SENTRY_DSN || undefined,

  integrations: [Sentry.browserTracingIntegration()],

  // Adjust this value in production or use tracesSampler for finer control.
  tracesSampleRate: 1.0,

  environment:
    import.meta.env.PUBLIC_SENTRY_ENVIRONMENT || import.meta.env.MODE,
  release: import.meta.env.PUBLIC_SENTRY_RELEASE || undefined,
});
