import { describe, expect, it, vi } from "vitest";
import {
  createDataForSeoClient,
  normaliseSeoIntake,
  researchSiteContext,
} from "../scripts/seo-research.mjs";

const intake = {
  businessName: "Harbor Plumbing",
  industry: "home-services",
  services: "Drain cleaning\nWater heater repair",
  serviceAreas: "Tacoma\nLakewood",
  priorityService: "Drain cleaning",
  searchPhrases: "emergency drain cleaning\nblocked drain plumber",
  customerProblems: "The sink backs up after the dishwasher runs.",
  excludedServices: "Septic pumping",
  competitorUrls: "https://example-one.test\nhttps://example-two.test",
};

describe("SEO research", () => {
  it("maps the documented DataForSEO keyword overview response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
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
                  items: [
                    {
                      keyword: "drain cleaning tacoma",
                      keyword_info: {
                        search_volume: 90,
                        cpc: 12.5,
                        competition: 0.7,
                      },
                      search_intent_info: { main_intent: "commercial" },
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
      client.keywordOverview({
        keywords: ["drain cleaning tacoma"],
        languageCode: "en",
      }),
    ).resolves.toMatchObject({
      cost: 0.03,
      keywords: [
        {
          keyword: "drain cleaning tacoma",
          searchVolume: 90,
          cpc: 12.5,
          competition: 0.7,
          intent: "commercial",
        },
      ],
    });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual([
      {
        keywords: ["drain cleaning tacoma"],
        location_code: 2840,
        language_code: "en",
      },
    ]);
  });

  it("normalises the guided intake without treating phrases as measured data", () => {
    expect(normaliseSeoIntake(intake)).toMatchObject({
      priorityService: "Drain cleaning",
      searchPhrases: ["emergency drain cleaning", "blocked drain plumber"],
      customerProblems: ["The sink backs up after the dishwasher runs."],
      excludedServices: ["Septic pumping"],
      competitorUrls: [
        "https://example-one.test/",
        "https://example-two.test/",
      ],
      phraseProvenance: "client_supplied",
    });
  });

  it("uses no more than two paid tasks and returns a grounded researched dossier", async () => {
    const keywordOverview = vi.fn().mockResolvedValue({
      cost: 0.03,
      keywords: [
        {
          keyword: "emergency drain cleaning",
          searchVolume: 90,
          cpc: 12.5,
          competition: 0.7,
          intent: "commercial",
        },
      ],
    });
    const organicSerp = vi.fn().mockResolvedValue({
      cost: 0.04,
      query: "emergency drain cleaning Tacoma",
      results: [
        {
          title: "Drain cleaning in Tacoma",
          domain: "example-plumber.test",
          snippet: "Help for backed-up drains.",
        },
      ],
      questions: ["What clears a blocked drain?"],
    });

    const dossier = await researchSiteContext(intake, {
      dataForSeo: { keywordOverview, organicSerp },
      model: {
        plan: vi.fn().mockResolvedValue({
          queries: ["roof repair Tacoma", "drain cleaning near Tacoma"],
        }),
        strategize: vi.fn().mockResolvedValue({
          validatedQueries: ["roof repair Tacoma", "emergency drain cleaning"],
          pageDecisions: [
            { type: "service", title: "Roof repair", reason: "Popular" },
            { type: "service", title: "Drain cleaning", reason: "Priority" },
            { type: "location", title: "Seattle", reason: "Nearby" },
          ],
          copyVocabulary: ["backed-up drain"],
          customerQuestions: ["Why is my sink backing up?"],
        }),
      },
      maxTasks: 2,
      maxUsd: 0.1,
    });

    expect(dossier.mode).toBe("researched");
    expect(dossier.cost).toEqual({ tasks: 2, usd: 0.07, limitUsd: 0.1 });
    expect(keywordOverview).toHaveBeenCalledTimes(1);
    expect(organicSerp).toHaveBeenCalledTimes(1);
    expect(dossier.validatedQueries[0]).toMatchObject({
      query: "emergency drain cleaning",
      provenance: "dataforseo_keyword_overview",
    });
    expect(dossier.pageDecisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "service", title: "Drain cleaning" }),
      ]),
    );
    expect(keywordOverview.mock.calls[0][0].keywords).not.toContain(
      "roof repair Tacoma",
    );
    expect(dossier.pageDecisions).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "Roof repair" }),
        expect.objectContaining({ title: "Seattle" }),
      ]),
    );
    expect(JSON.stringify(dossier)).not.toContain("Septic pumping service");
  });

  it("degrades to context-only research without losing the client brief", async () => {
    const dossier = await researchSiteContext(intake, {
      dataForSeo: {
        keywordOverview: vi.fn().mockRejectedValue(new Error("upstream down")),
        organicSerp: vi.fn(),
      },
      maxTasks: 2,
      maxUsd: 0.1,
    });

    expect(dossier.mode).toBe("context-only");
    expect(dossier.cost.tasks).toBe(0);
    expect(dossier.seedQueries).toContain("emergency drain cleaning");
    expect(dossier.warnings.join(" ")).toContain("upstream down");
  });
});
