declare module "cloudflare:workers" {
  interface ProvidedEnv extends Env {
    GITHUB_ORG_TOKEN: string;
    REVISION_COORDINATOR_SECRET: string;
    REVIEW_SIGNING_SECRET: string;
    LEAD_SIGNING_SECRET: string;
    OPENROUTER_API_KEY: string;
    ONBOARDING_INVITE_SIGNING_SECRET: string;
    ONBOARDING_ORIGIN: string;
    ONBOARDING_ADMIN_EMAILS: string;
    ONBOARDING_ACCESS_AUD: string;
    ONBOARDING_INVITES: DurableObjectNamespace;
    GENERATION_LEDGER: DurableObjectNamespace;
    GENERATION_TRACKING_SECRET: string;
    GOOGLE_PLACES_API_KEY: string;
  }
}
