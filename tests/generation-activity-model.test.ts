import { describe, expect, it } from "vitest";
import {
  observeModelCall,
  toTraceUsage,
  traceDecimal,
} from "../scripts/generation-activity-model.mjs";
import { completeGeneration } from "../scripts/generation-inference.mjs";
import type { TraceContext } from "../src/lib/generation-activity";
import type {
  InferenceProfile,
  InferenceRequest,
} from "../scripts/inference-client.mjs";

const profile: InferenceProfile = {
  provider: "opencode-go",
  model: "deepseek-v4.1-flash",
  protocol: "chat-completions",
  endpoint: "https://example.test/v1/chat/completions",
  auth: "bearer",
  capabilities: {
    maxOutputTokens: 1_024,
    outputFormats: ["text"],
    completionTokenField: "max_tokens",
  },
};

const request: InferenceRequest = {
  messages: [{ role: "user", content: "hello" }],
  maxOutputTokens: 64,
};

type Captured = { kind: string; payload: Record<string, unknown>; context: TraceContext };

function capture() {
  const events: Captured[] = [];
  const producer = {
    emit(kind: string, payload: Record<string, unknown>) {
      events.push({ kind, payload, context: {} as TraceContext });
      return true;
    },
    withContext(context: Partial<TraceContext>) {
      return {
        emit(kind: string, payload: Record<string, unknown>) {
          events.push({ kind, payload, context: context as TraceContext });
          return true;
        },
        flush: async () => {},
        close: async () => {},
        stats: () => ({}),
        context: () => context,
      };
    },
  };
  return { producer: producer as never, events };
}

function chatPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: "chatcmpl-1",
    choices: [
      { message: { role: "assistant", content: "Hello from the model." }, finish_reason: "stop" },
    ],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 5,
      prompt_tokens_details: { cached_tokens: 3 },
      completion_tokens_details: { reasoning_tokens: 2 },
    },
    ...overrides,
  };
}

function response(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("model activity instrumentation", () => {
  it("records the dispatch before the response and output after it", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { producer, events } = capture();
    const pending = completeGeneration({
      inference: {
        profile,
        apiKey: "synthetic",
        request,
        fetchImpl: async () => {
          await gate;
          return response(chatPayload());
        },
      },
      activity: { producer, context: { stage: "authoring" } },
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(events.map((event) => event.kind)).toEqual(["model_started"]);
    release();
    await pending;
    expect(events.map((event) => event.kind)).toEqual([
      "model_started",
      "model_finished",
      "output",
      "usage",
    ]);
    expect(events[0]?.payload).toMatchObject({
      provider: "opencode-go",
      model: "deepseek-v4.1-flash",
    });
    expect(events[1]?.payload).toMatchObject({ status: "completed" });
    expect(events[2]?.payload).toMatchObject({
      message: { kind: "text", text: "Hello from the model." },
    });
    expect(events[3]?.payload).toMatchObject({
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        cachedInputTokens: 3,
        reasoningTokens: 2,
        costKind: "unreported",
      },
    });
    expect(events[0]?.context).toMatchObject({
      stage: "authoring",
      actor: { kind: "model" },
    });
  });

  it("maps a provider-reported cost to an exact actual decimal", async () => {
    const { producer, events } = capture();
    await completeGeneration({
      inference: {
        profile,
        apiKey: "synthetic",
        request,
        fetchImpl: async () =>
          response(chatPayload({ usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.0012345678 } })),
      },
      activity: { producer },
    });
    expect(events.find((event) => event.kind === "usage")?.payload).toMatchObject({
      usage: { costUsd: "0.00123457", costKind: "actual" },
    });
  });

  it("keeps missing usage unknown rather than zero", async () => {
    const { producer, events } = capture();
    await completeGeneration({
      inference: {
        profile,
        apiKey: "synthetic",
        request,
        fetchImpl: async () =>
          response({ id: "x", choices: [
          { message: { role: "assistant", content: "ok" }, finish_reason: "stop" },
        ] }),
      },
      activity: { producer },
    });
    expect(events.find((event) => event.kind === "usage")?.payload).toMatchObject({
      usage: {
        inputTokens: null,
        outputTokens: null,
        costUsd: null,
        costKind: "unreported",
      },
    });
  });

  it("reports a provider error as an error without inventing output", async () => {
    const { producer, events } = capture();
    await completeGeneration({
      inference: {
        profile,
        apiKey: "synthetic",
        request,
        fetchImpl: async () =>
          new Response(JSON.stringify({ error: { type: "rate_limit", message: "slow down" } }), {
            status: 429,
            headers: { "content-type": "application/json" },
          }),
      },
      activity: { producer },
    });
    expect(events.find((event) => event.kind === "model_finished")?.payload).toMatchObject({
      status: "error",
    });
    expect(events.some((event) => event.kind === "output")).toBe(false);
  });

  it("records a transport failure without leaking the underlying error", async () => {
    const { producer, events } = capture();
    const completion = await completeGeneration({
      inference: {
        profile,
        apiKey: "synthetic",
        request,
        fetchImpl: async () => {
          throw new Error("boom token=supersecretvalue");
        },
      },
      activity: { producer },
    });
    expect(completion.result.status).toBe("error");
    const error = events.find((event) => event.kind === "error");
    expect(error?.payload).toMatchObject({ scope: "model", code: "transport" });
    expect(JSON.stringify(error)).not.toContain("supersecretvalue");
  });

  it("rethrows a caller-side failure after recording it", async () => {
    const { producer, events } = capture();
    const failure = Object.assign(new Error("synthetic failure"), {
      code: "provider_down",
    });
    await expect(
      observeModelCall({
        producer,
        provider: "opencode-go",
        model: "deepseek-v4.1-flash",
        invoke: async () => {
          throw failure;
        },
      }),
    ).rejects.toBe(failure);
    expect(events.map((event) => event.kind)).toEqual([
      "model_started",
      "model_finished",
      "error",
    ]);
    expect(events.find((event) => event.kind === "error")?.payload).toMatchObject({
      scope: "model",
      code: "provider_down",
    });
  });

  it("gives each separately dispatched retry its own call ID", async () => {
    const { producer, events } = capture();
    const calls = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
    for (const callId of calls)
      await observeModelCall({
        producer,
        provider: "opencode-go",
        model: "deepseek-v4.1-flash",
        callId,
        invoke: async () => ({ status: "completed", text: "x", usage: null }),
      });
    expect(
      events
        .filter((event) => event.kind === "usage")
        .map((event) => event.payload.callId),
    ).toEqual(calls);
  });

  it("does not throw when provider labels are not contract-safe", async () => {
    const { producer } = capture();
    await expect(
      observeModelCall({
        producer,
        provider: "OpenCode Go!",
        model: "model with spaces",
        invoke: async () => ({ status: "completed", text: "", usage: null }),
      }),
    ).resolves.toBeTruthy();
  });

  it("works without a producer", async () => {
    let called = 0;
    await expect(
      observeModelCall({
        producer: null,
        provider: "opencode-go",
        model: "m",
        invoke: async () => {
          called += 1;
          return "value";
        },
      }),
    ).resolves.toBe("value");
    expect(called).toBe(1);
  });

  it("formats exact decimals without exponent notation", () => {
    expect(traceDecimal(0)).toBe("0");
    expect(traceDecimal(0.25)).toBe("0.25");
    expect(traceDecimal(0.000000001)).toBe("0");
    expect(traceDecimal(-1)).toBeNull();
    expect(traceDecimal(Number.NaN)).toBeNull();
    expect(toTraceUsage({ inputTokens: 0, outputTokens: 0 })).toMatchObject({
      inputTokens: 0,
      outputTokens: 0,
    });
    expect(toTraceUsage(null)).toMatchObject({
      inputTokens: null,
      costKind: "unreported",
    });
  });
});
