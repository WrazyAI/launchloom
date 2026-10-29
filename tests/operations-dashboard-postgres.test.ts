import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { beforeAll, describe, expect, it } from "vitest";
import {
  createOperationsStore,
  type OperationsSql,
} from "../worker/src/operations/store";

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

function psql(text: string): Promise<string> {
  if (!url) throw new Error("Disposable PostgreSQL target is required.");
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const child = spawn("psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1"], {
      env: {
        ...Object.fromEntries(
          Object.entries(process.env).filter(([key]) => !key.startsWith("PG")),
        ),
        PGHOST: target.hostname.replace(/^\[|\]$/gu, ""),
        PGPORT: target.port || "5432",
        PGDATABASE: decodeURIComponent(target.pathname.slice(1)),
        PGUSER: decodeURIComponent(target.username),
        PGPASSWORD: decodeURIComponent(target.password),
        PGCONNECT_TIMEOUT: "5",
      },
    });
    let out = "";
    let error = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (error += chunk));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(out.trim()) : reject(Error(error)),
    );
    child.stdin.end(text);
  });
}

const asWorker = (text: string) =>
  psql(`begin; set local role launchloom_operations_worker; ${text}; commit;`);

const fingerprint = (value: string) =>
  createHash("sha256").update(value).digest("hex");

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

type Created = {
  intakeId: string;
  requestId: string;
  attemptId: string;
  operationId: string;
};

async function createAttempt(
  label: string,
  marker: string,
  confirm = true,
): Promise<Created> {
  const created = JSON.parse(
    await asWorker(
      `select row_to_json(r) from launchloom_operations.create_acceptance(
        '${label}', 'submission-${label}', '${fingerprint(label)}', 1,
        '{"synthetic":true,"marker":"${marker}"}',
        '{"rightsConfirmed":true,"termsVersion":"task6-terms"}', 'full'
      ) r`,
    ),
  );
  if (confirm)
    await asWorker(
      `select launchloom_operations.confirm_acceptance('${created.intake_id}')`,
    );
  return {
    intakeId: created.intake_id,
    requestId: created.request_id,
    attemptId: created.attempt_id,
    operationId: created.operation_id,
  };
}

async function attachRun(created: Created, run: string) {
  await psql(
    `update launchloom_operations.generation_attempts
     set workflow_repository='WrazyAI/launchloom', workflow_run_id='${run}', workflow_run_attempt=1
     where id='${created.attemptId}'`,
  );
}

async function append(
  created: Created,
  run: string,
  key: string,
  stage: string,
  transition: string,
  costKind: string,
  amount: string | null,
  currency: string | null,
  buildSha: string | null,
  coverageComplete: boolean | null,
) {
  return asWorker(
    `select launchloom_operations.append_run_event(
      '${created.attemptId}', 'WrazyAI/launchloom', '${run}', 1,
      '${key}', '${stage}', '${transition}', NULL, NULL, NULL, NULL,
      '${costKind}', ${amount === null ? "NULL" : `'${amount}'`},
      ${currency === null ? "NULL" : `'${currency}'`},
      ${buildSha === null ? "NULL" : `'${buildSha}'`},
      ${coverageComplete === null ? "NULL" : String(coverageComplete)}
    )`,
  );
}

async function observe(created: Created, run: string, conclusion: string) {
  return asWorker(
    `select launchloom_operations.record_run_observation(
      '${created.attemptId}', 'WrazyAI/launchloom', '${run}', 1, '${conclusion}'
    )`,
  );
}

const ids = {
  waiting: "",
  unconfirmed: "",
  attention: "",
  preview: "",
  running: "",
  failed: "",
  concurrent: "",
};
let waitingRequestId = "";
const marker = "private-marker-task6-dashboard";

describe.skipIf(!url)(
  "Task 6 real disposable PostgreSQL dashboard projections",
  () => {
    let store: ReturnType<typeof createOperationsStore>;

    beforeAll(async () => {
      for (const round of [1, 2]) {
        for (const name of [
          "001-operations",
          "002-acceptance-recovery",
          "003-dispatch",
          "004-run-ownership",
          "005-reconciliation",
          "006-cost-coverage",
          "007-dashboard",
        ])
          await psql(await readFile(`db/operations/${name}.sql`, "utf8"));
        expect(round).toBeGreaterThan(0);
      }

      const waiting = await createAttempt("waiting", marker);
      const unconfirmed = await createAttempt("unconfirmed", marker, false);
      const attention = await createAttempt("attention", marker);
      const preview = await createAttempt("preview", marker);
      const running = await createAttempt("running", marker);
      const failed = await createAttempt("failed", marker);
      ids.waiting = waiting.attemptId;
      ids.unconfirmed = unconfirmed.attemptId;
      ids.attention = attention.attemptId;
      ids.preview = preview.attemptId;
      ids.running = running.attemptId;
      ids.failed = failed.attemptId;
      waitingRequestId = waiting.requestId;

      await attachRun(attention, "6101");
      await append(
        attention,
        "6101",
        "intake:completed",
        "intake",
        "completed",
        "actual",
        "0.50",
        "USD",
        null,
        false,
      );
      expect(await observe(attention, "6101", "success")).toBe("attention");
      expect(
        await asWorker(
          `select launchloom_operations.retain_attention('${attention.attemptId}', 'admin:task6', '${"b".repeat(40)}')`,
        ),
      ).toBe("attention");

      await attachRun(preview, "6102");
      await append(
        preview,
        "6102",
        "render:cost",
        "render",
        "completed",
        "actual",
        "1.25",
        "USD",
        null,
        true,
      );
      await append(
        preview,
        "6102",
        "handoff:completed",
        "handoff",
        "completed",
        "actual",
        "0",
        "USD",
        "c".repeat(40),
        true,
      );
      expect(await observe(preview, "6102", "success")).toBe("updated");

      await attachRun(running, "6103");
      await append(
        running,
        "6103",
        "render:estimated",
        "render",
        "completed",
        "estimated",
        "2.40",
        "USD",
        null,
        false,
      );
      expect(await observe(running, "6103", "pending")).toBe("updated");

      await attachRun(failed, "6104");
      await append(
        failed,
        "6104",
        "render:failed",
        "render",
        "failed",
        "unreported",
        null,
        null,
        null,
        null,
      );
      expect(await observe(failed, "6104", "failure")).toBe("updated");

      store = createOperationsStore(connection);
    }, 60_000);

    it("applies migrations 001-007 twice and enforces the worker role boundary", async () => {
      expect(
        await psql(
          "select count(*) from pg_proc where proname in ('operation_record','list_operations','get_operation')",
        ),
      ).toBe("3");
      expect(
        await psql(
          "select indexdef from pg_indexes where schemaname='launchloom_operations' and indexname='attempts_created_recency'",
        ),
      ).toContain("(created_at DESC, id DESC)");
      expect(await asWorker("select current_user")).toBe(
        "launchloom_operations_worker",
      );
      expect(
        JSON.parse(
          await asWorker(
            "select record from launchloom_operations.list_operations(2, NULL, NULL)",
          ),
        ),
      ).toMatchObject({ total: expect.any(Number), items: expect.any(Array) });
      await expect(
        asWorker("select * from launchloom_operations.intakes"),
      ).rejects.toThrow(/permission denied/iu);
      await expect(
        asWorker("insert into launchloom_operations.clients default values"),
      ).rejects.toThrow(/permission denied/iu);
    }, 30_000);

    it("returns current records with stable IDs, status, observation and cost kind only", async () => {
      const page = JSON.parse(
        await asWorker(
          "select record from launchloom_operations.list_operations(50, NULL, NULL)",
        ),
      );
      expect(page.total).toBeGreaterThanOrEqual(6);
      const byId = new Map(
        page.items.map((item: { attemptId: string }) => [item.attemptId, item]),
      );
      expect(byId.get(ids.waiting)).toMatchObject({
        status: "waiting_to_start",
        costKind: "unreported",
        telemetryIncomplete: true,
      });
      expect(byId.get(ids.unconfirmed)).toMatchObject({
        status: "attention",
        dispatchState: "attention",
        attentionReason: "acceptance_unconfirmed",
        recoveryReason: "acceptance_unconfirmed",
      });
      expect(byId.get(ids.attention)).toMatchObject({
        status: "attention",
        deliveryStatus: "none",
        attentionReason: "missing_handoff",
        recoveryReason: "missing_handoff",
        telemetryIncomplete: true,
      });
      expect(byId.get(ids.preview)).toMatchObject({
        status: "preview_ready",
        deliveryStatus: "preview_ready",
        costKind: "actual",
        telemetryIncomplete: false,
      });
      expect(byId.get(ids.running)).toMatchObject({
        status: "running",
        costKind: "estimated",
      });
      expect(byId.get(ids.failed)).toMatchObject({ status: "failed" });
      for (const item of page.items) {
        expect(item.attemptId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
        );
        expect(item.requestId).toMatch(/^[0-9a-f-]{36}$/u);
        expect(item.operationId).toMatch(/^[0-9a-f-]{36}$/u);
        expect(typeof item.lastObservedAt).toBe("string");
        expect(["actual", "estimated", "unreported"]).toContain(item.costKind);
        expect(item).not.toHaveProperty("payload");
        expect(item).not.toHaveProperty("consent");
        expect(item).not.toHaveProperty("email");
        expect(item).not.toHaveProperty("issueNumber");
      }
      expect(JSON.stringify(page)).not.toContain(marker);
      expect(JSON.stringify(page)).not.toContain("task6-terms");
      expect(JSON.stringify(page)).not.toMatch(/legacy|issueNumber/iu);
    }, 30_000);

    it("serves 007 detail with recovery reason and audited operator action only", async () => {
      const raw = JSON.parse(
        await asWorker(
          `select launchloom_operations.get_operation('${ids.attention}')`,
        ),
      );
      expect(raw).toMatchObject({
        attemptId: ids.attention,
        recoveryReason: "missing_handoff",
      });
      const attention = await store.getOperation(ids.attention);
      expect(attention).toMatchObject({
        status: "attention",
        recoveryReason: "missing_handoff",
        operatorAction: {
          actorId: "admin:task6",
          decision: "retain_attention",
          evidenceRef: "b".repeat(40),
        },
        workflow: {
          repository: "WrazyAI/launchloom",
          runId: "6101",
          runAttempt: 1,
        },
      });
      expect(attention?.operatorAction?.recordedAt).toEqual(expect.any(Number));
      expect(attention?.events[0]).toMatchObject({
        stage: "intake",
        transition: "completed",
        costKind: "actual",
        amount: "0.50",
        currency: "USD",
      });
      const preview = await store.getOperation(ids.preview);
      expect(preview).toMatchObject({
        status: "preview_ready",
        deliveryStatus: "preview_ready",
        costKind: "actual",
        telemetryIncomplete: false,
        recoveryReason: null,
        operatorAction: null,
      });
      expect(preview?.costs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            currency: "USD",
            actual: "1.25",
            unreportedCount: 0,
            incompleteCount: 0,
            unknownCoverageCount: 0,
          }),
        ]),
      );
      expect(JSON.stringify(preview)).not.toContain(marker);
      expect(JSON.stringify(attention)).not.toContain("task6-terms");
    }, 30_000);

    it("keeps keyset pages disjoint and stable across concurrent reads and an insert", async () => {
      const first = await store.listOperations(2);
      expect(first.items).toHaveLength(2);
      expect(first.nextCursor).toEqual(expect.any(String));
      const firstIds = first.items.map((item) => item.attemptId);

      const [second, concurrent] = await Promise.all([
        store.listOperations(2, first.nextCursor),
        createAttempt("concurrent", marker),
      ]);
      expect(second.items).toHaveLength(2);
      const secondIds = second.items.map((item) => item.attemptId);
      expect(new Set([...firstIds, ...secondIds]).size).toBe(4);
      expect(firstIds.filter((id) => secondIds.includes(id))).toEqual([]);
      expect(concurrent.attemptId).toEqual(expect.any(String));
      ids.concurrent = concurrent.attemptId;

      const concurrentReads = await Promise.all(
        Array.from({ length: 6 }, () => store.listOperations(2)),
      );
      const signatures = concurrentReads.map((page) =>
        page.items.map((item) => item.attemptId).join(","),
      );
      expect(new Set(signatures).size).toBe(1);
      expect(concurrentReads.every((page) => page.items.length === 2)).toBe(
        true,
      );

      const after = await store.getOperation(ids.concurrent);
      expect(after).toMatchObject({ status: "waiting_to_start" });
    }, 60_000);

    it("does not let one partial attempt null the whole page", async () => {
      const orphanId = await psql(
        `insert into launchloom_operations.generation_attempts(request_id, attempt_number)
         values ('${waitingRequestId}', 2) returning id`,
      );
      expect(orphanId).toMatch(/^[0-9a-f-]{36}$/u);
      const page = JSON.parse(
        await asWorker(
          "select record from launchloom_operations.list_operations(50, NULL, NULL)",
        ),
      );
      expect(page.items.every((item: unknown) => item !== null)).toBe(true);
      expect(
        page.items.map((item: { attemptId: string }) => item.attemptId),
      ).not.toContain(orphanId);
      expect(page.total).toBe(
        Number(
          await psql(
            `select count(*) from launchloom_operations.generation_attempts a
             join launchloom_operations.generation_requests r on r.id = a.request_id
             join launchloom_operations.intakes i on i.id = r.intake_id
             join launchloom_operations.dispatch_outbox o on o.attempt_id = a.id`,
          ),
        ),
      );
      const listed = await store.listOperations(50);
      expect(listed.items.every((item) => item !== null)).toBe(true);
      expect(listed.items.map((item) => item.attemptId)).not.toContain(
        orphanId,
      );
    }, 30_000);

    it("rejects invalid limits and cursors before touching storage", async () => {
      await expect(store.listOperations(0)).rejects.toThrow();
      await expect(store.listOperations(101)).rejects.toThrow();
      await expect(
        store.listOperations(10, "not-a-real-cursor"),
      ).rejects.toThrow();
    }, 30_000);
  },
);
