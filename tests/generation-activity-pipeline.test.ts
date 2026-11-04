import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { observePipelineAction } from "../scripts/generation-activity-action.mjs";
import { finalizeGenerationActivity } from "../scripts/finalize-generation-activity.mjs";
import { createActivityProducer } from "../scripts/generation-activity-client.mjs";
import {
  TRACE_LIMITS,
  createPrivacyPolicy,
} from "../src/lib/generation-activity-contract.mjs";
import type { TraceEvent } from "../src/lib/generation-activity";
import { BASE_CONTEXT } from "./fixtures/generation-activity";
import { captureActivity } from "./fixtures/generation-activity-capture";
import { creativeModelActivity } from "../scripts/creative-activity.mjs";
import { completeGoCreative, buildGoCreativeRequest } from "../scripts/creative-lane-inference.mjs";

const privacy = createPrivacyPolicy({ allowSourceText: true });

function capture() {
  const events: { kind: string; payload: Record<string, unknown> }[] = [];
  const producer = {
    emit(kind: string, payload: Record<string, unknown>) {
      events.push({ kind, payload });
      return true;
    },
    withContext() {
      return this;
    },
    flush: async () => {},
    close: async () => {},
    stats: () => ({}),
    context: () => BASE_CONTEXT,
  };
  return { producer: producer as never, events };
}

describe("pipeline action instrumentation", () => {
  it("does not let emitter or result projection failures change the action", async () => {
    const producer = { emit() { throw new Error("diagnostic unavailable"); } } as never;
    await expect(observePipelineAction({
      producer, name: "repair_candidate", invoke: async () => 42,
      projectResult: () => { throw new Error("projection failed"); },
    })).resolves.toBe(42);
    const error = new Error("original failure with raw private prompt");
    await expect(observePipelineAction({
      producer, name: "repair_candidate", invoke: async () => { throw error; },
    })).rejects.toBe(error);
  });

  it("keeps nested candidate context through the real Go dispatch without request payloads", async () => {
    const { producer, events } = captureActivity();
    const activity = creativeModelActivity("model.creative_repair", {
      stage: "creative_repair", substep: "repair_inference", candidateId: "candidate-a", repairPass: 2,
    }, producer);
    const result = await completeGoCreative({
      activity, logicalModel: "opencode-go/deepseek-v4.1-flash",
      env: { OPENCODE_GO_API_KEY: "offline-private-key" },
      request: buildGoCreativeRequest({
        systemPrompt: "PRIVATE_SYSTEM_PROMPT",
        userContent: [
          {
            type: "text",
            text: "PRIVATE_USER_PROMPT https://provider.example/private",
          },
        ],
        maxOutputTokens: 100, sessionId: "offline-activity-test",
      }),
      fetchImpl: async () => {
        expect(events.at(-1)?.kind).toBe("model_started");
        return new Response(JSON.stringify({ status: "completed", output: [{
          type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: "{}" }],
        }] }), { headers: { "content-type": "application/json" } });
      },
    });
    expect(result.status).toBe("completed");
    const model = events.filter((event) => event.kind.startsWith("model_"));
    expect(model.map((event) => event.kind)).toEqual(["model_started", "model_finished"]);
    for (const event of model) expect(event.context).toMatchObject({
      stage: "creative_repair", substep: "repair_inference", candidateId: "candidate-a", repairPass: 2,
      actor: { kind: "model", role: "creative_repair" },
    });
    const payload = JSON.stringify(events);
    for (const privateText of ["PRIVATE_SYSTEM_PROMPT", "PRIVATE_USER_PROMPT", "provider.example", "offline-private-key"])
      expect(payload).not.toContain(privateText);
  });

  it("retains nested context with the real sanitized producer", async () => {
    const sent: TraceEvent[] = [];
    const producer = createActivityProducer({ context: BASE_CONTEXT, privacy, limits: TRACE_LIMITS,
      transport: { async send(events) { sent.push(...events as TraceEvent[]); return { status: 200 }; } },
    });
    producer.withContext({ stage: "creative_repair", candidateId: "candidate-a", repairPass: 2 })
      .withContext({ substep: "repair_inference", actor: { kind: "model", role: "creative_repair" } })
      .emit("model_started", { callId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", provider: "opencode-go", model: "deepseek-v4.1-flash" });
    await producer.close();
    expect(sent.find((event) => event.kind === "model_started")?.context).toMatchObject({
      stage: "creative_repair", candidateId: "candidate-a", repairPass: 2, substep: "repair_inference",
    });
  });
  it("records a start before the action and a finish after it", async () => {
    const { producer, events } = capture();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pending = observePipelineAction({
      producer,
      actionId: "render:1",
      name: "render_candidate",
      input: { path: "src/generated-experiences/selected" },
      invoke: async () => {
        await gate;
        return { count: 2 };
      },
      projectResult: (value) => ({ count: value.count }),
      now: (() => {
        let time = 100;
        return () => (time += 25);
      })(),
    });
    expect(events.map((event) => event.kind)).toEqual(["action_started"]);
    release();
    await pending;
    expect(events.map((event) => event.kind)).toEqual([
      "action_started",
      "action_finished",
    ]);
    expect(events[0]?.payload).toMatchObject({
      actionId: "render:1",
      name: "render_candidate",
      input: { path: "src/generated-experiences/selected" },
    });
    expect(events[1]?.payload).toMatchObject({
      status: "succeeded",
      result: { count: 2 },
    });
  });

  it("records a failure and rethrows the same error", async () => {
    const { producer, events } = capture();
    const failure = Object.assign(new Error("render failed"), {
      code: "render_error",
    });
    await expect(
      observePipelineAction({
        producer,
        name: "render_candidate",
        invoke: async () => {
          throw failure;
        },
      }),
    ).rejects.toBe(failure);
    expect(events.map((event) => event.kind)).toEqual([
      "action_started",
      "action_finished",
      "error",
    ]);
    expect(events[1]?.payload).toMatchObject({ status: "failed" });
    expect(events[2]?.payload).toMatchObject({
      scope: "action",
      code: "render_error",
    });
  });

  it("runs the action when evidence is dropped by the contract", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-03T10:00:00.000Z") });
    const sent: TraceEvent[][] = [];
    const producer = createActivityProducer({
      context: BASE_CONTEXT,
      privacy,
      transport: {
        async send(events) {
          sent.push(events as TraceEvent[]);
          return { status: 200 };
        },
      },
      limits: TRACE_LIMITS,
    });
    let ran = false;
    const value = await observePipelineAction({
      producer,
      name: "render_candidate",
      // `rawCommand` is deliberately not an allowlisted field.
      input: { rawCommand: "cat /etc/passwd" } as never,
      invoke: async () => {
        ran = true;
        return "ok";
      },
    });
    expect(value).toBe("ok");
    expect(ran).toBe(true);
    await vi.advanceTimersByTimeAsync(TRACE_LIMITS.flushIntervalMs);
    expect(sent.flat().some((event) => event.kind === "action_started")).toBe(false);
    await producer.close();
    vi.useRealTimers();
  });

  it("works without a producer", async () => {
    await expect(
      observePipelineAction({
        producer: null,
        name: "render_candidate",
        invoke: async () => 41,
      }),
    ).resolves.toBe(41);
  });
});

describe("run finalizer", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-11-03T10:00:00.000Z") });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const env = {
    GENERATION_ACTIVITY_ENABLED: "true",
    OPERATION_ID: "44444444-4444-4444-8444-444444444444",
    TRACK_ATTEMPT: "33333333-3333-4333-8333-333333333333",
    LAUNCHLOOM_API_URL: "https://api.launchloom.test",
  };

  function finalizerTransport() {
    const sent: TraceEvent[][] = [];
    return {
      sent,
      transport: {
        async send(events: TraceEvent[]) {
          sent.push(events);
          return { status: 200 };
        },
      },
    };
  }

  it("marks a successful run complete", async () => {
    const { sent, transport } = finalizerTransport();
    const result = await finalizeGenerationActivity({
      env: { ...env, GENERATION_OUTCOME: "success" },
      dependencies: { transport },
    });
    const closing = Promise.resolve(result);
    await vi.advanceTimersByTimeAsync(TRACE_LIMITS.flushIntervalMs);
    await closing;
    expect(result).toEqual({ recorded: true, complete: true });
    const kinds = sent.flat().map((event) => event.kind);
    expect(kinds).toContain("coverage");
    expect(kinds).toContain("producer_finished");
    const terminal = sent.flat().find((event) => event.kind === "producer_finished");
    expect(terminal?.payload).toMatchObject({ status: "complete" });
    expect(terminal?.context.actor).toMatchObject({ role: "run_finalizer" });
  });

  it("marks a failed or cancelled run incomplete", async () => {
    for (const outcome of ["failure", "cancelled", ""]) {
      const { sent, transport } = finalizerTransport();
      const result = await finalizeGenerationActivity({
        env: { ...env, GENERATION_OUTCOME: outcome },
        dependencies: { transport },
      });
      await vi.advanceTimersByTimeAsync(TRACE_LIMITS.flushIntervalMs);
      expect(result).toEqual({ recorded: true, complete: false });
      const terminal = sent
        .flat()
        .find((event) => event.kind === "producer_finished");
      expect(terminal?.payload).toMatchObject({ status: "incomplete" });
    }
  });

  it("is a no-op when the capability is disabled", async () => {
    const result = await finalizeGenerationActivity({
      env: { GENERATION_ACTIVITY_ENABLED: "false" },
    });
    expect(result).toEqual({ recorded: false, complete: false });
  });
});
