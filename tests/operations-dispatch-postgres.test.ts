import { spawn } from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
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
const gatedStore = () => createOperationsStore(connection(), { uncertainDispatchRetry: true });
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
  beforeEach(async () => {
    // Each case owns one acceptance. Park any due/leased rows left by a prior
    // case so a later lease-order assertion cannot consume unrelated work.
    await psql(`UPDATE launchloom_operations.dispatch_outbox SET state='attention',
      lease_until=NULL, last_error_code=coalesce(last_error_code,'test_cleanup')
      WHERE state IN ('pending','leased');`);
    await psql(`UPDATE launchloom_operations.generation_requests SET dispatch_state='attention'
      WHERE id IN (SELECT request_id FROM launchloom_operations.dispatch_outbox
        WHERE state='attention' AND last_error_code='test_cleanup');`);
  });

  it("grants service-only dispatch functions without exposing them to membership or admin roles", async () => {
    const privileges = JSON.parse(await psql(`SELECT json_agg(row_to_json(q)) FROM (
      SELECT role, signature, has_function_privilege(role, signature, 'execute') AS allowed
      FROM unnest(ARRAY['launchloom_operations_worker','launchloom_worker','launchloom_admin']) role
      CROSS JOIN unnest(ARRAY[
        'launchloom_operations.lease_dispatch(timestamp with time zone,boolean)',
        'launchloom_operations.record_dispatch_result(uuid,bigint,text,timestamp with time zone,boolean,integer)',
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

  it("automatically resumes an uncertain outage under the verified gate", async () => {
    const a = await acceptance();
    const t = now();
    await dispatchScheduled({
      store: gatedStore(),
      dispatch: async () => { throw new Error("outage before any response"); },
      now: () => t,
    });
    const waiting = await row(a.operationId);
    expect(waiting).toMatchObject({
      state: "pending", retry_count: 1, last_error_code: "dispatch_unknown",
      dispatch_state: "waiting_to_start", attempt_state: "waiting_to_start", workflow_run_id: null,
    });
    expect(Date.parse(waiting.next_attempt_at) - t).toBe(60_000);
    expect(await gatedStore().leaseDispatch(t + 59_999)).toBeNull();
    let sent = 0;
    await dispatchScheduled({
      store: gatedStore(),
      dispatch: async () => { sent++; return "accepted"; },
      now: () => t + 60_000,
    });
    expect(sent).toBe(1);
    expect(await row(a.operationId)).toMatchObject({
      state: "dispatched", workflow_run_id: null, attempt_state: "waiting_to_start",
    });
    expect(await gatedStore().claimRun(a.operationId, {
      repositoryId: "123", runId: "4001", runAttempt: 1,
    })).toBe("claimed");
    expect(await row(a.operationId)).toMatchObject({
      attempt_state: "running", workflow_run_id: "4001",
    });
  });

  it("recovers a crashed sender lease under the gate without transferring ownership", async () => {
    const a = await acceptance();
    const t = now();
    const crashed = await gatedStore().leaseDispatch(t);
    expect(crashed?.operationId).toBe(a.operationId);
    expect(await gatedStore().leaseDispatch(t + 121_000)).toBeNull();
    const requeued = await row(a.operationId);
    expect(requeued).toMatchObject({
      state: "pending", retry_count: 1, last_error_code: "dispatch_lease_expired",
      dispatch_state: "waiting_to_start", attempt_state: "waiting_to_start", workflow_run_id: null,
    });
    expect(Date.parse(requeued.next_attempt_at) - (t + 121_000)).toBe(60_000);
    await gatedStore().recordDispatchResult(a.operationId, crashed!.fence, {
      outcome: "accepted", now: t + 121_000,
    });
    expect(await row(a.operationId)).toMatchObject({ state: "pending", workflow_run_id: null });
    await dispatchScheduled({
      store: gatedStore(),
      dispatch: async (retried) => {
        // Stable operation identity is the duplicate-safety key; fencing moves.
        expect(retried.operationId).toBe(a.operationId);
        expect(retried.payload).toEqual(crashed!.payload);
        expect(retried.fence).toBeGreaterThan(crashed!.fence);
        return "accepted";
      },
      now: () => t + 181_000,
    });
    expect(await row(a.operationId)).toMatchObject({ state: "dispatched", workflow_run_id: null });
    expect(await gatedStore().claimRun(a.operationId, {
      repositoryId: "123", runId: "4101", runAttempt: 1,
    })).toBe("claimed");
    expect(await gatedStore().claimRun(a.operationId, {
      repositoryId: "123", runId: "4102", runAttempt: 1,
    })).toBe("duplicate");
  });

  it("lets the real run from a lost accepted response win while retry is pending, with no replay", async () => {
    const a = await acceptance();
    const t = now();
    await dispatchScheduled({
      store: gatedStore(),
      dispatch: async () => { throw new Error("response lost after GitHub accepted"); },
      now: () => t,
    });
    expect(await row(a.operationId)).toMatchObject({
      state: "pending", last_error_code: "dispatch_unknown", workflow_run_id: null,
    });
    expect(await gatedStore().claimRun(a.operationId, {
      repositoryId: "123", runId: "5001", runAttempt: 1,
    })).toBe("claimed");
    expect(await gatedStore().claimRun(a.operationId, {
      repositoryId: "123", runId: "5002", runAttempt: 1,
    })).toBe("duplicate");
    await gatedStore().recordDispatchResult(a.operationId, 1, {
      outcome: "accepted", now: t + 10_000_000,
    });
    expect(await gatedStore().leaseDispatch(t + 10_000_000)).toBeNull();
    expect(await row(a.operationId)).toMatchObject({
      state: "dispatched", attempt_state: "running", workflow_run_id: "5001",
    });
  });

  it("bounds uncertain recovery and surfaces terminal attention instead of looping forever", async () => {
    const a = await acceptance();
    let t = now();
    const delays = [60, 120, 240, 480, 960, 1920, 3600];
    for (let i = 0; i < 8; i++) {
      const leased = await gatedStore().leaseDispatch(t);
      expect(leased?.operationId).toBe(a.operationId);
      await gatedStore().recordDispatchResult(a.operationId, leased!.fence, {
        outcome: "unknown", now: t,
      });
      const current = await row(a.operationId);
      if (i < 7) {
        expect(current).toMatchObject({ state: "pending", dispatch_state: "waiting_to_start" });
        expect(Date.parse(current.next_attempt_at) - t).toBe(delays[i] * 1000);
        expect(await gatedStore().leaseDispatch(t + delays[i] * 1000 - 1)).toBeNull();
        t += delays[i] * 1000;
      }
    }
    expect(await row(a.operationId)).toMatchObject({
      state: "attention", retry_count: 8, last_error_code: "dispatch_unknown",
      dispatch_state: "attention",
    });
    expect(await gatedStore().leaseDispatch(t + 10_000_000)).toBeNull();
  });

  it("honors a capped rate-limit delay and keeps an ordinary forbidden terminal", async () => {
    const a = await acceptance();
    const t = now();
    await dispatchScheduled({
      store: gatedStore(),
      dispatch: async () => ({ outcome: "retryable", retryAfterSeconds: 300 }),
      now: () => t,
    });
    const limited = await row(a.operationId);
    expect(limited).toMatchObject({ state: "pending", dispatch_state: "waiting_to_start" });
    expect(Date.parse(limited.next_attempt_at) - t).toBe(300_000);
    expect(await gatedStore().leaseDispatch(t + 299_999)).toBeNull();
    await dispatchScheduled({
      store: gatedStore(),
      dispatch: async () => "rejected",
      now: () => t + 300_000,
    });
    expect(await row(a.operationId)).toMatchObject({
      state: "attention", last_error_code: "dispatch_rejected", dispatch_state: "attention",
    });
  });

  it("persists first-send gate provenance and never upgrades an unverified send", async () => {
    const a = await acceptance();
    const t = now();
    const lease = await store().leaseDispatch(t);
    expect(lease?.operationId).toBe(a.operationId);
    expect((await row(a.operationId)).gate_provenance).toBe("unverified");
    await gatedStore().recordDispatchResult(a.operationId, lease!.fence, {
      outcome: "unknown", now: t,
    });
    expect(await row(a.operationId)).toMatchObject({
      state: "attention", last_error_code: "dispatch_unknown",
      uncertain_replay: false, gate_provenance: "unverified",
      dispatch_state: "attention", attempt_state: "waiting_to_start",
    });
  });

  it("does not recover a crashed unverified lease after the gate is enabled", async () => {
    const a = await acceptance();
    const t = now();
    expect((await store().leaseDispatch(t))?.operationId).toBe(a.operationId);
    expect((await row(a.operationId)).gate_provenance).toBe("unverified");
    expect(await gatedStore().leaseDispatch(t + 121_000)).toBeNull();
    expect(await row(a.operationId)).toMatchObject({
      state: "attention", last_error_code: "dispatch_lease_expired",
      uncertain_replay: false, gate_provenance: "unverified",
      dispatch_state: "attention", attempt_state: "waiting_to_start",
    });
  });

  it("keeps unverified provenance on a later gated retry lease", async () => {
    const a = await acceptance();
    const t = now();
    const lease = await store().leaseDispatch(t);
    await gatedStore().recordDispatchResult(a.operationId, lease!.fence, {
      outcome: "retryable", now: t,
    });
    expect(await row(a.operationId)).toMatchObject({
      state: "pending", gate_provenance: "unverified",
    });
    await psql(`UPDATE launchloom_operations.dispatch_outbox
      SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE id='${a.operationId}';`);
    expect((await gatedStore().leaseDispatch(now()))?.operationId).toBe(a.operationId);
    expect((await row(a.operationId)).gate_provenance).toBe("unverified");
  });

  it("records verified provenance for a gated first send and fails closed when it is disabled later", async () => {
    const a = await acceptance();
    const t = now();
    const lease = await gatedStore().leaseDispatch(t);
    expect((await row(a.operationId)).gate_provenance).toBe("verified-v1");
    await store().recordDispatchResult(a.operationId, lease!.fence, {
      outcome: "unknown", now: t,
    });
    expect(await row(a.operationId)).toMatchObject({
      state: "attention", last_error_code: "dispatch_unknown",
      uncertain_replay: false, gate_provenance: "verified-v1",
    });
  });

  it("lets prior verified uncertainty claim after a later 429 retry", async () => {
    const a = await acceptance();
    const t = now();
    await dispatchScheduled({
      store: gatedStore(),
      dispatch: async () => { throw new Error("response lost"); },
      now: () => t,
    });
    expect(await row(a.operationId)).toMatchObject({
      state: "pending", uncertain_replay: true, gate_provenance: "verified-v1",
    });
    await psql(`UPDATE launchloom_operations.dispatch_outbox
      SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE id='${a.operationId}';`);
    await dispatchScheduled({
      store: gatedStore(), dispatch: async () => "retryable", now: () => now(),
    });
    expect(await row(a.operationId)).toMatchObject({
      state: "pending", last_error_code: "github_rate_limited",
      uncertain_replay: true, gate_provenance: "verified-v1",
    });
    expect(await gatedStore().claimRun(a.operationId, {
      repositoryId: "123", runId: "7001", runAttempt: 1,
    })).toBe("claimed");
    expect(await gatedStore().claimRun(a.operationId, {
      repositoryId: "123", runId: "7002", runAttempt: 1,
    })).toBe("duplicate");
  });

  it("lets prior verified uncertainty claim after a later rejection status", async () => {
    const a = await acceptance();
    const t = now();
    await dispatchScheduled({
      store: gatedStore(),
      dispatch: async () => { throw new Error("response lost"); },
      now: () => t,
    });
    await psql(`UPDATE launchloom_operations.dispatch_outbox
      SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE id='${a.operationId}';`);
    await dispatchScheduled({
      store: gatedStore(), dispatch: async () => "rejected", now: () => now(),
    });
    expect(await row(a.operationId)).toMatchObject({
      state: "attention", last_error_code: "dispatch_rejected",
      uncertain_replay: true, gate_provenance: "verified-v1",
    });
    expect(await gatedStore().claimRun(a.operationId, {
      repositoryId: "123", runId: "7051", runAttempt: 1,
    })).toBe("claimed");
  });

  it("lets prior verified uncertainty claim after later 429 retries exhaust", async () => {
    const a = await acceptance();
    const t = now();
    await dispatchScheduled({
      store: gatedStore(),
      dispatch: async () => { throw new Error("response lost"); },
      now: () => t,
    });
    for (let i = 0; i < 7; i++) {
      await psql(`UPDATE launchloom_operations.dispatch_outbox
        SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE id='${a.operationId}';`);
      await dispatchScheduled({
        store: gatedStore(), dispatch: async () => "retryable", now: () => now(),
      });
    }
    expect(await row(a.operationId)).toMatchObject({
      state: "attention", retry_count: 8,
      last_error_code: "dispatch_retries_exhausted",
      uncertain_replay: true, gate_provenance: "verified-v1",
    });
    expect(await gatedStore().claimRun(a.operationId, {
      repositoryId: "123", runId: "7101", runAttempt: 1,
    })).toBe("claimed");
  });

  it("floors a short supplied Retry-After under exponential backoff", async () => {
    const a = await acceptance();
    const t = now();
    const lease = await gatedStore().leaseDispatch(t);
    await gatedStore().recordDispatchResult(a.operationId, lease!.fence, {
      outcome: "retryable", retryAfterSeconds: 1, now: t,
    });
    const current = await row(a.operationId);
    expect(Date.parse(current.next_attempt_at) - t).toBe(60_000);
    expect(await gatedStore().leaseDispatch(t + 59_999)).toBeNull();
  });

  it("refuses to lease unowned waiting attempts with prior-effect evidence", async () => {
    const evidence = [
      "started_at=clock_timestamp()",
      "finished_at=clock_timestamp()",
      "terminal_reason='legacy_waiting'",
      `artifact_references='["synthetic"]'::jsonb`,
    ];
    for (const update of evidence) {
      const a = await acceptance();
      await psql(`UPDATE launchloom_operations.generation_attempts
        SET ${update} WHERE id='${a.attemptId}';`);
      expect(await gatedStore().leaseDispatch(now())).toBeNull();
      expect(await row(a.operationId)).toMatchObject({
        state: "attention", last_error_code: "prior_effects_unexplained",
        dispatch_state: "attention", attempt_state: "attention",
      });
    }
    const staged = await acceptance();
    await psql(`INSERT INTO launchloom_operations.stage_events(
      attempt_id,event_key,stage,transition) VALUES(
      '${staged.attemptId}','prior-1','copy','observed');`);
    expect(await gatedStore().leaseDispatch(now())).toBeNull();
    expect(await row(staged.operationId)).toMatchObject({
      state: "attention", last_error_code: "prior_effects_unexplained",
      attempt_state: "attention",
    });
    const blocked = await acceptance(false);
    await psql(`UPDATE launchloom_operations.generation_attempts
      SET started_at=clock_timestamp() WHERE id='${blocked.attemptId}';`);
    expect(await gatedStore().leaseDispatch(now())).toBeNull();
    expect(await row(blocked.operationId)).toMatchObject({
      state: "attention", last_error_code: "prior_effects_unexplained",
      attempt_state: "attention",
    });
  });

  it("refuses a claim on a waiting attempt with artifacts or stage evidence", async () => {
    const a = await acceptance();
    expect((await gatedStore().leaseDispatch(now()))?.operationId).toBe(a.operationId);
    await psql(`UPDATE launchloom_operations.generation_attempts
      SET artifact_references='["synthetic"]'::jsonb WHERE id='${a.attemptId}';`);
    expect(await gatedStore().claimRun(a.operationId, {
      repositoryId: "123", runId: "8001", runAttempt: 1,
    })).toBe("attention");
    expect(await row(a.operationId)).toMatchObject({
      state: "attention", last_error_code: "prior_effects_unexplained",
      dispatch_state: "attention", attempt_state: "attention",
    });

    const b = await acceptance();
    expect((await gatedStore().leaseDispatch(now()))?.operationId).toBe(b.operationId);
    await psql(`INSERT INTO launchloom_operations.stage_events(
      attempt_id,event_key,stage,transition) VALUES(
      '${b.attemptId}','prior-2','copy','observed');`);
    expect(await gatedStore().claimRun(b.operationId, {
      repositoryId: "123", runId: "8002", runAttempt: 1,
    })).toBe("attention");
    expect(await row(b.operationId)).toMatchObject({
      state: "attention", last_error_code: "prior_effects_unexplained",
      attempt_state: "attention",
    });
  });

  it("serializes lease and claim on unexplained prior effects", async () => {
    const a = await acceptance();
    await psql(`UPDATE launchloom_operations.generation_attempts
      SET started_at=clock_timestamp() WHERE id='${a.attemptId}';`);
    const [lease, claim] = await Promise.all([
      gatedStore().leaseDispatch(now()),
      gatedStore().claimRun(a.operationId, {
        repositoryId: "123", runId: "8101", runAttempt: 1,
      }),
    ]);
    expect(lease).toBeNull();
    expect(claim).toBe("attention");
    expect(await row(a.operationId)).toMatchObject({
      state: "attention", last_error_code: "prior_effects_unexplained",
      attempt_state: "attention", workflow_run_id: null,
    });
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

  it("does not let a proven non-accepted 429 retry elect a pre-dispatch run", async () => {
    const a = await acceptance();
    await dispatchScheduled({ store: gatedStore(), dispatch: async () => "retryable", now });
    expect(await row(a.operationId)).toMatchObject({
      state: "pending", last_error_code: "github_rate_limited",
      dispatch_state: "waiting_to_start",
    });
    expect(await gatedStore().claimRun(a.operationId, {
      repositoryId: "123", runId: "6001", runAttempt: 1,
    })).toBe("attention");
    // This case intentionally leaves a due pending row; park it so later
    // lease-order assertions in this shared persistent fixture stay isolated.
    await psql(`UPDATE launchloom_operations.dispatch_outbox
      SET state='attention', last_error_code='test_cleanup' WHERE id='${a.operationId}';`);
  });

  it("recovers a real 5xx outage through the scheduled handler after a restart", async () => {
    const a = await acceptance();
    const sql = vi.spyOn(persistence, "operationsDatabaseSql").mockImplementation(() => connection());
    let requests = 0;
    vi.stubGlobal("fetch", async () => {
      requests++;
      return new Response(null, { status: requests === 1 ? 503 : 204 });
    });
    const env = {
      OPERATIONS_DATABASE_URL: "synthetic-transport-only",
      OPERATIONS_DISPATCH_MODE: "claim-gated-v1",
      OPERATIONS_CLAIM_GATE: "verified-v1",
      OPERATIONS_DISPATCH_REPOSITORY: "synthetic/test",
      OPERATIONS_DISPATCH_WORKFLOW: "operations.yml",
      OPERATIONS_DISPATCH_REF: "fixture",
      GITHUB_ORG_TOKEN: "synthetic",
    };
    try {
      await scheduledOperations(env);
      expect(await row(a.operationId)).toMatchObject({
        state: "pending", last_error_code: "dispatch_unknown",
        dispatch_state: "waiting_to_start", attempt_state: "waiting_to_start",
      });
      // A fresh cron invocation reconstructs the store after the quiet period.
      await psql(`UPDATE launchloom_operations.dispatch_outbox
        SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE id='${a.operationId}';`);
      await scheduledOperations(env);
      expect(requests).toBe(2);
      expect(await row(a.operationId)).toMatchObject({
        state: "dispatched", workflow_run_id: null, attempt_state: "waiting_to_start",
      });
    } finally {
      sql.mockRestore();
      vi.unstubAllGlobals();
    }
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
    expect(await store().claimRun(a.operationId, {
      repositoryId: "123", runId: "7201", runAttempt: 1,
    })).toBe("attention");
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
