import { env as testEnv } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../src/index";
import {
  createOperationsStore,
  decodeOperationsCursor,
  encodeOperationsCursor,
  type OperationsSql,
} from "../src/operations/store";
import type {
  OperationDetailRecord,
  OperationRecord,
} from "../src/operations/contracts";
import {
  operationsDashboardApi,
  workspaceApi,
} from "../src/admin/workspace-api";

const origin = "https://worker.test";
const workspace = `${origin}/api/admin/onboarding-invites/workspace`;
const attemptId = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
const intakeId = "33333333-3333-4333-8333-333333333333";
const clientId = "44444444-4444-4444-8444-444444444444";
const operationId = "55555555-5555-4555-8555-555555555555";

function iso(ms: number) {
  return new Date(ms).toISOString();
}

function dbRecord(overrides: Record<string, unknown> = {}) {
  return {
    attemptId,
    requestId,
    intakeId,
    clientId,
    operationId,
    profile: "full",
    attemptNumber: 1,
    status: "attention",
    executionStatus: "attention",
    dispatchState: "dispatched",
    deliveryStatus: "none",
    createdAt: iso(1_760_000_000_000),
    startedAt: iso(1_760_000_100_000),
    finishedAt: null,
    lastObservedAt: iso(1_760_000_200_000),
    costKind: "unreported",
    telemetryIncomplete: true,
    costs: [
      {
        currency: "USD",
        actual: null,
        estimated: null,
        unreportedCount: 2,
        incompleteCount: 0,
        unknownCoverageCount: 1,
      },
    ],
    attentionReason: "missing_handoff",
    recoveryReason: "missing_handoff",
    operatorAction: null,
    // These private fields must never cross the read mapper.
    payload: { email: "private@example.test" },
    consent: { termsVersion: "private" },
    ...overrides,
  };
}

const apiRecord: OperationRecord = {
  attemptId,
  requestId,
  intakeId,
  clientId,
  operationId,
  profile: "full",
  attemptNumber: 1,
  status: "attention",
  executionStatus: "attention",
  dispatchState: "dispatched",
  deliveryStatus: "none",
  createdAt: 1_760_000_000_000,
  startedAt: 1_760_000_100_000,
  finishedAt: null,
  lastObservedAt: 1_760_000_200_000,
  costKind: "unreported",
  telemetryIncomplete: true,
  costs: [
    {
      currency: "USD",
      actual: null,
      estimated: null,
      unreportedCount: 2,
      incompleteCount: 0,
      unknownCoverageCount: 1,
    },
  ],
  attentionReason: "missing_handoff",
  recoveryReason: "missing_handoff",
  operatorAction: null,
};

function sqlFixture(
  records: unknown[],
  options: { total?: number; hasMore?: boolean } = {},
) {
  const queries: Array<{ text: string; params: unknown[] }> = [];
  const sql: OperationsSql = {
    async query<T>(text: string, params: unknown[] = []): Promise<T[]> {
      queries.push({ text, params });
      if (text.includes("list_operations"))
        return [
          {
            record: {
              items: records,
              total: options.total ?? records.length,
              hasMore: options.hasMore ?? false,
            },
          },
        ] as T[];
      if (text.includes("get_operation"))
        return (records.length ? [{ record: records[0] }] : []) as T[];
      return [] as T[];
    },
  };
  return { sql, queries };
}

describe("operations dashboard store", () => {
  it("maps current records, stable IDs, observation time, cost kind and telemetry", async () => {
    const { sql, queries } = sqlFixture([dbRecord()], {
      total: 2,
      hasMore: true,
    });
    const store = createOperationsStore(sql);
    const page = await store.listOperations(50);
    expect(page).toMatchObject({
      total: 2,
      nextCursor: expect.any(String),
      items: [apiRecord],
    });
    expect(JSON.stringify(page)).not.toMatch(
      /private@example\.test|termsVersion|payload|consent/,
    );
    expect(queries[0].text).toContain("list_operations");
    expect(queries[0].params).toEqual([50, null, null]);
  });

  it("uses an opaque cursor that round-trips the exact ordered boundary", async () => {
    const cursor = encodeOperationsCursor({
      createdAt: "2026-10-28T20:00:00.123456Z",
      attemptId,
    });
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(decodeOperationsCursor(cursor)).toEqual({
      createdAt: "2026-10-28T20:00:00.123456Z",
      attemptId,
    });
    expect(() => decodeOperationsCursor("not a cursor")).toThrow();
    expect(() =>
      decodeOperationsCursor(
        Buffer.from(
          JSON.stringify({ createdAt: "not-a-date", attemptId }),
        ).toString("base64url"),
      ),
    ).toThrow();
  });

  it("passes the decoded cursor to the keyset query without a page-number offset", async () => {
    const { sql, queries } = sqlFixture([dbRecord()]);
    const store = createOperationsStore(sql);
    const cursor = encodeOperationsCursor({
      createdAt: "2026-10-28T20:00:00.123456Z",
      attemptId,
    });
    await store.listOperations(25, cursor);
    expect(queries[0].params).toEqual([
      25,
      "2026-10-28T20:00:00.123456Z",
      attemptId,
    ]);
    expect(JSON.stringify(queries[0])).not.toMatch(/offset/iu);
  });

  it("rejects invalid limits and cursors before querying storage", async () => {
    const { sql, queries } = sqlFixture([]);
    const store = createOperationsStore(sql);
    await expect(store.listOperations(0)).rejects.toThrow();
    await expect(store.listOperations(101)).rejects.toThrow();
    await expect(store.listOperations(10, "bad cursor")).rejects.toThrow();
    expect(queries).toHaveLength(0);
  });

  it("serves detail with recovery reason and audited operator action only", async () => {
    const detail = {
      ...dbRecord({
        operatorAction: {
          actorId: "admin:verified",
          recordedAt: iso(1_760_000_300_000),
          decision: "retain_attention",
          evidenceRef: "a".repeat(40),
        },
      }),
      events: [
        {
          eventId: "66666666-6666-4666-8666-666666666666",
          eventKey: "handoff:missing",
          stage: "handoff",
          transition: "failed",
          occurredAt: iso(1_760_000_150_000),
          recordedAt: iso(1_760_000_160_000),
          detailCode: "missing_handoff",
          provider: null,
          model: null,
          costKind: "unreported",
          amount: null,
          currency: null,
          buildSha: null,
        },
      ],
      eventCount: 1,
      workflow: {
        repository: "WrazyAI/launchloom",
        runId: "123",
        runAttempt: 1,
      },
      outbox: {
        state: "dispatched",
        retryCount: 0,
        nextAttemptAt: null,
        lastErrorCode: null,
      },
    };
    const { sql, queries } = sqlFixture([detail]);
    const store = createOperationsStore(sql);
    const record = await store.getOperation(attemptId);
    expect(record).toMatchObject({
      attemptId,
      recoveryReason: "missing_handoff",
      operatorAction: {
        actorId: "admin:verified",
        recordedAt: 1_760_000_300_000,
        decision: "retain_attention",
      },
      events: [{ eventKey: "handoff:missing", buildSha: null }],
    });
    expect(JSON.stringify(record)).not.toMatch(/private@example\.test|consent/);
    expect(queries[0].params).toEqual([attemptId]);
  });

  it("returns null for an unknown stable ID", async () => {
    const { sql } = sqlFixture([]);
    const store = createOperationsStore(sql);
    await expect(store.getOperation(attemptId)).resolves.toBeNull();
  });
});

describe("operations dashboard API", () => {
  const env = {
    OPERATIONS_RECONCILE_MODE: "observe-v1",
    OPERATIONS_DATABASE_URL: "postgres://unused.invalid/operations",
  } as unknown as Env;
  const admin = { id: "admin:verified", role: "admin" };
  const detail: OperationDetailRecord = {
    ...apiRecord,
    events: [],
    eventCount: 0,
    workflow: { repository: null, runId: null, runAttempt: null },
    outbox: {
      state: "dispatched",
      retryCount: 0,
      nextAttemptAt: null,
      lastErrorCode: null,
    },
  };
  const readStore = () => ({
    listOperations: vi.fn(async () => ({
      items: [apiRecord],
      nextCursor: "cursor-next",
      total: 2,
    })),
    getOperation: vi.fn(async () => detail),
  });

  it("returns an authenticated, labelled, paginated current-operations page", async () => {
    const store = readStore();
    const response = await operationsDashboardApi(
      new Request(`${workspace}/operations/records?limit=25&cursor=cursor-1`),
      env,
      admin,
      store,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("X-LaunchLoom-Record-Source")).toBe(
      "operations",
    );
    expect(await response.json()).toEqual({
      items: [apiRecord],
      nextCursor: "cursor-next",
      total: 2,
      recordSource: "operations",
      readOnly: true,
    });
    expect(store.listOperations).toHaveBeenCalledWith(25, "cursor-1");
    expect(JSON.stringify(apiRecord)).not.toMatch(
      /payload|consent|email|termsVersion/,
    );
  });

  it("denies unauthenticated and unauthorized callers before any read", async () => {
    for (const principal of [
      null,
      { id: "", role: "admin" },
      { id: "client:1", role: "client" },
    ]) {
      const store = readStore();
      const response = await operationsDashboardApi(
        new Request(`${workspace}/operations/records`),
        env,
        principal as { id: string; role: string } | null,
        store,
      );
      expect(response.status).toBe(403);
      expect(store.listOperations).not.toHaveBeenCalled();
    }
  });

  it("rejects non-read methods and unavailable configuration", async () => {
    const store = readStore();
    const post = await operationsDashboardApi(
      new Request(`${workspace}/operations/records`, { method: "POST" }),
      env,
      admin,
      store,
    );
    expect(post.status).toBe(405);

    const disabled = await operationsDashboardApi(
      new Request(`${workspace}/operations/records`),
      {} as Env,
      admin,
      store,
    );
    expect(disabled.status).toBe(503);
    expect(store.listOperations).not.toHaveBeenCalled();
  });

  it("rejects invalid pagination instead of reading with an unbounded query", async () => {
    const store = readStore();
    for (const query of ["limit=0", "limit=101", "cursor=bad%20cursor"]) {
      const response = await operationsDashboardApi(
        new Request(`${workspace}/operations/records?${query}`),
        env,
        admin,
        store,
      );
      expect(response.status).toBe(400);
    }
    expect(store.listOperations).not.toHaveBeenCalled();
  });

  it("returns detail and 404 for an unknown stable ID", async () => {
    const store = readStore();
    const found = await operationsDashboardApi(
      new Request(`${workspace}/operations/records/${attemptId}`),
      env,
      admin,
      store,
    );
    expect(found.status).toBe(200);
    expect(await found.json()).toEqual({
      operation: detail,
      recordSource: "operations",
      readOnly: true,
    });

    store.getOperation.mockResolvedValueOnce(
      null as unknown as OperationDetailRecord,
    );
    const missing = await operationsDashboardApi(
      new Request(`${workspace}/operations/records/${attemptId}`),
      env,
      admin,
      store,
    );
    expect(missing.status).toBe(404);
  });

  it("does not expose provider errors as private data", async () => {
    const store = readStore();
    store.listOperations.mockRejectedValueOnce(
      new Error("password=private connection string"),
    );
    const response = await operationsDashboardApi(
      new Request(`${workspace}/operations/records`),
      env,
      admin,
      store,
    );
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toMatch(
      /password|private|postgres/iu,
    );
  });
});

describe("legacy history", () => {
  const legacyAttempt = {
    attemptId: "legacy-issue-42",
    requestId: null,
    clientId: "submission:legacy-42",
    issueNumber: 42,
    profile: "full",
    executionStatus: "queued",
    deliveryStatus: "none",
    stale: false,
    createdAt: 1,
    startedAt: null,
    completedAt: null,
    updatedAt: 1,
    initiator: {
      kind: "admin",
      id: "admin-1",
      name: "Admin",
      email: "admin@example.test",
      source: "cloudflare-access",
    },
    invitationCreator: {
      kind: "admin",
      id: "admin-1",
      name: "Admin",
      email: "admin@example.test",
      source: "cloudflare-access",
    },
    repository: null,
    runId: null,
    runAttempt: null,
    failure: {
      category: null,
      stage: null,
      summary: null,
      evidenceUrl: null,
      nextStep: null,
    },
    costs: { actualUsd: null, estimatedUsd: null, unreportedCount: 0 },
  };
  function legacyEnv() {
    const ledger = {
      listAttempts: vi.fn(async () => ({
        items: [legacyAttempt],
        nextCursor: null,
        total: 1,
      })),
      getAttempt: vi.fn(async () => legacyAttempt),
      getAttemptEvents: vi.fn(async () => ({
        items: [],
        nextCursor: null,
        total: 0,
      })),
      listClients: vi.fn(async () => ({
        items: [],
        nextCursor: null,
        total: 0,
      })),
      getClient: vi.fn(async () => null),
      getHealth: vi.fn(async () => ({
        lastSyncAt: null,
        coverageStart: null,
        partial: false,
        lastError: null,
        pendingProjectionCount: 0,
      })),
    };
    const coordinator = {
      projectionHealth: vi.fn(async () => ({
        partial: false,
        pendingProjectionCount: 0,
        lastError: null,
      })),
      acceptanceHealth: vi.fn(async () => ({
        attentionCount: 0,
        lastError: null,
      })),
    };
    return {
      env: {
        GENERATION_LEDGER: { getByName: () => ledger },
        ONBOARDING_INVITES: { getByName: () => coordinator },
      } as unknown as Env,
      ledger,
    };
  }

  it("serves active issue-based requests through the explicitly read-only legacy route", async () => {
    const { env, ledger } = legacyEnv();
    const response = await workspaceApi(
      new Request(`${workspace}/legacy/attempts?limit=10`),
      env,
      "admin@example.test",
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("X-LaunchLoom-Record-Source")).toBe("legacy");
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      recordSource: "legacy",
      readOnly: true,
      total: 1,
      items: [{ attemptId: "legacy-issue-42", issueNumber: 42 }],
    });
    expect(ledger.listAttempts).toHaveBeenCalledTimes(1);
  });

  it("never writes to the legacy source", async () => {
    const { env, ledger } = legacyEnv();
    const response = await workspaceApi(
      new Request(`${workspace}/legacy/attempts`, {
        method: "POST",
        body: JSON.stringify({ action: "delete" }),
      }),
      env,
      "admin@example.test",
    );
    expect(response.status).toBe(405);
    expect(ledger.listAttempts).not.toHaveBeenCalled();
    expect(JSON.stringify(await response.json())).not.toMatch(
      /delete|mutation|write/iu,
    );
  });

  it("keeps the old read endpoints readable as labelled legacy history", async () => {
    const { env } = legacyEnv();
    const response = await workspaceApi(
      new Request(`${workspace}/attempts?limit=10`),
      env,
      "admin@example.test",
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      recordSource: "legacy",
      readOnly: true,
      items: [{ attemptId: "legacy-issue-42", issueNumber: 42 }],
    });
  });
});

describe("dashboard router authorization", () => {
  const bindings = testEnv as unknown as Env;
  it("denies unsigned reads and cross-origin requests", async () => {
    const unsigned = await worker.fetch(
      new Request(`${workspace}/operations/records`),
      bindings,
      {} as ExecutionContext,
    );
    expect(unsigned.status).toBe(401);

    const crossOrigin = await worker.fetch(
      new Request(`${workspace}/operations/records`, {
        headers: { Origin: "https://attacker.test" },
      }),
      bindings,
      {} as ExecutionContext,
    );
    expect(crossOrigin.status).toBe(403);
  });
});
