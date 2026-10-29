import { describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:test";
import worker, { type Env } from "../src/index";
import {
  createAttemptReconciler,
  githubRunObserver,
  operationsResolutionApi,
  scheduledReconciliation,
  type ReconcileResult,
} from "../src/operations/reconcile";

const id = "11111111-1111-4111-8111-111111111111";
const run = { repositoryId: "123", runId: "456", runAttempt: 1 };
function fixture(overrides = {}) {
  const snapshot = { attemptId: id, run, state: "running", ...overrides };
  const store = {
    getReconciliationAttempt: vi.fn(async () => snapshot),
    recordRunObservation: vi.fn(
      async (_id, _run, conclusion): Promise<ReconcileResult> =>
        ["success", "unknown"].includes(conclusion) ? "attention" : "updated",
    ),
    resolveAttention: vi.fn(async (): Promise<ReconcileResult> => "updated"),
  };
  return { store, snapshot };
}
describe("GitHub reconciliation fails closed", () => {
  it.each(["failure", "cancelled", "timed_out", "success"])(
    "records missing callback from observed %s, never guesses preview",
    async (conclusion) => {
      const { store } = fixture();
      const reconcile = createAttemptReconciler(store, async () => ({
        ...run,
        status: "completed",
        conclusion,
      }));
      expect(await reconcile.reconcileAttempt(id)).toBe(
        conclusion === "success" ? "attention" : "updated",
      );
      expect(store.recordRunObservation).toHaveBeenCalledWith(
        id,
        run,
        conclusion,
      );
    },
  );
  it("unknown dispatch correlation stays attention without querying guessed run", async () => {
    const { store } = fixture({ run: null });
    const observe = vi.fn();
    expect(
      await createAttemptReconciler(store, observe).reconcileAttempt(id),
    ).toBe("attention");
    expect(observe).not.toHaveBeenCalled();
    expect(store.recordRunObservation).toHaveBeenCalledWith(
      id,
      null,
      "unknown",
    );
  });
  it("rejects mismatched observed identity and redacts dependency failure", async () => {
    const { store } = fixture();
    expect(
      await createAttemptReconciler(store, async () => ({
        ...run,
        runAttempt: 2,
        status: "completed",
        conclusion: "success",
      })).reconcileAttempt(id),
    ).toBe("attention");
    expect(store.recordRunObservation).toHaveBeenCalledWith(id, run, "unknown");
    expect(
      await createAttemptReconciler(store, async () => {
        throw Error("Bearer secret private@example.test");
      }).reconcileAttempt(id),
    ).toBe("attention");
  });
  it("reads exact GitHub run attempt and verifies repository identity", async () => {
    const send = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        Response.json({
          id: 456,
          run_attempt: 1,
          repository: { id: 123 },
          status: "completed",
          conclusion: "cancelled",
        }),
    );
    const observe = githubRunObserver(
      { repository: "owner/repo", token: "secret" },
      send as typeof fetch,
    );
    expect(await observe(run)).toEqual({
      ...run,
      status: "completed",
      conclusion: "cancelled",
    });
    expect(send.mock.calls[0][0]).toBe(
      "https://api.github.com/repos/owner/repo/actions/runs/456/attempts/1",
    );
  });
  it("does not trust a successful response for another repository", async () => {
    const observe = githubRunObserver(
      { repository: "owner/repo", token: "secret" },
      (async () =>
        Response.json({
          id: 456,
          run_attempt: 1,
          repository: { id: 999 },
          status: "completed",
          conclusion: "success",
        })) as typeof fetch,
    );
    await expect(observe(run)).rejects.toThrow("Run observation unavailable.");
  });
  it("denies reporting-only users and unproven ownership transfer without touching storage", async () => {
    const { store } = fixture();
    const request = () =>
      new Request("https://worker.test/resolve", {
        method: "POST",
        body: JSON.stringify({ attemptId: id, decision: "retry" }),
      });
    expect(
      (
        await operationsResolutionApi(
          request(),
          { id: "actor", role: "viewer" },
          store,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await operationsResolutionApi(
          request(),
          { id: "actor", role: "admin" },
          store,
        )
      ).status,
    ).toBe(400);
    expect(store.resolveAttention).not.toHaveBeenCalled();
  });
  it("records authorized retain-attention decisions with server-derived actor", async () => {
    const { store } = fixture();
    const req = new Request("https://worker.test/resolve", {
      method: "POST",
      body: JSON.stringify({
        attemptId: id,
        decision: "retain_attention",
        evidenceRef: "a".repeat(40),
      }),
    });
    expect(
      (
        await operationsResolutionApi(
          req,
          { id: "verified-actor", role: "admin" },
          store,
        )
      ).status,
    ).toBe(200);
    expect(store.resolveAttention).toHaveBeenCalledWith(
      id,
      "verified-actor",
      "a".repeat(40),
    );
  });
  it("scheduled reconciliation is explicitly disabled by default and makes no queries", async () => {
    const query = vi.fn();
    await scheduledReconciliation({}, { query });
    expect(query).not.toHaveBeenCalled();
  });
  it("owner has the same authorized resolution access as admin", async () => {
    const { store } = fixture();
    const req = new Request("https://worker.test/resolve", {
      method: "POST",
      body: JSON.stringify({
        attemptId: id,
        decision: "retain_attention",
        evidenceRef: "a".repeat(40),
      }),
    });
    expect(
      (
        await operationsResolutionApi(
          req,
          { id: "verified-owner", role: "owner" },
          store,
        )
      ).status,
    ).toBe(200);
  });
  it("actual HTTP router denies unsigned and cross-origin resolution requests", async () => {
    const url =
      "https://api.example.test/api/admin/onboarding-invites/workspace/operations/resolutions";
    const unsigned = await worker.fetch(
      new Request(url, { method: "POST", body: "{}" }),
      env as unknown as Env,
      {} as ExecutionContext,
    );
    expect(unsigned.status).toBe(401);
    const crossOrigin = await worker.fetch(
      new Request(url, {
        method: "POST",
        headers: { Origin: "https://attacker.test" },
        body: "{}",
      }),
      env as unknown as Env,
      {} as ExecutionContext,
    );
    expect(crossOrigin.status).toBe(403);
  });
  it('scheduled observation applies the exact stored run and emits only controlled alert metadata', async () => {
    const queries: Array<{ text: string; params: unknown[] }> = [];
    const sql = { async query<T>(text: string, params: unknown[] = []): Promise<T[]> {
      queries.push({ text, params });
      const rows = text.includes('list_reconciliation_attempts') ? [{ attempt_id: id }]
        : text.includes('get_reconciliation_attempt') ? [{ attempt_id: id, repository_id: '123', run_id: '456', run_attempt: 1, state: 'running' }]
          : text.includes('record_run_observation') ? [{ result: 'attention' }]
            : [{ attemptId: id, code: 'missing_handoff' }];
      return rows as T[];
    } };
    const send = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ id: 456, run_attempt: 1, repository: { id: 123 }, status: 'completed', conclusion: 'success', display_title: 'private@example.test' }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await scheduledReconciliation({ OPERATIONS_RECONCILE_MODE: 'observe-v1', OPERATIONS_DISPATCH_REPOSITORY: 'owner/repo', GITHUB_ORG_TOKEN: 'private-token' }, sql);
      expect(queries.find(query => query.text.includes('record_run_observation'))?.params).toEqual([id, '123', '456', 1, 'success']);
      expect(warn.mock.calls).toEqual([[JSON.stringify({ operations_alert: 'missing_handoff', attemptId: id })]]);
      expect(JSON.stringify(warn.mock.calls)).not.toMatch(/private|token/);
      expect(send).toHaveBeenCalledTimes(1);
    } finally { send.mockRestore(); warn.mockRestore(); }
  });
});
