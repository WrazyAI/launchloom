import fallback from "../fixtures/seo-research/fallback-complete.json";
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
        serviceMetrics: [
          {
            service: "Consultation",
            complete: true,
            primaryKeyword: "consultation Testville",
          },
        ],
      },
      competitors: [
        { domain: "one.test" },
        { domain: "two.test" },
        { domain: "three.test" },
      ],
      cost: {
        usd: 0.1,
        limitUsd: 0.25,
        overBudget: false,
        complete: true,
        unreportedTasks: 0,
      },
      pageMap: ["home", "services-hub", "service", "about", "contact"].map(
        (pageType) => ({
          pageType,
          service: pageType === "service" ? "Consultation" : undefined,
          primaryKeyword:
            pageType === "service"
              ? {
                  keyword: "consultation Testville",
                  volume: 90,
                  kd: 41,
                  cpc: 4.1,
                  competition: 0.7,
                  intent: "commercial",
                  provenance: "dataforseo",
                  metricSources: {
                    volume: "dataforseo_google_ads_location",
                    kd: "dataforseo_labs_bulk_keyword_difficulty",
                    cpc: "dataforseo_google_ads_location",
                    competition: "dataforseo_google_ads_location",
                    intent: "dataforseo_labs_search_intent",
                  },
                }
              : undefined,
        }),
      ),
    };
    const config = {
      services: [{ name: "Consultation" }],
      seoResearch: v2Research,
    };
    expect(seoResearchReadiness(config)).toEqual({
      allowed: true,
      mode: "researched",
    });
    expect(
      seoResearchReadiness({
        ...config,
        seoResearch: {
          ...v2Research,
          completeness: { ...v2Research.completeness, serviceMetrics: [] },
        },
      }).allowed,
    ).toBe(false);
    expect(
      seoResearchReadiness({
        ...config,
        seoResearch: {
          ...v2Research,
          cost: { ...v2Research.cost, overBudget: true },
        },
      }).allowed,
    ).toBe(false);
    expect(
      seoResearchReadiness({
        ...config,
        seoResearch: {
          ...v2Research,
          cost: { ...v2Research.cost, complete: false, unreportedTasks: 1 },
        },
      }).allowed,
    ).toBe(false);
  });

  it("allows completed cited fallback research with its own mode", () => {
    expect(seoResearchReadiness({ seoResearch: fallback })).toEqual({
      allowed: true,
      mode: "context-only",
    });
  });

  it.each(["partial", "failed", "empty", "pending", "unavailable"])(
    "blocks %s fallback research",
    (status) => {
      expect(
        seoResearchReadiness({
          seoResearch: {
            ...fallback,
            publishReady: true,
            fallbackSearch: { ...fallback.fallbackSearch, status },
          },
        }).allowed,
      ).toBe(false);
    },
  );

  it("does not trust a complete label without cited evidence and bounded reported cost", () => {
    for (const change of [
      { externalSearchEvidence: [] },
      {
        externalSearchEvidence: [
          {
            ...fallback.externalSearchEvidence[0],
            sourceUrl: "javascript:alert(1)",
          },
        ],
      },
      {
        externalSearchEvidence: [
          { ...fallback.externalSearchEvidence[0], provenance: "reasoned_gap" },
        ],
      },
      ...[
        { costComplete: false },
        { costUsd: 1 },
        { costUsd: null },
        { budgetExhausted: true },
        { failedQueries: 1 },
        { queriesAttempted: 0 },
      ].map((change) => ({
        fallbackSearch: { ...fallback.fallbackSearch, ...change },
      })),
    ])
      expect(
        seoResearchReadiness({
          seoResearch: { ...fallback, publishReady: true, ...change },
        }).allowed,
      ).toBe(false);
  });

  it("accepts only explicit confirmation values", () => {
    expect(isAffirmativeConfirmation(true)).toBe(true);
    expect(isAffirmativeConfirmation("yes")).toBe(true);
    expect(isAffirmativeConfirmation("on")).toBe(true);
    expect(isAffirmativeConfirmation("false")).toBe(false);
    expect(isAffirmativeConfirmation(false)).toBe(false);
  });
});


it("requires completed research for every confirmed city even when the primary fallback is ready", () => {
  const cityResearch = (city: string) => ({ ...fallback, marketSnapshot: { primaryCity: city } });
  const areas = ["Cookeville, TN", "Algood, TN"];
  const research = { ...fallback, publishReady: true, coverageAreas: areas, coverageResearch: {
    version: 1, areas, complete: true,
    cities: areas.map(city => ({ city, status: "complete", research: cityResearch(city) })),
  } };
  expect(seoResearchReadiness({ seoResearch: research }).allowed).toBe(true);
  for (const coverageResearch of [
    { ...research.coverageResearch, complete: false },
    { ...research.coverageResearch, cities: research.coverageResearch.cities.slice(0, 1) },
    { ...research.coverageResearch, cities: [research.coverageResearch.cities[0], { city: areas[1], status: "pending", research: null }] },
    { ...research.coverageResearch, cities: [research.coverageResearch.cities[0], { city: areas[1], status: "complete", research: { ...cityResearch(areas[1]), fallbackSearch: { ...fallback.fallbackSearch, status: "failed" } } }] },
  ]) expect(seoResearchReadiness({ seoResearch: { ...research, coverageResearch } }).allowed).toBe(false);
});


it("blocks a confirmed multi-city dossier whose per-city evidence was stripped", () => {
  expect(seoResearchReadiness({seoResearch:{...fallback,publishReady:true,coverageAreas:["Cookeville, TN","Algood, TN"],coverageConfirmation:{status:"confirmed",selectedCount:1}}}).allowed).toBe(false);
});
