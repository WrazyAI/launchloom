export type SeoResearchReadiness =
  | { allowed: true; mode: "legacy" | "researched" | "context-only" }
  | {
      allowed: false;
      mode: "context-only" | "baseline";
      code:
        | "seo_research_required"
        | "pipeline_test_only"
        | "business_facts_required"
        | "route_approval_required"
        | "page_content_required";
      error: string;
    };
export function isAffirmativeConfirmation(value: unknown): boolean;
export function seoResearchReadiness(config: {
  pipelineTest?: unknown;
  business?: Record<string, unknown>;
  factReadiness?: unknown;
  pageContent?: unknown;
  pageEvidence?: unknown;
  pageBriefs?: unknown;
  routePolicy?: unknown;
  routeInventory?: unknown;
  seoResearch?: unknown;
  services?: unknown;
  locations?: unknown;
}): SeoResearchReadiness;
export function hasCompletedFallbackResearch(research: unknown): boolean;
export function hasPipelineTest(config: unknown): boolean;
