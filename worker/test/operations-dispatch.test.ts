import { createExecutionContext, createScheduledController, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import { dispatchScheduled, githubDispatcher, scheduledOperations } from "../src/operations/dispatch";
import { createOperationsStore } from "../src/operations/store";
import type { LeasedDispatch } from "../src/operations/contracts";

const item: LeasedDispatch = {
  operationId: "11111111-1111-4111-8111-111111111111", fence: 1,
  payload: { schemaVersion: 1, operationId: "11111111-1111-4111-8111-111111111111",
    intakeId: "22222222-2222-4222-8222-222222222222", requestId: "33333333-3333-4333-8333-333333333333",
    attemptId: "44444444-4444-4444-8444-444444444444" },
};

describe("scheduled operations dispatch", () => {
  it("does nothing from the actual scheduled entrypoint with default production settings", async () => {
    const ctx = createExecutionContext();
    await worker.scheduled(createScheduledController(), { ...env, GITHUB_ORG_TOKEN: "synthetic" }, ctx);
    await waitOnExecutionContext(ctx);
  });

  it("requires both opt-ins and validates enabled configuration from the real cron entrypoint", async () => {
    await scheduledOperations({ OPERATIONS_DISPATCH_MODE: "claim-gated-v1" });
    await scheduledOperations({ OPERATIONS_CLAIM_GATE: "verified-v1" });
    await expect(worker.scheduled(createScheduledController(), {
      OPERATIONS_DISPATCH_MODE: "claim-gated-v1", OPERATIONS_CLAIM_GATE: "verified-v1",
    }, createExecutionContext())).rejects.toThrow("storage is not configured");
  });

  it("sanitizes invalid connection failures before the scheduler can log them", async () => {
    await expect(scheduledOperations({
      OPERATIONS_DISPATCH_MODE: "claim-gated-v1", OPERATIONS_CLAIM_GATE: "verified-v1",
      OPERATIONS_DATABASE_URL: "private-fixture-do-not-log",
      OPERATIONS_DISPATCH_REPOSITORY: "synthetic/test", OPERATIONS_DISPATCH_WORKFLOW: "operations.yml",
      OPERATIONS_DISPATCH_REF: "fixture", GITHUB_ORG_TOKEN: "synthetic",
    })).rejects.toThrow("Operations storage is temporarily unavailable.");
  });

  it("records a timeout as unknown, never a retryable rejection", async () => {
    const results: unknown[] = [];
    let count = 0;
    await dispatchScheduled({
      store: { leaseDispatch: async () => count++ === 0 ? item : null,
        recordDispatchResult: async (...args) => { results.push(args); } },
      dispatch: async () => { throw new Error("private upstream body"); }, now: () => 1000,
    });
    expect(results).toEqual([[item.operationId, 1, { outcome: "unknown", now: 1000 }]]);
  });

  it("stops a tick on unavailable persistence instead of sending more work", async () => {
    let sent = 0;
    await expect(dispatchScheduled({ store: {
      leaseDispatch: async () => item,
      recordDispatchResult: async () => { throw new Error("db unavailable"); },
    }, dispatch: async () => { sent++; return "accepted"; }, now: () => 1000 })).rejects.toThrow();
    expect(sent).toBe(1);
  });

  it("bounds a tick even with an endless backlog", async () => {
    let sent = 0;
    await dispatchScheduled({ store: { leaseDispatch: async () => item,
      recordDispatchResult: async () => {} }, dispatch: async () => { sent++; return "accepted"; }, now: () => 1000 });
    expect(sent).toBe(10);
  });
});

describe("GitHub dispatch boundary", () => {
  const target = { repository: "synthetic/operations-test", workflow: "operations.yml", ref: "claim-gated-test", token: "synthetic-token" };
  it.each([[200, "accepted"], [204, "accepted"], [429, "retryable"], [503, "unknown"], [401, "rejected"], [422, "rejected"]] as const)(
    "classifies HTTP %i without inventing a run identity", async (status, outcome) => {
      const send = githubDispatcher(target, async (url, init) => {
        expect(String(url)).toBe("https://api.github.com/repos/synthetic/operations-test/actions/workflows/operations.yml/dispatches");
        expect(init?.redirect).toBe("error");
        expect(JSON.parse(String(init?.body))).toEqual({ ref: "claim-gated-test", inputs: {
          operation_id: item.payload.operationId, request_id: item.payload.requestId, attempt_id: item.payload.attemptId,
        } });
        return new Response(null, { status });
      });
      expect(await send(item)).toBe(outcome);
    });
  it("refuses unsafe target configuration before sending", () => {
    expect(() => githubDispatcher({ ...target, repository: "../../elsewhere" })).toThrow();
    expect(() => githubDispatcher({ ...target, repository: "../elsewhere" })).toThrow();
    expect(() => githubDispatcher({ ...target, repository: "synthetic/.." })).toThrow();
  });
});

describe("dispatch store validation", () => {
  it("rejects untrusted malformed run identity and nonintegral fencing before SQL", async () => {
    const query = vi.fn();
    const store = createOperationsStore({ query });
    await expect(store.claimRun(item.operationId, { repositoryId: "x", runId: "123", runAttempt: 1 })).rejects.toMatchObject({ code: "invalid" });
    await expect(store.claimRun(item.operationId, { repositoryId: 123 as unknown as string, runId: "123", runAttempt: 1 })).rejects.toMatchObject({ code: "invalid" });
    await expect(store.recordDispatchResult(item.operationId, 1.5, { outcome: "accepted", now: 1000 })).rejects.toMatchObject({ code: "invalid" });
    expect(query).not.toHaveBeenCalled();
  });
});
