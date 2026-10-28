import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createOperationsStore, type OperationsSql } from "../worker/src/operations/store";

/**
 * Real PostgreSQL proof for migration 004 (run-owned intake reads and events).
 *
 * Explicit opt-in to an ALREADY disposable LOCAL PostgreSQL database only.
 * Never falls back to a deployed connection or inherited PG* overrides.
 */
const url = process.env.OPERATIONS_TEST_DATABASE_URL;
if (url) {
  const target = new URL(url);
  if (
    !["postgres:", "postgresql:"].includes(target.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
    target.search ||
    process.env.OPERATIONS_TEST_DISPOSABLE !== "1" ||
    !/^\/launchloom_operations_test(?:_[a-z0-9_]+)?$/u.test(target.pathname)
  )
    throw new Error(
      "Operations integration tests require OPERATIONS_TEST_DISPOSABLE=1 and a fresh local launchloom_operations_test[_suffix] database without connection overrides.",
    );
}
const enabled = Boolean(url) && process.env.OPERATIONS_TEST_DISPOSABLE === "1";

function psql(sql: string): Promise<string> {
  if (!url) throw new Error("Disposable PostgreSQL target is required.");
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const child = spawn("psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1"], {
      env: {
        ...Object.fromEntries(
          Object.entries(process.env).filter(([key]) => !key.startsWith("PG")),
        ),
        PGDATABASE: decodeURIComponent(target.pathname.slice(1)),
        PGHOST: target.hostname.replace(/^\[|\]$/gu, ""),
        PGPORT: target.port || "5432",
        PGUSER: decodeURIComponent(target.username),
        PGPASSWORD: decodeURIComponent(target.password),
        PGCONNECT_TIMEOUT: "5",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    let error = "";
    child.stdout.on("data", (chunk) => {
      out += chunk;
    });
    child.stderr.on("data", (chunk) => {
      error += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(out.trim()) : reject(new Error(error || `psql exited ${code}`)),
    );
    child.stdin.end(sql);
  });
}

const asOperations = (sql: string, commit = true) =>
  psql(
    `begin; set local role launchloom_operations_worker; ${sql} ${commit ? "commit" : "rollback"};`,
  );

function literal(value: unknown) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

/** Exercises the production store transport under the real effective role. */
function storeConnection(): OperationsSql {
  return {
    async query<T>(text: string, params: unknown[] = []): Promise<T[]> {
      const rendered = text.replace(/\$(\d+)/gu, (_, index) =>
        literal(params[Number(index) - 1]),
      );
      const output = await psql(
        `begin; set local role launchloom_operations_worker; select coalesce(json_agg(row_to_json(q)), '[]'::json) from (${rendered}) q; commit;`,
      );
      return JSON.parse(output) as T[];
    },
  };
}

const suffix = crypto.randomUUID();
let inviteSequence = 0;
function inviteName(label: string) {
  inviteSequence += 1;
  return `${label}-${suffix}-${inviteSequence}`;
}

function createAcceptanceSql(invite: string) {
  return `select row_to_json(r) from launchloom_operations.create_acceptance(
    '${invite}', 'submission-${invite}', '${"a".repeat(64)}', 1,
    '{"businessName":"Synthetic Harbor Plumbing","email":"sam@example.test","phone":"555-0100"}'::jsonb,
    '{"termsVersion":"client-intake-v2","rightsConfirmed":true}'::jsonb, 'full') r;`;
}

type Acceptance = {
  intake_id: string;
  request_id: string;
  attempt_id: string;
  operation_id: string;
  created: boolean;
};

async function acceptance(confirmed = true): Promise<Acceptance> {
  const record = JSON.parse(
    await asOperations(createAcceptanceSql(inviteName("accept")), true),
  ) as Acceptance;
  if (confirmed)
    await asOperations(
      `select launchloom_operations.confirm_acceptance('${record.intake_id}');`,
      true,
    );
  return record;
}

async function stageForClaim(operationId: string) {
  await psql(
    `update launchloom_operations.dispatch_outbox
     set state='leased', gate_provenance='verified-v1', lease_until=now() + interval '2 minutes'
     where id='${operationId}';`,
  );
}

const repositoryId = "1352728020";
let runSequence = Number(String(Date.now()).slice(-10));
function nextRun() {
  runSequence += 1;
  return String(runSequence);
}
const runId = "424242";
const runAttempt = 1;

function claimSql(
  operationId: string,
  repository = repositoryId,
  run = runId,
  attempt = runAttempt,
) {
  return `select launchloom_operations.claim_run('${operationId}', ${
    repository === null ? "NULL" : `'${repository}'`
  }, ${run === null ? "NULL" : `'${run}'`}, ${attempt});`;
}

async function claim(
  operationId: string,
  repository = repositoryId,
  run = runId,
  attempt = runAttempt,
): Promise<string> {
  return asOperations(claimSql(operationId, repository, run, attempt), true);
}

function boundedRead(operationId: string, repository = repositoryId, run = runId, attempt = runAttempt) {
  return asOperations(
    `select count(*) from launchloom_operations.get_claimed_operation('${operationId}','${repository}','${run}',${attempt});`,
  );
}

function boundedIntake(intakeId: string, repository = repositoryId, run = runId, attempt = runAttempt) {
  return asOperations(
    `select count(*) from launchloom_operations.get_claimed_intake('${intakeId}','${repository}','${run}',${attempt});`,
  );
}

function appendSql(
  attemptId: string,
  eventKey: string,
  options: {
    repository?: string;
    run?: string;
    runAttempt?: number;
    stage?: string;
    transition?: string;
    costKind?: string;
    amount?: string | null;
    currency?: string | null;
  } = {},
) {
  const {
    repository = repositoryId,
    run = runId,
    runAttempt: attemptNumber = runAttempt,
    stage = "intake",
    transition = "completed",
    costKind = "unreported",
    amount = null,
    currency = null,
  } = options;
  return asOperations(
    `select launchloom_operations.append_run_event('${attemptId}','${repository}','${run}',${attemptNumber},
      '${eventKey}','${stage}','${transition}', now(), 'payload_loaded', 'synthetic', 'synthetic-model',
      '${costKind}', ${amount === null ? "NULL" : `'${amount}'`}, ${
        currency === null ? "NULL" : `'${currency}'`
      });`,
  );
}

describe.skipIf(!enabled)("run ownership on real disposable PostgreSQL", () => {
  beforeAll(async () => {
    // Hard prerequisite: a NEW empty fixture with only the precreated, non-login
    // fixture roles. Migrations are applied here as the trusted schema owner.
    expect(
      await psql(
        "select count(*) from pg_namespace where nspname in ('launchloom_admin','launchloom_operations');",
      ),
    ).toBe("0");
    expect(
      await psql(
        "select count(*) from pg_roles where rolname in ('launchloom_operations_worker','launchloom_worker','launchloom_admin');",
      ),
    ).toBe("3");
    await psql(await readFile("db/admin/001-membership.sql", "utf8"));
    for (const migration of [
      "db/operations/001-operations.sql",
      "db/operations/002-acceptance-recovery.sql",
      "db/operations/003-dispatch.sql",
      "db/operations/004-run-ownership.sql",
    ]) {
      const sql = await readFile(migration, "utf8");
      await psql(sql);
      // Reapplication proves the functions can be replaced in place.
      await psql(sql);
    }
  });

  beforeEach(async () => {
    // Keep each case isolated on the shared disposable fixture without deleting
    // synthetic rows. Any leftover eligible row becomes visibly parked.
    await psql(
      `update launchloom_operations.dispatch_outbox set state='attention',
       lease_until=NULL, last_error_code=coalesce(last_error_code,'test_cleanup')
       where state in ('pending','leased');`,
    );
  });

  it("grants the identity-bound functions only to the effective operations role and no table access", async () => {
    const signatures = [
      "launchloom_operations.get_claimed_operation(uuid,text,text,integer)",
      "launchloom_operations.get_claimed_intake(uuid,text,text,integer)",
      "launchloom_operations.append_run_event(uuid,text,text,integer,text,text,text,timestamp with time zone,text,text,text,text,numeric,text)",
    ];
    const privileges = JSON.parse(
      await psql(`select json_agg(row_to_json(q)) from (
        select role, signature, has_function_privilege(role, signature, 'execute') as allowed
        from unnest(array['launchloom_operations_worker','launchloom_worker','launchloom_admin']) role
        cross join unnest(array[${signatures.map((s) => `'${s}'`).join(",")}]) signature
      ) q;`),
    ) as Array<{ role: string; allowed: boolean }>;
    expect(privileges).toHaveLength(9);
    for (const privilege of privileges)
      expect(privilege.allowed).toBe(privilege.role === "launchloom_operations_worker");

    expect(
      await psql(
        "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='launchloom_operations' and c.relkind='r' and has_table_privilege('launchloom_operations_worker',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');",
      ),
    ).toBe("0");
    expect(
      await psql(
        "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace, lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where n.nspname='launchloom_operations' and acl.grantee=0 and acl.privilege_type='EXECUTE';",
      ),
    ).toBe("0");

    expect(await asOperations("select current_user;")).toBe(
      "launchloom_operations_worker",
    );
    await expect(
      asOperations("select id from launchloom_operations.intakes limit 0;"),
    ).rejects.toThrow(/permission denied/u);
    await expect(
      asOperations(
        "update launchloom_operations.generation_attempts set state='running' where false;",
      ),
    ).rejects.toThrow(/permission denied/u);
    expect(await asOperations("select count(*) from launchloom_operations.get_claimed_intake('00000000-0000-4000-8000-000000000000','1','1',1);"))
      .toBe("0");
  });

  it("allows only the exact claimed run to read the confirmed intake", async () => {
    const record = await acceptance();
    const run = nextRun();
    await stageForClaim(record.operation_id);

    expect(await claim(record.operation_id, repositoryId, run, runAttempt)).toBe("claimed");
    expect(
      JSON.parse(
        await psql(
          `select json_build_object(
             'request', (select dispatch_state from launchloom_operations.generation_requests where id='${record.request_id}'),
             'attempt', (select state from launchloom_operations.generation_attempts where id='${record.attempt_id}'),
             'outbox', (select state from launchloom_operations.dispatch_outbox where id='${record.operation_id}'),
             'repository', (select workflow_repository from launchloom_operations.generation_attempts where id='${record.attempt_id}'),
             'run', (select workflow_run_id from launchloom_operations.generation_attempts where id='${record.attempt_id}'),
             'run_attempt', (select workflow_run_attempt from launchloom_operations.generation_attempts where id='${record.attempt_id}'));`,
        ),
      ),
    ).toEqual({
      request: "dispatched",
      attempt: "running",
      outbox: "dispatched",
      repository: repositoryId,
      run,
      run_attempt: runAttempt,
    });

    const operation = JSON.parse(
      await asOperations(
        `select row_to_json(q) from launchloom_operations.get_claimed_operation('${record.operation_id}','${repositoryId}','${run}',${runAttempt}) q;`,
      ),
    );
    expect(operation).toEqual({
      operation_id: record.operation_id,
      intake_id: record.intake_id,
      request_id: record.request_id,
      attempt_id: record.attempt_id,
    });
    const intake = JSON.parse(
      await asOperations(
        `select record from launchloom_operations.get_claimed_intake('${record.intake_id}','${repositoryId}','${run}',${runAttempt});`,
      ),
    );
    expect(intake).toMatchObject({
      intakeId: record.intake_id,
      requestId: record.request_id,
      attemptId: record.attempt_id,
      operationId: record.operation_id,
      acceptanceState: "confirmed",
      payloadVersion: 1,
      payload: {
        businessName: "Synthetic Harbor Plumbing",
        email: "sam@example.test",
      },
    });

    for (const [repo, wrongRun, attempt] of [
      ["999999999", run, runAttempt],
      [repositoryId, "777777", runAttempt],
      [repositoryId, run, 2],
    ] as const) {
      expect(await boundedRead(record.operation_id, repo, wrongRun, attempt)).toBe("0");
      expect(await boundedIntake(record.intake_id, repo, wrongRun, attempt)).toBe("0");
      expect(await claim(record.operation_id, repo, wrongRun, attempt)).toBe("duplicate");
    }
    expect(await claim(record.operation_id, repositoryId, run, runAttempt)).toBe("duplicate");
  });

  it("never permits an unconfirmed, unowned or malformed claim", async () => {
    const run = nextRun();
    const unconfirmed = await acceptance(false);
    await stageForClaim(unconfirmed.operation_id);
    expect(await claim(unconfirmed.operation_id, repositoryId, run, runAttempt)).toBe("attention");
    expect(await boundedRead(unconfirmed.operation_id, repositoryId, run, runAttempt)).toBe("0");
    expect(await boundedIntake(unconfirmed.intake_id, repositoryId, run, runAttempt)).toBe("0");

    const record = await acceptance();
    expect(await boundedRead(record.operation_id, repositoryId, run, runAttempt)).toBe("0");
    expect(await boundedIntake(record.intake_id, repositoryId, run, runAttempt)).toBe("0");
    expect(await claim(record.operation_id, repositoryId, run, runAttempt)).toBe("attention");

    for (const [repo, badRun, attempt] of [
      ["abc", run, runAttempt],
      ["", run, runAttempt],
      [repositoryId, "0", runAttempt],
      [repositoryId, run, 0],
    ] as const)
      await expect(claim(record.operation_id, repo, badRun, attempt)).rejects.toThrow(
        "invalid_dispatch",
      );

    expect(
      await asOperations(
        `select launchloom_operations.claim_run(NULL, '${repositoryId}', '${run}', 1);`,
      ),
    ).toBe("attention");
    // A NULL operation ID is not part of the numeric identity validation and
    // fails closed as attention (no row, no owner). NULL identity fields raise.
    for (const [repo, runValue] of [
      ["NULL", `'${run}'`],
      [`'${repositoryId}'`, "NULL"],
      ["NULL", "NULL"],
    ] as const)
      await expect(
        asOperations(
          `select launchloom_operations.claim_run('${record.operation_id}', ${repo}, ${runValue}, 1);`,
        ),
      ).rejects.toThrow("invalid_dispatch");
    expect(await boundedRead(record.operation_id, repositoryId, run, 1)).toBe("0");
    expect(
      await psql(
        `select count(*) from launchloom_operations.generation_attempts where id='${record.attempt_id}' and workflow_run_id is not null;`,
      ),
    ).toBe("0");
  });

  it("elects one owner and never transfers or rebinds that ownership", async () => {
    const record = await acceptance();
    await stageForClaim(record.operation_id);
    const firstRun = Number(nextRun());
    // Reserve the whole concurrent identity block so later cases cannot collide
    // with whichever contender happened to win this election.
    runSequence += 7;
    const claims = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        claim(record.operation_id, repositoryId, String(firstRun + index), 1),
      ),
    );
    expect(claims.filter((result) => result === "claimed")).toHaveLength(1);
    expect(claims.filter((result) => result === "duplicate")).toHaveLength(7);
    expect(
      await psql(
        `select count(*) from launchloom_operations.generation_attempts where request_id='${record.request_id}' and workflow_run_id is not null;`,
      ),
    ).toBe("1");

    const other = await acceptance();
    await stageForClaim(other.operation_id);
    // A run identity can own at most one attempt, so crossing operations must
    // fail closed rather than transfer or manufacture a second owner.
    const winner = await psql(
      `select workflow_run_id from launchloom_operations.generation_attempts where id='${record.attempt_id}';`,
    );
    expect(await claim(other.operation_id, repositoryId, winner, 1)).toBe(
      "attention",
    );
    expect(await boundedRead(other.operation_id)).toBe("0");
  });

  it("writes stage events only for the owning running run, with stable-key dedupe", async () => {
    const run = nextRun();
    const record = await acceptance();
    await stageForClaim(record.operation_id);
    expect(await claim(record.operation_id, repositoryId, run, runAttempt)).toBe("claimed");

    expect(await appendSql(record.attempt_id, "intake:completed", { run })).toBe(
      "inserted",
    );
    expect(await appendSql(record.attempt_id, "intake:completed", { run })).toBe(
      "duplicate",
    );
    expect(
      await psql(
        `select count(*) from launchloom_operations.stage_events where attempt_id='${record.attempt_id}' and event_key='intake:completed';`,
      ),
    ).toBe("1");

    expect(
      await appendSql(record.attempt_id, "intake:wrong-run", { run: nextRun() }),
    ).toBe("attention");
    expect(
      await appendSql(record.attempt_id, "intake:wrong-repo", {
        repository: "999999999",
        run,
      }),
    ).toBe("attention");
    expect(
      await appendSql(record.attempt_id, "intake:wrong-attempt", {
        run,
        runAttempt: 2,
      }),
    ).toBe("attention");

    const other = await acceptance();
    const otherRun = nextRun();
    await stageForClaim(other.operation_id);
    expect(await claim(other.operation_id, repositoryId, otherRun, 1)).toBe(
      "claimed",
    );
    expect(await appendSql(other.attempt_id, "intake:other-run", { run })).toBe(
      "attention",
    );

    // A terminal attempt cannot receive a late event.
    await psql(
      `update launchloom_operations.generation_attempts set state='succeeded', finished_at=now(), terminal_reason='synthetic_success' where id='${other.attempt_id}';`,
    );
    expect(await appendSql(other.attempt_id, "intake:late", { run: otherRun })).toBe(
      "attention",
    );
    expect(
      await psql(
        `select count(*) from launchloom_operations.stage_events where attempt_id='${other.attempt_id}';`,
      ),
    ).toBe("0");
  });

  it("keeps database cost and stage constraints effective for owner writes", async () => {
    const run = nextRun();
    const record = await acceptance();
    await stageForClaim(record.operation_id);
    expect(await claim(record.operation_id, repositoryId, run, runAttempt)).toBe("claimed");

    await expect(
      appendSql(record.attempt_id, "cost:missing", { run,
        costKind: "actual",
        amount: null,
        currency: "USD",
      }),
    ).rejects.toThrow("stage_events_cost_check");
    await expect(
      appendSql(record.attempt_id, "cost:unreported", { run,
        costKind: "unreported",
        amount: "1.25",
        currency: "USD",
      }),
    ).rejects.toThrow("stage_events_cost_check");
    expect(
      await appendSql(record.attempt_id, "cost:decimal", { run,
        costKind: "actual",
        amount: "0.12345678",
        currency: "USD",
      }),
    ).toBe("inserted");
    expect(
      await psql(
        `select amount::text from launchloom_operations.stage_events where attempt_id='${record.attempt_id}' and event_key='cost:decimal';`,
      ),
    ).toBe("0.12345678");
    expect(
      await psql(
        `select count(*) from launchloom_operations.stage_events where attempt_id='${record.attempt_id}' and event_key in ('cost:missing','cost:unreported');`,
      ),
    ).toBe("0");
  });

  it("executes the production store transport against the real owner-fenced functions", async () => {
    const run = nextRun();
    const store = createOperationsStore(storeConnection());
    const created = await store.createAcceptance({
      inviteId: inviteName("store"),
      submissionId: `submission-${suffix}`,
      fingerprint: "c".repeat(64),
      payloadVersion: 1,
      payload: { businessName: "Synthetic Store Plumbing", email: "store@example.test" },
      consent: { termsVersion: "client-intake-v2", rightsConfirmed: true },
      profile: "full",
    });
    await store.confirmAcceptance(created.intakeId);
    await stageForClaim(created.operationId);
    const identity = { repositoryId, runId: run, runAttempt: 1 };
    expect(await store.claimRun(created.operationId, identity)).toBe("claimed");
    expect(await store.getClaimedOperation(created.operationId, identity)).toEqual({
      operationId: created.operationId,
      intakeId: created.intakeId,
      requestId: created.requestId,
      attemptId: created.attemptId,
    });
    const intake = await store.getIntakeForRun(created.intakeId, identity);
    expect(intake).toMatchObject({
      intakeId: created.intakeId,
      acceptanceState: "confirmed",
      payload: { businessName: "Synthetic Store Plumbing" },
    });
    expect(
      await store.getIntakeForRun(created.intakeId, {
        repositoryId,
        runId: "999999",
        runAttempt: 1,
      }),
    ).toBeNull();
    const event = {
      eventKey: "store:completed",
      stage: "intake",
      transition: "completed",
      detailCode: "payload_loaded",
      provider: "synthetic",
      model: "synthetic-model",
      costKind: "unreported" as const,
    };
    expect(await store.appendEvent(created.attemptId, identity, event)).toBe(
      "inserted",
    );
    expect(await store.appendEvent(created.attemptId, identity, event)).toBe(
      "duplicate",
    );
    expect(
      await store.appendEvent(
        created.attemptId,
        { repositoryId, runId: "999999", runAttempt: 1 },
        { ...event, eventKey: "store:wrong-run" },
      ),
    ).toBe("attention");
    expect(
      await psql(
        `select count(*) from launchloom_operations.stage_events where attempt_id='${created.attemptId}' and event_key='store:completed';`,
      ),
    ).toBe("1");
  });

  it("leases through the verified gate before a first claim is accepted", async () => {
    const run = nextRun();
    const record = await acceptance();
    await psql(
      `update launchloom_operations.dispatch_outbox set next_attempt_at='2000-01-01T00:00:00Z' where id='${record.operation_id}';`,
    );
    const leased = JSON.parse(
      await asOperations(
        `select row_to_json(q) from launchloom_operations.lease_dispatch(now(), true) q;`,
      ),
    );
    expect(leased.operation_id).toBe(record.operation_id);
    expect(leased.payload).toEqual({
      schemaVersion: 1,
      intakeId: record.intake_id,
      requestId: record.request_id,
      attemptId: record.attempt_id,
      operationId: record.operation_id,
    });
    expect(
      await psql(
        `select gate_provenance from launchloom_operations.dispatch_outbox where id='${record.operation_id}';`,
      ),
    ).toBe("verified-v1");
    expect(await claim(record.operation_id, repositoryId, run, runAttempt)).toBe("claimed");
    expect(await boundedRead(record.operation_id, repositoryId, run, runAttempt)).toBe("1");
  });
});
