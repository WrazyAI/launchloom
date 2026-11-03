import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createGenerationActivityStore,
  type VerifiedTraceOwner,
} from "../worker/src/generation-activity/store";
import type { OperationsSql } from "../worker/src/operations/store";
import { encodeActivityCursor } from "../worker/src/generation-activity/cursor";
import { BASE_CALL_ID, traceEvent } from "./fixtures/generation-activity";
import type { TraceEvent } from "../src/lib/generation-activity";

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
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (err += chunk));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(out.trim()) : reject(Error(err)),
    );
    child.stdin.end(text);
  });
}

const asWorker = (text: string) =>
  sql(`begin; set local role launchloom_operations_worker; ${text}; commit;`);

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

const store = createGenerationActivityStore(connection);

function uuidFor(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}

let counter = 0;
async function createAttempt() {
  counter += 1;
  const row = JSON.parse(
    await sql(
      `select row_to_json(r) from launchloom_operations.create_acceptance(
        'synthetic-${counter}', 'submission-${counter}',
        '${"a".repeat(64)}', 1, '{}',
        '{"rightsConfirmed":true,"termsVersion":"test"}', 'full') r`,
    ),
  ) as { attempt_id: string; operation_id: string };
  const runId = String(9000 + counter);
  await sql(
    `update launchloom_operations.generation_attempts
        set workflow_repository = 'WrazyAI/launchloom',
            workflow_run_id = '${runId}', workflow_run_attempt = 1
      where id = '${row.attempt_id}'`,
  );
  const owner: VerifiedTraceOwner = {
    namespace: "operations",
    attemptId: row.attempt_id,
    repositoryId: "123",
    runId,
    runAttempt: 1,
  };
  return { attemptId: row.attempt_id, owner };
}

function event(
  attemptId: string,
  sequence: number,
  overrides: Record<string, unknown> = {},
): TraceEvent {
  return traceEvent({
    eventId: uuidFor(sequence),
    sequence,
    context: { ...traceEvent().context, attemptId },
    ...overrides,
  });
}

function usageEvent(
  attemptId: string,
  sequence: number,
  callId: string,
  overrides: Record<string, unknown> = {},
): TraceEvent {
  return event(attemptId, sequence, {
    kind: "usage",
    payload: {
      callId,
      usage: {
        inputTokens: null,
        outputTokens: null,
        cachedInputTokens: null,
        cacheWriteTokens: null,
        reasoningTokens: null,
        costUsd: null,
        costKind: "unreported",
        ...overrides,
      },
    },
  });
}

describe.skipIf(!url)("generation activity persistence", () => {
  beforeAll(async () => {
    for (const name of [
      "001-operations",
      "002-acceptance-recovery",
      "003-dispatch",
      "004-run-ownership",
      "005-reconciliation",
      "006-cost-coverage",
      "007-dashboard",
      "008-generation-activity",
    ])
      await sql(await readFile(`db/operations/${name}.sql`, "utf8"));
  }, 60_000);

  beforeEach(async () => {
    await sql(
      "truncate launchloom_operations.activity_expired, launchloom_operations.activity_partitions cascade",
    );
    await sql("truncate launchloom_operations.clients cascade");
  });

  it("serializes concurrent appends without losing or reusing a cursor", async () => {
    const { attemptId, owner } = await createAttempt();
    const results = await Promise.all([
      store.append(owner, [event(attemptId, 1)]),
      store.append(owner, [event(attemptId, 2)]),
    ]);
    expect(results.map((result) => result.accepted).sort()).toEqual([1, 1]);
    const page = await store.read(owner);
    expect(page.items).toHaveLength(2);
    const cursors = page.items.map((item) => item.cursor);
    expect(new Set(cursors).size).toBe(2);
    expect(page.recording).toBe("recording");
  });

  it("treats a repeated event as idempotent but rejects conflicting reuse", async () => {
    const { attemptId, owner } = await createAttempt();
    const first = await store.append(owner, [event(attemptId, 1)]);
    const replay = await store.append(owner, [event(attemptId, 1)]);
    expect(replay.accepted).toBe(0);
    expect(replay.lastCursor).toBe(first.lastCursor);
    await expect(
      store.append(owner, [
        event(attemptId, 1, {
          payload: {
            callId: BASE_CALL_ID,
            provider: "openrouter",
            model: "different-model",
          },
        }),
      ]),
    ).rejects.toMatchObject({
      name: "OperationsError",
      code: "conflict",
    });
    const page = await store.read(owner);
    expect(page.items).toHaveLength(1);
  });

  it("rejects a partition that is not bound to the verified run", async () => {
    const { attemptId, owner } = await createAttempt();
    await expect(
      store.append({ ...owner, runId: "77777" }, [event(attemptId, 1)]),
    ).rejects.toMatchObject({
      name: "OperationsError",
      code: "forbidden",
    });
    await expect(
      store.append({ ...owner, repositoryId: "not-a-number" }, [
        event(attemptId, 1),
      ]),
    ).rejects.toThrow(/Invalid activity request/u);
    expect((await store.read(owner)).items).toHaveLength(0);
  });

  it("keeps namespaces isolated", async () => {
    const { attemptId, owner } = await createAttempt();
    await store.append(owner, [event(attemptId, 1)]);
    const legacy = await store.read({
      namespace: "legacy",
      attemptId: "github:123:1",
    });
    expect(legacy.items).toHaveLength(0);
    expect(legacy.recording).toBe("not_recorded");
    const operations = await store.read(owner);
    expect(operations.items).toHaveLength(1);
  });

  it("pages history backwards and bounds the page size", async () => {
    const { attemptId, owner } = await createAttempt();
    for (let sequence = 1; sequence <= 5; sequence += 1)
      await store.append(owner, [
        event(attemptId, sequence, {
          kind: "error",
          payload: {
            scope: "stage",
            code: `failure_${sequence}`,
            message: { kind: "text", text: `stage ${sequence}` },
          },
        }),
      ]);
    const latest = await store.read(owner, { limit: 2 });
    expect(latest.items.map((item) => item.sequence)).toEqual([4, 5]);
    expect(latest.hasMore).toBe(true);
    const older = await store.read(owner, {
      before: latest.items[0].cursor,
      limit: 2,
    });
    expect(older.items.map((item) => item.sequence)).toEqual([2, 3]);
    const oldest = await store.read(owner, {
      before: older.items[0].cursor,
      limit: 2,
    });
    expect(oldest.items.map((item) => item.sequence)).toEqual([1]);
    expect(oldest.hasMore).toBe(false);
    await expect(store.read(owner, { limit: 101 })).rejects.toThrow(
      /Invalid activity request/u,
    );
    await expect(
      store.read(owner, {
        after: latest.nextCursor!,
        before: older.items[0].cursor,
      }),
    ).rejects.toThrow(/Invalid activity request/u);
    await expect(
      store.read(owner, { after: "v1.1.deadbeef" }),
    ).rejects.toThrow(/Invalid activity cursor/u);
  });

  it("catches up forward without skipping the middle of a burst", async () => {
    const { attemptId, owner } = await createAttempt();
    await store.append(owner, [event(attemptId, 1)]);
    // 150 more events arrive in bounded batches, as a long model burst would.
    for (let start = 2; start <= 151; start += 20) {
      const batch = Array.from(
        { length: Math.min(20, 152 - start) },
        (_, index) => event(attemptId, start + index),
      );
      await store.append(owner, batch);
    }
    const first = await store.read(owner, {
      after: encodeActivityCursor(owner, 1),
      limit: 100,
    });
    expect(first.items).toHaveLength(100);
    expect(first.items[0]?.sequence).toBe(2);
    expect(first.items.at(-1)?.sequence).toBe(101);
    expect(first.hasMore).toBe(true);
    const second = await store.read(owner, {
      after: first.nextCursor,
      limit: 100,
    });
    expect(second.items[0]?.sequence).toBe(102);
    expect(second.items.at(-1)?.sequence).toBe(151);
    expect(second.hasMore).toBe(false);
  });

  it("serves an expired partition as expired instead of healthy content", async () => {
    const { attemptId, owner } = await createAttempt();
    await store.append(owner, [event(attemptId, 1)]);
    await sql(
      `update launchloom_operations.activity_partitions
          set expires_at = now() - interval '1 day'
        where attempt_id = '${attemptId}'`,
    );
    const page = await store.read(owner);
    expect(page.recording).toBe("expired");
    expect(page.items).toHaveLength(0);
  });

  it("counts usage once per call and keeps rollups independent of the feed window", async () => {
    const { attemptId, owner } = await createAttempt();
    await store.append(owner, [
      usageEvent(attemptId, 1, uuidFor(101), {
        inputTokens: 0,
        outputTokens: 0,
      }),
      usageEvent(attemptId, 2, uuidFor(102)),
      usageEvent(attemptId, 3, uuidFor(103), {
        inputTokens: 100,
        outputTokens: 50,
        costUsd: "0.25",
        costKind: "actual",
      }),
    ]);
    // A duplicate usage record for a known call must not double count.
    await store.append(owner, [
      usageEvent(attemptId, 4, uuidFor(101), {
        inputTokens: 999,
        outputTokens: 999,
      }),
    ]);
    const page = await store.read(owner, { limit: 1 });
    expect(page.items).toHaveLength(1);
    expect(page.usage).toMatchObject({
      responses: 3,
      unknownResponses: 1,
      inputTokens: 100,
      outputTokens: 50,
      cost: {
        currency: "USD",
        actual: "0.25000000",
        estimated: null,
        unreportedCount: 2,
      },
    });
  });

  it("stops verbose content at capacity but still accepts control evidence", async () => {
    const { attemptId, owner } = await createAttempt();
    await store.append(owner, [event(attemptId, 1)]);
    await sql(
      `update launchloom_operations.activity_partitions
          set event_count = 10000 - 32, byte_count = 0, sequence = 32
        where attempt_id = '${attemptId}'`,
    );
    const verbose = await store.append(owner, [
      event(attemptId, 2, {
        kind: "action_started",
        payload: {
          actionId: "render:1",
          name: "render_candidate",
          input: { path: "src/index.astro" },
        },
      }),
    ]);
    expect(verbose.suppressed).toBe(true);
    expect(verbose.accepted).toBe(0);
    const finished = await store.append(owner, [
      event(attemptId, 3, {
        kind: "producer_finished",
        context: {
          ...traceEvent().context,
          attemptId,
          actor: { kind: "orchestrator", role: "run_finalizer" },
        },
        payload: { status: "incomplete", detail: null },
      }),
    ]);
    expect(finished.accepted).toBe(1);
    const page = await store.read(owner);
    expect(page.coverage).toContainEqual(
      expect.objectContaining({ boundary: "trace.capacity", status: "limited" }),
    );
    expect(page.recording).toBe("incomplete");
  });

  it("prunes only expired trace content and keeps lifecycle evidence", async () => {
    const expired = await createAttempt();
    const fresh = await createAttempt();
    await store.append(expired.owner, [event(expired.attemptId, 1)]);
    await store.append(fresh.owner, [event(fresh.attemptId, 1)]);
    await sql(
      `insert into launchloom_operations.stage_events(attempt_id, event_key, stage, transition)
       values ('${expired.attemptId}', 'evidence:1', 'intake', 'completed')`,
    );
    await sql(
      `update launchloom_operations.activity_partitions
          set expires_at = now() - interval '1 day'
        where attempt_id = '${expired.attemptId}'`,
    );
    const pruned = await store.pruneExpired(10);
    expect(pruned.deleted).toBe(1);
    const expiredPage = await store.read(expired.owner);
    expect(expiredPage.recording).toBe("expired");
    expect(expiredPage.items).toHaveLength(0);
    expect(
      await sql(
        `select count(*) from launchloom_operations.stage_events where attempt_id = '${expired.attemptId}'`,
      ),
    ).toBe("1");
    expect((await store.read(fresh.owner)).items).toHaveLength(1);
    // The tombstone is content-free and survives a second prune.
    await store.pruneExpired(10);
    expect((await store.read(expired.owner)).recording).toBe("expired");
  });

  it("rejects a sequence outside the integer range", async () => {
    const { attemptId, owner } = await createAttempt();
    const overflow = {
      ...event(attemptId, 1),
      sequence: 2_147_483_648,
    };
    await expect(store.append(owner, [overflow])).rejects.toThrow(
      /invalid generation activity/u,
    );
  });
});
