import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildInferenceRequest,
  inferenceCompletion,
  normalizeInferenceResponse,
  postInferenceJson,
  requireCompletedInference,
  validateInferenceProfile,
} from "../scripts/inference-client.mjs";
import { openRouterChatCompletion } from "../scripts/openrouter-client.mjs";
import { loadReferenceDossier } from "../scripts/reference-dossier.mjs";

const protocols = ["chat-completions", "responses", "messages"] as const;
const image = "data:image/png;base64,aW1hZ2U=";
const schema = {
  type: "object",
  additionalProperties: false,
  required: ["source"],
  properties: { source: { type: "string" } },
};
const profileFor = (protocol: string): any => ({
  provider: "fixture-provider",
  model: "fixture-model",
  protocol,
  endpoint: `https://fixture.invalid/v1/${protocol === "chat-completions" ? "chat/completions" : protocol}`,
  auth: protocol === "messages" ? "api-key" : "bearer",
  userAgent: "launchloom-fixture/1.0",
  sessionHeader: "x-opencode-session",
  capabilities: {
    images: true,
    imageDetail: protocol !== "messages",
    temperature: true,
    maxOutputTokens: 48_000,
    outputFormats:
      protocol === "messages"
        ? ["text", "json-schema"]
        : ["text", "json", "json-schema"],
    ...(protocol === "chat-completions"
      ? { completionTokenField: "max_completion_tokens" }
      : {}),
    reasoning: {
      mode: protocol === "messages" ? "adaptive" : "effort",
      efforts: ["low", "high"],
    },
  },
});
const requestFor = (): any => ({
  messages: [
    {
      role: "system",
      content: "Source identity is internal evidence, never visitor copy.",
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: "Retain the assigned design and both image roles.",
        },
        { type: "image", url: image },
        { type: "image", url: image },
      ],
    },
  ],
  maxOutputTokens: 48_000,
  outputFormat: { type: "json-schema", name: "source_stage", schema },
  reasoning: { effort: "high" },
  sessionId: "launchloom:fixture:stable",
});
const completed = (
  protocol: string,
  bodyText = '{"source":"complete"}',
): any =>
  protocol === "chat-completions"
    ? {
        id: "fixture-response",
        choices: [
          {
            finish_reason: "stop",
            message: { role: "assistant", content: bodyText },
          },
        ],
      }
    : protocol === "responses"
      ? {
          id: "fixture-response",
          status: "completed",
          output: [
            {
              type: "message",
              role: "assistant",
              status: "completed",
              content: [
                { type: "output_text", text: bodyText, annotations: [] },
              ],
            },
          ],
        }
      : {
          id: "fixture-response",
          type: "message",
          role: "assistant",
          stop_reason: "end_turn",
          content: [{ type: "text", text: bodyText }],
        };

beforeEach(() =>
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Live network forbidden in inference tests");
    }),
  ),
);
afterEach(() => vi.unstubAllGlobals());

describe("provider-neutral request contracts", () => {
  it("serializes Responses assistant replay as plain text without input-only blocks", () => {
    const request = requestFor();
    request.messages.push({
      role: "assistant",
      content: [
        { type: "text", text: "First part. " },
        { type: "text", text: "Second part." },
      ],
    });
    request.messages.push({ role: "user", content: "Continue safely." });
    const wire = buildInferenceRequest(profileFor("responses"), request);
    expect(wire.body.input.at(-2)).toEqual({
      role: "assistant",
      content: "First part. Second part.",
    });
    expect(wire.body.input.at(-1).content).toEqual([
      { type: "input_text", text: "Continue safely." },
    ]);
  });
  it.each(protocols)(
    "serializes text, two images, schema, reasoning and full output allowance for %s",
    (protocol) => {
      const profile = profileFor(protocol);
      const request = requestFor();
      const before = structuredClone(request);
      const wire = buildInferenceRequest(profile, request);
      expect(request).toEqual(before);
      expect(wire.url).toBe(profile.endpoint);
      expect(wire.headers).toEqual({
        "Content-Type": "application/json",
        "User-Agent": "launchloom-fixture/1.0",
        "x-opencode-session": request.sessionId,
      });
      expect(wire.headers).not.toHaveProperty("Authorization");
      expect(wire.headers).not.toHaveProperty("x-api-key");
      expect(JSON.stringify(wire.body)).not.toMatch(
        /openrouter|session_id|prompt_cache|usage/,
      );
      if (protocol === "chat-completions") {
        expect(wire.body.max_completion_tokens).toBe(48_000);
        expect(wire.body.response_format.json_schema).toEqual({
          name: "source_stage",
          strict: true,
          schema,
        });
        expect(
          wire.body.messages[1].content.filter(
            (part: any) => part.type === "image_url",
          ),
        ).toHaveLength(2);
        expect(wire.body.reasoning_effort).toBe("high");
      } else if (protocol === "responses") {
        expect(wire.body.max_output_tokens).toBe(48_000);
        expect(wire.body.store).toBe(false);
        expect(wire.body.text.format).toEqual({
          type: "json_schema",
          name: "source_stage",
          strict: true,
          schema,
        });
        expect(
          wire.body.input[1].content.filter(
            (part: any) => part.type === "input_image",
          ),
        ).toHaveLength(2);
        expect(wire.body.reasoning).toEqual({ effort: "high" });
      } else {
        expect(wire.body.max_tokens).toBe(48_000);
        expect(wire.body.system[0].text).toBe(before.messages[0].content);
        expect(wire.body.messages).toHaveLength(1);
        expect(
          wire.body.messages[0].content.filter(
            (part: any) => part.type === "image",
          ),
        ).toEqual(
          Array(2).fill({
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: "aW1hZ2U=",
            },
          }),
        );
        expect(wire.body.output_config).toEqual({
          effort: "high",
          format: { type: "json_schema", schema },
        });
        expect(wire.body.thinking).toEqual({ type: "adaptive" });
      }
      request.outputFormat.schema.required.push("changed-after-preflight");
      expect(JSON.stringify(wire.body)).not.toContain(
        "changed-after-preflight",
      );
      request.outputFormat.schema.required.pop();
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each(protocols)(
    "preserves actual retained dossier text through %s without transformation",
    (protocol) => {
      const dossier = loadReferenceDossier(
        "data/reference-library/dossiers/web-architecture-studio-peake",
      );
      const request = requestFor();
      request.messages[1].content[0].text = dossier.designPrompt;
      const wire = buildInferenceRequest(profileFor(protocol), request);
      const messages =
        protocol === "responses" ? wire.body.input : wire.body.messages;
      const part = messages.at(-1).content[0];
      expect(part.text).toBe(dossier.designPrompt);
    },
  );

  it("supports explicit Chat max_tokens and schema-free JSON only where declared", () => {
    const profile = profileFor("chat-completions");
    profile.capabilities.completionTokenField = "max_tokens";
    const request = requestFor();
    request.outputFormat = { type: "json" };
    expect(buildInferenceRequest(profile, request).body).toMatchObject({
      max_tokens: 48_000,
      response_format: { type: "json_object" },
    });
    expect(() =>
      buildInferenceRequest(profileFor("messages"), request),
    ).toThrow(/output format/);
  });

  it("supports explicit Messages thinking budgets without consuming the entire output allowance", () => {
    const profile = profileFor("messages");
    profile.capabilities.reasoning = { mode: "budget" };
    const request = requestFor();
    request.reasoning = { budgetTokens: 1024 };
    expect(buildInferenceRequest(profile, request).body.thinking).toEqual({
      type: "enabled",
      budget_tokens: 1024,
    });
    request.reasoning.budgetTokens = request.maxOutputTokens;
    expect(() => buildInferenceRequest(profile, request)).toThrow(/leave room/);
  });

  it.each([
    [
      "ceiling",
      (profile: any) => {
        profile.capabilities.maxOutputTokens = 24_000;
      },
    ],
    [
      "images",
      (profile: any) => {
        profile.capabilities.images = false;
      },
    ],
    [
      "schema",
      (profile: any) => {
        profile.capabilities.outputFormats = ["text"];
      },
    ],
    [
      "effort",
      (_profile: any, request: any) => {
        request.reasoning.effort = "max";
      },
    ],
    [
      "temperature",
      (profile: any, request: any) => {
        profile.capabilities.temperature = false;
        request.temperature = 0.5;
      },
    ],
    [
      "tools",
      (_profile: any, request: any) => {
        request.tools = [{ type: "openrouter:web_search" }];
      },
    ],
    [
      "cache",
      (_profile: any, request: any) => {
        request.responseCache = true;
      },
    ],
    [
      "stream",
      (_profile: any, request: any) => {
        request.stream = true;
      },
    ],
    [
      "session",
      (_profile: any, request: any) => {
        delete request.sessionId;
      },
    ],
    [
      "headers",
      (_profile: any, request: any) => {
        request.sessionId = "session\r\nAuthorization: leaked";
      },
    ],
    [
      "remote-image",
      (_profile: any, request: any) => {
        request.messages[1].content[1].url = "https://source.example/photo.png";
      },
    ],
    [
      "invalid-image",
      (_profile: any, request: any) => {
        request.messages[1].content[1].url = "data:image/png;base64,x";
      },
    ],
    [
      "cache-marker",
      (_profile: any, request: any) => {
        request.messages[1].content[0].prompt_cache_breakpoint = {
          mode: "explicit",
        };
      },
    ],
    [
      "tool-replay",
      (_profile: any, request: any) => {
        request.messages.push({ role: "tool", content: "hidden" });
      },
    ],
    [
      "system-reordering",
      (_profile: any, request: any) => {
        request.messages.push({
          role: "system",
          content: "late system message",
        });
      },
    ],
  ])(
    "rejects unsupported %s before transport without silent weakening",
    (_label, mutate) => {
      const profile = profileFor("chat-completions");
      const request = requestFor();
      mutate(profile, request);
      expect(() => buildInferenceRequest(profile, request)).toThrow();
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("does not drop image detail during Messages translation", () => {
    const request = requestFor();
    request.messages[1].content[1].detail = "high";
    expect(() =>
      buildInferenceRequest(profileFor("messages"), request),
    ).toThrow(/detail/);
    expect(
      buildInferenceRequest(profileFor("responses"), request).body.input[1]
        .content[1].detail,
    ).toBe("high");
  });

  it.each([
    "http://fixture.invalid/v1/responses",
    "https://credential:secret@fixture.invalid/v1/responses",
    "https://fixture.invalid/v1/responses?key=secret",
    "https://fixture.invalid/v1/responses#secret",
    "https://fixture.invalid/v1/messages",
  ])("rejects unsafe or mismatched endpoint %s", (endpoint) => {
    expect(() =>
      validateInferenceProfile({ ...profileFor("responses"), endpoint }),
    ).toThrow();
  });
  it("prevents a session header from overwriting auth", () => {
    expect(() =>
      validateInferenceProfile({
        ...profileFor("messages"),
        sessionHeader: "x-api-key",
      }),
    ).toThrow(/authentication/);
  });
});

describe("provider-neutral response states", () => {
  it.each(protocols)(
    "normalizes a complete %s response with explicit provenance and missing cost",
    (protocol) => {
      const result = normalizeInferenceResponse(
        profileFor(protocol),
        completed(protocol),
      );
      expect(result).toMatchObject({
        status: "completed",
        provider: "fixture-provider",
        model: "fixture-model",
        id: "fixture-response",
        usage: {
          inputTokens: null,
          outputTokens: null,
          costUsd: null,
          costKind: "unreported",
        },
      });
      expect(requireCompletedInference(result)).toBe('{"source":"complete"}');
    },
  );
  it.each(protocols)(
    "never exposes partial %s source as a complete answer",
    (protocol) => {
      const payload = completed(protocol, "partial source");
      if (protocol === "chat-completions")
        payload.choices[0].finish_reason = "length";
      else if (protocol === "responses") {
        payload.status = "incomplete";
        payload.incomplete_details = { reason: "max_output_tokens" };
      } else payload.stop_reason = "max_tokens";
      const result = normalizeInferenceResponse(profileFor(protocol), payload);
      expect(result.status).toBe("incomplete");
      expect(result.text).toBe("");
      expect(() => requireCompletedInference(result)).toThrow(/incomplete/);
    },
  );
  it.each(protocols)(
    "normalizes %s refusals without returning visitor-visible refusal prose",
    (protocol) => {
      const payload = completed(protocol);
      if (protocol === "chat-completions")
        payload.choices[0].message.refusal = "private refusal details";
      else if (protocol === "responses")
        payload.output[0].content = [
          { type: "refusal", refusal: "private refusal details" },
        ];
      else payload.stop_reason = "refusal";
      const result = normalizeInferenceResponse(profileFor(protocol), payload);
      expect(result.status).toBe("refused");
      expect(result.text).toBe("");
      expect(JSON.stringify(result)).not.toContain("private refusal");
    },
  );
  it.each(protocols)(
    "distinguishes %s tool work from a complete text reply",
    (protocol) => {
      const payload = completed(protocol);
      if (protocol === "chat-completions")
        payload.choices[0].message.tool_calls = [{ id: "call1" }];
      else if (protocol === "responses")
        payload.output.push({ type: "function_call", call_id: "call1" });
      else payload.content.push({ type: "tool_use", id: "call1" });
      expect(
        normalizeInferenceResponse(profileFor(protocol), payload).status,
      ).toBe("requires-action");
    },
  );
  it("keeps thinking/reasoning out of visible output but retains citations on visible text", () => {
    const payload = completed("messages");
    payload.content.unshift({
      type: "thinking",
      thinking: "private hidden reasoning",
      signature: "opaque",
    });
    payload.content[1].citations = [
      {
        type: "web_search_result_location",
        url: "https://example.test/source",
      },
    ];
    const result = normalizeInferenceResponse(profileFor("messages"), payload);
    expect(result.text).toBe('{"source":"complete"}');
    expect(result.annotations).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain("hidden reasoning");
    const response = completed("responses");
    response.output.unshift({
      type: "reasoning",
      summary: [{ text: "private hidden reasoning" }],
    });
    expect(
      normalizeInferenceResponse(profileFor("responses"), response).text,
    ).toBe(result.text);
  });
  it("normalizes cache usage without fabricating cost and counts Messages cached inputs separately", () => {
    const messages = completed("messages");
    messages.usage = {
      input_tokens: 10,
      output_tokens: 5,
      cache_read_input_tokens: 100,
      cache_creation_input_tokens: 20,
    };
    expect(
      normalizeInferenceResponse(profileFor("messages"), messages).usage,
    ).toEqual({
      inputTokens: 130,
      outputTokens: 5,
      cachedInputTokens: 100,
      cacheWriteTokens: 20,
      reasoningTokens: null,
      costUsd: null,
      costKind: "unreported",
    });
    const responses = completed("responses");
    responses.usage = {
      input_tokens: 130,
      output_tokens: 5,
      input_tokens_details: { cached_tokens: 100 },
      output_tokens_details: { reasoning_tokens: 2 },
      cost: 0,
    };
    expect(
      normalizeInferenceResponse(profileFor("responses"), responses).usage,
    ).toMatchObject({
      inputTokens: 130,
      cachedInputTokens: 100,
      reasoningTokens: 2,
      costUsd: 0,
      costKind: "provider-reported",
    });
  });
  it.each([
    [401, "authentication"],
    [403, "authentication"],
    [402, "quota"],
    [429, "rate-limit"],
    [408, "timeout"],
    [400, "invalid-request"],
    [503, "upstream"],
  ])(
    "normalizes HTTP %s without leaking provider payloads",
    (httpStatus, code) => {
      const result = normalizeInferenceResponse(
        profileFor("responses"),
        { error: { message: "PRIVATE_PROMPT_SECRET", type: "api_error" } },
        { httpStatus, headers: new Headers({ "Retry-After": "3600" }) },
      );
      expect(result).toMatchObject({
        status: "error",
        error: { code, httpStatus },
        retryAfterSeconds: 3600,
      });
      expect(JSON.stringify(result)).not.toContain("PRIVATE_PROMPT_SECRET");
    },
  );
  it.each([
    ["server_error", "upstream"],
    ["internal_error", "upstream"],
    ["upstream_error", "upstream"],
    ["overloaded", "upstream"],
  ])(
    "classifies a 400 provider %s code as a transient %s fault",
    (providerCode, expected) => {
      const result = normalizeInferenceResponse(
        profileFor("responses"),
        { error: { code: providerCode, type: providerCode } },
        { httpStatus: 400 },
      );
      expect(result).toMatchObject({
        status: "error",
        error: { code: expected, httpStatus: 400 },
      });
    },
  );
  it("preserves a quota error even with HTTP 200 and parses date Retry-After", () => {
    const result = normalizeInferenceResponse(
      profileFor("responses"),
      { error: { code: "insufficient_quota" } },
      {
        headers: new Headers({
          "Retry-After": "Mon, 12 Oct 2026 12:00:30 GMT",
        }),
        now: Date.parse("2026-10-12T12:00:00Z"),
      },
    );
    expect(result.error?.code).toBe("quota");
    expect(result.retryAfterSeconds).toBe(30);
  });
  it.each(protocols)(
    "fails closed on empty, malformed, unknown-state and unknown-output %s responses",
    (protocol) => {
      const profile = profileFor(protocol);
      for (const payload of [null, [], "string", {}, completed(protocol, "")])
        expect(normalizeInferenceResponse(profile, payload).status).toBe(
          "error",
        );
      const payload = completed(protocol);
      if (protocol === "chat-completions")
        payload.choices[0].finish_reason = "unknown";
      else if (protocol === "responses") payload.status = "in_progress";
      else payload.stop_reason = "unknown";
      expect(normalizeInferenceResponse(profile, payload).error?.code).toBe(
        "unknown-finish-state",
      );
      const unexpected = completed(protocol);
      if (protocol === "chat-completions")
        unexpected.choices[0].message.content = [{ type: "audio" }];
      else if (protocol === "responses")
        unexpected.output.push({ type: "computer_call" });
      else unexpected.content.push({ type: "document" });
      expect(normalizeInferenceResponse(profile, unexpected).error?.code).toBe(
        "unsupported-output-block",
      );
    },
  );
});

describe("explicit transport and OpenRouter compatibility", () => {
  it.each(protocols)(
    "calls an injected %s transport once with correct explicit auth, cancellation and no redirects",
    async (protocol) => {
      const controller = new AbortController();
      const fixtureTransport = vi.fn(async () =>
        Response.json(completed(protocol)),
      );
      const result = await inferenceCompletion({
        profile: profileFor(protocol),
        request: requestFor(),
        apiKey: "fixture-only-not-a-provider-credential",
        signal: controller.signal,
        fetchImpl: fixtureTransport,
      });
      expect(requireCompletedInference(result)).toBe('{"source":"complete"}');
      expect(fixtureTransport).toHaveBeenCalledTimes(1);
      const [, options] = fixtureTransport.mock.calls[0] as any;
      expect(options.signal).toBe(controller.signal);
      expect(options.redirect).toBe("error");
      expect(
        options.headers[
          protocol === "messages" ? "x-api-key" : "Authorization"
        ],
      ).toBe(
        protocol === "messages"
          ? "fixture-only-not-a-provider-credential"
          : "Bearer fixture-only-not-a-provider-credential",
      );
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it("validates capability and credentials before invoking the transport", async () => {
    const fixtureTransport = vi.fn();
    await expect(
      inferenceCompletion({
        profile: profileFor("responses"),
        request: requestFor(),
        apiKey: "",
        fetchImpl: fixtureTransport,
      }),
    ).rejects.toThrow(/credential/);
    await expect(
      inferenceCompletion({
        profile: profileFor("responses"),
        request: { ...requestFor(), maxOutputTokens: 48001 },
        apiKey: "fixture-only",
        fetchImpl: fixtureTransport,
      }),
    ).rejects.toThrow(/ceiling/);
    expect(fixtureTransport).not.toHaveBeenCalled();
  });
  it("freezes provider/model provenance across in-flight role changes", async () => {
    const profile = profileFor("responses");
    const transport = vi.fn(async () => {
      profile.provider = "different-provider";
      profile.model = "different-model";
      profile.protocol = "messages";
      return Response.json(completed("responses"));
    });
    const result = await inferenceCompletion({
      profile,
      request: requestFor(),
      apiKey: "fixture-only",
      fetchImpl: transport,
    });
    expect(result).toMatchObject({
      status: "completed",
      provider: "fixture-provider",
      model: "fixture-model",
      protocol: "responses",
    });
  });
  it("does not retry rate limits, change providers or read a key from process environment", async () => {
    const fixtureTransport = vi.fn(
      async () =>
        new Response("not-json-private-upstream-text", {
          status: 429,
          headers: { "Retry-After": "7200" },
        }),
    );
    const result = await inferenceCompletion({
      profile: profileFor("responses"),
      request: requestFor(),
      apiKey: "fixture-only",
      fetchImpl: fixtureTransport,
    });
    expect(result).toMatchObject({
      status: "error",
      error: { code: "rate-limit" },
      retryAfterSeconds: 7200,
    });
    expect(fixtureTransport).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("private-upstream");
  });
  it("handles cancellation before dispatch and transport failures without leaking exception text", async () => {
    const controller = new AbortController();
    controller.abort();
    const transport = vi.fn(async () => {
      throw new Error("PRIVATE_PROVIDER_OR_CREDENTIAL");
    });
    const cancelled = await inferenceCompletion({
      profile: profileFor("responses"),
      request: requestFor(),
      apiKey: "fixture-only",
      signal: controller.signal,
      fetchImpl: transport,
    });
    expect(cancelled.error?.code).toBe("cancelled");
    expect(transport).not.toHaveBeenCalled();
    const failed = await inferenceCompletion({
      profile: profileFor("responses"),
      request: requestFor(),
      apiKey: "fixture-only",
      fetchImpl: transport,
    });
    expect(failed.error?.code).toBe("transport");
    expect(transport).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(failed)).not.toContain("PRIVATE_PROVIDER");
  });
  it("preserves OpenRouter request bytes, headers, response identity and existing endpoint budget seam", async () => {
    const body = {
      model: "openai/gpt-6-luna",
      temperature: 0.62,
      reasoning: { effort: "xhigh", exclude: true },
      response_format: {
        type: "json_schema",
        json_schema: { name: "fixture", strict: true, schema },
      },
      max_completion_tokens: 48000,
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: image, detail: "high" } },
          ],
        },
      ],
      usage: { include: false },
    };
    const response = Response.json({ choices: [] });
    const fixtureTransport = vi.fn(async () => response);
    const signal = new AbortController().signal;
    expect(
      await openRouterChatCompletion({
        apiKey: "fixture-only",
        title: "Existing author",
        body,
        sessionId: "existing-session",
        responseCache: true,
        responseCacheTtlSeconds: 1200,
        signal,
        fetchImpl: fixtureTransport,
      }),
    ).toBe(response);
    const [url, options] = fixtureTransport.mock.calls[0] as any;
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(options).toEqual({
      method: "POST",
      signal,
      headers: {
        Authorization: "Bearer fixture-only",
        "Content-Type": "application/json",
        "X-OpenRouter-Title": "Existing author",
        "X-OpenRouter-Cache": "true",
        "X-OpenRouter-Cache-TTL": "1200",
      },
      body: JSON.stringify({ ...body, session_id: "existing-session" }),
    });
  });
  it("offers raw shared transport without imposing result normalization on legacy callers", async () => {
    const raw = new Response("provider-specific-envelope", { status: 400 });
    const fixtureTransport = vi.fn(async () => raw);
    expect(
      await postInferenceJson({
        url: "https://fixture.invalid/v1/chat/completions",
        headers: { "Content-Type": "application/json" },
        body: { model: "existing" },
        fetchImpl: fixtureTransport,
      }),
    ).toBe(raw);
  });
});
