export type SeoResearchReadiness =
  | { allowed: true; mode: "legacy" | "researched" }
  | {
      allowed: false;
      mode: "context-only" | "baseline";
      code: "seo_research_required";
      error: string;
    };

export function isAffirmativeConfirmation(value: unknown): boolean {
  return value === true || value === "yes" || value === "on";
}

export function seoResearchReadiness(
  config: Record<string, unknown>,
): SeoResearchReadiness {
  const research = config.seoResearch;
  if (!research || typeof research !== "object")
    return { allowed: true, mode: "legacy" };
  const { mode, publishReady } = research as {
    mode?: unknown;
    publishReady?: unknown;
  };
  if (mode === "researched" && publishReady === true)
    return { allowed: true, mode };
  return {
    allowed: false,
    mode: mode === "context-only" ? "context-only" : "baseline",
    code: "seo_research_required",
    error:
      "SEO research is incomplete. The preview remains available, but production publishing is blocked until research succeeds.",
  };
}
