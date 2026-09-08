declare module "cloudflare:workers" {
  interface ProvidedEnv extends Env {
    GITHUB_ORG_TOKEN: string;
    REVISION_COORDINATOR_SECRET: string;
  }
}
