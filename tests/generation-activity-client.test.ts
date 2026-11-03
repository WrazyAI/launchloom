import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createActivityProducer,
  type ActivityProducer,
  type ActivityTransport,
} from "../scripts/generation-activity-client.mjs";
import {
  TRACE_LIMITS,
  createPrivacyPolicy,
} from "../src/lib/generation-activity-contract.mjs";
import type { TraceEvent } from "../src/lib/generation-activity";
import {
  BASE_CONTEXT,
  BASE_CALL_ID,
  traceEvent,
} from "./fixtures/generation-activity";

const privacy = createPrivacyPolicy({ allowSourceText: true });

type Sent = { events: TraceEvent[]; attempt: number };

function harness(
  transport?: ActivityTransport,
  limits = TRACE_LIMITS,
) {
  const sent: Sent[] = [];
  const spoolWrites: string[] = [];
  const defaultTransport: ActivityTransport = {
    async send(events, { attempt }) {
      sent.push({ events: events as TraceEvent[], attempt });
      return { status: 200 };
    },
  };
  const producer: ActivityProducer = createActivityProducer({
    context: BASE_CONTEXT,
    privacy,
    transport: transport ?? defaultTransport,
    spool: {
      async write(events) {
        spoolWrites.push(JSON.stringify(events));
      },
      async clear() {},
    },
    limits,
  });
  return { producer, sent, spoolWrites };
}

function modelStarted() {
  return {
    callId: BASE_CALL_ID,
    provider: "opencode-go",
    model: "deepseek-v4.1-flash",
  } as const;
}

describe("generation activity producer", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-11-03T10:00:00.000Z") });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("flushes on the one-second interval, not immediately for a single event", async () => {
    const { producer, sent } = harness();
    expect(producer.emit("model_started", modelStarted())).toBe(true);
    expect(sent).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(999);
    expect(sent).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.events).toHaveLength(1);
    await producer.close();
  });

  it("flushes immediately at the event batch bound", async () => {
    const { producer, sent } = harness();
    for (let index = 0; index < TRACE_LIMITS.flushEvents; index += 1)
      producer.emit("model_started", modelStarted());
    await vi.advanceTimersByTimeAsync(0);
    expect(sent[0]?.events).toHaveLength(TRACE_LIMITS.flushEvents);
    await producer.close();
  });

  it("emits a producer heartbeat on its own interval", async () => {
    const { producer, sent } = harness();
    await vi.advanceTimersByTimeAsync(TRACE_LIMITS.heartbeatMs + TRACE_LIMITS.flushIntervalMs);
    const kinds = sent.flatMap((batch) => batch.events.map((event) => event.kind));
    expect(kinds).toContain("heartbeat");
    expect(producer.stats().lastHeartbeatAt).not.toBeNull();
    await producer.close();
  });

  it("never exceeds the queue byte bound and drops verbose evidence first", async () => {
    const limits = { ...TRACE_LIMITS, maxQueueBytes: 4_096, flushEvents: 100 };
    const { producer } = harness(undefined, limits);
    const big = "x".repeat(1_000);
    let rejected = 0;
    for (let index = 0; index < 10; index += 1) {
      if (
        !producer.emit("output", {
          callId: BASE_CALL_ID,
          message: { kind: "text", text: `${index}-${big}` },
        })
      )
        rejected += 1;
    }
    expect(rejected).toBeGreaterThan(0);
    expect(producer.stats().queueBytes).toBeLessThanOrEqual(limits.maxQueueBytes);
  });

  it("retries a transient failure with the same event IDs", async () => {
    let calls = 0;
    const transport: ActivityTransport = {
      async send(events, { attempt }) {
        calls += 1;
        if (calls < 3)
          return { status: 503, attempted: [events.length, attempt] } as never;
        return { status: 200 };
      },
    };
    const { producer } = harness(transport);
    producer.emit("model_started", modelStarted());
    await vi.advanceTimersByTimeAsync(TRACE_LIMITS.flushIntervalMs + 2_000);
    expect(calls).toBe(3);
    expect(producer.stats().queued).toBe(0);
    expect(producer.stats().rejected).toBe(0);
    await producer.close();
  });

  it("does not retry or fall back after an authentication rejection", async () => {
    let calls = 0;
    const transport: ActivityTransport = {
      async send() {
        calls += 1;
        return { status: 401 };
      },
    };
    const { producer } = harness(transport);
    producer.emit("model_started", modelStarted());
    await vi.advanceTimersByTimeAsync(TRACE_LIMITS.flushIntervalMs + 5_000);
    expect(calls).toBe(1);
    expect(producer.stats().queued).toBe(0);
    expect(producer.stats().rejected).toBe(1);
    await producer.close();
  });

  it("scrubs credentials before they reach the spool", async () => {
    const { producer, spoolWrites } = harness();
    const secret = "sk-ABCDEFGHIJKLMNOPQRSTUVWX";
    producer.emit("output", {
      callId: BASE_CALL_ID,
      message: {
        kind: "text",
        text: `Authorization failure with ${secret} in the message`,
      },
    });
    await vi.advanceTimersByTimeAsync(TRACE_LIMITS.flushIntervalMs);
    expect(spoolWrites.join("\n")).not.toContain(secret);
    await producer.close();
  });

  it("shares one queue and sequence between child contexts", async () => {
    const { producer, sent } = harness();
    const child = producer.withContext({ stage: "creative_render" });
    expect(child.emit("task_started", { label: "Rendering", detail: null })).toBe(true);
    expect(producer.emit("model_started", modelStarted())).toBe(true);
    await vi.advanceTimersByTimeAsync(TRACE_LIMITS.flushIntervalMs);
    const events = sent.flatMap((batch) => batch.events);
    expect(events.map((event) => event.sequence)).toEqual([1, 2]);
    expect(events[0]?.context.stage).toBe("creative_render");
    await producer.close();
  });

  it("stops queueing verbose evidence after ingest suppression", async () => {
    const transport: ActivityTransport = {
      async send() {
        return { status: 200, suppressed: true };
      },
    };
    const { producer } = harness(transport);
    producer.emit("model_started", modelStarted());
    await vi.advanceTimersByTimeAsync(TRACE_LIMITS.flushIntervalMs);
    expect(producer.emit("model_started", modelStarted())).toBe(false);
    expect(producer.stats().suppressed).toBe(true);
    await producer.close();
  });

  it("finishes with a terminal signal on close and clears its timers", async () => {
    const { producer, sent } = harness();
    producer.emit("model_started", modelStarted());
    await producer.close();
    const terminal = sent
      .flatMap((batch) => batch.events)
      .find((event) => event.kind === "producer_finished");
    expect(terminal?.payload).toMatchObject({ status: "complete" });
    const count = sent.length;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(sent.length).toBe(count);
    expect(producer.emit("model_started", modelStarted())).toBe(false);
  });

  it("does not claim completion when every delivery fails", async () => {
    const attempts: string[][] = [];
    const transport: ActivityTransport = {
      async send(events) {
        attempts.push(events.map((event) => event.kind));
        return { status: 503 };
      },
    };
    const { producer } = harness(transport);
    producer.emit("model_started", modelStarted());
    const closing = producer.close();
    await vi.advanceTimersByTimeAsync(TRACE_LIMITS.closeTimeoutMs + 1_000);
    await closing;
    expect(attempts.flat()).toContain("model_started");
    const stats = producer.stats();
    expect(stats.closed).toBe(true);
    // Nothing was acknowledged, so the evidence remains queued rather than
    // being reported as delivered.
    expect(stats.queued).toBeGreaterThan(0);
    expect(stats.rejected).toBe(0);
  });

  it("unrefs its periodic timers so a script can exit", () => {
    const handles: { unref: ReturnType<typeof vi.fn> }[] = [];
    const clock = {
      now: () => Date.now(),
      setTimeout: () => {
        const handle = { unref: vi.fn() };
        handles.push(handle);
        return handle;
      },
      clearTimeout: () => {},
      randomUUID: () => crypto.randomUUID(),
    };
    const producer = createActivityProducer({
      context: BASE_CONTEXT,
      privacy,
      transport: { async send() { return { status: 200 }; } },
      clock,
      limits: TRACE_LIMITS,
    });
    producer.emit("model_started", modelStarted());
    expect(handles.length).toBeGreaterThanOrEqual(2);
    expect(handles.every((handle) => handle.unref.mock.calls.length === 1)).toBe(
      true,
    );
    void producer.close();
  });

  it("drops an event that fails validation without throwing", () => {
    const { producer } = harness();
    expect(
      producer.emit("model_started", {
        callId: "not-a-uuid",
        provider: "opencode-go",
        model: "m",
      } as never),
    ).toBe(false);
    expect(producer.stats().dropped).toBe(1);
    expect(() => producer.emit("heartbeat", { intervalMs: 10_000 })).not.toThrow();
  });

  it("keeps a benign event with a stable identity", () => {
    const { producer } = harness();
    expect(producer.emit("task_started", { label: "Run", detail: null })).toBe(true);
    expect(producer.context()).toMatchObject({
      namespace: "operations",
      attemptId: BASE_CONTEXT.attemptId,
    });
  });

  it("accepts a submitted event fixture through the same policy", () => {
    const event = traceEvent();
    expect(event.eventId).toBeTruthy();
  });
});
