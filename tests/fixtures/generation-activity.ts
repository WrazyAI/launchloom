import type { TraceContext, TraceEvent } from "../../src/lib/generation-activity";

export const BASE_CONTEXT: TraceContext = {
  namespace: "operations",
  attemptId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  producerId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  stage: "authoring",
  substep: null,
  taskId: null,
  parentTaskId: null,
  candidateId: null,
  repairPass: null,
  actor: { kind: "model", role: "site_builder" },
};

export const BASE_CALL_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

export function usage(overrides: Record<string, unknown> = {}) {
  return {
    inputTokens: 1200,
    outputTokens: 340,
    cachedInputTokens: null,
    cacheWriteTokens: null,
    reasoningTokens: null,
    costUsd: null,
    costKind: "unreported",
    ...overrides,
  };
}

export function traceEvent(
  overrides: Record<string, unknown> = {},
): TraceEvent {
  return {
    schemaVersion: 1,
    eventId: "11111111-1111-4111-8111-111111111111",
    context: { ...BASE_CONTEXT },
    sequence: 1,
    emittedAt: "2026-11-03T10:00:00.000Z",
    kind: "model_started",
    payload: {
      callId: BASE_CALL_ID,
      provider: "opencode-go",
      model: "deepseek-v4.1-flash",
    },
    ...overrides,
  } as unknown as TraceEvent;
}

export function textEvent(text: string, overrides: Record<string, unknown> = {}) {
  return traceEvent({
    kind: "output",
    payload: {
      callId: BASE_CALL_ID,
      message: { kind: "text", text },
    },
    ...overrides,
  });
}
