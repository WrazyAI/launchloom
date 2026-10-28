import { createExecutionContext, createScheduledController, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import { dispatchScheduled, githubDispatcher, scheduledOperations } from "../src/operations/dispatch";
import { createOperationsStore } from "../src/operations/store";
import * as persistence from "../src/operations/store";
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

  it("passes a capped rate-limit delay for the same stable operation to persistence", async () => {
    const results: unknown[] = [];
    const sent: string[] = [];
    let count = 0;
    await dispatchScheduled({
      store: {
        leaseDispatch: async () => count++ === 0 ? item : null,
        recordDispatchResult: async (...args) => { results.push(args); },
      },
      dispatch: async (leased) => {
        sent.push(leased.operationId);
        return { outcome: "retryable", retryAfterSeconds: 7200 };
      },
      now: () => 1000,
    });
    expect(sent).toEqual([item.operationId]);
    expect(results).toEqual([[
      item.operationId,
      1,
      { outcome: "retryable", retryAfterSeconds: 3600, now: 1000 },
    ]]);
  });

  it("enables uncertain recovery only after both verified gate flags", async () => {
    const create = vi.spyOn(persistence, "createOperationsStore");
    create.mockImplementation(() => ({
      leaseDispatch: async () => null,
      recordDispatchResult: async () => {},
    }) as unknown as ReturnType<typeof persistence.createOperationsStore>);
    try {
      await scheduledOperations({ OPERATIONS_DISPATCH_MODE: "claim-gated-v1" });
      await scheduledOperations({ OPERATIONS_CLAIM_GATE: "verified-v1" });
      expect(create).not.toHaveBeenCalled();
      await scheduledOperations({
        OPERATIONS_DISPATCH_MODE: "claim-gated-v1",
        OPERATIONS_CLAIM_GATE: "verified-v1",
        OPERATIONS_DATABASE_URL: "postgresql://synthetic:synthetic@127.0.0.1/synthetic",
        OPERATIONS_DISPATCH_REPOSITORY: "synthetic/operations-test",
        OPERATIONS_DISPATCH_WORKFLOW: "operations.yml",
        OPERATIONS_DISPATCH_REF: "fixture",
        GITHUB_ORG_TOKEN: "synthetic",
      });
      expect(create).toHaveBeenCalledWith(expect.anything(), {
        uncertainDispatchRetry: true,
      });
    } finally {
      create.mockRestore();
    }
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
  it("retries a rate-limited 403 using safe headers but keeps a normal forbidden terminal", async () => {
    const clock = () => 1_000_000_000;
    const limited = githubDispatcher(target, async () => new Response(null, {
      status: 403,
      headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1000120" },
    }), clock);
    expect(await limited(item)).toEqual({ outcome: "retryable", retryAfterSeconds: 120 });

    const secondary = githubDispatcher(target, async () => new Response(null, {
      status: 403,
      headers: { "retry-after": "45" },
    }), clock);
    expect(await secondary(item)).toEqual({ outcome: "retryable", retryAfterSeconds: 45 });

    const forbidden = githubDispatcher(target, async () => new Response(null, {
      status: 403,
      headers: { "x-ratelimit-remaining": "4999", "x-ratelimit-reset": "1000120" },
    }), clock);
    expect(await forbidden(item)).toBe("rejected");
  });

  it("does not treat unvalidated 403 headers as a rate limit", async () => {
    const clock = () => 1_000_000_000;
    const empty = githubDispatcher(target, async () => new Response(null, {
      status: 403, headers: { "retry-after": "", "x-ratelimit-remaining": "0" },
    }), clock);
    expect(await empty(item)).toBe("rejected");

    const malformed = githubDispatcher(target, async () => new Response(null, {
      status: 403, headers: { "retry-after": "soon", "x-ratelimit-remaining": "0" },
    }), clock);
    expect(await malformed(item)).toBe("rejected");

    const remainingOnly = githubDispatcher(target, async () => new Response(null, {
      status: 403, headers: { "x-ratelimit-remaining": "0" },
    }), clock);
    expect(await remainingOnly(item)).toBe("rejected");

    const withReset = githubDispatcher(target, async () => new Response(null, {
      status: 403, headers: {
        "x-ratelimit-remaining": "00", "x-ratelimit-reset": "1000120",
      },
    }), clock);
    expect(await withReset(item)).toEqual({ outcome: "retryable", retryAfterSeconds: 120 });
  });

  it("caps retry-after, ignores zero and malformed delays, and uses the longer reset", async () => {
    const clock = () => 1_000_000;
    const capped = githubDispatcher(target, async () => new Response(null, {
      status: 429, headers: { "retry-after": "7200" },
    }), clock);
    expect(await capped(item)).toEqual({ outcome: "retryable", retryAfterSeconds: 3600 });

    const zero = githubDispatcher(target, async () => new Response(null, {
      status: 429, headers: { "retry-after": "0" },
    }), clock);
    expect(await zero(item)).toBe("retryable");

    const malformed = githubDispatcher(target, async () => new Response(null, {
      status: 429, headers: { "retry-after": "soon", "x-ratelimit-reset": "later" },
    }), clock);
    expect(await malformed(item)).toBe("retryable");

    const longerReset = githubDispatcher(target, async () => new Response(null, {
      status: 429, headers: {
        "retry-after": "5", "x-ratelimit-reset": String(1_000 + 600),
      },
    }), clock);
    expect(await longerReset(item)).toEqual({ outcome: "retryable", retryAfterSeconds: 600 });

    const resetOnly = githubDispatcher(target, async () => new Response(null, {
      status: 429, headers: { "x-ratelimit-reset": String(1_000 + 900) },
    }), clock);
    expect(await resetOnly(item)).toEqual({ outcome: "retryable", retryAfterSeconds: 900 });
  });

  it("accepts only HTTP-date syntax for retry-after dates", async () => {
    const clock = () => Date.parse("Sun, 06 Nov 1994 08:00:00 GMT");
    const expected = 2_977;
    for (const date of [
      "Sun, 06 Nov 1994 08:49:37 GMT",
      "Sunday, 06-Nov-94 08:49:37 GMT",
      "Sun Nov  6 08:49:37 1994",
    ]) {
      const send = githubDispatcher(target, async () => new Response(null, {
        status: 429, headers: { "retry-after": date },
      }), clock);
      expect(await send(item)).toEqual({
        outcome: "retryable",
        retryAfterSeconds: expected,
      });
    }
  });

  it("rejects ISO and other JavaScript-parseable non-HTTP dates", async () => {
    const clock = () => Date.parse("Sun, 06 Nov 1994 08:00:00 GMT");
    for (const date of [
      "1994-11-06T08:49:37.000Z",
      "1994-11-06 08:49:37",
      "November 6, 1994 08:49:37 GMT",
      "Sun, 06 Nov 1994 08:49:37 UTC",
      "Sun, 06 Nov 1994 08:49:37",
      "Sun, 31 Feb 1994 08:49:37 GMT",
      "Sun, 06 Nov 1994 25:49:37 GMT",
    ]) {
      const send = githubDispatcher(target, async () => new Response(null, {
        status: 429, headers: { "retry-after": date },
      }), clock);
      expect(await send(item)).toBe("retryable");
    }

    const forbidden = githubDispatcher(target, async () => new Response(null, {
      status: 403,
      headers: {
        "retry-after": "1994-11-06T08:49:37.000Z",
        "x-ratelimit-remaining": "0",
      },
    }), clock);
    expect(await forbidden(item)).toBe("rejected");
  });

  it("rejects impossible calendar days instead of normalizing them", async () => {
    const clock = () => Date.UTC(2026, 0, 1);
    for (const date of [
      "Wed, 31 Feb 2027 08:49:37 GMT",
      "Sat, 31 Apr 2027 08:49:37 GMT",
      "Mon, 29 Feb 2027 08:49:37 GMT",
      "Mon, 31-Feb-27 08:49:37 GMT",
      "Sun Feb 30 08:49:37 2027",
    ]) {
      const limited = githubDispatcher(target, async () => new Response(null, {
        status: 403,
        headers: { "retry-after": date, "x-ratelimit-remaining": "0" },
      }), clock);
      expect(await limited(item)).toBe("rejected");

      const throttled = githubDispatcher(target, async () => new Response(null, {
        status: 429, headers: { "retry-after": date },
      }), clock);
      expect(await throttled(item)).toBe("retryable");
    }
  });

  it("keeps an independently valid reset beside an impossible date", async () => {
    const send = githubDispatcher(target, async () => new Response(null, {
      status: 403,
      headers: {
        "retry-after": "Wed, 31 Feb 2027 08:49:37 GMT",
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": "1767225720",
      },
    }), () => Date.UTC(2026, 0, 1));
    expect(await send(item)).toEqual({ outcome: "retryable", retryAfterSeconds: 120 });
  });

  it("accepts a real leap day and rejects a non-leap February 29", async () => {
    const leap = githubDispatcher(target, async () => new Response(null, {
      status: 429,
      headers: { "retry-after": "Tue, 29 Feb 2028 00:40:00 GMT" },
    }), () => Date.UTC(2028, 1, 29));
    expect(await leap(item)).toEqual({ outcome: "retryable", retryAfterSeconds: 2_400 });

    const notLeap = githubDispatcher(target, async () => new Response(null, {
      status: 403,
      headers: {
        "retry-after": "Thu, 29 Feb 2100 00:40:00 GMT",
        "x-ratelimit-remaining": "0",
      },
    }), () => Date.UTC(2099, 11, 31));
    expect(await notLeap(item)).toBe("rejected");
  });

  it("applies the RFC850 50-year rule to the exact future instant", async () => {
    const now = Date.UTC(2026, 5, 15); // 2026-06-15T00:00:00Z
    const send = (date: string) =>
      githubDispatcher(target, async () => new Response(null, {
        status: 429, headers: { "retry-after": date },
      }), () => now)(item);

    // Exactly 50 years ahead is still inside the window.
    expect(await send("Tuesday, 15-Jun-76 00:00:00 GMT"))
      .toEqual({ outcome: "retryable", retryAfterSeconds: 3_600 });
    // One second past the window means 1976, which is already in the past.
    expect(await send("Tuesday, 15-Jun-76 00:00:01 GMT")).toBe("retryable");
    // One day past the window is also 1976.
    expect(await send("Tuesday, 16-Jun-76 00:00:00 GMT")).toBe("retryable");
    // 2077 is 51 years ahead, so it means 1977.
    expect(await send("Tuesday, 16-Jun-77 00:00:00 GMT")).toBe("retryable");
    // 2049 is inside the window and remains a measurable future delay.
    expect(await send("Tuesday, 15-Jun-49 00:00:00 GMT"))
      .toEqual({ outcome: "retryable", retryAfterSeconds: 3_600 });
  });

  it("rolls an RFC850 year over at the exact past boundary", async () => {
    const now = Date.UTC(2050, 5, 15); // 2050-06-15T00:00:00Z
    const send = (date: string) =>
      githubDispatcher(target, async () => new Response(null, {
        status: 429, headers: { "retry-after": date },
      }), () => now)(item);

    // Exactly 50 years behind stays 2000, already past.
    expect(await send("Thursday, 15-Jun-00 00:00:00 GMT")).toBe("retryable");
    // One second further back rolls forward to 2100 and a clamped delay.
    expect(await send("Thursday, 14-Jun-00 23:59:59 GMT"))
      .toEqual({ outcome: "retryable", retryAfterSeconds: 3_600 });
  });

  it("resolves an upcoming RFC850 00 year into the next century", async () => {
    const now = Date.UTC(2099, 11, 31, 23, 30); // 2099-12-31T23:30:00Z
    const send = (date: string, status: 403 | 429 = 429) =>
      githubDispatcher(target, async () => new Response(null, {
        status,
        headers: status === 403
          ? { "retry-after": date, "x-ratelimit-remaining": "0" }
          : { "retry-after": date },
      }), () => now)(item);

    // 2100-01-01 is 30 minutes ahead, not 2000-01-01 behind.
    expect(await send("Friday, 01-Jan-00 00:00:00 GMT"))
      .toEqual({ outcome: "retryable", retryAfterSeconds: 1_800 });
    expect(await send("Friday, 01-Jan-00 00:00:00 GMT", 403))
      .toEqual({ outcome: "retryable", retryAfterSeconds: 1_800 });
    // 2100 is not a leap year, so 29 February there must not be retryable.
    expect(await send("Thursday, 29-Feb-00 00:00:00 GMT", 403)).toBe("rejected");
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

  it("passes the disabled-by-default gate to SQL and bounds retry delays", async () => {
    const query = vi.fn(async () => []);
    await createOperationsStore({ query }).leaseDispatch(1000);
    expect(query).toHaveBeenLastCalledWith(
      "select * from launchloom_operations.lease_dispatch($1::timestamptz, $2::boolean)",
      [new Date(1000).toISOString(), false],
    );
    await createOperationsStore({ query }, { uncertainDispatchRetry: true }).recordDispatchResult(
      item.operationId, 1, { outcome: "retryable", retryAfterSeconds: 300, now: 1000 },
    );
    expect(query).toHaveBeenLastCalledWith(
      "select launchloom_operations.record_dispatch_result($1::uuid, $2::bigint, $3, $4::timestamptz, $5::boolean, $6::integer)",
      [item.operationId, 1, "retryable", new Date(1000).toISOString(), true, 300],
    );
    const gated = createOperationsStore({ query }, { uncertainDispatchRetry: true });
    for (const retryAfterSeconds of [0, 3601, 1.5, "60" as unknown as number]) {
      await expect(gated.recordDispatchResult(item.operationId, 1, {
        outcome: "retryable", retryAfterSeconds, now: 1000,
      })).rejects.toMatchObject({ code: "invalid" });
    }
  });
});
