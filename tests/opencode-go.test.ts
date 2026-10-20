import { afterEach, describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  buildAuthorResponsesRequest,
  buildSiteCopyResponsesRequest,
  opencodeGoCashCostUsd,
  opencodeGoResponsesProfile,
  opencodeGoUsageMetrics,
  responsesImagePart,
} from "../scripts/opencode-go.mjs";
import {
  buildInferenceRequest,
  validateInferenceProfile,
} from "../scripts/inference-client.mjs";
import {
  generateSiteConfigWithModel,
  getSiteConfigUsageRecords,
} from "../scripts/generate-site-config.mjs";
import { summarizeGenerationCosts } from "../scripts/generation-cost-summary.mjs";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const imageUrl = "data:image/png;base64,aGVsbG8=";

function goCandidate() {
  return {
    preset: "home-services",
    business: {
      name: "Willow & Fern Garden Care",
      tagline: "Seasonal garden care planned around your yard",
      description:
        "Seasonal garden maintenance in Portland with a documented walkthrough before any seasonal plan is proposed.",
    },
    services: [
      {
        name: "Garden maintenance",
        description:
          "Review seasonal maintenance priorities and note preparation before booking.",
        decisionSupport: {
          scope: "Ask which seasonal tasks a maintenance visit can cover.",
          nextStep: "Share the yard details and seasonal concerns.",
          preparation:
            "Note the areas and timing that matter most this season.",
        },
      },
      {
        name: "Seasonal planting",
        description:
          "Discuss planting options and timing before deciding on a seasonal plan.",
        decisionSupport: {
          scope: "Ask which planting tasks fit the current season.",
          nextStep: "Describe the beds or containers under consideration.",
          preparation: "Note sunlight, soil, and watering conditions.",
        },
      },
    ],
    differentiators: [
      "A documented walkthrough precedes seasonal recommendations.",
    ],
    copy: {
      heroKicker: "Garden care in Portland, OR",
      heroHeading: "Seasonal garden care, planned before the first visit",
      heroBody:
        "Book seasonal garden care and review the walkthrough notes before any plan is proposed.",
      servicesHeading: "Seasonal garden care, explained",
      servicesIntro:
        "Choose a confirmed service and review what a seasonal visit includes.",
      aboutHeading: "Planned around your garden",
      aboutBody:
        "Seasonal visits begin with a walkthrough so recommendations match the yard.",
      contactHeading: "Request a garden visit",
      formIntro:
        "Share the garden details and preferred timing so the team can confirm the next step.",
    },
    conversion: {
      process: [
        "Share the garden details and seasonal concerns.",
        "The team confirms whether the service fits the yard.",
        "Review the walkthrough notes before approving a seasonal plan.",
      ],
      faqs: [
        {
          question: "What happens during the first visit?",
          answer:
            "The first visit starts with a documented walkthrough and a discussion of the next step.",
        },
        {
          question: "When do I approve a seasonal plan?",
          answer:
            "Recommendations are shared after the walkthrough so you can review the scope first.",
        },
      ],
    },
  };
}

describe("opencode go profile and request contracts", () => {
  it("validates and serializes the Go Responses profile through the neutral client", () => {
    const profile = opencodeGoResponsesProfile();
    expect(validateInferenceProfile(profile)).toEqual(profile);
    const { body, headers } = buildInferenceRequest(profile, {
      messages: [
        { role: "system", content: "system" },
        {
          role: "user",
          content: [
            { type: "text", text: "route" },
            { type: "image", url: imageUrl, detail: "high" },
            { type: "text", text: "stage" },
          ],
        },
      ],
      maxOutputTokens: 48_000,
      reasoning: { effort: "xhigh" },
      outputFormat: {
        type: "json-schema",
        name: "launchloom_production_author_stage",
        schema: { type: "object" },
      },
      sessionId: "launchloom:test-session",
    });
    expect(headers["x-opencode-session"]).toBe("launchloom:test-session");
    expect(headers["User-Agent"]).toBe("launchloom-production/0.1");
    expect(body.model).toBe("gpt-6-luna");
    expect(body.store).toBe(false);
    expect(body.max_output_tokens).toBe(48_000);
    expect(body.reasoning).toEqual({ effort: "xhigh" });
    expect(body.text).toEqual({
      format: {
        type: "json_schema",
        name: "launchloom_production_author_stage",
        strict: true,
        schema: { type: "object" },
      },
    });
    expect(body.input[0]).toEqual({
      role: "system",
      content: [{ type: "input_text", text: "system" }],
    });
    expect(body.input[1].content).toContainEqual({
      type: "input_image",
      image_url: imageUrl,
      detail: "high",
    });
  });

  it("refuses temperature because the Go model rejects it", () => {
    const profile = opencodeGoResponsesProfile();
    expect(() =>
      buildInferenceRequest(profile, {
        messages: [{ role: "user", content: "hi" }],
        maxOutputTokens: 100,
        temperature: 0.62,
      }),
    ).toThrow(/temperature/i);
  });

  it("computes cash cost from published Go prices including cache lines", () => {
    expect(
      opencodeGoCashCostUsd({
        inputTokens: 200_000,
        outputTokens: 500_000,
        cachedInputTokens: 50_000,
        cacheWriteTokens: 100_000,
      }),
    ).toBeCloseTo(0.268, 9);
    expect(
      opencodeGoCashCostUsd({
        inputTokens: 300_000,
        outputTokens: 1_000_000,
      }),
    ).toBeCloseTo(0.81, 9);
    expect(opencodeGoCashCostUsd(null)).toBeNull();
  });

  it("records cache and cash metrics in the shared ledger shape", () => {
    const logs: string[] = [];
    const metrics = opencodeGoUsageMetrics(
      {
        inputTokens: 200_000,
        outputTokens: 0,
        cachedInputTokens: 100_000,
        cacheWriteTokens: 0,
      },
      { label: "site-copy", logger: (line) => logs.push(String(line)) },
    );
    expect(metrics.cacheHitPercent).toBe(50);
    expect(metrics.cost).toBeCloseTo(0.011, 9);
    expect(metrics.costSource).toBe("computed-from-published-prices");
    expect(logs[0]).toContain("opencode_go_cache");
    expect(logs[0]).toContain("label=site-copy");
  });

  it("maps chat image parts to neutral Responses image parts", () => {
    expect(
      responsesImagePart({
        type: "image_url",
        image_url: { url: imageUrl, detail: "high" },
      }),
    ).toEqual({ type: "image", url: imageUrl, detail: "high" });
    expect(() =>
      responsesImagePart({
        type: "image_url",
        image_url: { url: "https://example.invalid/x.png" },
      }),
    ).toThrow();
  });

  it("builds author and site-copy Responses requests without OpenRouter fields", () => {
    const authorRequest = buildAuthorResponsesRequest({
      systemPrompt: "sys",
      routePrompt: "route",
      stagePrompt: "stage",
      imageParts: [{ type: "image", url: imageUrl, detail: "high" }],
      stageMaxTokens: 48_000,
      effort: "xhigh",
      schema: { type: "object" },
      sessionId: "s",
    });
    expect(
      authorRequest.messages[1].content.map((part: any) => part.type),
    ).toEqual(["text", "image", "text", "text"]);
    expect(authorRequest.outputFormat).toEqual({
      type: "json-schema",
      name: "launchloom_production_author_stage",
      schema: { type: "object" },
    });
    expect(authorRequest.temperature).toBeUndefined();
    const siteRequest = buildSiteCopyResponsesRequest({
      systemPrompt: "sys",
      userPrompt: "user",
      maxOutputTokens: 8192,
      effort: "medium",
      sessionId: "s",
    });
    expect(siteRequest.outputFormat).toEqual({ type: "json" });
    expect(siteRequest.reasoning).toEqual({ effort: "medium" });
    expect(siteRequest.temperature).toBeUndefined();
  });

  it("routes site copy through Go Responses and records cash usage", async () => {
    vi.stubEnv("SITE_COPY_PROVIDER", "opencode-go");
    vi.stubEnv("OPENCODE_GO_API_KEY", "test-go-key");
    const fetchMock = vi.fn(
      async (_input?: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            status: "completed",
            output: [
              {
                type: "message",
                role: "assistant",
                status: "completed",
                content: [
                  {
                    type: "output_text",
                    text: JSON.stringify(goCandidate()),
                  },
                ],
              },
            ],
            usage: {
              input_tokens: 1000,
              output_tokens: 200,
              input_tokens_details: {
                cached_tokens: 100,
                cache_write_tokens: 700,
              },
              output_tokens_details: { reasoning_tokens: 20 },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const config = await generateSiteConfigWithModel({
      businessName: "Willow & Fern Garden Care",
      industry: "home-services",
      services: "Garden maintenance, Seasonal planting",
      primaryCity: "Portland, OR",
      phone: "(503) 555-0111",
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("https://opencode.ai/inference/go/v1/responses");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-go-key");
    expect(headers["x-opencode-session"]).toContain("launchloom:");
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("gpt-6-luna");
    expect(body.reasoning).toEqual({ effort: "medium" });
    expect(body.text.format).toEqual({ type: "json_object" });
    expect(body.max_output_tokens).toBe(8192);
    expect(body.temperature).toBeUndefined();
    expect(body.store).toBe(false);
    expect(Array.isArray(body.input)).toBe(true);
    expect(config.business.name).toBe("Willow & Fern Garden Care");
    const usage = getSiteConfigUsageRecords().filter(
      (record: any) => record.label === "site-copy",
    );
    expect(usage.length).toBeGreaterThan(0);
    const last = usage.at(-1) as any;
    expect(last.model).toBe("openai/gpt-6-luna");
    expect(last.usage.inputTokens).toBe(1000);
    expect(last.usage.provider).toBe("opencode-go");
    expect(last.usage.costSource).toBe("computed-from-published-prices");
    expect(last.usage.cost).toBeCloseTo(0.0002085, 9);
  });

  it("prices Go site-copy records in the shared cost summary", () => {
    const summary: any = summarizeGenerationCosts({
      siteConfigUsage: {
        records: [
          {
            label: "site-copy",
            model: "openai/gpt-6-luna",
            usage: {
              inputTokens: 1000,
              outputTokens: 200,
              cachedInputTokens: 100,
              cacheWriteTokens: 700,
              provider: "opencode-go",
              cost: 0.0002085,
              costSource: "computed-from-published-prices",
            },
          },
        ],
      },
    });
    const stage = summary.stages.find(
      (entry: any) => entry.stage === "site_config",
    );
    expect(stage.provider).toBe("opencode-go");
    expect(stage.costUsd).toBeCloseTo(0.000209, 9);
    expect(stage.costKind).toBe("actual");
    expect(stage.complete).toBe(true);
    expect(stage.detail.promptTokens).toBe(1000);
    expect(stage.detail.completionTokens).toBe(200);
  });
});

describe("author CLI provider selection gates", () => {
  const scriptPath = path.resolve("scripts/author-production-experiences.mjs");

  it("requires OPENCODE_GO_API_KEY when the Go provider is selected", () => {
    const {
      OPENROUTER_API_KEY: _router,
      OPENCODE_GO_API_KEY: _go,
      ...rest
    } = process.env;
    const result = spawnSync(
      process.execPath,
      [scriptPath, "--config", "unused.json", "--inspiration", "unused.json"],
      {
        env: { ...rest, CREATIVE_EXPERIENCE_PROVIDER: "opencode-go" },
        encoding: "utf8",
      },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("OPENCODE_GO_API_KEY is required");
  });

  it("rejects an unknown provider explicitly", () => {
    const result = spawnSync(process.execPath, [scriptPath], {
      env: { ...process.env, CREATIVE_EXPERIENCE_PROVIDER: "bogus" },
      encoding: "utf8",
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "Unsupported CREATIVE_EXPERIENCE_PROVIDER: bogus",
    );
  });
});

describe("opencode go deepseek wire models", () => {
  it("maps the reviewed DeepSeek logical models to their wire ids", async () => {
    const module = await import("../scripts/opencode-go.mjs");
    expect(module.opencodeGoWireModel("opencode-go/deepseek-v4.1-flash")).toBe(
      "deepseek-v4.1-flash",
    );
    expect(module.opencodeGoWireModel("deepseek-v4.1-flash")).toBe(
      "deepseek-v4.1-flash",
    );
    expect(module.opencodeGoWireModel("opencode-go/deepseek-v4-pro")).toBe(
      "deepseek-v4-pro",
    );
    const profile = module.opencodeGoResponsesProfile({
      logicalModel: "opencode-go/deepseek-v4.1-flash",
    });
    expect(profile.model).toBe("deepseek-v4.1-flash");
    expect(profile.capabilities.outputFormats).toContain("json-schema");
  });
});

describe("creative lane Go transport retries", () => {
  const completedResponse = () =>
    new Response(
      JSON.stringify({
        id: "resp_retry",
        status: "completed",
        output: [
          {
            type: "message",
            role: "assistant",
            status: "completed",
            content: [{ type: "output_text", text: "{\"ok\":true}" }],
          },
        ],
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );

  it("retries transient provider errors with backoff", async () => {
    const module = await import("../scripts/creative-lane-inference.mjs");
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      if (calls < 3)
        return new Response(JSON.stringify({ error: { message: "upstream" } }), {
          status: 503,
          headers: { "content-type": "application/json" },
        });
      return completedResponse();
    };
    const result = await module.completeGoCreative({
      logicalModel: "opencode-go/deepseek-v4.1-flash",
      request: module.buildGoCreativeRequest({
        systemPrompt: "Return JSON.",
        userContent: [{ type: "text", text: "Say ok." }],
        schemaName: "probe",
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["ok"],
          properties: { ok: { type: "boolean" } },
        },
        maxOutputTokens: 100,
        sessionId: "launchloom:test-session",
      }),
      fetchImpl: fetchImpl as typeof fetch,
      env: { OPENCODE_GO_API_KEY: "test-go-key" },
      retryDelayMs: 0,
    });
    expect(result.status).toBe("completed");
    expect(calls).toBe(3);
  });

  it("does not retry authentication failures", async () => {
    const module = await import("../scripts/creative-lane-inference.mjs");
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return new Response(JSON.stringify({ error: { message: "unauthorized" } }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    };
    await expect(
      module.completeGoCreative({
        logicalModel: "opencode-go/deepseek-v4.1-flash",
        request: module.buildGoCreativeRequest({
          systemPrompt: "Return JSON.",
          userContent: [{ type: "text", text: "Say ok." }],
          schemaName: "probe",
          schema: { type: "object", additionalProperties: false, required: ["ok"], properties: { ok: { type: "boolean" } } },
          maxOutputTokens: 100,
          sessionId: "launchloom:test-session",
        }),
        fetchImpl: fetchImpl as typeof fetch,
        env: { OPENCODE_GO_API_KEY: "test-go-key" },
        retryDelayMs: 0,
      }),
    ).rejects.toThrow(/OpenCode Go error/u);
    expect(calls).toBe(1);
  });
});
