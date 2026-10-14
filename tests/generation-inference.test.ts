import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  completeGeneration,
  GenerationInferenceError,
  parseGenerationOutput,
} from "../scripts/generation-inference.mjs";
import { createInferenceAuthorAdapter } from "../scripts/author-inference-adapter.mjs";

beforeEach(() =>
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Live provider network forbidden");
    }),
  ),
);
afterEach(() => vi.unstubAllGlobals());

const source = {
  stage: "experience",
  designContract: "",
  designRationale: "",
  content:
    "export default function Experience() { return <section>Retained source</section>; }",
};
const chat = (value = source, finish = "stop") => ({
  choices: [
    {
      finish_reason: finish,
      message: { role: "assistant", content: JSON.stringify(value) },
    },
  ],
  usage: { prompt_tokens: 10, completion_tokens: 20 },
});
const legacyOptions = (payload: any = chat()) => ({
  body: {
    model: "openai/gpt-6-luna",
    messages: [{ role: "user", content: "Exact author prompt" }],
    max_completion_tokens: 48000,
  },
  apiKey: "fixture-only",
  fetchImpl: vi.fn(async () => Response.json(payload)),
});
const neutralOptions = (
  protocol: "chat-completions" | "responses" | "messages",
  stage: string = "experience",
): any => ({
  profile: {
    provider: "offline-fixture",
    model: "fixture-model",
    protocol,
    endpoint: `https://fixture.invalid/v1/${protocol === "chat-completions" ? "chat/completions" : protocol}`,
    auth: protocol === "messages" ? "api-key" : "bearer",
    capabilities: {
      maxOutputTokens: 48000,
      outputFormats: ["text", "json-schema"],
      ...(protocol === "chat-completions"
        ? { completionTokenField: "max_completion_tokens" }
        : {}),
    },
  },
  request: {
    maxOutputTokens: 48000,
    messages: [
      { role: "system", content: "Keep factual and source gates" },
      { role: "user", content: `Exact ${stage} prompt` },
    ],
    outputFormat: {
      type: "json-schema",
      name: "author_stage",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["stage", "content"],
        properties: { stage: { type: "string" }, content: { type: "string" } },
      },
    },
  },
  apiKey: "fixture-only",
});

describe("generation caller boundary", () => {
  it("retains legacy request transport and envelope alongside normalized provenance", async () => {
    const options = legacyOptions();
    const completion = await completeGeneration({ openRouter: options });
    expect(options.fetchImpl).toHaveBeenCalledOnce();
    expect((options.fetchImpl.mock.calls[0] as any)[0]).toBe(
      "https://openrouter.ai/api/v1/chat/completions",
    );
    expect(
      JSON.parse((options.fetchImpl.mock.calls[0] as any)[1].body),
    ).toEqual({ ...options.body, usage: { include: true } });
    expect(completion.legacy.payload).toEqual(chat());
    expect(completion.result).toMatchObject({
      provider: "openrouter",
      model: options.body.model,
      protocol: "chat-completions",
      status: "completed",
      usage: { inputTokens: 10, outputTokens: 20, costUsd: null },
    });
    expect(parseGenerationOutput(completion)).toEqual(source);
    expect(fetch).not.toHaveBeenCalled();
  });

  for (const protocol of [
    "chat-completions",
    "responses",
    "messages",
  ] as const) {
    it.each([
      "contract",
      "experience",
      "service",
      "location",
      "service-index",
      "styles",
      "motion",
    ])(
      `parses %s via ${protocol} without a fabricated OpenRouter envelope`,
      async (stage) => {
        const options = neutralOptions(protocol, stage);
        const value = { ...source, stage };
        const text = JSON.stringify(value);
        options.fetchImpl = vi.fn(async () =>
          Response.json(
            protocol === "chat-completions"
              ? chat(value)
              : protocol === "responses"
                ? {
                    status: "completed",
                    output: [
                      {
                        type: "message",
                        role: "assistant",
                        status: "completed",
                        content: [{ type: "output_text", text }],
                      },
                    ],
                  }
                : {
                    type: "message",
                    role: "assistant",
                    stop_reason: "end_turn",
                    content: [{ type: "text", text }],
                  },
          ),
        );
        const completion = await completeGeneration({ inference: options });
        expect(completion.legacy).toBeNull();
        expect(completion.result).toMatchObject({
          provider: "offline-fixture",
          model: "fixture-model",
          protocol,
          status: "completed",
          usage: { costUsd: null, costKind: "unreported" },
        });
        expect(parseGenerationOutput(completion)).toEqual(value);
        const sent = JSON.parse(options.fetchImpl.mock.calls[0][1].body);
        expect(
          sent.max_output_tokens ||
            sent.max_completion_tokens ||
            sent.max_tokens,
        ).toBe(48000);
        expect(JSON.stringify(sent)).toContain(`Exact ${stage} prompt`);
        expect(fetch).not.toHaveBeenCalled();
      },
    );
  }

  it.each(["length", "content_filter", "tool_calls", "unknown"])(
    "rejects %s even when the legacy body contains complete parseable JSON",
    async (finish) => {
      const completion = await completeGeneration({
        openRouter: legacyOptions(chat(source, finish)),
      });
      expect(() => parseGenerationOutput(completion)).toThrow(
        /did not complete/,
      );
    },
  );
  it("rejects a provider refusal even when source-looking text is also present", async () => {
    const payload: any = chat();
    payload.choices[0].message.refusal = "Private refusal details";
    const completion = await completeGeneration({
      openRouter: legacyOptions(payload),
    });
    expect(completion.result.status).toBe("refused");
    expect(() => parseGenerationOutput(completion)).toThrow(/did not complete/);
    expect(JSON.stringify(completion.result)).not.toContain("Private refusal");
  });
  it("keeps invalid JSON envelope diagnostics without allowing parsing", async () => {
    const options = legacyOptions();
    options.fetchImpl = vi.fn(async () => new Response("non-json upstream"));
    const completion = await completeGeneration({ openRouter: options });
    expect(completion.legacy.rawBody).toBe("non-json upstream");
    expect(completion.legacy.parseError).toBeInstanceOf(Error);
    expect(completion.result.status).toBe("error");
    expect(() => parseGenerationOutput(completion)).toThrow();
    try {
      parseGenerationOutput(completion);
    } catch (error) {
      expect(error).toBeInstanceOf(GenerationInferenceError);
      expect((error as GenerationInferenceError).result).toMatchObject({
        status: "error",
        text: "",
        annotations: [],
      });
    }
  });
  it("preserves quota state and Retry-After for neutral orchestration without retries", async () => {
    const options = neutralOptions("responses");
    options.fetchImpl = vi.fn(async () =>
      Response.json(
        { error: { code: "insufficient_quota" } },
        { status: 429, headers: { "Retry-After": "3600" } },
      ),
    );
    const completion = await completeGeneration({ inference: options });
    expect(completion.result).toMatchObject({
      status: "error",
      error: { code: "quota" },
      retryAfterSeconds: 3600,
    });
    expect(options.fetchImpl).toHaveBeenCalledOnce();
    expect(() => parseGenerationOutput(completion)).toThrow();
    try {
      parseGenerationOutput(completion);
    } catch (error) {
      expect((error as GenerationInferenceError).result).toMatchObject({
        error: { code: "quota" },
        retryAfterSeconds: 3600,
      });
    }
  });
  it("requires one explicit transport and never chooses a target from environment", async () => {
    await expect(completeGeneration({} as any)).rejects.toThrow(/exactly one/);
    await expect(
      completeGeneration({
        openRouter: legacyOptions(),
        inference: neutralOptions("responses"),
      } as any),
    ).rejects.toThrow(/exactly one/);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("neutral author adapter invariants", () => {
  it("rejects a lowered stage budget before dispatch", async () => {
    const options = neutralOptions("responses");
    const transport = vi.fn();
    const generate = createInferenceAuthorAdapter({
      ...options,
      fetchImpl: transport,
      prepareRequest: () => ({ ...options.request, maxOutputTokens: 24000 }),
    });
    await expect(generate({ stage: "experience" })).rejects.toThrow(
      /stage budget/,
    );
    expect(transport).not.toHaveBeenCalled();
  });
  it("requires schema mode and a known author stage", async () => {
    const options = neutralOptions("responses");
    const transport = vi.fn();
    const generate = createInferenceAuthorAdapter({
      ...options,
      fetchImpl: transport,
      prepareRequest: () => ({
        ...options.request,
        outputFormat: { type: "text" },
      }),
    });
    await expect(generate({ stage: "experience" })).rejects.toThrow(
      /schema output/,
    );
    await expect(generate({ stage: "constructor" })).rejects.toThrow(
      /Unknown authoring stage/,
    );
    expect(transport).not.toHaveBeenCalled();
  });
  it("freezes its configured profile and retains cancellation without provider fallback", async () => {
    const options = neutralOptions("responses");
    const controller = new AbortController();
    const transport = vi.fn();
    const generate = createInferenceAuthorAdapter({
      ...options,
      signal: controller.signal,
      fetchImpl: transport,
      prepareRequest: () => options.request,
    });
    options.profile.model = "different-model";
    options.profile.endpoint = "https://different.invalid/v1/responses";
    controller.abort();
    await expect(generate({ stage: "experience" })).rejects.toThrow(
      /did not complete/,
    );
    expect(transport).not.toHaveBeenCalled();
  });
  it("blocks parseable but truncated source before the author engine can use it", async () => {
    const options = neutralOptions("responses");
    const transport = vi.fn(async () =>
      Response.json({
        status: "incomplete",
        output: [
          {
            type: "message",
            role: "assistant",
            status: "incomplete",
            content: [{ type: "output_text", text: JSON.stringify(source) }],
          },
        ],
      }),
    );
    const generate = createInferenceAuthorAdapter({
      ...options,
      fetchImpl: transport,
      prepareRequest: () => options.request,
    });
    await expect(generate({ stage: "experience" })).rejects.toThrow(
      /incomplete/,
    );
    expect(transport).toHaveBeenCalledOnce();
  });
});
