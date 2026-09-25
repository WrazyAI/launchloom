import { describe, expect, it } from "vitest";
import {
  isAffirmativeConfirmation,
  seoResearchReadiness,
} from "../worker/src/seo-readiness";

describe("SEO publication readiness", () => {
  it("allows researched and legacy sites but blocks degraded new previews", () => {
    expect(seoResearchReadiness({}).allowed).toBe(true);
    expect(
      seoResearchReadiness({
        seoResearch: { mode: "researched", publishReady: true },
      }),
    ).toEqual({ allowed: true, mode: "researched" });
    expect(
      seoResearchReadiness({
        seoResearch: { mode: "researched", publishReady: false },
      }).allowed,
    ).toBe(false);
    expect(
      seoResearchReadiness({ seoResearch: { mode: "context-only" } }),
    ).toMatchObject({
      allowed: false,
      mode: "context-only",
      code: "seo_research_required",
    });
  });

  it("validates the version two evidence map instead of trusting its ready flag", () => {
    const v2Research = {
      version: 2,
      mode: "researched",
      publishReady: true,
      completeness: {
        keywordOverview: true,
        searchIntent: true,
        keywordDifficulty: true,
        serviceSerps: 1,
        serviceSerpsRequired: 1,
        serviceMetrics: [{ service: "Consultation", complete: true, primaryKeyword: "consultation Testville" }],
      },
      competitors: [{ domain: "one.test" }, { domain: "two.test" }, { domain: "three.test" }],
      cost: { usd: 0.1, limitUsd: 0.25, overBudget: false, complete: true, unreportedTasks: 0 },
      pageMap: ["home", "services-hub", "service", "about", "contact"].map((pageType) => ({
        pageType,
        service: pageType === "service" ? "Consultation" : undefined,
        primaryKeyword: pageType === "service" ? {
          keyword: "consultation Testville", volume: 90, kd: 41, cpc: 4.1, competition: 0.7,
          intent: "commercial", provenance: "dataforseo",
          metricSources: { volume: "dataforseo_google_ads_location", kd: "dataforseo_labs_bulk_keyword_difficulty", cpc: "dataforseo_google_ads_location", competition: "dataforseo_google_ads_location", intent: "dataforseo_labs_search_intent" },
        } : undefined,
      })),
    };
    const config = { services: [{ name: "Consultation" }], seoResearch: v2Research };
    expect(seoResearchReadiness(config)).toEqual({ allowed: true, mode: "researched" });
    expect(seoResearchReadiness({ ...config, seoResearch: { ...v2Research, completeness: { ...v2Research.completeness, serviceMetrics: [] } } }).allowed).toBe(false);
    expect(seoResearchReadiness({ ...config, seoResearch: { ...v2Research, cost: { ...v2Research.cost, overBudget: true } } }).allowed).toBe(false);
    expect(seoResearchReadiness({ ...config, seoResearch: { ...v2Research, cost: { ...v2Research.cost, complete: false, unreportedTasks: 1 } } }).allowed).toBe(false);
  });

  it("accepts only explicit confirmation values", () => {
    expect(isAffirmativeConfirmation(true)).toBe(true);
    expect(isAffirmativeConfirmation("yes")).toBe(true);
    expect(isAffirmativeConfirmation("on")).toBe(true);
    expect(isAffirmativeConfirmation("false")).toBe(false);
    expect(isAffirmativeConfirmation(false)).toBe(false);
  });
});
