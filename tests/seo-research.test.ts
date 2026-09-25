import { describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createDataForSeoClient,
  normaliseSeoIntake,
  researchSiteContext,
} from "../scripts/seo-research.mjs";

const intake = {
  businessName: "Harbor Plumbing",
  industry: "home-services",
  services: "Drain cleaning\nWater heater repair",
  primaryCity: "Tacoma, WA",
  serviceAreas: "Tacoma, WA",
  serviceRadius: "20",
  website: "https://harbor-plumbing.test",
  differentiators: "Clear communication",
};

function researchProvider(options: { searchVolumeCost?: number; serpFailure?: boolean } = {}) {
  type SearchVolumeResponse = { cost?: number; keywords: Array<{ keyword: string; searchVolume: number | null; cpc: number | null; competition: number | null }> };
  const googleSearchVolume = vi.fn(async ({ keywords }: { keywords: string[] }): Promise<SearchVolumeResponse> => ({
    cost: options.searchVolumeCost ?? 0.04,
    keywords: keywords.map((keyword) => ({
      keyword,
      searchVolume: keyword.includes("near me") ? 70 : 90,
      cpc: 4.1,
      competition: 0.7,
    })),
  }));
  const searchIntent = vi.fn(async ({ keywords }: { keywords: string[] }) => ({
    cost: 0.01,
    keywords: keywords.map((keyword) => ({ keyword, intent: keyword.includes("cost") ? "informational" : "commercial" })),
  }));
  const bulkKeywordDifficulty = vi.fn(async ({ keywords }: { keywords: string[] }) => ({
    cost: 0.01,
    keywords: keywords.map((keyword) => ({ keyword, difficulty: 41 })),
  }));
  const organicSerp = vi.fn(async ({ keyword }: { keyword: string }) => {
    if (options.serpFailure) throw new Error("SERP provider unavailable");
    return {
      cost: 0.01,
      query: keyword,
      results: [
        { position: 1, title: "Local service team", url: "https://one.test/drain-cleaning/", domain: "one.test" },
        { position: 2, title: "Service and repairs", url: "https://two.test/services/", domain: "two.test" },
        { position: 4, title: "Local Plumbing Help", url: "https://three.test/tacoma/", domain: "three.test" },
      ],
      questions: ["How much does drain cleaning cost?"],
    };
  });
  const relatedKeywords = vi.fn(async ({ keyword }: { keyword: string }) => ({
    cost: 0.01,
    keywords: [{ keyword: `${keyword} cost`, searchVolume: 20, cpc: 3.4, competition: 0.5, intent: "informational" }],
  }));
  const rankedKeywords = vi.fn(async () => ({
    cost: 0.01,
    keywords: [{ keyword: "harbor plumbing drain cleaning", position: 7, title: "Drain cleaning", url: "https://harbor-plumbing.test/drain-cleaning/", searchVolume: 30 }],
  }));
  return { googleSearchVolume, searchIntent, bulkKeywordDifficulty, organicSerp, relatedKeywords, rankedKeywords };
}

describe("SEO market map", () => {
  it("normalizes client-confirmed service and city facts without treating them as measured metrics", () => {
    expect(normaliseSeoIntake(intake)).toMatchObject({
      services: ["Drain cleaning", "Water heater repair"],
      primaryCity: "Tacoma, WA",
      serviceRadius: 20,
      metricLocation: "Tacoma,Washington,United States",
      labsLocation: "Tacoma,Washington,United States",
    });
  });

  it("preserves atomic service entries and applies the shared five-service limit", async () => {
    const confirmedServices = [
      "Heating, ventilation and AC",
      "Drain cleaning",
      "Water heater repair",
      "Pipe repair",
      "Sewer inspection",
      "Septic pumping",
    ];
    expect(normaliseSeoIntake({ confirmedServices }).services).toEqual(confirmedServices.slice(0, 5));

    const dossier = await researchSiteContext({ ...intake, confirmedServices });
    expect(dossier.marketSnapshot.confirmedServices).toEqual(confirmedServices.slice(0, 5));
    expect(dossier.seedQueries).toEqual(expect.arrayContaining([
      expect.stringContaining("Heating, ventilation and AC"),
      expect.stringContaining("Sewer inspection"),
    ]));
    expect(dossier.seedQueries.some((query: string) => query.includes("Septic pumping"))).toBe(false);
    expect(dossier.warnings.join(" ")).toContain("Only the first 5 client-confirmed services were researched");
  });

  it("runs without optional Markdown map and enrichment CLI arguments", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "launchloom-seo-cli-"));
    try {
      const source = path.join(directory, "intake.md");
      const output = path.join(directory, "research.json");
      await fs.writeFile(source, `\`\`\`json\n${JSON.stringify({
        ...intake,
        confirmedServices: ["Heating, ventilation and AC"],
      })}\n\`\`\``);
      const script = fileURLToPath(new URL("../scripts/seo-research.mjs", import.meta.url));
      const result = spawnSync(process.execPath, [script, "--source", source, "--out", output], {
        encoding: "utf8",
        env: {
          ...process.env,
          DATAFORSEO_LOGIN: "",
          DATAFORSEO_USERNAME: "",
          DATAFORSEO_PASSWORD: "",
        },
      });

      expect(result.status).toBe(0);
      expect(JSON.parse(await fs.readFile(output, "utf8")).marketSnapshot.confirmedServices)
        .toEqual(["Heating, ventilation and AC"]);
      await expect(fs.stat(process.execPath)).resolves.toBeTruthy();
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });

  it("keeps an explicit non-US country in local DataForSEO targeting", () => {
    expect(normaliseSeoIntake({ services: "Drain cleaning", primaryCity: "London, UK" })).toMatchObject({
      primaryCity: "London, UK",
      metricLocation: "London,United Kingdom",
      labsLocation: "London,United Kingdom",
    });
  });

  it("maps local Google Ads metrics, measured search intent, KD, SERP, related-keyword, and ranked-keyword fields", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status_code: 20000, tasks_error: 0, cost: 0.03,
        tasks: [{ status_code: 20000, result: [{
          keyword: "drain cleaning tacoma", search_volume: 90, cpc: 12.5, competition: 0.7,
        }] }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status_code: 20000, tasks_error: 0, cost: 0.01248,
        tasks: [{ status_code: 20000, result: [{ items: [{ keyword: "drain cleaning tacoma", keyword_intent: { label: "commercial", probability: 0.84 } }] }] }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status_code: 20000, tasks_error: 0, cost: 0.01,
        tasks: [{ status_code: 20000, result: [{ items: [{ keyword: "drain cleaning tacoma", keyword_difficulty: 41 }] }] }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status_code: 20000, tasks_error: 0, cost: 0.02,
        tasks: [{ status_code: 20000, result: [{ items: [
          { type: "organic", rank_group: 2, rank_absolute: 2, title: "Drain cleaning", url: "https://plumber.test/drains/", domain: "plumber.test" },
          { type: "people_also_ask", items: [{ title: "What does drain cleaning cost?" }] },
        ] }] }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status_code: 20000, tasks_error: 0, cost: 0.01,
        tasks: [{ status_code: 20000, result: [{ items: [{ keyword_data: {
          keyword: "drain cleaning cost tacoma", keyword_info: { search_volume: 20, cpc: 3.4, competition: 0.5 }, search_intent_info: { main_intent: "informational" },
        } }] }] }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status_code: 20000, tasks_error: 0, cost: 0.01,
        tasks: [{ status_code: 20000, result: [{ items: [{ keyword_data: {
          keyword: "harbor plumbing drain cleaning", keyword_info: { search_volume: 30 }, ranked_serp_element: { serp_item: { rank_group: 7, title: "Drain cleaning", url: "https://harbor.test/drain-cleaning/" } },
        } }] }] }],
      }), { status: 200 }));
    const client = createDataForSeoClient({ login: "test-login", password: "test-password", fetchImpl });

    await expect(client.googleSearchVolume({ keywords: ["drain cleaning tacoma"], locationName: "Tacoma,Washington,United States" })).resolves.toMatchObject({
      cost: 0.03,
      keywords: [{ keyword: "drain cleaning tacoma", searchVolume: 90, cpc: 12.5, competition: 0.7 }],
    });
    await expect(client.searchIntent({ keywords: ["drain cleaning tacoma"] })).resolves.toMatchObject({ keywords: [{ keyword: "drain cleaning tacoma", intent: "commercial" }] });
    await expect(client.bulkKeywordDifficulty({ keywords: ["drain cleaning tacoma"], locationName: "United States", languageCode: "en" })).resolves.toMatchObject({ keywords: [{ keyword: "drain cleaning tacoma", difficulty: 41 }] });
    await expect(client.organicSerp({ keyword: "drain cleaning tacoma", locationName: "Tacoma, Washington, United States", languageCode: "en" })).resolves.toMatchObject({
      results: [{ position: 2, title: "Drain cleaning", url: "https://plumber.test/drains/", domain: "plumber.test" }],
      questions: ["What does drain cleaning cost?"],
    });
    await expect(client.relatedKeywords({ keyword: "drain cleaning tacoma", locationName: "United States", languageCode: "en" })).resolves.toMatchObject({ keywords: [{ keyword: "drain cleaning cost tacoma", keyword_info: { search_volume: 20 }, search_intent_info: { main_intent: "informational" } }] });
    await expect(client.rankedKeywords({ target: "harbor.test", locationName: "United States", languageCode: "en" })).resolves.toMatchObject({ keywords: [{ keyword_data: { keyword: "harbor plumbing drain cleaning", ranked_serp_element: { serp_item: { rank_group: 7, url: "https://harbor.test/drain-cleaning/" } } } }] });
    expect(fetchImpl).toHaveBeenCalledTimes(6);
    expect(fetchImpl.mock.calls[0][0]).toBe("https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live");
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual([{
      keywords: ["drain cleaning tacoma"],
      location_name: "Tacoma,Washington,United States",
    }]);
  });

  it("builds a provenance-backed page map from only confirmed services and real provider evidence", async () => {
    const provider = researchProvider();
    const dossier = await researchSiteContext(intake, {
      dataForSeo: provider,
      maxTasks: 16,
      maxUsd: 0.25,
    });

    expect(dossier.mode).toBe("researched");
    expect(dossier.publishReady).toBe(true);
    expect(dossier.cost).toMatchObject({ tasks: 8, usd: 0.11, limitUsd: 0.25, overBudget: false });
    expect(provider.organicSerp).toHaveBeenCalledTimes(2);
    expect(provider.googleSearchVolume).toHaveBeenCalledWith(expect.objectContaining({
      keywords: expect.arrayContaining(["Drain cleaning near me", "Drain cleaning Tacoma, WA", "Drain cleaning quote", "emergency Drain cleaning Tacoma, WA"]),
    }));
    expect(dossier.validatedQueries.find((item) => item.keyword === "Drain cleaning Tacoma, WA")).toMatchObject({
      volume: 90, kd: 41, cpc: 4.1, competition: 0.7, intent: "commercial", provenance: "dataforseo",
    });
    expect(dossier.pageMap.map((page) => page.pageType)).toEqual(expect.arrayContaining(["home", "services-hub", "service", "about", "contact", "blog-index"]));
    expect(dossier.pageMap.filter((page) => page.pageType === "service").map((page) => page.service)).toEqual(["Drain cleaning", "Water heater repair"]);
    expect(dossier.pageMap.some((page) => page.service === "Roof repair")).toBe(false);
    expect(dossier.competitors).toEqual(expect.arrayContaining([
      expect.objectContaining({ domain: "one.test", results: expect.arrayContaining([expect.objectContaining({ position: 1, title: "Local service team", url: "https://one.test/drain-cleaning/" })]) }),
      expect.objectContaining({ domain: "two.test" }),
      expect.objectContaining({ domain: "three.test" }),
    ]));
    expect(dossier.pageMap.find((page) => page.service === "Drain cleaning")?.fanOutQuestions).toContain("How much does drain cleaning cost?");
    expect(dossier.pageMap.find((page) => page.pageType === "home")?.fanOutQuestions.length).toBeGreaterThanOrEqual(2);
    expect(dossier.fanOutQuestionGroups.map((group) => group.pageId)).toEqual(expect.arrayContaining(["home", "services-hub", "about", "contact"]));
    expect(dossier.questionEvidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ provenance: "dataforseo_people_also_ask" }),
      expect.objectContaining({ provenance: "reasoned_gap" }),
    ]));
    expect(dossier.quickWins[0]).toMatchObject({ keyword: "harbor plumbing drain cleaning", currentPosition: 7, url: "https://harbor-plumbing.test/drain-cleaning/" });
    expect(dossier.blogOpportunities.length).toBeGreaterThanOrEqual(3);
    expect(dossier.pageMap.filter((page) => page.pageType === "blog-opportunity").length).toBe(dossier.blogOpportunities.length);
    expect(dossier.pageMap.some((page) => page.pageType === "location")).toBe(false);
  });

  it("records missing metrics as null and keeps reasoned questions distinct from measured questions", async () => {
    const provider = researchProvider();
    provider.googleSearchVolume.mockResolvedValueOnce({ cost: 0.04, keywords: [{ keyword: "drain cleaning Tacoma, WA", searchVolume: null, cpc: null, competition: null }] });
    provider.searchIntent.mockResolvedValueOnce({ cost: 0.01, keywords: [] });
    provider.bulkKeywordDifficulty.mockResolvedValueOnce({ cost: 0.01, keywords: [] });
    const dossier = await researchSiteContext(intake, { dataForSeo: provider, maxTasks: 16, maxUsd: 0.25 });

    expect(dossier.validatedQueries.find((item) => item.keyword.toLowerCase() === "drain cleaning tacoma, wa")).toMatchObject({ volume: null, kd: null, cpc: null, competition: null, intent: null, provenance: "dataforseo_unavailable" });
    expect(dossier.warnings.join(" ")).toMatch(/metrics remain null/iu);
  });

  it("blocks publication when any confirmed service lacks a complete measured primary query", async () => {
    const provider = researchProvider();
    provider.googleSearchVolume.mockResolvedValueOnce({
      cost: 0.04,
      keywords: [{ keyword: "Drain cleaning Tacoma, WA", searchVolume: 90, cpc: 4.1, competition: 0.7 }],
    });
    const dossier = await researchSiteContext(intake, { dataForSeo: provider, maxTasks: 16, maxUsd: 0.25 });

    expect(dossier.completeness.serviceMetrics).toEqual([
      { service: "Drain cleaning", complete: true, primaryKeyword: "Drain cleaning Tacoma, WA" },
      { service: "Water heater repair", complete: false, primaryKeyword: null },
    ]);
    expect(dossier.publishReady).toBe(false);
    expect(dossier.warnings.join(" ")).toContain("lack a primary query with measured volume, CPC, competition, Keyword Difficulty, and intent");
  });

  it("degrades to context-only when a required measured research stage fails", async () => {
    const provider = researchProvider({ serpFailure: true });
    const dossier = await researchSiteContext(intake, { dataForSeo: provider, maxTasks: 16, maxUsd: 0.25 });

    expect(dossier.mode).toBe("context-only");
    expect(dossier.publishReady).toBe(false);
    expect(dossier.cost.tasks).toBeGreaterThan(0);
    expect(dossier.warnings.join(" ")).toContain("SERP provider unavailable");
  });

  it("stops starting paid tasks at the configured task ceiling", async () => {
    const provider = researchProvider();
    const dossier = await researchSiteContext(intake, { dataForSeo: provider, maxTasks: 2, maxUsd: 0.25 });

    expect(dossier.mode).toBe("context-only");
    expect(dossier.cost.tasks).toBe(2);
    expect(provider.organicSerp).not.toHaveBeenCalled();
    expect(dossier.warnings.join(" ")).toContain("task budget");
  });

  it("reports a provider-reported task overrun and starts no additional tasks", async () => {
    const provider = researchProvider({ searchVolumeCost: 0.30 });
    const dossier = await researchSiteContext(intake, { dataForSeo: provider, maxTasks: 16, maxUsd: 0.25 });

    expect(dossier.cost).toMatchObject({ tasks: 1, usd: 0.3, limitUsd: 0.25, overBudget: true });
    expect(dossier.mode).toBe("context-only");
    expect(provider.searchIntent).not.toHaveBeenCalled();
    expect(dossier.warnings.join(" ")).toContain("above the configured cost cap");
  });

  it("records cost as unavailable instead of inventing a zero and stops paid work", async () => {
    const provider = researchProvider();
    provider.googleSearchVolume.mockResolvedValueOnce({
      cost: undefined,
      keywords: [{ keyword: "Drain cleaning Tacoma, WA", searchVolume: 90, cpc: 4.1, competition: 0.7 }],
    });
    const dossier = await researchSiteContext(intake, { dataForSeo: provider, maxTasks: 16, maxUsd: 0.25 });

    expect(dossier.cost).toMatchObject({ tasks: 1, usd: 0, complete: false, unreportedTasks: 1, overBudget: false });
    expect(dossier.cost.stageCosts[0]).toMatchObject({ stage: "local_search_volume", usd: null, status: "cost_unavailable" });
    expect(dossier.validatedQueries.find((item) => item.keyword === "Drain cleaning Tacoma, WA")).toMatchObject({ volume: 90, provenance: "dataforseo_metric_partial" });
    expect(provider.searchIntent).not.toHaveBeenCalled();
    expect(dossier.publishReady).toBe(false);
    expect(dossier.warnings.join(" ")).toContain("without provider-reported spend");
  });

  it("degrades without DataForSEO and does not fabricate metrics, competitors, or locations", async () => {
    const dossier = await researchSiteContext(intake, { maxTasks: 16, maxUsd: 0.25 });
    expect(dossier.mode).toBe("context-only");
    expect(dossier.publishReady).toBe(false);
    expect(dossier.validatedQueries.every((item) => item.volume === null && item.kd === null && item.cpc === null && item.competition === null && item.intent === null)).toBe(true);
    expect(dossier.competitors).toEqual([]);
    expect(dossier.pageMap.some((page) => page.pageType === "location")).toBe(false);
    expect(dossier.fanOutQuestionGroups.map((group) => group.pageId)).toEqual(expect.arrayContaining(["home", "services-hub", "about", "contact"]));
    expect(dossier.fanOutQuestionGroups.flatMap((group) => group.questions).every((item) => item.provenance === "reasoned_gap")).toBe(true);
  });
});
