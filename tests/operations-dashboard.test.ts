import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, createAdminApi } from "../src/admin/api";
import {
  operationCostLabel,
  operationSourceLabel,
  operationStatusLabel,
  operationSummary,
  popCursorTrail,
  pushCursorTrail,
  telemetryLabel,
} from "../src/admin/operations-format";
import { readRouteState, writeRouteState } from "../src/admin/route-state";
import type {
  OperationDetail,
  OperationPage,
  OperationRecord,
} from "../src/lib/admin-contracts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function respond(response: Response | Promise<Response>) {
  const mock = vi.fn(async () => response);
  vi.stubGlobal("fetch", mock);
  return mock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const operation: OperationRecord = {
  attemptId: "11111111-1111-4111-8111-111111111111",
  requestId: "22222222-2222-4222-8222-222222222222",
  intakeId: "33333333-3333-4333-8333-333333333333",
  clientId: "44444444-4444-4444-8444-444444444444",
  operationId: "55555555-5555-4555-8555-555555555555",
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

const page: OperationPage = {
  items: [operation],
  nextCursor: "cursor-next",
  total: 2,
  recordSource: "operations",
  readOnly: true,
};

describe("operations API client", () => {
  it("requests the authenticated paginated operations endpoint", async () => {
    const mock = respond(json(page));
    const api = createAdminApi();
    await expect(
      api.listOperations({ limit: 25, cursor: "cursor-1" }),
    ).resolves.toEqual(page);
    expect(mock).toHaveBeenCalledTimes(1);
    const [path, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe(
      "/api/admin/onboarding-invites/workspace/operations/records?limit=25&cursor=cursor-1",
    );
    expect(init.method).toBeUndefined();
    expect(init.credentials).toBe("same-origin");
  });

  it("requests operation detail by stable attempt ID", async () => {
    const detail: OperationDetail = {
      ...operation,
      events: [],
      eventCount: 0,
      workflow: {
        repository: null,
        runId: null,
        runAttempt: null,
      },
      outbox: {
        state: "dispatched",
        retryCount: 0,
        nextAttemptAt: null,
        lastErrorCode: null,
      },
    };
    const mock = respond(
      json({
        operation: detail,
        recordSource: "operations",
        readOnly: true,
      }),
    );
    const api = createAdminApi();
    await expect(api.getOperation(operation.attemptId)).resolves.toEqual(
      detail,
    );
    const [path] = mock.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe(
      `/api/admin/onboarding-invites/workspace/operations/records/${operation.attemptId}`,
    );
  });

  it("requests legacy history through the explicit read-only route", async () => {
    const legacy = {
      ...page,
      recordSource: "legacy" as const,
      items: [
        {
          attemptId: "legacy-issue-42",
          requestId: null,
          clientId: "submission:legacy-42",
          issueNumber: 42,
          profile: "full" as const,
          executionStatus: "queued" as const,
          deliveryStatus: "none" as const,
          stale: false,
          createdAt: 1,
          startedAt: null,
          completedAt: null,
          updatedAt: 1,
          initiator: {
            kind: "admin" as const,
            id: "admin-1",
            name: "Admin",
            email: null,
            source: "cloudflare-access" as const,
          },
          invitationCreator: {
            kind: "admin" as const,
            id: "admin-1",
            name: "Admin",
            email: null,
            source: "cloudflare-access" as const,
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
          costs: {
            actualUsd: null,
            estimatedUsd: null,
            unreportedCount: 0,
          },
        },
      ],
      total: 1,
    };
    const mock = respond(json(legacy));
    const api = createAdminApi();
    await expect(api.listLegacyAttempts({ limit: 10 })).resolves.toMatchObject({
      recordSource: "legacy",
      total: 1,
    });
    const [path, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe(
      "/api/admin/onboarding-invites/workspace/legacy/attempts?limit=10",
    );
    expect(init.method).toBeUndefined();
  });

  it("rejects malformed operations pages instead of rendering invented rows", async () => {
    respond(json({ items: [{ attemptId: "not-a-uuid" }], total: 1 }));
    const api = createAdminApi();
    await expect(api.listOperations({ limit: 10 })).rejects.toMatchObject({
      name: "ApiRequestError",
      code: "invalid_response",
    });
  });

  it("surfaces authorization failures without returning private rows", async () => {
    respond(
      json(
        { error: { code: "forbidden", message: "Admin access required." } },
        403,
      ),
    );
    const api = createAdminApi();
    const error = await api
      .listOperations({ limit: 10 })
      .catch((value) => value);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ status: 403, code: "forbidden" });
    expect(JSON.stringify(error)).not.toMatch(/payload|email|consent/);
  });
});

describe("operations view model", () => {
  it("labels waiting, attention and verified preview distinctly", () => {
    expect(operationStatusLabel("waiting_to_start")).toMatchObject({
      label: "Waiting to start",
      tone: "waiting",
    });
    expect(operationStatusLabel("attention")).toMatchObject({
      label: "Needs attention",
      tone: "attention",
    });
    expect(operationStatusLabel("preview_ready")).toMatchObject({
      label: "Verified preview",
      tone: "ready",
    });
  });

  it("counts attention, verified previews, waiting work and incomplete telemetry", () => {
    expect(
      operationSummary([
        operation,
        { ...operation, attemptId: "preview", status: "preview_ready" },
        { ...operation, attemptId: "waiting", status: "waiting_to_start" },
      ]),
    ).toEqual({
      attention: 1,
      previewReady: 1,
      waiting: 1,
      incompleteTelemetry: 3,
    });
  });

  it("never turns unknown or incomplete cost into a zero estimate", () => {
    expect(operationCostLabel(operation)).toBe("Unreported");
    expect(
      operationCostLabel({
        ...operation,
        costKind: "estimated",
        costs: [
          {
            ...operation.costs[0],
            actual: null,
            estimated: "2.40",
            unreportedCount: 1,
          },
        ],
      }),
    ).toBe("Estimated USD 2.40 (incomplete)");
    expect(telemetryLabel(true)).toBe("Telemetry incomplete");
    expect(telemetryLabel(false)).toBe("Telemetry complete");
  });

  it("labels the two record sources separately", () => {
    expect(operationSourceLabel("operations")).toBe("Current operations");
    expect(operationSourceLabel("legacy")).toBe("Legacy history (read-only)");
  });

  it("keeps a bounded previous-page trail for stable pagination", () => {
    let trail: string[] = [];
    for (let index = 0; index < 60; index += 1) {
      trail = pushCursorTrail(trail, `cursor-${index}`);
    }
    expect(trail).toHaveLength(50);
    expect(trail[0]).toBe("cursor-10");
    const previous = popCursorTrail(trail);
    expect(previous.cursor).toBe("cursor-59");
    expect(previous.trail).toHaveLength(49);
    expect(popCursorTrail([])).toEqual({ cursor: null, trail: [] });
  });
});

describe("dashboard migration structure", () => {
  it("adds read-only definer functions with explicit worker grants", async () => {
    const sql = await readFile("db/operations/007-dashboard.sql", "utf8");
    expect(sql).toContain("list_operations");
    expect(sql).toContain("get_operation");
    expect(sql).toContain("operation_record");
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain(
      "SET search_path = pg_catalog, launchloom_operations, pg_temp",
    );
    expect(sql).toContain("TO launchloom_operations_worker");
    expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/u);
    expect(sql).not.toMatch(
      /GRANT[^;]*ON ALL TABLES|CREATE ROLE|CREATE DATABASE/iu,
    );
  });
});

describe("operations route state", () => {
  it("round-trips the current operations view without changing legacy routes", () => {
    const operations = writeRouteState({
      view: "operations",
      clientId: null,
      attemptId: operation.attemptId,
      filters: { limit: 25 },
      cursor: "cursor-next",
    });
    expect(readRouteState(operations)).toEqual({
      view: "operations",
      clientId: null,
      attemptId: operation.attemptId,
      filters: { limit: 25 },
      cursor: "cursor-next",
    });

    const legacy = writeRouteState({
      view: "generations",
      clientId: null,
      attemptId: null,
      filters: {},
      cursor: null,
    });
    expect(readRouteState(legacy).view).toBe("generations");
  });
});
