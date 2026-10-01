export type SeoResearchReadiness =
  | { allowed: true; mode: "legacy" | "researched" | "context-only" }
  | {
      allowed: false;
      mode: "context-only" | "baseline";
      code: "seo_research_required";
      error: string;
    };
export function isAffirmativeConfirmation(value: unknown): boolean;
export function seoResearchReadiness(config: {
  seoResearch?: unknown;
  services?: unknown;
  locations?: unknown;
}): SeoResearchReadiness;
export function hasCompletedFallbackResearch(research: unknown): boolean;
