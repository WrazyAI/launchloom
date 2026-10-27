import { spawn } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { createOperationsStore, type OperationsSql } from "../worker/src/operations/store";
import { dispatchScheduled, scheduledOperations } from "../worker/src/operations/dispatch";
import * as persistence from "../worker/src/operations/store";

const url = process.env.OPERATIONS_TEST_DATABASE_URL;
if (url) {
  const u = new URL(url);
  if (!["postgres:", "postgresql:"].includes(u.protocol) ||
      !["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) || u.search ||
      !/^\/launchloom_operations_test(?:_[a-z0-9_]+)?$/u.test(u.pathname))
    throw new Error("Only an explicitly disposable loopback operations test database is permitted.");
}
const enabled = Boolean(url) && process.env.OPERATIONS_TEST_DISPOSABLE === "1";
function psql(text: string): Promise<string> {
  const u = new URL(url!);
  return new Promise((resolve, reject) => {
    const child = spawn("psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1"], {
      env: { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("PG"))),
        PGHOST: u.hostname.replace(/^\[|\]$/gu, ""), PGPORT: u.port || "5432",
        PGDATABASE: decodeURIComponent(u.pathname.slice(1)), PGUSER: decodeURIComponent(u.username),
        PGPASSWORD: decodeURIComponent(u.password), PGCONNECT_TIMEOUT: "5" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "", error = "";
    child.stdout.on("data", b => { out += b; });
    child.stderr.on("data", b => { error += b; });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve(out.trim()) : reject(new Error(error)));
    child.stdin.end(text);
  });
}
function literal(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}
function connection(): OperationsSql {
  return { async query<T>(text: string, params: unknown[] = []): Promise<T[]> {
    const rendered = text.replace(/\$(\d+)/gu, (_, n) => literal(params[Number(n)-1]));
    return JSON.parse(await psql(`SET ROLE launchloom_operations_worker; SELECT coalesce(json_agg(row_to_json(q)), '[]'::json) FROM (${rendered}) q;`));
  } };
}
const now = () => Date.now();
const store = () => createOperationsStore(connection());
async function acceptance(confirmed = true) {
  const s = store();
  const id = crypto.randomUUID();
  const accepted = await s.createAcceptance({ inviteId: `dispatch-${id}`, submissionId: `submission-${id}`,
    fingerprint: "a".repeat(64), payloadVersion: 1, payload: { businessName: "Synthetic fixture" },
    consent: { termsVersion: "test-v1", rightsConfirmed: true }, profile: "test" });
  if (confirmed) {
    await s.confirmAcceptance(accepted.intakeId);
    // Eligibility tests control their due time explicitly, rather than assume
    // the application and database clocks are synchronized at first dispatch.
    await psql(`UPDATE launchloom_operations.dispatch_outbox SET next_attempt_at='2000-01-01T00:00:00Z' WHERE id='${accepted.operationId}';`);
  }
  return accepted;
}
async function row(operationId: string) {
  return JSON.parse(await psql(`SELECT row_to_json(q) FROM (SELECT o.*, r.dispatch_state, a.state AS attempt_state,
    a.workflow_run_id FROM launchloom_operations.dispatch_outbox o
    JOIN launchloom_operations.generation_requests r ON r.id=o.request_id
    JOIN launchloom_operations.generation_attempts a ON a.id=o.attempt_id WHERE o.id='${operationId}') q;`));
}
// Tests intentionally retain rows between calls/connections, exercising process restart semantics.
describe.runIf(enabled)("durable dispatch on real disposable Postgres", () => {
  it("grants service-only dispatch functions without exposing them to membership or admin roles", async () => {
    const privileges = JSON.parse(await psql(`SELECT json_agg(row_to_json(q)) FROM (
      SELECT role, signature, has_function_privilege(role, signature, 'execute') AS allowed
      FROM unnest(ARRAY['launchloom_operations_worker','launchloom_worker','launchloom_admin']) role
      CROSS JOIN unnest(ARRAY[
        'launchloom_operations.lease_dispatch(timestamp with time zone)',
        'launchloom_operations.record_dispatch_result(uuid,bigint,text,timestamp with time zone)',
        'launchloom_operations.claim_run(uuid,text,text,integer)']) signature
    ) q;`));
    expect(privileges).toHaveLength(9);
    for (const p of privileges) expect(p.allowed).toBe(p.role === "launchloom_operations_worker");
  });

  it("never leases blocked or merely pending but unconfirmed entries", async () => {
    const a = await acceptance(false);
    expect(await store().leaseDispatch(now())).toBeNull();
    await psql(`UPDATE launchloom_operations.dispatch_outbox SET state='pending' WHERE id='${a.operationId}';`);
    expect(await store().leaseDispatch(now())).toBeNull();
    await psql(`UPDATE launchloom_operations.dispatch_outbox SET state='blocked_unconfirmed' WHERE id='${a.operationId}';`);
  });

  it("keeps a known rejection waiting_to_start and a fresh scheduled instance retries after backoff", async () => {
    const a = await acceptance();
    await dispatchScheduled({ store: store(), dispatch: async () => "retryable", now });
    expect(await row(a.operationId)).toMatchObject({ state: "pending", retry_count: 1, dispatch_state: "waiting_to_start", attempt_state: "waiting_to_start" });
    expect(await store().leaseDispatch(now())).toBeNull();
    let sent = 0;
    const restartTime = now() + 61_000;
    await dispatchScheduled({ store: store(), dispatch: async () => { sent++; return "accepted"; }, now: () => restartTime });
    expect(sent).toBe(1);
    expect(await row(a.operationId)).toMatchObject({ state: "dispatched", workflow_run_id: null, attempt_state: "waiting_to_start" });
  });

  it("does not re-dispatch an accepted response lost in transit, but permits one first claim", async () => {
    const a = await acceptance();
    await dispatchScheduled({ store: store(), dispatch: async () => { throw new Error("response lost after GitHub accepted"); }, now });
    expect(await row(a.operationId)).toMatchObject({ state: "attention", last_error_code: "dispatch_unknown", workflow_run_id: null });
    expect(await store().leaseDispatch(now() + 100_000)).toBeNull();
    expect(await store().claimRun(a.operationId, { repositoryId: "123", runId: "1001", runAttempt: 1 })).toBe("claimed");
  });

  it("serializes lease races, expires a crashed worker to attention, and ignores stale fence results", async () => {
    const a = await acceptance();
    const timestamp = now();
    const leases = await Promise.all([store().leaseDispatch(timestamp), store().leaseDispatch(timestamp)]);
    expect(leases.filter(Boolean)).toHaveLength(1);
    const lease = leases.find(Boolean)!;
    await store().recordDispatchResult(a.operationId, lease.fence + 1, { outcome: "accepted", now: timestamp });
    expect(await row(a.operationId)).toMatchObject({ state: "leased", retry_count: 0 });
    await store().leaseDispatch(timestamp + 121_000);
    await store().recordDispatchResult(a.operationId, lease.fence, { outcome: "retryable", now: timestamp + 121_000 });
    expect(await row(a.operationId)).toMatchObject({ state: "attention", last_error_code: "dispatch_lease_expired" });
  });

  it("elects exactly one duplicate run and never transfers unknown prior side effects", async () => {
    const a = await acceptance();
    const lease = await store().leaseDispatch(now());
    expect(lease?.operationId).toBe(a.operationId);
    const results = await Promise.all([
      store().claimRun(a.operationId, { repositoryId: "123", runId: "2001", runAttempt: 1 }),
      store().claimRun(a.operationId, { repositoryId: "123", runId: "2002", runAttempt: 1 }),
    ]);
    expect(results.sort()).toEqual(["claimed", "duplicate"]);
    await store().recordDispatchResult(a.operationId, lease!.fence, { outcome: "unknown", now: now() });
    expect(await row(a.operationId)).toMatchObject({ state: "dispatched", attempt_state: "running" });
    await psql(`UPDATE launchloom_operations.generation_attempts SET state='attention', terminal_reason='side_effects_unknown' WHERE id='${a.attemptId}';`);
    expect(await store().claimRun(a.operationId, { repositoryId: "123", runId: "2003", runAttempt: 1 })).toBe("attention");
  });

  it("rejects claims before dispatch and refuses same-run replay or rerun takeover", async () => {
    const a = await acceptance();
    const run = { repositoryId: "123", runId: "3001", runAttempt: 1 };
    expect(await store().claimRun(a.operationId, run)).toBe("attention");
    await store().leaseDispatch(now());
    expect(await store().claimRun(a.operationId, run)).toBe("claimed");
    expect(await store().claimRun(a.operationId, run)).toBe("duplicate");
    expect(await store().claimRun(a.operationId, { ...run, runAttempt: 2 })).toBe("duplicate");
  });

  it("resumes a quiet-period cron with new store instances over the same persistent database", async () => {
    const a = await acceptance();
    // Replace only the external Neon HTTP transport, not store/lease/SQL logic.
    const sql = vi.spyOn(persistence, "operationsDatabaseSql").mockImplementation(() => connection());
    let requests = 0;
    vi.stubGlobal("fetch", async () => { requests++; return new Response(null, { status: requests === 1 ? 429 : 204 }); });
    const env = { OPERATIONS_DATABASE_URL: "synthetic-transport-only", OPERATIONS_DISPATCH_MODE: "claim-gated-v1",
      OPERATIONS_CLAIM_GATE: "verified-v1", OPERATIONS_DISPATCH_REPOSITORY: "synthetic/test",
      OPERATIONS_DISPATCH_WORKFLOW: "operations.yml", OPERATIONS_DISPATCH_REF: "fixture", GITHUB_ORG_TOKEN: "synthetic" };
    try {
      await scheduledOperations(env);
      expect(await row(a.operationId)).toMatchObject({ state: "pending", dispatch_state: "waiting_to_start" });
      // No request wakes the worker. A fresh cron invocation reconstructs its
      // store and discovers the persisted due entry after the quiet period.
      await psql(`UPDATE launchloom_operations.dispatch_outbox SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE id='${a.operationId}';`);
      await scheduledOperations(env);
      expect(sql).toHaveBeenCalledTimes(2);
      expect(requests).toBe(2);
      expect(await row(a.operationId)).toMatchObject({ state: "dispatched", workflow_run_id: null });
    } finally { sql.mockRestore(); vi.unstubAllGlobals(); }
  });

  it("bounds rate-limit retries with persisted exponential backoff and terminal attention", async () => {
    const a = await acceptance();
    let timestamp = now();
    const delays = [60, 120, 240, 480, 960, 1920, 3600];
    for (let i = 0; i < 8; i++) {
      const leased = await store().leaseDispatch(timestamp);
      expect(leased?.operationId).toBe(a.operationId);
      await store().recordDispatchResult(a.operationId, leased!.fence, { outcome: "retryable", now: timestamp });
      const current = await row(a.operationId);
      if (i < 7) {
        expect(Date.parse(current.next_attempt_at) - timestamp).toBe(delays[i] * 1000);
        expect(await store().leaseDispatch(timestamp + delays[i]*1000 - 1)).toBeNull();
        timestamp += delays[i]*1000;
      }
    }
    expect(await row(a.operationId)).toMatchObject({ state: "attention", retry_count: 8, last_error_code: "dispatch_retries_exhausted", dispatch_state: "attention" });
    expect(await store().leaseDispatch(timestamp + 10_000_000)).toBeNull();
  });

  it("never shares one trusted run across two operations", async () => {
    const a = await acceptance();
    await store().leaseDispatch(now());
    const identity = { repositoryId: "987", runId: "9001", runAttempt: 1 };
    expect(await store().claimRun(a.operationId, identity)).toBe("claimed");
    const b = await acceptance();
    await store().leaseDispatch(now());
    expect(await store().claimRun(b.operationId, identity)).toBe("attention");
    expect(await row(b.operationId)).toMatchObject({ attempt_state: "waiting_to_start", workflow_run_id: null });
  });
});
