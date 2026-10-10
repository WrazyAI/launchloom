import { compileCanonicalSiteBrief } from "../scripts/compile-canonical-site-brief.mjs";
import { normalise } from "../scripts/generate-site-config.mjs";
import { seoResearchReadiness } from "../templates/client-site/src/lib/seo-readiness.mjs";
import { describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createDataForSeoClient,
  createOpenRouterIntentQueryPlanner,
  createOpenRouterWebSearchClient,
  normaliseSeoIntake,
  renderSeoMapMarkdown,
  researchSiteContext,
} from "../scripts/seo-research.mjs";
import { validateIntentQueryPlan } from "../scripts/seo-intent-planner.mjs";

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

function dataForSeoLocationsResponse(locations: Array<Record<string, unknown>>) {
  return Response.json({
    status_code: 20000,
    tasks_error: 0,
    tasks: [{ status_code: 20000, result: locations }],
  });
}

const commonUsGoogleAdsLocations = [
  {
    location_code: 1010001,
    location_name: "Seattle,Washington,United States",
    country_iso_code: "US",
    location_type: "City",
  },
  {
    location_code: 1010002,
    location_name: "Tacoma,Washington,United States",
    country_iso_code: "US",
    location_type: "City",
  },
  {
    location_code: 1010003,
    location_name: "Austin,Texas,United States",
    country_iso_code: "US",
    location_type: "City",
  },
];

function researchProvider(
  options: { searchVolumeCost?: number; serpFailure?: boolean } = {},
) {
  type SearchVolumeResponse = {
    cost?: number;
    keywords: Array<{
      keyword: string;
      searchVolume: number | null;
      cpc: number | null;
      competition: number | null;
    }>;
  };
  const googleSearchVolume = vi.fn(
    async ({
      keywords,
    }: {
      keywords: string[];
      locationName?: string;
    }): Promise<SearchVolumeResponse> => ({
      cost: options.searchVolumeCost ?? 0.04,
      keywords: keywords.map((keyword) => ({
        keyword,
        searchVolume: keyword.includes("near me") ? 70 : 90,
        cpc: 4.1,
        competition: 0.7,
      })),
    }),
  );
  const searchIntent = vi.fn(async ({ keywords }: { keywords: string[] }) => ({
    cost: 0.01,
    keywords: keywords.map((keyword) => ({
      keyword,
      intent: keyword.includes("cost") ? "informational" : "commercial",
    })),
  }));
  const bulkKeywordDifficulty = vi.fn(
    async ({ keywords }: { keywords: string[] }) => ({
      cost: 0.01,
      keywords: keywords.map((keyword) => ({ keyword, difficulty: 41 })),
    }),
  );
  const organicSerp = vi.fn(async ({ keyword }: { keyword: string }) => {
    if (options.serpFailure) throw new Error("SERP provider unavailable");
    return {
      cost: 0.01,
      query: keyword,
      results: [
        {
          position: 1,
          title: "Local service team",
          url: "https://one.test/drain-cleaning/",
          domain: "one.test",
        },
        {
          position: 2,
          title: "Service and repairs",
          url: "https://two.test/services/",
          domain: "two.test",
        },
        {
          position: 4,
          title: "Local Plumbing Help",
          url: "https://three.test/tacoma/",
          domain: "three.test",
        },
      ],
      questions: ["How much does drain cleaning cost?"],
    };
  });
  const relatedKeywords = vi.fn(async ({ keyword }: { keyword: string }) => ({
    cost: 0.01,
    keywords: [
      {
        keyword: `${keyword} cost`,
        searchVolume: 20,
        cpc: 3.4,
        competition: 0.5,
        intent: "informational",
      },
    ],
  }));
  const rankedKeywords = vi.fn(async () => ({
    cost: 0.01,
    keywords: [
      {
        keyword: "harbor plumbing drain cleaning",
        position: 7,
        title: "Drain cleaning",
        url: "https://harbor-plumbing.test/drain-cleaning/",
        searchVolume: 30,
      },
    ],
  }));
  return {
    googleSearchVolume,
    searchIntent,
    bulkKeywordDifficulty,
    organicSerp,
    relatedKeywords,
    rankedKeywords,
  };
}

describe("SEO market map", () => {
  it("accepts up to three service-bound model phrases and ignores excess suggestions", () => {
    const plan = validateIntentQueryPlan(
      {
        services: [
          {
            service: "Pre-order pastry boxes",
            phrases: [
              "pastry box order",
              "pastry gift box",
              "order a box of pastries",
              "fresh pastry box",
            ],
          },
        ],
      },
      ["Pre-order pastry boxes"],
    );

    expect(plan.services[0].phrases).toEqual([
      "pastry box order",
      "pastry gift box",
      "order a box of pastries",
    ]);
    expect(plan.acceptedPhraseCount).toBe(3);
    expect(plan.complete).toBe(true);
  });

  it("retains an explicit research language through every relevant provider request", async () => {
    const provider = researchProvider();
    const dossier = await researchSiteContext(
      { ...intake, researchLanguageCode: "es" },
      { dataForSeo: provider, maxUsd: 0.5 },
    );
    expect(dossier.languageCode).toBe("es");
    for (const request of [
      provider.googleSearchVolume,
      provider.bulkKeywordDifficulty,
      provider.organicSerp,
      provider.relatedKeywords,
      provider.rankedKeywords,
    ])
      for (const [payload] of request.mock.calls)
        expect(payload).toMatchObject({ languageCode: "es" });
  });

  it("does not append the primary city to a service query that already contains it", async () => {
    const provider = researchProvider();
    await researchSiteContext(
      { ...intake, services: "Drain cleaning Tacoma WA", website: "" },
      { dataForSeo: provider },
    );
    expect(provider.organicSerp.mock.calls[0][0].keyword).toBe(
      "Drain cleaning Tacoma WA",
    );
  });

  it("keeps empty successful measured responses incomplete", async () => {
    const empty = async () => ({ cost: 0, keywords: [], results: [] });
    const dossier = await researchSiteContext(intake, {
      dataForSeo: {
        googleSearchVolume: empty,
        searchIntent: empty,
        bulkKeywordDifficulty: empty,
        organicSerp: empty,
        relatedKeywords: empty,
        rankedKeywords: empty,
      },
    });
    expect(dossier.mode).toBe("context-only");
    expect(dossier.publishReady).toBe(false);
  });
  it("normalizes client-confirmed service and city facts without treating them as measured metrics", () => {
    expect(normaliseSeoIntake(intake)).toMatchObject({
      services: ["Drain cleaning", "Water heater repair"],
      primaryCity: "Tacoma, WA",
      serviceRadius: 20,
      metricLocation: "Tacoma,Washington,United States",
      labsLocation: "United States",
    });
  });

  it("qualifies a full US state name with the United States for metric targeting", () => {
    expect(
      normaliseSeoIntake({
        services: "Skin-care consultation",
        primaryCity: "Madison, Wisconsin",
      }),
    ).toMatchObject({
      metricLocation: "Madison,Wisconsin,United States",
      labsLocation: "United States",
    });
  });

  it("infers local, cost, and booking query families from minimal confirmed intake", async () => {
    const provider = researchProvider();
    const dossier = await researchSiteContext(
      {
        businessKind: "auto repair",
        confirmedServices: ["Brake repair"],
        primaryCity: "Portland, OR",
      },
      { dataForSeo: provider, maxTasks: 16, maxUsd: 0.5 },
    );
    const planned =
      provider.googleSearchVolume.mock.calls[0]?.[0].keywords || [];
    const servicePage = dossier.pageMap.find(
      (page) => page.pageType === "service",
    );

    expect(planned).toEqual(
      expect.arrayContaining([
        "Brake repair",
        "Brake repair near me",
        "Brake repair Portland OR",
        "Brake repair cost",
        "Brake repair quote",
      ]),
    );
    expect(provider.searchIntent.mock.calls[0]?.[0].keywords).toEqual(planned);
    expect(servicePage?.primaryKeyword).toMatchObject({
      keyword: "Brake repair Portland OR",
      intent: "commercial",
      provenance: "dataforseo",
    });
    expect(dossier.publishReady).toBe(true);
  });

  it("uses service-bound customer-language phrases and never prefixes a broad business kind", async () => {
    const provider = researchProvider();
    const intentPlanner = vi.fn(
      async ({ services }: { services: string[] }) => ({
        plan: {
          services: [
            {
              service: services[0],
              phrases: [
                "sourdough bread",
                "order sourdough bread",
                "naturally leavened bread",
              ],
            },
          ],
        },
        usage: {
          model: "z-ai/glm-5.3-flash",
          costUsd: 0.002,
          promptTokens: 120,
          completionTokens: 42,
          cachedTokens: 24,
        },
      }),
    );
    const dossier = await researchSiteContext(
      {
        businessName: "Juniper & Loaf Bakehouse",
        businessKind: "restaurant",
        confirmedServices: ["Naturally leavened breads"],
        primaryCity: "Seattle, WA",
        email: "private@example.test",
        phone: "+1 555 0100",
        address: "private address",
      },
      { dataForSeo: provider, intentPlanner, maxTasks: 16, maxUsd: 0.5 },
    );
    const planned =
      provider.googleSearchVolume.mock.calls[0]?.[0].keywords || [];

    expect(intentPlanner).toHaveBeenCalledTimes(1);
    expect(intentPlanner.mock.calls[0]?.[0]).toMatchObject({
      businessName: "Juniper & Loaf Bakehouse",
      businessKind: "restaurant",
      services: ["Naturally leavened breads"],
    });
    expect(intentPlanner.mock.calls[0]?.[0]).not.toHaveProperty("email");
    expect(intentPlanner.mock.calls[0]?.[0]).not.toHaveProperty("phone");
    expect(intentPlanner.mock.calls[0]?.[0]).not.toHaveProperty("address");
    expect(planned).toEqual(
      expect.arrayContaining([
        "sourdough bread",
        "sourdough bread near me",
        "sourdough bread Seattle WA",
        "order sourdough bread",
        "naturally leavened bread",
      ]),
    );
    expect(planned).toHaveLength(6);
    expect(planned.every((keyword) => !keyword.includes(","))).toBe(true);
    expect(provider.googleSearchVolume.mock.calls[0]?.[0]).toMatchObject({
      locationName: "Seattle,Washington,United States",
    });
    expect(
      planned.some((keyword) =>
        keyword.toLowerCase().startsWith("restaurant "),
      ),
    ).toBe(false);
    expect(dossier.validatedQueries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          keyword: "sourdough bread Seattle WA",
          confirmedService: "Naturally leavened breads",
          volume: 90,
          provenance: "dataforseo",
        }),
      ]),
    );
    expect(
      dossier.pageMap.find((page) => page.pageType === "service")
        ?.primaryKeyword?.keyword,
    ).toMatch(/sourdough bread Seattle WA/iu);
    expect(provider.organicSerp.mock.calls[0]?.[0].keyword).toBe(
      "sourdough bread Seattle WA",
    );
    expect(provider.relatedKeywords.mock.calls[0]?.[0].keyword).toBe(
      "sourdough bread Seattle WA",
    );
    expect(dossier.intentPlanning).toMatchObject({
      status: "model",
      model: "z-ai/glm-5.3-flash",
      acceptedPhraseCount: 3,
      usage: {
        costUsd: 0.002,
        promptTokens: 120,
        completionTokens: 42,
        cachedTokens: 24,
      },
    });
    expect(renderSeoMapMarkdown(dossier)).toContain(
      "Customer-language query planning: model; 1/1 confirmed services have accepted model phrases",
    );
  });

  it("sends only bounded non-contact intake to the cacheable OpenRouter intent planner", async () => {
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    services: [
                      {
                        service: "Brake repair",
                        phrases: ["brake shop", "brake repair"],
                      },
                    ],
                  }),
                },
              },
            ],
            usage: {
              cost: 0.001,
              prompt_tokens: 100,
              completion_tokens: 30,
              prompt_tokens_details: { cached_tokens: 20 },
            },
          }),
          { status: 200, headers: { "x-openrouter-cache-status": "MISS" } },
        ),
    );
    const planner = createOpenRouterIntentQueryPlanner({
      apiKey: "test-openrouter-key",
      fetchImpl,
    });
    const result = await planner({
      businessName: "Rivet and Road Auto Repair",
      businessKind: "auto repair",
      industry: "auto-repair",
      services: ["Brake repair"],
      languageCode: "en",
      email: "private@example.test",
      phone: "+1 555 0100",
      address: "private address",
    } as any);
    const request = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body));
    const messages = JSON.stringify(body.messages);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(request.headers).toMatchObject({ "X-OpenRouter-Cache": "true" });
    expect(body).toMatchObject({
      model: "z-ai/glm-5.3-flash",
      response_format: { type: "json_object" },
      temperature: 0,
      usage: { include: true },
    });
    expect(messages).toContain("Rivet and Road Auto Repair");
    expect(messages).toContain("Brake repair");
    expect(messages).not.toContain("private@example.test");
    expect(messages).not.toContain("555 0100");
    expect(messages).not.toContain("private address");
    expect(result).toMatchObject({
      plan: {
        services: [
          { service: "Brake repair", phrases: ["brake shop", "brake repair"] },
        ],
      },
      usage: {
        costUsd: 0.001,
        promptTokens: 100,
        completionTokens: 30,
        cachedTokens: 20,
        cacheStatus: "MISS",
      },
    });
  });

  it("bounds reasoning for query planning and records cost when output is exhausted", async () => {
    const provider = researchProvider();
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            model: "z-ai/glm-5.3-flash",
            choices: [
              {
                finish_reason: "length",
                message: {
                  role: "assistant",
                  content: null,
                  reasoning: "PRIVATE_REASONING_MUST_NOT_BE_RECORDED",
                },
              },
            ],
            usage: {
              cost: 0.0002283,
              prompt_tokens: 242,
              completion_tokens: 384,
              prompt_tokens_details: { cached_tokens: 0 },
              completion_tokens_details: { reasoning_tokens: 406 },
            },
          }),
          { status: 200, headers: { "x-openrouter-cache-status": "MISS" } },
        ),
    );
    const intentPlanner = createOpenRouterIntentQueryPlanner({
      apiKey: "test-openrouter-key",
      fetchImpl,
    });
    const dossier = await researchSiteContext(
      {
        businessName: "Rivet and Road Auto Repair",
        businessKind: "auto repair",
        confirmedServices: ["Brake repair"],
        primaryCity: "Portland, OR",
      },
      { dataForSeo: provider, intentPlanner, maxTasks: 16, maxUsd: 0.5 },
    );
    const request = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));

    expect(request).toMatchObject({
      max_tokens: 768,
      reasoning: { max_tokens: 96, exclude: true },
    });
    expect(dossier.intentPlanning.status).toBe("deterministic-fallback");
    expect(dossier.intentPlanning.usage).toMatchObject({
      costUsd: 0.0002283,
      promptTokens: 242,
      completionTokens: 384,
      cacheStatus: "MISS",
    });
    expect(dossier.intentPlanning.warning).toContain("finish_reason=length");
    expect(dossier.intentPlanning.warning).not.toContain(
      "PRIVATE_REASONING_MUST_NOT_BE_RECORDED",
    );
  });

  it("does not invent a city when minimal intake has no confirmed primary location", async () => {
    const provider = researchProvider();
    const dossier = await researchSiteContext(
      {
        businessKind: "auto repair",
        confirmedServices: ["Brake repair"],
      },
      { dataForSeo: provider, maxTasks: 16, maxUsd: 0.5 },
    );
    const planned =
      provider.googleSearchVolume.mock.calls[0]?.[0].keywords || [];

    expect(planned).toContain("Brake repair near me");
    expect(
      planned.every(
        (query) => !query.includes("Portland") && !query.includes("Tacoma"),
      ),
    ).toBe(true);
    expect(dossier.marketSnapshot.primaryCity).toBe("");
    expect(dossier.publishReady).toBe(false);
    expect(dossier.warnings.join(" ")).toContain("No confirmed primary city");
  });

  it("does not start paid research until at least one service is confirmed", async () => {
    const provider = researchProvider();
    const dossier = await researchSiteContext(
      {
        businessKind: "auto repair",
        primaryCity: "Portland, OR",
      },
      { dataForSeo: provider },
    );

    expect(provider.googleSearchVolume).not.toHaveBeenCalled();
    expect(dossier.mode).toBe("baseline");
    expect(dossier.publishReady).toBe(false);
    expect(dossier.warnings.join(" ")).toContain(
      "at least one client-confirmed service",
    );
  });

  it("preserves an explicit niche separately from a broad industry label", () => {
    expect(
      normaliseSeoIntake({
        businessKind: "veterinary",
        industry: "wellness",
        services: ["Preventive wellness visits"],
      }),
    ).toMatchObject({
      businessKind: "veterinary",
      industry: "wellness",
    });
    expect(normaliseSeoIntake({ industry: "veterinary" }).businessKind).toBe(
      "veterinary",
    );
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
    expect(normaliseSeoIntake({ confirmedServices }).services).toEqual(
      confirmedServices.slice(0, 5),
    );

    const dossier = await researchSiteContext({ ...intake, confirmedServices });
    expect(dossier.marketSnapshot.confirmedServices).toEqual(
      confirmedServices.slice(0, 5),
    );
    expect(dossier.seedQueries).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Heating, ventilation and AC"),
        expect.stringContaining("Sewer inspection"),
      ]),
    );
    expect(
      dossier.seedQueries.some((query: string) =>
        query.includes("Septic pumping"),
      ),
    ).toBe(false);
    expect(dossier.warnings.join(" ")).toContain(
      "Only the first 5 client-confirmed services were researched",
    );
  });

  it("preserves comma-containing scalar service names across research normalization", () => {
    expect(
      normaliseSeoIntake({
        intakeVersion: "2",
        services: "Heating, ventilation and AC",
        primaryCity: "Tacoma, WA",
      }).services,
    ).toEqual(["Heating, ventilation and AC"]);
  });

  it("splits comma-delimited legacy scalar services without changing V2 arrays", () => {
    expect(
      normaliseSeoIntake({
        intakeVersion: "1",
        services: "Drain cleaning, Water heater repair",
        primaryCity: "Tacoma, WA",
      }).services,
    ).toEqual(["Drain cleaning", "Water heater repair"]);
    expect(
      normaliseSeoIntake({
        intakeVersion: "2",
        confirmedServices: ["Heating, ventilation and AC"],
        primaryCity: "Tacoma, WA",
      }).services,
    ).toEqual(["Heating, ventilation and AC"]);
  });

  it("matches provider metrics when DataForSEO normalizes punctuation in keyword keys", async () => {
    const provider = researchProvider();
    const normalizedKeyword = (keyword: string) =>
      keyword
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim();
    provider.googleSearchVolume.mockImplementation(async ({ keywords }) => ({
      cost: 0.04,
      keywords: keywords.map((keyword) => ({
        keyword: normalizedKeyword(keyword),
        searchVolume: 90,
        cpc: 4.1,
        competition: 0.7,
      })),
    }));
    provider.searchIntent.mockImplementation(async ({ keywords }) => ({
      cost: 0.01,
      keywords: keywords.map((keyword) => ({
        keyword: normalizedKeyword(keyword),
        intent: "commercial",
      })),
    }));
    provider.bulkKeywordDifficulty.mockImplementation(async ({ keywords }) => ({
      cost: 0.01,
      keywords: keywords.map((keyword) => ({
        keyword: normalizedKeyword(keyword),
        difficulty: 41,
      })),
    }));

    const dossier = await researchSiteContext(
      {
        confirmedServices: ["Heating, ventilation and AC"],
        primaryCity: "Tacoma, WA",
        industry: "home-services",
      },
      { dataForSeo: provider, maxTasks: 32, maxUsd: 2 },
    );
    const primary = dossier.pageMap.find(
      (page) => page.pageType === "service",
    )?.primaryKeyword;

    expect(dossier.completeness.serviceMetrics).toEqual([
      {
        service: "Heating, ventilation and AC",
        complete: true,
        primaryKeyword: expect.any(String),
      },
    ]);
    expect(primary).toMatchObject({
      volume: 90,
      kd: 41,
      cpc: 4.1,
      competition: 0.7,
      intent: "commercial",
    });
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
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-seo-cli-"),
    );
    try {
      const source = path.join(directory, "intake.md");
      const output = path.join(directory, "research.json");
      await fs.writeFile(
        source,
        `\`\`\`json\n${JSON.stringify({
          ...intake,
          confirmedServices: ["Heating, ventilation and AC"],
        })}\n\`\`\``,
      );
      const script = fileURLToPath(
        new URL("../scripts/seo-research.mjs", import.meta.url),
      );
      const result = spawnSync(
        process.execPath,
        [script, "--source", source, "--out", output],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            DATAFORSEO_LOGIN: "",
            DATAFORSEO_USERNAME: "",
            DATAFORSEO_PASSWORD: "",
            OPENROUTER_API_KEY: "",
          },
        },
      );

      expect(result.status).toBe(0);
      expect(
        JSON.parse(await fs.readFile(output, "utf8")).marketSnapshot
          .confirmedServices,
      ).toEqual(["Heating, ventilation and AC"]);
      await expect(fs.stat(process.execPath)).resolves.toBeTruthy();
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });

  it("keeps an explicit non-US country in local DataForSEO targeting", () => {
    expect(
      normaliseSeoIntake({
        services: "Drain cleaning",
        primaryCity: "London, UK",
      }),
    ).toMatchObject({
      primaryCity: "London, UK",
      metricLocation: "London,United Kingdom",
      labsLocation: "United Kingdom",
    });
    expect(
      normaliseSeoIntake({
        services: "Drain cleaning",
        primaryCity: "Tacoma, Washington, US",
      }).labsLocation,
    ).toBe("United States");
  });

  it("resolves the local Google Ads location code and never sends location_name to search volume", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          status_code: 20000,
          tasks_error: 0,
          tasks: [
            {
              status_code: 20000,
              result: [
                {
                  location_code: 1012345,
                  location_name: "Madison,Wisconsin,United States",
                  country_iso_code: "US",
                  location_type: "City",
                },
              ],
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          status_code: 20000,
          tasks_error: 0,
          cost: 0.09,
          tasks: [
            {
              status_code: 20000,
              result: [
                {
                  keyword: "skin care consultation madison",
                  search_volume: 170,
                  cpc: 2.4,
                  competition: 0.6,
                },
              ],
            },
          ],
        }),
      );
    const client = createDataForSeoClient({
      login: "test-login",
      password: "test-password",
      fetchImpl,
    });

    await expect(
      client.googleSearchVolume({
        keywords: ["skin care consultation madison"],
        locationName: "Madison,Wisconsin,United States",
      }),
    ).resolves.toMatchObject({
      keywords: [
        {
          keyword: "skin care consultation madison",
          searchVolume: 170,
        },
      ],
    });

    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      "https://api.dataforseo.com/v3/keywords_data/google_ads/locations/us",
    );
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ method: "GET" });
    expect(fetchImpl.mock.calls[1]?.[0]).toBe(
      "https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live",
    );
    const payload = JSON.parse(fetchImpl.mock.calls[1]?.[1]?.body as string);
    expect(payload).toEqual([
      {
        keywords: ["skin care consultation madison"],
        location_code: 1012345,
        language_code: "en",
      },
    ]);
    expect(payload[0]).not.toHaveProperty("location_name");
  });

  it("fails closed when a local Google Ads place name resolves ambiguously", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        status_code: 20000,
        tasks_error: 0,
        tasks: [
          {
            status_code: 20000,
            result: [
              {
                location_code: 101,
                location_name: "Springfield,Illinois,United States",
                country_iso_code: "US",
                location_type: "City",
              },
              {
                location_code: 202,
                location_name: "Springfield,Missouri,United States",
                country_iso_code: "US",
                location_type: "City",
              },
            ],
          },
        ],
      }),
    );
    const client = createDataForSeoClient({
      login: "test-login",
      password: "test-password",
      fetchImpl,
    });

    await expect(
      client.googleSearchVolume({
        keywords: ["plumber Springfield"],
        locationName: "Springfield,United States",
      }),
    ).rejects.toThrow("DataForSEO could not resolve a unique local location code");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("caches location lists and resolves country aliases for local search volume", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        dataForSeoLocationsResponse([
          {
            location_code: 1005001,
            location_name: "London,England,United Kingdom",
            country_iso_code: "GB",
            location_type: "City",
          },
        ]),
      )
      .mockResolvedValueOnce(
        Response.json({
          status_code: 20000,
          tasks_error: 0,
          cost: 0.09,
          tasks: [{ status_code: 20000, result: [{ keyword: "facial care", search_volume: 50 }] }],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          status_code: 20000,
          tasks_error: 0,
          cost: 0.09,
          tasks: [{ status_code: 20000, result: [{ keyword: "skin consultation", search_volume: 30 }] }],
        }),
      );
    const client = createDataForSeoClient({
      login: "test-login",
      password: "test-password",
      fetchImpl,
    });

    await client.googleSearchVolume({
      keywords: ["facial care"],
      locationName: "London,United Kingdom",
    });
    await client.googleSearchVolume({
      keywords: ["skin consultation"],
      locationName: "London,United Kingdom",
    });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      "https://api.dataforseo.com/v3/keywords_data/google_ads/locations/gb",
    );
    expect(JSON.parse(fetchImpl.mock.calls[1]?.[1]?.body as string)[0]).toMatchObject({
      keywords: ["facial care"],
      location_code: 1005001,
    });
    expect(JSON.parse(fetchImpl.mock.calls[2]?.[1]?.body as string)[0]).toMatchObject({
      keywords: ["skin consultation"],
      location_code: 1005001,
    });
  });

  it("surfaces the Google Ads task error instead of a top-level Ok message", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        dataForSeoLocationsResponse(commonUsGoogleAdsLocations),
      )
      .mockResolvedValueOnce(
        Response.json({
          status_code: 20000,
          status_message: "Ok.",
          tasks_error: 1,
          tasks: [
            {
              status_code: 40501,
              status_message: "The supplied location is unavailable.",
            },
          ],
        }),
      );
    const client = createDataForSeoClient({
      login: "test-login",
      password: "test-password",
      fetchImpl,
    });

    await expect(
      client.googleSearchVolume({
        keywords: ["sourdough bread"],
        locationName: "Seattle,Washington,United States",
      }),
    ).rejects.toThrow(
      "DataForSEO task 40501: The supplied location is unavailable.",
    );
  });

  it("retains retryable task status and explicit provider-reported failure cost", async () => {
    const client = createDataForSeoClient({
      login: "test-login",
      password: "test-password",
      fetchImpl: vi.fn(async () =>
        Response.json({
          status_code: 20000,
          status_message: "Ok.",
          cost: 0.012,
          tasks_error: 1,
          tasks: [
            {
              status_code: 40101,
              status_message: "Internal SE Server Error.",
              cost: 0.012,
            },
          ],
        }),
      ),
    });

    await expect(
      client.organicSerp({
        keyword: "drain cleaning Tacoma",
        locationName: "Tacoma,Washington,United States",
        languageCode: "en",
      }),
    ).rejects.toMatchObject({
      dataForSeo: { statusCode: 40101, reportedCost: 0.012 },
    });
  });

  it("accepts numeric-string DataForSEO success codes and zero task errors", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        dataForSeoLocationsResponse(commonUsGoogleAdsLocations),
      )
      .mockResolvedValueOnce(
        Response.json({
          status_code: "20000",
          status_message: "Ok.",
          tasks_error: "0",
          cost: 0.09,
          tasks: [
            {
              status_code: "20000",
              result: [
                {
                  keyword: "sourdough bread",
                  search_volume: 170,
                  cpc: 2.4,
                  competition: 0.6,
                },
              ],
            },
          ],
        }),
      );
    const client = createDataForSeoClient({
      login: "test-login",
      password: "test-password",
      fetchImpl,
    });

    await expect(
      client.googleSearchVolume({
        keywords: ["sourdough bread"],
        locationName: "Seattle,Washington,United States",
      }),
    ).resolves.toMatchObject({
      cost: 0.09,
      keywords: [
        {
          keyword: "sourdough bread",
          searchVolume: 170,
          cpc: 2.4,
          competition: 0.6,
        },
      ],
    });
  });

  it("maps local Google Ads metrics, measured search intent, KD, SERP, related-keyword, and ranked-keyword fields", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        dataForSeoLocationsResponse([
          commonUsGoogleAdsLocations.find(
            (location) => location.location_name.startsWith("Tacoma,"),
          )!,
        ]),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status_code: 20000,
            tasks_error: 0,
            cost: 0.03,
            tasks: [
              {
                status_code: 20000,
                result: [
                  {
                    keyword: "drain cleaning tacoma",
                    search_volume: 90,
                    cpc: 12.5,
                    competition: 0.7,
                  },
                ],
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status_code: 20000,
            tasks_error: 0,
            cost: 0.01248,
            tasks: [
              {
                status_code: 20000,
                result: [
                  {
                    items: [
                      {
                        keyword: "drain cleaning tacoma",
                        keyword_intent: {
                          label: "commercial",
                          probability: 0.84,
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status_code: 20000,
            tasks_error: 0,
            cost: 0.01,
            tasks: [
              {
                status_code: 20000,
                result: [
                  {
                    items: [
                      {
                        keyword: "drain cleaning tacoma",
                        keyword_difficulty: 41,
                      },
                    ],
                  },
                ],
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status_code: 20000,
            tasks_error: 0,
            cost: 0.02,
            tasks: [
              {
                status_code: 20000,
                result: [
                  {
                    items: [
                      {
                        type: "organic",
                        rank_group: 2,
                        rank_absolute: 2,
                        title: "Drain cleaning",
                        url: "https://plumber.test/drains/",
                        domain: "plumber.test",
                      },
                      {
                        type: "people_also_ask",
                        items: [{ title: "What does drain cleaning cost?" }],
                      },
                    ],
                  },
                ],
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status_code: 20000,
            tasks_error: 0,
            cost: 0.01,
            tasks: [
              {
                status_code: 20000,
                result: [
                  {
                    items: [
                      {
                        keyword_data: {
                          keyword: "drain cleaning cost tacoma",
                          keyword_info: {
                            search_volume: 20,
                            cpc: 3.4,
                            competition: 0.5,
                          },
                          search_intent_info: { main_intent: "informational" },
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status_code: 20000,
            tasks_error: 0,
            cost: 0.01,
            tasks: [
              {
                status_code: 20000,
                result: [
                  {
                    items: [
                      {
                        keyword_data: {
                          keyword: "harbor plumbing drain cleaning",
                          keyword_info: { search_volume: 30 },
                          ranked_serp_element: {
                            serp_item: {
                              rank_group: 7,
                              title: "Drain cleaning",
                              url: "https://harbor.test/drain-cleaning/",
                            },
                          },
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          }),
          { status: 200 },
        ),
      );
    const client = createDataForSeoClient({
      login: "test-login",
      password: "test-password",
      fetchImpl,
    });

    await expect(
      client.googleSearchVolume({
        keywords: ["drain cleaning tacoma"],
        locationName: "Tacoma,Washington,United States",
      }),
    ).resolves.toMatchObject({
      cost: 0.03,
      keywords: [
        {
          keyword: "drain cleaning tacoma",
          searchVolume: 90,
          cpc: 12.5,
          competition: 0.7,
        },
      ],
    });
    await expect(
      client.searchIntent({ keywords: ["drain cleaning tacoma"] }),
    ).resolves.toMatchObject({
      keywords: [{ keyword: "drain cleaning tacoma", intent: "commercial" }],
    });
    await expect(
      client.bulkKeywordDifficulty({
        keywords: ["drain cleaning tacoma"],
        locationName: "United States",
        languageCode: "en",
      }),
    ).resolves.toMatchObject({
      keywords: [{ keyword: "drain cleaning tacoma", difficulty: 41 }],
    });
    await expect(
      client.organicSerp({
        keyword: "drain cleaning tacoma",
        locationName: "Tacoma, Washington, United States",
        languageCode: "en",
      }),
    ).resolves.toMatchObject({
      results: [
        {
          position: 2,
          title: "Drain cleaning",
          url: "https://plumber.test/drains/",
          domain: "plumber.test",
        },
      ],
      questions: ["What does drain cleaning cost?"],
    });
    await expect(
      client.relatedKeywords({
        keyword: "drain cleaning tacoma",
        locationName: "United States",
        languageCode: "en",
      }),
    ).resolves.toMatchObject({
      keywords: [
        {
          keyword: "drain cleaning cost tacoma",
          keyword_info: { search_volume: 20 },
          search_intent_info: { main_intent: "informational" },
        },
      ],
    });
    await expect(
      client.rankedKeywords({
        target: "harbor.test",
        locationName: "United States",
        languageCode: "en",
      }),
    ).resolves.toMatchObject({
      keywords: [
        {
          keyword_data: {
            keyword: "harbor plumbing drain cleaning",
            ranked_serp_element: {
              serp_item: {
                rank_group: 7,
                url: "https://harbor.test/drain-cleaning/",
              },
            },
          },
        },
      ],
    });
    expect(fetchImpl).toHaveBeenCalledTimes(7);
    expect(fetchImpl.mock.calls[0][0]).toBe(
      "https://api.dataforseo.com/v3/keywords_data/google_ads/locations/us",
    );
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ method: "GET" });
    expect(fetchImpl.mock.calls[1][0]).toBe(
      "https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live",
    );
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual([
      {
        keywords: ["drain cleaning tacoma"],
        location_code: 1010002,
        language_code: "en",
      },
    ]);
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
    expect(dossier.cost).toMatchObject({
      tasks: 8,
      usd: 0.11,
      limitUsd: 0.25,
      overBudget: false,
    });
    expect(provider.organicSerp).toHaveBeenCalledTimes(2);
    expect(provider.googleSearchVolume).toHaveBeenCalledWith(
      expect.objectContaining({
        keywords: expect.arrayContaining([
          "Drain cleaning near me",
          "Drain cleaning Tacoma WA",
          "Drain cleaning quote",
          "emergency Drain cleaning Tacoma WA",
        ]),
      }),
    );
    expect(
      dossier.validatedQueries.find(
        (item) => item.keyword === "Drain cleaning Tacoma WA",
      ),
    ).toMatchObject({
      volume: 90,
      kd: 41,
      cpc: 4.1,
      competition: 0.7,
      intent: "commercial",
      provenance: "dataforseo",
    });
    expect(dossier.pageMap.map((page) => page.pageType)).toEqual(
      expect.arrayContaining([
        "home",
        "services-hub",
        "service",
        "about",
        "contact",
        "blog-index",
      ]),
    );
    expect(
      dossier.pageMap
        .filter((page) => page.pageType === "service")
        .map((page) => page.service),
    ).toEqual(["Drain cleaning", "Water heater repair"]);
    expect(dossier.pageMap.some((page) => page.service === "Roof repair")).toBe(
      false,
    );
    expect(dossier.competitors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          domain: "one.test",
          results: expect.arrayContaining([
            expect.objectContaining({
              position: 1,
              title: "Local service team",
              url: "https://one.test/drain-cleaning/",
            }),
          ]),
        }),
        expect.objectContaining({ domain: "two.test" }),
        expect.objectContaining({ domain: "three.test" }),
      ]),
    );
    expect(
      dossier.pageMap.find((page) => page.service === "Drain cleaning")
        ?.fanOutQuestions,
    ).toContain("How much does drain cleaning cost?");
    expect(
      dossier.pageMap.find((page) => page.pageType === "home")?.fanOutQuestions
        .length,
    ).toBeGreaterThanOrEqual(2);
    expect(dossier.fanOutQuestionGroups.map((group) => group.pageId)).toEqual(
      expect.arrayContaining(["home", "services-hub", "about", "contact"]),
    );
    expect(dossier.questionEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provenance: "dataforseo_people_also_ask" }),
        expect.objectContaining({ provenance: "reasoned_gap" }),
      ]),
    );
    expect(dossier.quickWins[0]).toMatchObject({
      keyword: "harbor plumbing drain cleaning",
      currentPosition: 7,
      url: "https://harbor-plumbing.test/drain-cleaning/",
    });
    expect(dossier.blogOpportunities.length).toBeGreaterThanOrEqual(3);
    expect(
      dossier.pageMap.filter((page) => page.pageType === "blog-opportunity")
        .length,
    ).toBe(dossier.blogOpportunities.length);
    expect(dossier.pageMap.some((page) => page.pageType === "location")).toBe(
      false,
    );
  });

  it("records missing metrics as null and keeps reasoned questions distinct from measured questions", async () => {
    const provider = researchProvider();
    provider.googleSearchVolume.mockResolvedValueOnce({
      cost: 0.04,
      keywords: [
        {
          keyword: "drain cleaning Tacoma, WA",
          searchVolume: null,
          cpc: null,
          competition: null,
        },
      ],
    });
    provider.searchIntent.mockResolvedValueOnce({ cost: 0.01, keywords: [] });
    provider.bulkKeywordDifficulty.mockResolvedValueOnce({
      cost: 0.01,
      keywords: [],
    });
    const dossier = await researchSiteContext(intake, {
      dataForSeo: provider,
      maxTasks: 16,
      maxUsd: 0.25,
    });

    expect(
      dossier.validatedQueries.find(
        (item) => item.keyword.toLowerCase() === "drain cleaning tacoma wa",
      ),
    ).toMatchObject({
      volume: null,
      kd: null,
      cpc: null,
      competition: null,
      intent: null,
      provenance: "dataforseo_unavailable",
    });
    expect(dossier.warnings.join(" ")).toMatch(/metrics remain null/iu);
  });

  it("blocks publication when any confirmed service lacks a complete measured primary query", async () => {
    const provider = researchProvider();
    provider.googleSearchVolume.mockResolvedValueOnce({
      cost: 0.04,
      keywords: [
        {
          keyword: "Drain cleaning Tacoma, WA",
          searchVolume: 90,
          cpc: 4.1,
          competition: 0.7,
        },
      ],
    });
    const dossier = await researchSiteContext(intake, {
      dataForSeo: provider,
      maxTasks: 16,
      maxUsd: 0.25,
    });

    expect(dossier.completeness.serviceMetrics).toEqual([
      {
        service: "Drain cleaning",
        complete: true,
        primaryKeyword: "Drain cleaning Tacoma WA",
      },
      { service: "Water heater repair", complete: false, primaryKeyword: null },
    ]);
    expect(dossier.publishReady).toBe(false);
    expect(dossier.warnings.join(" ")).toContain(
      "lack a primary query with measured volume, CPC, competition, Keyword Difficulty, and intent",
    );
  });

  it("does not map unrelated provider metrics onto a confirmed service", async () => {
    const provider = researchProvider();
    provider.googleSearchVolume.mockResolvedValueOnce({
      cost: 0.04,
      keywords: [
        {
          keyword: "unrelated industrial equipment",
          searchVolume: 900,
          cpc: 9,
          competition: 0.9,
        },
      ],
    });
    provider.searchIntent.mockResolvedValueOnce({
      cost: 0.01,
      keywords: [
        { keyword: "unrelated industrial equipment", intent: "commercial" },
      ],
    });
    provider.bulkKeywordDifficulty.mockResolvedValueOnce({
      cost: 0.01,
      keywords: [{ keyword: "unrelated industrial equipment", difficulty: 3 }],
    });

    const dossier = await researchSiteContext(
      {
        businessKind: "auto repair",
        confirmedServices: ["Brake repair"],
        primaryCity: "Portland, OR",
      },
      { dataForSeo: provider, maxTasks: 16, maxUsd: 0.5 },
    );
    const primary = dossier.pageMap.find(
      (page) => page.pageType === "service",
    )?.primaryKeyword;

    expect(dossier.publishReady).toBe(false);
    expect(dossier.completeness.serviceMetrics).toEqual([
      { service: "Brake repair", complete: false, primaryKeyword: null },
    ]);
    expect(primary).toMatchObject({
      volume: null,
      kd: null,
      cpc: null,
      competition: null,
      intent: null,
      provenance: "dataforseo_unavailable",
    });
  });

  it("degrades to context-only when a required measured research stage fails", async () => {
    const provider = researchProvider({ serpFailure: true });
    const dossier = await researchSiteContext(intake, {
      dataForSeo: provider,
      maxTasks: 16,
      maxUsd: 0.25,
    });

    expect(dossier.mode).toBe("context-only");
    expect(dossier.publishReady).toBe(false);
    expect(dossier.cost.tasks).toBeGreaterThan(0);
    expect(dossier.warnings.join(" ")).toContain("SERP provider unavailable");
  });

  it("retries one transient SERP failure only when its cost is known and within budget", async () => {
    const provider = researchProvider();
    provider.organicSerp.mockRejectedValueOnce(
      Object.assign(
        new Error("DataForSEO task 40101: temporary search error"),
        {
          dataForSeo: { statusCode: 40101, reportedCost: 0.01 },
        },
      ),
    );
    const dossier = await researchSiteContext(intake, {
      dataForSeo: provider,
      maxTasks: 16,
      maxUsd: 0.25,
      dataForSeoRetryDelayMs: 0,
    });
    const firstSerpStage = dossier.cost.stageCosts.filter(
      (stage) => stage.stage === "organic_serp:drain-cleaning",
    );

    expect(provider.organicSerp).toHaveBeenCalledTimes(3);
    expect(firstSerpStage).toEqual([
      expect.objectContaining({
        tasks: 1,
        usd: 0.01,
        status: "retryable_failure",
      }),
      expect.objectContaining({ tasks: 1, usd: 0.01, status: "complete" }),
    ]);
    expect(dossier.cost.tasks).toBeGreaterThan(
      provider.organicSerp.mock.calls.length,
    );
    expect(dossier.cost.usd).toBeGreaterThanOrEqual(0.08);
    expect(dossier.cost.complete).toBe(true);
  });

  it("does not retry transient failures when the provider cost is unknown", async () => {
    const provider = researchProvider();
    provider.organicSerp.mockRejectedValueOnce(
      Object.assign(new Error("DataForSEO task 40103: execution failed"), {
        dataForSeo: { statusCode: 40103, reportedCost: null },
      }),
    );
    const dossier = await researchSiteContext(intake, {
      dataForSeo: provider,
      maxTasks: 16,
      maxUsd: 0.25,
      dataForSeoRetryDelayMs: 0,
    });

    expect(provider.organicSerp).toHaveBeenCalledTimes(1);
    expect(dossier.cost).toMatchObject({
      tasks: 4,
      complete: false,
      unreportedTasks: 1,
    });
  });

  it("does not retry permanent DataForSEO task failures even when their cost is known", async () => {
    const provider = researchProvider();
    provider.organicSerp.mockRejectedValueOnce(
      Object.assign(new Error("DataForSEO task 40501: invalid input"), {
        dataForSeo: { statusCode: 40501, reportedCost: 0.01 },
      }),
    );
    const dossier = await researchSiteContext(intake, {
      dataForSeo: provider,
      maxTasks: 16,
      maxUsd: 0.25,
      dataForSeoRetryDelayMs: 0,
    });

    expect(provider.organicSerp).toHaveBeenCalledTimes(2);
    expect(dossier.cost.unreportedTasks).toBe(0);
    expect(dossier.warnings.join(" ")).toContain("task 40501");
  });

  it("does not retry when a reported failure cost leaves less than the reserved budget", async () => {
    const provider = researchProvider();
    provider.organicSerp.mockRejectedValueOnce(
      Object.assign(
        new Error("DataForSEO task 40101: temporary search error"),
        {
          dataForSeo: { statusCode: 40101, reportedCost: 0.03 },
        },
      ),
    );
    const dossier = await researchSiteContext(intake, {
      dataForSeo: provider,
      maxTasks: 16,
      maxUsd: 0.1,
      dataForSeoRetryDelayMs: 0,
    });

    expect(provider.organicSerp).toHaveBeenCalledTimes(1);
    expect(dossier.cost).toMatchObject({
      tasks: 4,
      usd: 0.09,
      complete: true,
      unreportedTasks: 0,
    });
  });

  it("does not retry when the failed attempt consumes the final task slot", async () => {
    const provider = researchProvider();
    provider.organicSerp.mockRejectedValueOnce(
      Object.assign(
        new Error("DataForSEO task 40101: temporary search error"),
        {
          dataForSeo: { statusCode: 40101, reportedCost: 0.01 },
        },
      ),
    );
    const dossier = await researchSiteContext(intake, {
      dataForSeo: provider,
      maxTasks: 4,
      maxUsd: 0.25,
      dataForSeoRetryDelayMs: 0,
    });

    expect(provider.organicSerp).toHaveBeenCalledTimes(1);
    expect(dossier.cost).toMatchObject({
      tasks: 4,
      usd: 0.07,
      complete: true,
      unreportedTasks: 0,
    });
  });

  it("accounts for known failure spend that exceeds the cap without retrying", async () => {
    const provider = researchProvider();
    provider.organicSerp.mockRejectedValueOnce(
      Object.assign(
        new Error("DataForSEO task 40101: temporary search error"),
        {
          dataForSeo: { statusCode: 40101, reportedCost: 0.08 },
        },
      ),
    );
    const dossier = await researchSiteContext(intake, {
      dataForSeo: provider,
      maxTasks: 16,
      maxUsd: 0.1,
      dataForSeoRetryDelayMs: 0,
    });

    expect(provider.organicSerp).toHaveBeenCalledTimes(1);
    expect(dossier.cost).toMatchObject({
      tasks: 4,
      usd: 0.14,
      complete: true,
      unreportedTasks: 0,
      overBudget: true,
    });
    expect(dossier.publishReady).toBe(false);
  });

  it("keeps SEO not-ready after one charged transient retry also fails", async () => {
    const provider = researchProvider();
    provider.organicSerp
      .mockRejectedValueOnce(
        Object.assign(
          new Error("DataForSEO task 40101: temporary search error"),
          {
            dataForSeo: { statusCode: 40101, reportedCost: 0.01 },
          },
        ),
      )
      .mockRejectedValueOnce(
        Object.assign(new Error("DataForSEO task 40103: execution failed"), {
          dataForSeo: { statusCode: 40103, reportedCost: 0.02 },
        }),
      );
    const dossier = await researchSiteContext(intake, {
      dataForSeo: provider,
      maxTasks: 16,
      maxUsd: 0.25,
      dataForSeoRetryDelayMs: 0,
    });
    const firstSerpStage = dossier.cost.stageCosts.filter(
      (stage) => stage.stage === "organic_serp:drain-cleaning",
    );

    expect(provider.organicSerp).toHaveBeenCalledTimes(3);
    expect(firstSerpStage).toEqual([
      expect.objectContaining({
        tasks: 1,
        usd: 0.01,
        status: "retryable_failure",
      }),
      expect.objectContaining({ tasks: 1, usd: 0.02, status: "failed" }),
    ]);
    expect(dossier.cost).toMatchObject({
      complete: true,
      unreportedTasks: 0,
    });
    expect(dossier.cost.usd).toBeGreaterThan(0.09);
    expect(
      dossier.cost.stageCosts.reduce(
        (sum, stage) => sum + (typeof stage.usd === "number" ? stage.usd : 0),
        0,
      ),
    ).toBeCloseTo(dossier.cost.usd, 5);
    const completeness: any = dossier.completeness;
    expect(
      completeness.serviceMetrics.every((item: any) => item.complete),
    ).toBe(true);
    expect(dossier.completeness.serviceSerps).toBeLessThan(
      dossier.completeness.serviceSerpsRequired,
    );
    expect(dossier.mode).toBe("context-only");
    expect(dossier.publishReady).toBe(false);
  });

  it("stops starting paid tasks at the configured task ceiling", async () => {
    const provider = researchProvider();
    const dossier = await researchSiteContext(intake, {
      dataForSeo: provider,
      maxTasks: 2,
      maxUsd: 0.25,
    });

    expect(dossier.mode).toBe("context-only");
    expect(dossier.cost.tasks).toBe(2);
    expect(provider.organicSerp).not.toHaveBeenCalled();
    expect(dossier.warnings.join(" ")).toContain("task budget");
  });

  it("reports a provider-reported task overrun and starts no additional tasks", async () => {
    const provider = researchProvider({ searchVolumeCost: 0.3 });
    const dossier = await researchSiteContext(intake, {
      dataForSeo: provider,
      maxTasks: 16,
      maxUsd: 0.25,
    });

    expect(dossier.cost).toMatchObject({
      tasks: 1,
      usd: 0.3,
      limitUsd: 0.25,
      overBudget: true,
    });
    expect(dossier.mode).toBe("context-only");
    expect(provider.searchIntent).not.toHaveBeenCalled();
    expect(dossier.warnings.join(" ")).toContain(
      "above the configured cost cap",
    );
  });

  it("records cost as unavailable instead of inventing a zero and stops paid work", async () => {
    const provider = researchProvider();
    provider.googleSearchVolume.mockResolvedValueOnce({
      cost: undefined,
      keywords: [
        {
          keyword: "Drain cleaning Tacoma, WA",
          searchVolume: 90,
          cpc: 4.1,
          competition: 0.7,
        },
      ],
    });
    const dossier = await researchSiteContext(intake, {
      dataForSeo: provider,
      maxTasks: 16,
      maxUsd: 0.25,
    });

    expect(dossier.cost).toMatchObject({
      tasks: 1,
      usd: 0,
      complete: false,
      unreportedTasks: 1,
      overBudget: false,
    });
    expect(dossier.cost.stageCosts[0]).toMatchObject({
      stage: "local_search_volume",
      usd: null,
      status: "cost_unavailable",
    });
    expect(
      dossier.validatedQueries.find(
        (item) => item.keyword === "Drain cleaning Tacoma WA",
      ),
    ).toMatchObject({ volume: 90, provenance: "dataforseo_metric_partial" });
    expect(provider.searchIntent).not.toHaveBeenCalled();
    expect(dossier.publishReady).toBe(false);
    expect(dossier.warnings.join(" ")).toContain(
      "without provider-reported spend",
    );
  });

  it("collects bounded cited web evidence without DataForSEO but remains unready for production", async () => {
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
    expect(dossier.publishReady).toBe(false);
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
    expect(
      dossier.validatedQueries.every(
        (item) =>
          item.volume === null &&
          item.kd === null &&
          item.cpc === null &&
          item.competition === null &&
          item.intent === null,
      ),
    ).toBe(true);
    expect(dossier.competitors).toEqual([]);
    expect(dossier.pageMap.some((page) => page.pageType === "location")).toBe(
      false,
    );
    expect(dossier.warnings.join(" ")).toContain("external observations only");
  });

  it("qualifies fallback service searches with an explicit niche, not a broad industry guess", async () => {
    const webSearch = {
      search: vi.fn(async ({ query }: { query: string }) => ({
        results: [
          {
            url: "https://example.test/service",
            title: `Observed result for ${query}`,
            snippet: "Observed public search evidence.",
          },
        ],
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

    expect(
      webSearch.search.mock.calls.map(([request]) => request.query),
    ).toEqual([
      "veterinary preventive wellness visits Madison WI",
      "veterinary vaccination appointments Madison WI",
      "veterinary diagnostic consultations Madison WI",
    ]);
    expect(veterinary.mode).toBe("context-only");
    expect(veterinary.publishReady).toBe(false);
    expect(veterinary.marketSnapshot.businessKind).toBe("veterinary");
    expect(
      veterinary.validatedQueries.every(
        (item) =>
          item.volume === null &&
          item.kd === null &&
          item.cpc === null &&
          item.competition === null &&
          item.intent === null,
      ),
    ).toBe(true);

    const generalSearch = {
      search: vi.fn(async ({ query }: { query: string }) => ({
        results: [
          {
            url: "https://example.test/general",
            title: query,
            snippet: "Observed.",
          },
        ],
        costUsd: 0.001,
      })),
    };
    await researchSiteContext(
      {
        ...veterinaryIntake,
        industry: "wellness",
      },
      {
        webSearch: generalSearch,
        maxFallbackSearchQueries: 1,
        maxFallbackUsd: 0.05,
      },
    );
    expect(generalSearch.search.mock.calls[0]?.[0].query).toBe(
      "Preventive wellness visits Madison WI",
    );
    expect(generalSearch.search.mock.calls[0]?.[0].query).not.toContain(
      "veterinary",
    );
  });

  it("uses bounded web evidence after DataForSEO fails without treating it as measured SEO", async () => {
    const provider = researchProvider();
    provider.googleSearchVolume.mockRejectedValueOnce(
      new Error("DataForSEO returned HTTP 402"),
    );
    const webSearch = {
      search: vi.fn(async ({ query }: { query: string }) => ({
        results: [
          {
            url: "https://example.test/auto-repair",
            title: `Observed result for ${query}`,
            snippet: "A directly observed page about the requested service.",
          },
        ],
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
    expect(dossier.publishReady).toBe(false);
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
    expect(
      dossier.validatedQueries.every(
        (item) =>
          item.volume === null &&
          item.kd === null &&
          item.cpc === null &&
          item.competition === null &&
          item.intent === null,
      ),
    ).toBe(true);
    expect(dossier.warnings.join(" ")).toContain(
      "DataForSEO returned HTTP 402",
    );
    expect(dossier.warnings.join(" ")).toContain("external observations only");
  });

  it("keeps an explicit degraded context-only result when no online search provider is configured", async () => {
    const dossier = await researchSiteContext(intake, {
      maxTasks: 16,
      maxUsd: 0.25,
    });
    expect(dossier.mode).toBe("context-only");
    expect(dossier.publishReady).toBe(false);
    expect(dossier.fallbackSearch.status).toBe("unavailable");
    expect(dossier.externalSearchEvidence).toEqual([]);
    expect(dossier.warnings.join(" ")).toContain(
      "No supported online-search fallback is configured",
    );
    expect(
      dossier.validatedQueries.every(
        (item) =>
          item.volume === null &&
          item.kd === null &&
          item.cpc === null &&
          item.competition === null &&
          item.intent === null,
      ),
    ).toBe(true);
    expect(dossier.competitors).toEqual([]);
    expect(dossier.pageMap.some((page) => page.pageType === "location")).toBe(
      false,
    );
    expect(dossier.fanOutQuestionGroups.map((group) => group.pageId)).toEqual(
      expect.arrayContaining(["home", "services-hub", "about", "contact"]),
    );
    expect(
      dossier.fanOutQuestionGroups
        .flatMap((group) => group.questions)
        .every((item) => item.provenance === "reasoned_gap"),
    ).toBe(true);
  });

  it("extracts only OpenRouter url citations and ignores model-authored search claims", async () => {
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    "Fabricated claim: Harbor Plumbing ranks #1 and gets 900 searches.",
                  annotations: [
                    {
                      type: "url_citation",
                      url_citation: {
                        url: "https://source.example/plumbing",
                        title: "Plumbing source",
                        content:
                          "A directly extracted snippet from the source page.",
                      },
                    },
                  ],
                },
              },
            ],
            usage: { cost: 0.003 },
          }),
          { status: 200 },
        ),
    );
    const search = createOpenRouterWebSearchClient({
      apiKey: "test-key",
      fetchImpl,
      model: "test/model",
    });
    const observed = await search.search({
      query: "drain cleaning Tacoma",
      maxResults: 4,
    });

    expect(observed.costUsd).toBe(0.003);
    expect(observed.results).toEqual([
      {
        url: "https://source.example/plumbing",
        title: "Plumbing source",
        snippet: "A directly extracted snippet from the source page.",
      },
    ]);
    expect(JSON.stringify(observed)).not.toContain("ranks #1");
    expect(JSON.stringify(observed)).not.toContain("900 searches");
    const request = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body));
    expect(request.tools).toEqual([
      {
        type: "openrouter:web_search",
        parameters: {
          engine: "parallel",
          max_results: 4,
          max_total_results: 4,
          max_characters: 1200,
        },
      },
    ]);
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
        results: [
          {
            url: "https://example.test/budget",
            title: "Budgeted result",
            snippet: "Observed evidence.",
          },
        ],
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
    expect(dossier.warnings.join(" ")).toContain(
      "configured USD 0.005 spend bound",
    );
  });

  it("stops after one fallback query when provider spend is unreported", async () => {
    const webSearch = {
      search: vi.fn(async () => ({
        results: [
          {
            url: "https://example.test/unreported",
            title: "Unreported-cost result",
            snippet: "Observed evidence.",
          },
        ],
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
    expect(dossier.warnings.join(" ")).toContain("did not report request cost");
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
  const fetchImpl = vi
    .fn()
    .mockResolvedValueOnce(
      dataForSeoLocationsResponse([
        commonUsGoogleAdsLocations.find(
          (location) => location.location_name.startsWith("Austin,"),
        )!,
      ]),
    )
    .mockResolvedValueOnce(
      Response.json({
        status_code: 20000,
        tasks_error: 0,
        cost: 0.09,
        tasks: [
          {
            status_code: 20000,
            result: [
              {
                keyword: "dental checkups",
                search_volume: 170,
                cpc: 4.8,
                competition: "LOW",
                competition_index: 14,
              },
              {
                keyword: "zero competition",
                search_volume: 10,
                cpc: 1,
                competition: "LOW",
                competition_index: 0,
              },
              {
                keyword: "missing index",
                search_volume: 10,
                cpc: null,
                competition: "LOW",
                competition_index: null,
              },
            ],
          },
        ],
      }),
    );
  const client = createDataForSeoClient({
    login: "fixture",
    password: "fixture",
    fetchImpl,
  });
  const result = await client.googleSearchVolume({
    keywords: ["dental checkups", "zero competition", "missing index"],
    locationName: "Austin,Texas,United States",
  });
  expect(result.keywords.map((item) => item.competition)).toEqual([
    0.14,
    0,
    null,
  ]);
});

it("researches only explicitly confirmed cities with city-specific metrics and a shared budget", async () => {
  const provider = researchProvider();
  const confirmed = {
    ...intake,
    website: "",
    primaryCity: "Cookeville, TN",
    serviceAreas: "Cookeville, TN; Baxter, TN",
    coverageAreas: ["Cookeville, TN", "Algood, TN"],
    serviceRadius: "10",
    coverageConfirmation: {
      status: "confirmed",
      primaryCity: "Cookeville, TN",
      radiusSelection: "10",
      selectedCount: 1,
    },
  };
  const dossier = await researchSiteContext(confirmed, {
    dataForSeo: provider,
    maxTasks: 32,
    maxUsd: 2,
  });
  expect(dossier.coverageAreas).toEqual(["Cookeville, TN", "Algood, TN"]);
  expect(
    provider.googleSearchVolume.mock.calls.map(([args]) => args.locationName),
  ).toEqual([
    "Cookeville,Tennessee,United States",
    "Algood,Tennessee,United States",
  ]);
  expect(dossier.coverageResearch!.cities.map((item) => item.city)).toEqual(
    confirmed.coverageAreas,
  );
  expect(dossier.coverageResearch!.complete).toBe(true);
  expect(dossier.cost.tasks).toBeLessThanOrEqual(32);
  expect(JSON.stringify(dossier)).not.toContain("Baxter");
});

it("keeps every confirmed city planned and blocks readiness when the shared budget cannot research them", async () => {
  const provider = researchProvider();
  const areas = [
    "Tacoma, WA",
    ...Array.from({ length: 24 }, (_, i) => `Town ${i}, WA`),
  ];
  const dossier = await researchSiteContext(
    {
      ...intake,
      website: "",
      coverageAreas: areas,
      coverageConfirmation: {
        status: "confirmed",
        primaryCity: "Tacoma, WA",
        radiusSelection: "20",
        selectedCount: 24,
      },
    },
    { dataForSeo: provider, maxTasks: 1, maxUsd: 0.25 },
  );
  expect(dossier.coverageAreas).toEqual(areas);
  expect(dossier.coverageResearch!.cities).toHaveLength(25);
  expect(dossier.coverageResearch!.complete).toBe(false);
  expect(dossier.publishReady).toBe(false);
  expect(provider.googleSearchVolume).toHaveBeenCalledTimes(1);
  expect(dossier.cost.tasks).toBe(1);
});

it("shares fallback query and USD caps across confirmed cities instead of multiplying them", async () => {
  const search = vi.fn(async ({ query }: { query: string }) => ({
    costUsd: 0.002,
    results: [
      {
        url: "https://evidence.test/local",
        title: query,
        snippet: "Cited local service observation",
      },
    ],
  }));
  const dossier = await researchSiteContext(
    {
      ...intake,
      website: "",
      coverageAreas: ["Tacoma, WA", "Lakewood, WA", "Puyallup, WA"],
      coverageConfirmation: {
        status: "confirmed",
        primaryCity: "Tacoma, WA",
        radiusSelection: "20",
        selectedCount: 2,
      },
    },
    {
      webSearch: { search },
      maxFallbackSearchQueries: 3,
      maxFallbackUsd: 0.05,
    },
  );
  expect(search).toHaveBeenCalledTimes(3);
  expect(dossier.coverageResearch!.fallbackQueries).toBe(3);
  expect(dossier.coverageResearch!.fallbackCostUsd).toBe(0.006);
  expect(
    dossier.coverageResearch!.cities.slice(1).map((item) => item.status),
  ).toEqual(["pending", "pending"]);
  expect(dossier.publishReady).toBe(false);
  expect(dossier.coverageResearch!.complete).toBe(false);
  expect(dossier.coverageResearch!.approvalPolicy).toBe("primary-city");
});

it("stops further measured city calls when the primary provider task has unreported spend", async () => {
  const provider = researchProvider();
  provider.googleSearchVolume.mockImplementation(async ({ keywords }) => ({
    keywords: keywords.map((keyword) => ({
      keyword,
      searchVolume: 20,
      cpc: 1,
      competition: 0.2,
    })),
  }));
  const dossier = await researchSiteContext(
    {
      ...intake,
      website: "",
      coverageAreas: ["Tacoma, WA", "Lakewood, WA"],
      coverageConfirmation: {
        status: "confirmed",
        primaryCity: "Tacoma, WA",
        radiusSelection: "20",
        selectedCount: 1,
      },
    },
    { dataForSeo: provider, maxUsd: 2, maxTasks: 32 },
  );
  expect(provider.googleSearchVolume).toHaveBeenCalledTimes(1);
  expect(provider.organicSerp).not.toHaveBeenCalled();
  expect(dossier.cost.complete).toBe(false);
  expect(dossier.coverageResearch!.cities[1].status).toBe("pending");
});

it("keeps primary approval and pending coverage visible through the canonical brief and generated config", async () => {
  const selected = {
    ...intake,
    phone: "555-0100",
    email: "owner@example.test",
    leadEmail: "leads@example.test",
    website: "",
    coverageAreas: ["Tacoma, WA", "Lakewood, WA"],
    coverageConfirmation: {
      status: "confirmed",
      primaryCity: "Tacoma, WA",
      radiusSelection: "20",
      selectedCount: 1,
    },
  };
  const provider = researchProvider();
  const research = await researchSiteContext(selected, {
    dataForSeo: provider,
    maxTasks: 7,
    maxUsd: 0.25,
  });
  expect(research.coverageResearch!.complete).toBe(false);
  expect(research.publishReady).toBe(true);
  const brief = compileCanonicalSiteBrief({
    intake: selected,
    enrichment: { coverageAreas: ["Tacoma, WA", "Seattle, WA"] },
    research,
  });
  const config = normalise({}, brief);
  expect(config.business.serviceAreas).toEqual(selected.coverageAreas);
  expect(config.seoResearch.coverageResearch.cities[1].status).toBe("pending");
  expect(seoResearchReadiness(config).allowed).toBe(true);
  expect(
    seoResearchReadiness({
      ...config,
      locations: [{ name: "Unmapped city", slug: "unmapped" }],
    }).allowed,
  ).toBe(false);
  expect(
    seoResearchReadiness({
      ...config,
      seoResearch: {
        ...config.seoResearch,
        completeness: {
          ...config.seoResearch.completeness,
          keywordOverview: false,
        },
      },
    }).allowed,
  ).toBe(false);
});
