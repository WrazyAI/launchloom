import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createOperationsStore,
  type OperationsSql,
} from "../worker/src/operations/store";
import { createAttemptReconciler } from "../worker/src/operations/reconcile";
import { summarizeGenerationCosts } from "../scripts/generation-cost-summary.mjs";
import { buildOperationsCostEvents } from "../scripts/record-generation-event.mjs";

const url = process.env.OPERATIONS_TEST_DATABASE_URL;
if (url) {
  const target = new URL(url);
  if (
    !["postgres:", "postgresql:"].includes(target.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) ||
    target.search ||
    !/^\/launchloom_operations_test(?:_[a-z0-9_]+)?$/u.test(target.pathname) ||
    process.env.OPERATIONS_TEST_DISPOSABLE !== "1"
  )
    throw Error("Disposable loopback PostgreSQL required.");
}
async function sql(text: string): Promise<string> {
  const target = new URL(url!);
  return new Promise((resolve, reject) => {
    const child = spawn("psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1"], {
      env: {
        ...Object.fromEntries(
          Object.entries(process.env).filter(([key]) => !key.startsWith("PG")),
        ),
        PGHOST: target.hostname.replace(/^\[|\]$/gu, ""),
        PGPORT: target.port || "5432",
        PGDATABASE: target.pathname.slice(1),
        PGUSER: decodeURIComponent(target.username),
        PGPASSWORD: decodeURIComponent(target.password),
        PGCONNECT_TIMEOUT: "5",
      },
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (c) => (out += c));
    child.stderr.on("data", (c) => (err += c));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(out.trim()) : reject(Error(err)),
    );
    child.stdin.end(text);
  });
}
const asWorker = (text: string) =>
  sql(`begin; set local role launchloom_operations_worker; ${text}; commit;`);
let attempt: string;
const run = ` '123', '456', 1 `;
const append = (
  stage = "intake",
  transition = "completed",
  key = "event:1",
  sha = "NULL",
  owner = run,
  cost = `'unreported', NULL, NULL`,
) =>
  asWorker(
    `select launchloom_operations.append_run_event('${attempt}', ${owner}, '${key}', '${stage}', '${transition}', NULL, NULL, NULL, NULL, ${cost}, ${sha})`,
  );
const observe = (conclusion: string) =>
  asWorker(
    `select launchloom_operations.record_run_observation('${attempt}', ${run}, '${conclusion}')`,
  );
const state = () =>
  sql(
    `select state || ':' || coalesce(terminal_reason, '') || ':' || delivery_state from launchloom_operations.generation_attempts where id='${attempt}'`,
  );
const connection: OperationsSql = {
  async query<T>(text: string, params: unknown[] = []): Promise<T[]> {
    const rendered = text.replace(/\$(\d+)/gu, (_, index) => {
      const value = params[Number(index) - 1];
      return value === null || value === undefined
        ? "NULL"
        : `'${String(value).replaceAll("'", "''")}'`;
    });
    return JSON.parse(
      await asWorker(
        `select coalesce(json_agg(row_to_json(q)), '[]') from (${rendered}) q`,
      ),
    );
  },
};

describe.skipIf(!url)(
  "Task 5 real PostgreSQL ownership, monotonic state and cost evidence",
  () => {
    beforeAll(async () => {
      for (const name of [
        "001-operations",
        "002-acceptance-recovery",
        "003-dispatch",
        "004-run-ownership",
        "005-reconciliation",
        "006-cost-coverage",
      ])
        await sql(await readFile(`db/operations/${name}.sql`, "utf8"));
    });
    beforeEach(async () => {
      await sql(`truncate launchloom_operations.clients cascade`);
      const created = JSON.parse(
        await asWorker(
          `select row_to_json(r) from launchloom_operations.create_acceptance('synthetic', 'submission', '${"a".repeat(64)}', 1, '{}', '{"rightsConfirmed":true,"termsVersion":"test"}', 'full') r`,
        ),
      );
      attempt = created.attempt_id;
      await asWorker(
        `select launchloom_operations.confirm_acceptance('${created.intake_id}')`,
      );
      await sql(
        `update launchloom_operations.dispatch_outbox set state='leased', gate_provenance='verified-v1' where id='${created.operation_id}'`,
      );
      expect(
        await asWorker(
          `select launchloom_operations.claim_run('${created.operation_id}', ${run})`,
        ),
      ).toBe("claimed");
    });
    it("deduplicates events and fences wrong-run callbacks", async () => {
      expect(await append()).toBe("inserted");
      expect(await append()).toBe("duplicate");
      expect(
        await append("intake", "completed", "other", "NULL", `'123', '999', 1`),
      ).toBe("attention");
      expect(
        await sql("select count(*) from launchloom_operations.stage_events"),
      ).toBe("1");
    });
    it("retains late stage evidence without regressing failed terminal state", async () => {
      expect(await observe("failure")).toBe("updated");
      expect(await append()).toBe("inserted");
      expect(await observe("pending")).toBe("unchanged");
      expect(await state()).toBe("failed:github_failure:none");
    });
    it.each(["cancelled", "timed_out"])(
      "reconciles missing callback for %s",
      async (conclusion) => {
        await observe(conclusion);
        expect(await state()).toBe(
          `${conclusion === "cancelled" ? "cancelled" : "failed"}:github_${conclusion}:none`,
        );
      },
    );
    it("success without post-gate handoff is attention, not preview-ready", async () => {
      expect(await observe("success")).toBe("attention");
      expect(await state()).toBe("attention:missing_handoff:none");
      expect(await append("preview_ready")).toBe("inserted");
      await observe("success");
      expect(await state()).toBe("attention:missing_handoff:none");
    });
    it("authenticated SHA-bound handoff plus GitHub success proves preview delivery", async () => {
      await append("handoff", "completed", "handoff:1", `'${"a".repeat(40)}'`);
      expect(await observe("success")).toBe("updated");
      expect(await state()).toBe("succeeded:verified_handoff:preview_ready");
      await observe("unknown");
      expect(await state()).toBe("succeeded:verified_handoff:preview_ready");
    });
    it("late handoff repairs incomplete telemetry but cannot override GitHub failure", async () => {
      await observe("success");
      await append("handoff", "completed", "handoff:1", `'${"a".repeat(40)}'`);
      await observe("success");
      expect(await state()).toBe("succeeded:verified_handoff:preview_ready");
    });
    it("rejects malformed handoff, private metadata and conflicting idempotency payload", async () => {
      await expect(append("handoff")).rejects.toThrow();
      await expect(append("private@example.test")).rejects.toThrow();
      await append();
      await expect(append("authoring")).rejects.toThrow();
    });
    it("keeps estimated and unreported costs distinct and exact", async () => {
      await append(
        "authoring",
        "completed",
        "cost:1",
        "NULL",
        run,
        `'estimated', 0.10000001, 'USD'`,
      );
      await append(
        "imagery",
        "completed",
        "cost:2",
        "NULL",
        run,
        `'actual', 0.20000002, 'USD'`,
      );
      await append("seo_research", "completed", "cost:3");
      const rollup = JSON.parse(
        await asWorker(
          `select row_to_json(r) from launchloom_operations.attempt_cost_rollup('${attempt}') r`,
        ),
      );
      expect(rollup).toEqual({
        currency: "USD",
        actual: "0.20000002",
        estimated: "0.10000001",
        unreported: 1,
        incomplete: 0,
        unknown_coverage: 3,
      });
    });
    it("unknown run correlation remains attention and never queues a retry", async () => {
      await sql(
        `update launchloom_operations.generation_attempts set workflow_repository=NULL, workflow_run_id=NULL, workflow_run_attempt=NULL, state='waiting_to_start' where id='${attempt}'`,
      );
      expect(
        await asWorker(
          `select launchloom_operations.record_run_observation('${attempt}', NULL, NULL, NULL, 'unknown')`,
        ),
      ).toBe("attention");
      expect(await state()).toBe("attention:unknown_run:none");
      expect(
        await sql(
          "select count(*) from launchloom_operations.generation_attempts",
        ),
      ).toBe("1");
    });
    it("audits actor, evidence and checked run without altering ownership", async () => {
      await observe("unknown");
      await asWorker(
        `select launchloom_operations.retain_attention('${attempt}', 'verified-admin', '${"a".repeat(40)}')`,
      );
      const audit = JSON.parse(
        await sql(
          "select row_to_json(r) from launchloom_operations.operator_resolutions r",
        ),
      );
      expect(audit.actor_id).toBe("verified-admin");
      expect(audit.run_id).toBe("456");
      expect(audit.decision).toBe("retain_attention");
      expect(await state()).toBe("attention:observation_unavailable:none");
      await expect(
        asWorker("select * from launchloom_operations.operator_resolutions"),
      ).rejects.toThrow(/permission denied/);
    });
    it("reconciles through the real production store transport and exact owner snapshot", async () => {
      const store = createOperationsStore(connection);
      expect(await store.listReconciliationAttempts()).toEqual([attempt]);
      const identity = { repositoryId: "123", runId: "456", runAttempt: 1 };
      expect(await store.getReconciliationAttempt(attempt)).toEqual({
        attemptId: attempt,
        run: identity,
        state: "running",
      });
      await store.appendEvent(attempt, identity, {
        eventKey: "handoff:1",
        stage: "handoff",
        transition: "completed",
        buildSha: "b".repeat(40),
      });
      const reconciler = createAttemptReconciler(store, async (verified) => ({
        ...verified,
        status: "completed",
        conclusion: "success",
      }));
      expect(await reconciler.reconcileAttempt(attempt)).toBe("updated");
      expect(await state()).toBe("succeeded:verified_handoff:preview_ready");
      expect(await store.listReconciliationAttempts()).toEqual([]);
      expect(await store.getOperationAlerts()).toEqual([]);
    });
    it("rejects stale observation identities and keeps late handoff from overriding failure", async () => {
      await observe("failure");
      await append("handoff", "completed", "handoff:1", `'${"a".repeat(40)}'`);
      await observe("success");
      expect(await state()).toBe("failed:github_failure:none");
      expect(
        await asWorker(
          `select launchloom_operations.record_run_observation('${attempt}', '123', '999', 1, 'success')`,
        ),
      ).toBe("attention");
      expect(await state()).toBe("failed:github_failure:none");
    });
    it("retains exact known subtotals and incomplete coverage independently in event and rollup", async () => {
      const store = createOperationsStore(connection);
      const identity = { repositoryId: "123", runId: "456", runAttempt: 1 };
      const [event] = buildOperationsCostEvents(
        attempt,
        summarizeGenerationCosts({
          siteConfigUsage: {
            records: [
              { usage: { cost: "0.100000000000000001" } },
              { usage: {} },
            ],
          },
        }),
      );
      await store.appendEvent(attempt, identity, event);
      expect(await store.appendEvent(attempt, identity, event)).toBe(
        "duplicate",
      );
      const row = JSON.parse(
        await sql(
          "select row_to_json(r) from launchloom_operations.stage_events r",
        ),
      );
      expect(row.coverage_complete).toBe(false);
      const rollup = JSON.parse(
        await asWorker(
          `select row_to_json(r) from launchloom_operations.attempt_cost_rollup('${attempt}') r`,
        ),
      );
      expect(rollup).toMatchObject({
        actual: "0.100000000000000001",
        estimated: "0",
        incomplete: 1,
        unknown_coverage: 0,
      });
      await expect(
        store.appendEvent(attempt, identity, {
          ...event,
          coverageComplete: true,
        }),
      ).rejects.toMatchObject({ code: "conflict" });
    });
    it("records paid usage after a terminal failure without changing execution or delivery", async () => {
      await observe("failure");
      const [event] = buildOperationsCostEvents(
        attempt,
        summarizeGenerationCosts({
          creativeRun: {
            status: "failed",
            usage: [{ usage: { cost: "0.10000001" } }],
          },
        }),
      );
      await createOperationsStore(connection).appendEvent(
        attempt,
        { repositoryId: "123", runId: "456", runAttempt: 1 },
        event,
      );
      expect(await state()).toBe("failed:github_failure:none");
      const rollup = JSON.parse(
        await asWorker(
          `select row_to_json(r) from launchloom_operations.attempt_cost_rollup('${attempt}') r`,
        ),
      );
      expect(rollup).toMatchObject({
        actual: "0.10000001",
        incomplete: 0,
        unknown_coverage: 0,
      });
    });
  },
);
