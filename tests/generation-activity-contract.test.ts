import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  TRACE_EVENT_KINDS as RUNTIME_EVENT_KINDS,
  TRACE_LIMITS,
  TRACE_SAFE_FIELD_NAMES,
  assertBoundedJson,
  buildSafeFields,
  buildTraceEvent,
  createPrivacyPolicy,
  isTraceIdentity,
  projectTraceText,
  scrubTraceText,
  traceTextBytes,
  truncateUtf8,
  validateTraceBatch,
} from "../src/lib/generation-activity-contract.mjs";
import type {
  TraceEvent,
  TraceEventKind,
  TraceNamespace,
  TraceActorKind,
} from "../src/lib/generation-activity";
import {
  BASE_CALL_ID,
  textEvent,
  traceEvent,
  usage,
} from "./fixtures/generation-activity";

// Bidirectional compile-time link: neither the types nor the runtime list may
// drift without a type error here.
type RuntimeKind = (typeof RUNTIME_EVENT_KINDS)[number];
type AssertNever<T extends never> = T;
export type _NoExtraRuntimeKind = AssertNever<
  Exclude<RuntimeKind, TraceEventKind>
>;
export type _NoMissingRuntimeKind = AssertNever<
  Exclude<TraceEventKind, RuntimeKind>
>;
const _namespaceCheck: TraceNamespace[] = ["legacy", "operations"];
const _actorCheck: TraceActorKind[] = ["model", "orchestrator", "process"];
void _namespaceCheck;
void _actorCheck;

const policy = createPrivacyPolicy({ allowSourceText: true });

describe("generation activity contract", () => {
  it("keeps a stable event ID across delivery replay", () => {
    const event = traceEvent();
    const second = traceEvent({
      sequence: 2,
      eventId: "22222222-2222-4222-8222-222222222222",
    });
    expect(
      validateTraceBatch([event, event, second]).map((entry) => entry.eventId),
    ).toEqual([event.eventId, event.eventId, second.eventId]);
  });

  it("rejects unknown kinds and unexpected envelope fields", () => {
    expect(() => buildTraceEvent(traceEvent({ kind: "thinking" }))).toThrow(
      /kind_invalid/u,
    );
    expect(() =>
      buildTraceEvent({ ...traceEvent(), prompt: "raw private prompt" }),
    ).toThrow(/event_unknown_field/u);
  });

  it("keeps zero usage at zero and missing usage unknown", () => {
    const zero = buildTraceEvent(
      traceEvent({
        kind: "usage",
        payload: {
          callId: BASE_CALL_ID,
          usage: usage({ inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 }),
        },
      }),
      policy,
    );
    expect(zero.payload).toMatchObject({
      usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
    });
    const missing = buildTraceEvent(
      traceEvent({
        kind: "usage",
        payload: { callId: BASE_CALL_ID, usage: usage({ inputTokens: null }) },
      }),
      policy,
    );
    expect(missing.payload).toMatchObject({ usage: { inputTokens: null } });
  });

  it("rejects a cost amount that disagrees with its cost kind", () => {
    expect(() =>
      buildTraceEvent(
        traceEvent({
          kind: "usage",
          payload: {
            callId: BASE_CALL_ID,
            usage: usage({ costKind: "actual", costUsd: null }),
          },
        }),
        policy,
      ),
    ).toThrow(/usage_cost_mismatch/u);
    expect(() =>
      buildTraceEvent(
        traceEvent({
          kind: "usage",
          payload: {
            callId: BASE_CALL_ID,
            usage: usage({ costKind: "unreported", costUsd: "0.10" }),
          },
        }),
        policy,
      ),
    ).toThrow(/usage_cost_mismatch/u);
  });

  it("bounds multibyte text by UTF-8 bytes, not code units", () => {
    const text = "é".repeat(5000);
    const projected = projectTraceText(text, policy);
    expect(projected.kind).toBe("text");
    const bytes = traceTextBytes((projected as { text: string }).text);
    expect(bytes).toBeLessThanOrEqual(TRACE_LIMITS.maxTextBytes);
    expect(traceTextBytes(truncateUtf8(text, 10))).toBeLessThanOrEqual(10);
    expect(truncateUtf8("😀😀😀", 5)).toBe("😀");
  });

  it("rejects depth, node and width amplification", () => {
    const deep: Record<string, unknown> = {};
    let cursor = deep;
    for (let index = 0; index < 10; index += 1) {
      cursor.next = {};
      cursor = cursor.next as Record<string, unknown>;
    }
    expect(() => assertBoundedJson(deep)).toThrow(/too_deep/u);
    const wide = Object.fromEntries(
      Array.from({ length: 700 }, (_, index) => [`k${index}`, index]),
    );
    expect(() => assertBoundedJson(wide)).toThrow(/too_many_nodes|too_wide/u);
    expect(() => assertBoundedJson({ list: Array(200).fill(0) })).toThrow(
      /too_wide/u,
    );
  });

  it("removes a credential straddling the truncation boundary", () => {
    const secret = `sk-${"Z".repeat(60)}`;
    const projected = projectTraceText(`${"a".repeat(8100)}${secret}`, policy);
    expect(projected.kind).toBe("text");
    const text = (projected as { text: string }).text;
    expect(text).not.toContain("sk-");
    expect(text).not.toContain("ZZZZZZZZZZ");
    expect(text).toContain("[credential redacted]");
  });

  it("removes an exact known private value before truncation", () => {
    const privateValue = "Private Contact 555-0199 for Harbour Clinic";
    const scoped = createPrivacyPolicy({
      allowSourceText: true,
      sensitiveValues: [privateValue],
    });
    const projected = projectTraceText(
      `${"b".repeat(8100)}${privateValue}`,
      scoped,
    );
    expect(projected.kind).toBe("text");
    const text = (projected as { text: string }).text;
    expect(text).not.toContain("Private Con");
    expect(text).not.toContain("555-0199");
    expect(text).toContain("[redacted]");
  });

  it("withholds unclassified or unsupported source text", () => {
    expect(projectTraceText(42, policy)).toEqual({
      kind: "withheld",
      reason: "unclassified",
    });
    expect(
      projectTraceText("model source", createPrivacyPolicy(), {
        mode: "source",
      }),
    ).toEqual({ kind: "withheld", reason: "unsupported" });
    expect(
      projectTraceText(
        "model source",
        createPrivacyPolicy({ allowSourceText: true }),
        { mode: "source" },
      ),
    ).toEqual({ kind: "text", text: "model source" });
  });

  it("removes credentials and unapproved links from errors", () => {
    const scrubbed = scrubTraceText(
      "failed: Bearer abcdefghijklmnop api_key=supersecretvalue https://private.example/token",
      policy,
    );
    expect(scrubbed).not.toContain("abcdefghijklmnop");
    expect(scrubbed).not.toContain("supersecretvalue");
    expect(scrubbed).not.toContain("private.example");
    const event = buildTraceEvent(
      traceEvent({
        kind: "error",
        payload: {
          scope: "model",
          code: "provider_auth",
          message: {
            kind: "text",
            text: "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signaturepart",
          },
        },
      }),
      policy,
    );
    expect(event.payload).toMatchObject({ code: "provider_auth" });
    expect(JSON.stringify(event)).not.toContain("eyJhbGciOiJIUzI1NiJ9");
  });

  it("redacts contact shapes from failures but not from site copy", () => {
    const error = buildTraceEvent(
      traceEvent({
        kind: "error",
        payload: {
          scope: "action",
          code: "action_failed",
          message: {
            kind: "text",
            text: "Failed for client@example.test or 512-555-0199",
          },
        },
      }),
      policy,
    );
    expect(JSON.stringify(error)).not.toContain("client@example.test");
    expect(JSON.stringify(error)).not.toContain("512-555-0199");
    const retry = buildTraceEvent(
      traceEvent({
        kind: "retry",
        payload: {
          scope: "provider",
          attempt: 2,
          maxAttempts: 3,
          reason: "Retry for client@example.test",
        },
      }),
      policy,
    );
    expect(JSON.stringify(retry)).not.toContain("client@example.test");
    const output = buildTraceEvent(
      textEvent("Call the studio on 512-555-0100."),
      policy,
    );
    // Public business contact copy remains reviewable model output.
    expect(JSON.stringify(output)).toContain("512-555-0100");
  });

  it("only accepts allowlisted flat action fields", () => {
    const fields = buildSafeFields(
      { path: "src/pages/index.astro", route: "/", dropped: "raw stdout" },
      { policy },
    );
    expect(fields).toEqual({ path: "src/pages/index.astro", route: "/" });
    expect(() =>
      buildTraceEvent(
        traceEvent({
          kind: "action_started",
          payload: {
            actionId: "write:1",
            name: "write_file",
            input: { path: { nested: true } },
          },
        }),
        policy,
      ),
    ).toThrow(/input_nested_value/u);
    expect(() =>
      buildTraceEvent(
        traceEvent({
          kind: "action_started",
          payload: {
            actionId: "write:1",
            name: "write_file",
            input: { arbitrary: "value" },
          },
        }),
        policy,
      ),
    ).toThrow(/input_field/u);
  });

  it("rejects oversized events and batches", () => {
    const bigField = "x".repeat(2000);
    const input = Object.fromEntries(
      TRACE_SAFE_FIELD_NAMES.map((name) => [name, bigField]),
    );
    expect(() =>
      buildTraceEvent(
        traceEvent({
          kind: "action_started",
          payload: { actionId: "write:1", name: "write_file", input },
        }),
        policy,
      ),
    ).toThrow(/event_too_large/u);
    // A batch of individually valid events can still exceed the batch budget.
    const large = Array.from({ length: 40 }, (_, index) => ({
      ...textEvent("y".repeat(4000), {
        sequence: index + 1,
        eventId: `33333333-3333-4333-8333-${String(index).padStart(12, "0")}`,
      }),
    }));
    expect(() => validateTraceBatch(large, policy)).toThrow(
      /batch_too_large/u,
    );
  });

  it("requires one identity, one producer and increasing sequence", () => {
    expect(() =>
      validateTraceBatch(
        [
          traceEvent(),
          traceEvent({
            sequence: 2,
            eventId: "44444444-4444-4444-8444-444444444444",
            context: {
              ...traceEvent().context,
              attemptId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            },
          }),
        ],
        policy,
      ),
    ).toThrow(/batch_identity_mismatch/u);
    expect(() =>
      validateTraceBatch(
        [
          traceEvent(),
          traceEvent({
            sequence: 2,
            eventId: "55555555-5555-4555-8555-555555555555",
            context: {
              ...traceEvent().context,
              producerId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
            },
          }),
        ],
        policy,
      ),
    ).toThrow(/batch_producer_mismatch/u);
    expect(() =>
      validateTraceBatch(
        [
          traceEvent({ sequence: 3 }),
          traceEvent({
            sequence: 2,
            eventId: "66666666-6666-4666-8666-666666666666",
          }),
        ],
        policy,
      ),
    ).toThrow(/batch_sequence_order/u);
  });

  it("validates identities per namespace without inventing ownership", () => {
    expect(
      isTraceIdentity({
        namespace: "operations",
        attemptId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
    ).toBe(true);
    expect(
      isTraceIdentity({ namespace: "legacy", attemptId: "github:123:1" }),
    ).toBe(true);
    expect(
      isTraceIdentity({ namespace: "operations", attemptId: "github:123:1" }),
    ).toBe(false);
    expect(
      isTraceIdentity({ namespace: "legacy", attemptId: "../etc/passwd" }),
    ).toBe(false);
    expect(
      isTraceIdentity({ namespace: "legacy", attemptId: "github:123:1", x: 1 }),
    ).toBe(false);
  });

  it("rejects raw prompts, headers and environment dumps", () => {
    for (const bad of [
      { kind: "model_started", payload: { callId: BASE_CALL_ID, provider: "opencode-go", model: "m", prompt: "x" } },
      { kind: "task_started", payload: { label: "ok", detail: null, headers: "x" } },
    ]) {
      expect(() => buildTraceEvent(traceEvent(bad))).toThrow(
        /unknown_field/u,
      );
    }
    expect(() =>
      buildTraceEvent({
        ...traceEvent(),
        env: { HOME: "/root" },
      } as unknown as TraceEvent),
    ).toThrow(/event_unknown_field/u);
  });

  it("keeps the coverage inventory explicit and pointed at real sources", () => {
    const inventory = JSON.parse(
      fs.readFileSync("data/generation-activity-coverage.json", "utf8"),
    ) as {
      schemaVersion: number;
      boundaries: Array<{ id: string; status: string; source: string }>;
    };
    expect(inventory.schemaVersion).toBe(1);
    const ids = new Set<string>();
    for (const boundary of inventory.boundaries) {
      expect(boundary.id.length).toBeGreaterThan(0);
      expect(ids.has(boundary.id)).toBe(false);
      ids.add(boundary.id);
      expect([
        "instrumented",
        "not_applicable",
        "unsupported",
        "limited",
      ]).toContain(boundary.status);
      if (boundary.id !== "provider_internal.actions" && boundary.id !== "action.github_job_scheduling") {
        expect(fs.existsSync(boundary.source.split(" ")[0]!)).toBe(true);
      }
    }
    expect(inventory.boundaries.length).toBeGreaterThanOrEqual(15);
  });

  it("keeps a benign structured action observable", () => {
    const started = buildTraceEvent(
      traceEvent({
        kind: "action_started",
        payload: {
          actionId: "render:1",
          name: "render_candidate",
          input: { path: "src/generated-experiences/selected", candidateId: "cand-1" },
        },
      }),
      policy,
    );
    expect(started.payload).toMatchObject({
      actionId: "render:1",
      name: "render_candidate",
      input: { candidateId: "cand-1" },
    });
    expect(started.context.stage).toBe("authoring");
  });
});
