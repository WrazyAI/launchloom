declare module "cloudflare:workers" {
  interface ProvidedEnv extends Env {
    GITHUB_ORG_TOKEN: string;
    REVISION_COORDINATOR_SECRET: string;
    REVIEW_SIGNING_SECRET: string;
    LEAD_SIGNING_SECRET: string;
    OPENROUTER_API_KEY: string;
  }
}
