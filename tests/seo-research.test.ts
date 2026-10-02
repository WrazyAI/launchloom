import { describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createDataForSeoClient,
  createOpenRouterWebSearchClient,
  normaliseSeoIntake,
  renderSeoMapMarkdown,
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
  const googleSearchVolume = vi.fn(async ({ keywords }: { keywords: string[]; locationName?: string }): Promise<SearchVolumeResponse> => ({
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
      labsLocation: "United States",
    });
  });

  it("preserves an explicit niche separately from a broad industry label", () => {
    expect(normaliseSeoIntake({
      businessKind: "veterinary",
      industry: "wellness",
      services: ["Preventive wellness visits"],
    })).toMatchObject({
      businessKind: "veterinary",
      industry: "wellness",
    });
    expect(normaliseSeoIntake({ industry: "veterinary" }).businessKind).toBe("veterinary");
    expect(normaliseSeoIntake({ industry: "wellness" }).businessKind).toBe("");
  });

  it("uses the first semicolon-delimited city for SEO and preserves all submitted areas", async () => {
    const legacyIntake = {
      intakeVersion: "1",
      businessName: "Rivet and Road Mobile Auto Repair",
      industry: "auto-repair",
      services: "Brake repair",
      serviceAreas: "Portland, OR; Beaverton, OR; Gresham, OR",
      coverageAreas: ["Portland, OR", "Tigard, OR"],
      serviceRadius: "30",
    };

    expect(normaliseSeoIntake(legacyIntake)).toMatchObject({
      primaryCity: "Portland, OR",
      coverageAreas: [
        "Portland, OR",
        "Beaverton, OR",
        "Gresham, OR",
        "Tigard, OR",
      ],
    });

    const dossier = await researchSiteContext(legacyIntake);
    expect(dossier.seedQueries).toContain("Brake repair Portland OR");
    expect(dossier.marketSnapshot.primaryCity).toBe("Portland, OR");
    expect(dossier.marketSnapshot.coverageAreas).toEqual([
      "Portland, OR",
      "Beaverton, OR",
      "Gresham, OR",
      "Tigard, OR",
    ]);
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

  it("preserves comma-containing scalar service names across research normalization", () => {
    expect(normaliseSeoIntake({
      intakeVersion: "2",
      services: "Heating, ventilation and AC",
      primaryCity: "Tacoma, WA",
    }).services).toEqual(["Heating, ventilation and AC"]);
  });

  it("splits comma-delimited legacy scalar services without changing V2 arrays", () => {
    expect(normaliseSeoIntake({
      intakeVersion: "1",
      services: "Drain cleaning, Water heater repair",
      primaryCity: "Tacoma, WA",
    }).services).toEqual(["Drain cleaning", "Water heater repair"]);
    expect(normaliseSeoIntake({
      intakeVersion: "2",
      confirmedServices: ["Heating, ventilation and AC"],
      primaryCity: "Tacoma, WA",
    }).services).toEqual(["Heating, ventilation and AC"]);
  });

  it("matches provider metrics when DataForSEO normalizes punctuation in keyword keys", async () => {
    const provider = researchProvider();
    const normalizedKeyword = (keyword: string) => keyword.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    provider.googleSearchVolume.mockImplementation(async ({ keywords }) => ({
      cost: 0.04,
      keywords: keywords.map((keyword) => ({ keyword: normalizedKeyword(keyword), searchVolume: 90, cpc: 4.1, competition: 0.7 })),
    }));
    provider.searchIntent.mockImplementation(async ({ keywords }) => ({
      cost: 0.01,
      keywords: keywords.map((keyword) => ({ keyword: normalizedKeyword(keyword), intent: "commercial" })),
    }));
    provider.bulkKeywordDifficulty.mockImplementation(async ({ keywords }) => ({
      cost: 0.01,
      keywords: keywords.map((keyword) => ({ keyword: normalizedKeyword(keyword), difficulty: 41 })),
    }));

    const dossier = await researchSiteContext({
      confirmedServices: ["Heating, ventilation and AC"],
      primaryCity: "Tacoma, WA",
      industry: "home-services",
    }, { dataForSeo: provider, maxTasks: 32, maxUsd: 2 });
    const primary = dossier.pageMap.find((page) => page.pageType === "service")?.primaryKeyword;

    expect(dossier.completeness.serviceMetrics).toEqual([
      { service: "Heating, ventilation and AC", complete: true, primaryKeyword: expect.any(String) },
    ]);
    expect(primary).toMatchObject({ volume: 90, kd: 41, cpc: 4.1, competition: 0.7, intent: "commercial" });
  });

  it("marks fallback search not-needed after successful measured research", async () => {
    const webSearch = { search: vi.fn() };
    const dossier = await researchSiteContext(intake, {
      dataForSeo: researchProvider(),
      webSearch,
      maxTasks: 32,
      maxUsd: 2,
    });

    expect(webSearch.search).not.toHaveBeenCalled();
    expect(dossier.fallbackSearch.status).toBe("not-needed");
    expect(renderSeoMapMarkdown(dossier)).toContain(
      "Fallback web search: not needed (no provider stage failed).",
    );
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
          OPENROUTER_API_KEY: "",
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
      labsLocation: "United Kingdom",
    });
    expect(normaliseSeoIntake({ services: "Drain cleaning", primaryCity: "Tacoma, Washington, US" }).labsLocation)
      .toBe("United States");
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
      keywords: expect.arrayContaining(["Drain cleaning near me", "Drain cleaning Tacoma WA", "Drain cleaning quote", "emergency Drain cleaning Tacoma WA"]),
    }));
    expect(dossier.validatedQueries.find((item) => item.keyword === "Drain cleaning Tacoma WA")).toMatchObject({
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

    expect(dossier.validatedQueries.find((item) => item.keyword.toLowerCase() === "drain cleaning tacoma wa")).toMatchObject({ volume: null, kd: null, cpc: null, competition: null, intent: null, provenance: "dataforseo_unavailable" });
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
      { service: "Drain cleaning", complete: true, primaryKeyword: "Drain cleaning Tacoma WA" },
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
    expect(dossier.validatedQueries.find((item) => item.keyword === "Drain cleaning Tacoma WA")).toMatchObject({ volume: 90, provenance: "dataforseo_metric_partial" });
    expect(provider.searchIntent).not.toHaveBeenCalled();
    expect(dossier.publishReady).toBe(false);
    expect(dossier.warnings.join(" ")).toContain("without provider-reported spend");
  });

  it("collects bounded cited web evidence without DataForSEO and permits developer approval", async () => {
    const webSearch = {
      search: vi.fn(async ({ query }: { query: string }) => ({
        results: [
          {
            url: "https://example.test/service",
            title: `Observed result for ${query}`,
            snippet: "Extracted search evidence from the public page.",
          },
        ],
        costUsd: 0.002,
      })),
    };
    const dossier = await researchSiteContext(intake, {
      webSearch,
      maxTasks: 16,
      maxUsd: 0.25,
      maxFallbackSearchQueries: 2,
      maxFallbackUsd: 0.05,
    });

    expect(webSearch.search).toHaveBeenCalledTimes(2);
    expect(dossier.mode).toBe("context-only");
    expect(dossier.publishReady).toBe(true);
    expect(dossier.fallbackSearch).toMatchObject({
      status: "complete",
      queriesAttempted: 2,
      maxQueries: 2,
      maxResultsPerQuery: 4,
      provider: "OpenRouter web search (Parallel)",
      costUsd: 0.004,
      maxUsd: 0.05,
      costComplete: true,
      budgetExhausted: false,
    });
    expect(dossier.externalSearchEvidence).toHaveLength(2);
    expect(dossier.externalSearchEvidence[0]).toMatchObject({
      query: expect.any(String),
      sourceUrl: "https://example.test/service",
      title: expect.stringContaining("Observed result"),
      snippet: "Extracted search evidence from the public page.",
      retrievedAt: expect.any(String),
      provider: "OpenRouter web search (Parallel)",
      provenance: "external_search_observation",
    });
    expect(dossier.validatedQueries.every((item) => item.volume === null && item.kd === null && item.cpc === null && item.competition === null && item.intent === null)).toBe(true);
    expect(dossier.competitors).toEqual([]);
    expect(dossier.pageMap.some((page) => page.pageType === "location")).toBe(false);
    expect(dossier.warnings.join(" ")).toContain("external observations only");
  });

  it("qualifies fallback service searches with an explicit niche, not a broad industry guess", async () => {
    const webSearch = {
      search: vi.fn(async ({ query }: { query: string }) => ({
        results: [{
          url: "https://example.test/service",
          title: `Observed result for ${query}`,
          snippet: "Observed public search evidence.",
        }],
        costUsd: 0.001,
      })),
    };
    const veterinaryIntake = {
      industry: "veterinary",
      businessName: "Fieldnotes Veterinary Studio",
      services: [
        "Preventive wellness visits",
        "Vaccination appointments",
        "Diagnostic consultations",
      ],
      primaryCity: "Madison, WI",
    };

    const veterinary = await researchSiteContext(veterinaryIntake, {
      webSearch,
      maxFallbackSearchQueries: 3,
      maxFallbackUsd: 0.05,
    });

    expect(webSearch.search.mock.calls.map(([request]) => request.query)).toEqual([
      "veterinary preventive wellness visits Madison, WI",
      "veterinary vaccination appointments Madison, WI",
      "veterinary diagnostic consultations Madison, WI",
    ]);
    expect(veterinary.mode).toBe("context-only");
    expect(veterinary.publishReady).toBe(true);
    expect(veterinary.marketSnapshot.businessKind).toBe("veterinary");
    expect(veterinary.validatedQueries.every((item) =>
      item.volume === null && item.kd === null && item.cpc === null &&
      item.competition === null && item.intent === null,
    )).toBe(true);

    const generalSearch = {
      search: vi.fn(async ({ query }: { query: string }) => ({
        results: [{ url: "https://example.test/general", title: query, snippet: "Observed." }],
        costUsd: 0.001,
      })),
    };
    await researchSiteContext({
      ...veterinaryIntake,
      industry: "wellness",
    }, {
      webSearch: generalSearch,
      maxFallbackSearchQueries: 1,
      maxFallbackUsd: 0.05,
    });
    expect(generalSearch.search.mock.calls[0]?.[0].query).toBe(
      "Preventive wellness visits Madison, WI",
    );
    expect(generalSearch.search.mock.calls[0]?.[0].query).not.toContain("veterinary");
  });

  it("uses bounded web evidence after DataForSEO fails without treating it as measured SEO", async () => {
    const provider = researchProvider();
    provider.googleSearchVolume.mockRejectedValueOnce(
      new Error("DataForSEO returned HTTP 402"),
    );
    const webSearch = {
      search: vi.fn(async ({ query }: { query: string }) => ({
        results: [{
          url: "https://example.test/auto-repair",
          title: `Observed result for ${query}`,
          snippet: "A directly observed page about the requested service.",
        }],
        costUsd: 0.002,
      })),
    };

    const dossier = await researchSiteContext(intake, {
      dataForSeo: provider,
      webSearch,
      maxFallbackSearchQueries: 2,
      maxFallbackUsd: 0.05,
    });

    expect(webSearch.search).toHaveBeenCalledTimes(2);
    expect(dossier.mode).toBe("context-only");
    expect(dossier.publishReady).toBe(true);
    expect(dossier.cost.stageCosts[0]).toMatchObject({
      stage: "local_search_volume",
      status: "failed",
    });
    expect(dossier.fallbackSearch).toMatchObject({
      status: "complete",
      queriesAttempted: 2,
      costUsd: 0.004,
      maxUsd: 0.05,
    });
    expect(dossier.externalSearchEvidence).toHaveLength(2);
    expect(dossier.validatedQueries.every((item) =>
      item.volume === null && item.kd === null && item.cpc === null &&
      item.competition === null && item.intent === null,
    )).toBe(true);
    expect(dossier.warnings.join(" ")).toContain("DataForSEO returned HTTP 402");
    expect(dossier.warnings.join(" ")).toContain("external observations only");
  });

  it("keeps an explicit degraded context-only result when no online search provider is configured", async () => {
    const dossier = await researchSiteContext(intake, { maxTasks: 16, maxUsd: 0.25 });
    expect(dossier.mode).toBe("context-only");
    expect(dossier.publishReady).toBe(false);
    expect(dossier.fallbackSearch.status).toBe("unavailable");
    expect(dossier.externalSearchEvidence).toEqual([]);
    expect(dossier.warnings.join(" ")).toContain("No supported online-search fallback is configured");
    expect(dossier.validatedQueries.every((item) => item.volume === null && item.kd === null && item.cpc === null && item.competition === null && item.intent === null)).toBe(true);
    expect(dossier.competitors).toEqual([]);
    expect(dossier.pageMap.some((page) => page.pageType === "location")).toBe(false);
    expect(dossier.fanOutQuestionGroups.map((group) => group.pageId)).toEqual(expect.arrayContaining(["home", "services-hub", "about", "contact"]));
    expect(dossier.fanOutQuestionGroups.flatMap((group) => group.questions).every((item) => item.provenance === "reasoned_gap")).toBe(true);
  });

  it("extracts only OpenRouter url citations and ignores model-authored search claims", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      choices: [{
        message: {
          content: "Fabricated claim: Harbor Plumbing ranks #1 and gets 900 searches.",
          annotations: [
            {
              type: "url_citation",
              url_citation: {
                url: "https://source.example/plumbing",
                title: "Plumbing source",
                content: "A directly extracted snippet from the source page.",
              },
            },
          ],
        },
      }],
      usage: { cost: 0.003 },
    }), { status: 200 }));
    const search = createOpenRouterWebSearchClient({
      apiKey: "test-key",
      fetchImpl,
      model: "test/model",
    });
    const observed = await search.search({ query: "drain cleaning Tacoma", maxResults: 4 });

    expect(observed.costUsd).toBe(0.003);
    expect(observed.results).toEqual([{
      url: "https://source.example/plumbing",
      title: "Plumbing source",
      snippet: "A directly extracted snippet from the source page.",
    }]);
    expect(JSON.stringify(observed)).not.toContain("ranks #1");
    expect(JSON.stringify(observed)).not.toContain("900 searches");
    const request = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body));
    expect(request.tools).toEqual([{
      type: "openrouter:web_search",
      parameters: {
        engine: "parallel",
        max_results: 4,
        max_total_results: 4,
        max_characters: 1200,
      },
    }]);
    expect(request.max_tool_calls).toBe(1);
    expect(request.tool_choice).toBe("required");
    expect(request.messages[0].content).toContain(
      "Include a direct citation for each observation",
    );
    expect(request.messages[0].content).toContain(
      "Do not claim keyword volume, rankings, difficulty, or CPC",
    );
    expect(request.messages[0].content).not.toContain(
      "only a terse acknowledgement",
    );
    expect(request.max_tokens).toBeGreaterThanOrEqual(256);
  });

  it("stops fallback research when the provider-reported spend bound is reached", async () => {
    const webSearch = {
      search: vi.fn(async () => ({
        results: [{
          url: "https://example.test/budget",
          title: "Budgeted result",
          snippet: "Observed evidence.",
        }],
        costUsd: 0.006,
      })),
    };
    const dossier = await researchSiteContext(intake, {
      webSearch,
      maxFallbackSearchQueries: 3,
      maxFallbackUsd: 0.005,
    });

    expect(webSearch.search).toHaveBeenCalledTimes(1);
    expect(dossier.fallbackSearch).toMatchObject({
      status: "partial",
      queriesAttempted: 1,
      costUsd: 0.006,
      maxUsd: 0.005,
      costComplete: true,
      budgetExhausted: true,
    });
    expect(dossier.publishReady).toBe(false);
    expect(dossier.warnings.join(" ")).toContain("configured USD 0.005 spend bound");
  });

  it("stops after one fallback query when provider spend is unreported", async () => {
    const webSearch = {
      search: vi.fn(async () => ({
        results: [{
          url: "https://example.test/unreported",
          title: "Unreported-cost result",
          snippet: "Observed evidence.",
        }],
      })),
    };
    const dossier = await researchSiteContext(intake, {
      webSearch,
      maxFallbackSearchQueries: 3,
      maxFallbackUsd: 0.05,
    });

    expect(webSearch.search).toHaveBeenCalledTimes(1);
    expect(dossier.fallbackSearch).toMatchObject({
      status: "partial",
      queriesAttempted: 1,
      costComplete: false,
      budgetExhausted: false,
    });
    expect(dossier.warnings.join(" ")).toContain(
      "did not report request cost",
    );
    expect(dossier.publishReady).toBe(false);
  });

  it("degrades honestly and stops after an unknown-cost fallback failure", async () => {
    const search = vi.fn(async () => {
      throw new Error("search unavailable");
    });
    const dossier = await researchSiteContext(intake, {
      webSearch: { search },
      maxFallbackSearchQueries: 3,
    });
    expect(search).toHaveBeenCalledTimes(1);
    expect(dossier.mode).toBe("context-only");
    expect(dossier.publishReady).toBe(false);
    expect(dossier.fallbackSearch).toMatchObject({
      status: "failed",
      queriesAttempted: 1,
      failedQueries: 1,
      costComplete: false,
    });
    expect(dossier.externalSearchEvidence).toEqual([]);
    expect(dossier.warnings.join(" ")).toContain("search unavailable");
    expect(dossier.warnings.join(" ")).toContain(
      "provider spend for the failed request is unknown",
    );
    expect(dossier.warnings.join(" ")).toContain(
      "returned no usable cited evidence",
    );
  });
});

it("maps real Google Ads competition indexes without inventing values from categorical labels", async () => {
  const client = createDataForSeoClient({
    login: "fixture",
    password: "fixture",
    fetchImpl: vi.fn(async () => Response.json({
      status_code: 20000,
      tasks_error: 0,
      cost: 0.09,
      tasks: [{
        status_code: 20000,
        result: [
          { keyword: "dental checkups", search_volume: 170, cpc: 4.8, competition: "LOW", competition_index: 14 },
          { keyword: "zero competition", search_volume: 10, cpc: 1, competition: "LOW", competition_index: 0 },
          { keyword: "missing index", search_volume: 10, cpc: null, competition: "LOW", competition_index: null },
        ],
      }],
    })),
  });
  const result = await client.googleSearchVolume({
    keywords: ["dental checkups", "zero competition", "missing index"],
    locationName: "Austin,Texas,United States",
  });
  expect(result.keywords.map(item => item.competition)).toEqual([0.14, 0, null]);
});


it("researches only explicitly confirmed cities with city-specific metrics and a shared budget", async () => {
  const provider = researchProvider();
  const confirmed = { ...intake, website: "", primaryCity: "Cookeville, TN", serviceAreas: "Cookeville, TN; Baxter, TN", coverageAreas: ["Cookeville, TN", "Algood, TN"], serviceRadius: "10", coverageConfirmation: { status: "confirmed", primaryCity: "Cookeville, TN", radiusSelection: "10", selectedCount: 1 } };
  const dossier = await researchSiteContext(confirmed, { dataForSeo: provider, maxTasks: 32, maxUsd: 2 });
  expect(dossier.coverageAreas).toEqual(["Cookeville, TN", "Algood, TN"]);
  expect(provider.googleSearchVolume.mock.calls.map(([args]) => args.locationName)).toEqual(["Cookeville,Tennessee,United States", "Algood,Tennessee,United States"]);
  expect(dossier.coverageResearch!.cities.map(item => item.city)).toEqual(confirmed.coverageAreas);
  expect(dossier.coverageResearch!.complete).toBe(true);
  expect(dossier.cost.tasks).toBeLessThanOrEqual(32);
  expect(JSON.stringify(dossier)).not.toContain("Baxter");
});

it("keeps every confirmed city planned and blocks readiness when the shared budget cannot research them", async () => {
  const provider = researchProvider();
  const areas = ["Tacoma, WA", ...Array.from({length: 24}, (_, i) => `Town ${i}, WA`)];
  const dossier = await researchSiteContext({ ...intake, website: "", coverageAreas: areas, coverageConfirmation: { status: "confirmed", primaryCity: "Tacoma, WA", radiusSelection: "20", selectedCount: 24 } }, { dataForSeo: provider, maxTasks: 1, maxUsd: 0.25 });
  expect(dossier.coverageAreas).toEqual(areas);
  expect(dossier.coverageResearch!.cities).toHaveLength(25);
  expect(dossier.coverageResearch!.complete).toBe(false);
  expect(dossier.publishReady).toBe(false);
  expect(provider.googleSearchVolume).toHaveBeenCalledTimes(1);
  expect(dossier.cost.tasks).toBe(1);
});


it("shares fallback query and USD caps across confirmed cities instead of multiplying them", async () => {
  const search = vi.fn(async ({ query }: {query: string}) => ({costUsd: 0.002, results:[{url:"https://evidence.test/local", title:query, snippet:"Cited local service observation"}]}));
  const dossier = await researchSiteContext({ ...intake, website:"", coverageAreas:["Tacoma, WA","Lakewood, WA","Puyallup, WA"], coverageConfirmation:{status:"confirmed",primaryCity:"Tacoma, WA",radiusSelection:"20",selectedCount:2} }, {webSearch:{search},maxFallbackSearchQueries:3,maxFallbackUsd:0.05});
  expect(search).toHaveBeenCalledTimes(3);
  expect(dossier.coverageResearch!.fallbackQueries).toBe(3);
  expect(dossier.coverageResearch!.fallbackCostUsd).toBe(0.006);
  expect(dossier.coverageResearch!.cities.slice(1).map(item=>item.status)).toEqual(["pending","pending"]);
  expect(dossier.publishReady).toBe(false);
});

it("stops further measured city calls when the primary provider task has unreported spend", async () => {
  const provider = researchProvider();
  provider.googleSearchVolume.mockImplementation(async ({keywords})=>({keywords:keywords.map(keyword=>({keyword,searchVolume:20,cpc:1,competition:0.2}))}));
  const dossier = await researchSiteContext({...intake,website:"",coverageAreas:["Tacoma, WA","Lakewood, WA"],coverageConfirmation:{status:"confirmed",primaryCity:"Tacoma, WA",radiusSelection:"20",selectedCount:1}}, {dataForSeo:provider,maxUsd:2,maxTasks:32});
  expect(provider.googleSearchVolume).toHaveBeenCalledTimes(1);
  expect(provider.organicSerp).not.toHaveBeenCalled();
  expect(dossier.cost.complete).toBe(false);
  expect(dossier.coverageResearch!.cities[1].status).toBe("pending");
});
