import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { describe, expect, it, beforeAll } from "vitest";

const path = "db/operations/001-operations.sql";

describe("operations migration structure (not transaction proof)", () => {
  it("creates the six related tables and deterministic query indexes", async () => {
    const sql = await readFile(path, "utf8");
    for (const table of [
      "clients",
      "intakes",
      "generation_requests",
      "generation_attempts",
      "stage_events",
      "dispatch_outbox",
    ])
      expect(sql).toContain(
        `CREATE TABLE IF NOT EXISTS launchloom_operations.${table}`,
      );
    for (const index of [
      "intakes_client_recency",
      "requests_intake_recency",
      "attempts_state_recency",
      "events_attempt_recency",
      "outbox_eligible_recency",
    ])
      expect(sql).toContain(`CREATE INDEX IF NOT EXISTS ${index}`);
    expect(sql).toContain("numeric(20, 8)");
    expect(sql).toContain("blocked_unconfirmed");
  });

  it("uses fixed-path definer functions with explicit role grants, no membership access", async () => {
    const sql = await readFile(path, "utf8");
    expect(sql.match(/SECURITY DEFINER/g)).toHaveLength(3);
    expect(
      sql.match(
        /SET search_path = pg_catalog, launchloom_operations, pg_temp/g,
      ),
    ).toHaveLength(3);
    expect(sql).toContain(
      "REVOKE ALL ON ALL FUNCTIONS IN SCHEMA launchloom_operations FROM PUBLIC",
    );
    expect(sql).toContain("TO launchloom_operations_worker");
    expect(sql).not.toMatch(
      /GRANT[^;]*ON ALL TABLES|TO launchloom_worker|CREATE ROLE|CREATE DATABASE/,
    );
    expect(sql).not.toContain("launchloom_admin.");
  });

  it("declares a fail-closed payload check and relational bindings for all dispatch identifiers", async () => {
    const sql = await readFile(path, "utf8");
    expect(sql).toContain("CONSTRAINT dispatch_outbox_payload_check CHECK ((");
    expect(sql).toContain(") IS TRUE)");
    for (const key of ["intakeId", "requestId", "attemptId", "operationId"])
      expect(sql).toContain(`jsonb_typeof(payload->'${key}') = 'string'`);
    expect(sql).toContain("payload->'schemaVersion' = '1'::jsonb");
    expect(sql).toContain("payload->>'intakeId' = intake_id::text");
    expect(sql).toContain("payload->>'requestId' = request_id::text");
    expect(sql).toContain("FOREIGN KEY (attempt_id, request_id)");
    expect(sql).toContain("FOREIGN KEY (request_id, intake_id)");
  });
});

// Explicit opt-in to an ALREADY disposable LOCAL PostgreSQL database only.
// Never falls back to ADMIN_DATABASE_URL or any deployed connection.
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

function psql(sql: string): Promise<string> {
  // PGDATABASE is a database name, not a reliable URI expansion surface.
  // Split ONLY the already-validated disposable target; never permit libpq to
  // fall back to its default socket/port or inherit connection overrides.
  if (!url) throw new Error("Disposable PostgreSQL target is required.");
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const child = spawn("psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1"], {
      // Do not inherit PGHOSTADDR/PGSERVICE/PGOPTIONS that could override a local URI.
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
    let out = "",
      error = "";
    child.stdout.on("data", (chunk) => {
      out += chunk;
    });
    child.stderr.on("data", (chunk) => {
      error += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(out.trim()) : reject(new Error(error)),
    );
    child.stdin.end(sql);
  });
}
const suffix = crypto.randomUUID();
const invite = `synthetic-${suffix}`;
const create = (fingerprint = "a".repeat(64), submission: string = suffix) =>
  `select row_to_json(r) from launchloom_operations.create_acceptance('${invite}', '${submission}', '${fingerprint}', 1, '{"synthetic":true}', '{"termsVersion":"v1","rightsConfirmed":true}', 'care') r;`;
const asOperations = (sql: string, commit = false) =>
  psql(
    `begin; set local role launchloom_operations_worker; ${sql} ${commit ? "commit" : "rollback"};`,
  );

describe.skipIf(!url)(
  "operations migration (real disposable local PostgreSQL)",
  () => {
    beforeAll(async () => {
      // Hard prerequisite: NEW empty fixture, isolated database name, precreated
      // operations/membership roles, and an owner connection allowed to SET ROLE.
      // Never reuse a DB containing application schemas, even synthetic history.
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
      // Real membership boundaries, but no real members/enrollments or other data.
      await psql(await readFile("db/admin/001-membership.sql", "utf8"));
      const migration = await readFile(path, "utf8");
      await psql(migration);
      await psql(migration);
    });

    it("concurrent duplicates create exactly one row set and return the original stable IDs", async () => {
      const results = await Promise.all(
        Array.from({ length: 8 }, async () => JSON.parse(await psql(create()))),
      );
      expect(results.filter((r) => r.created)).toHaveLength(1);
      const ids = results.map(({ created: _, ...ids }) => ids);
      for (const result of ids) expect(result).toEqual(ids[0]);
      expect(
        await psql(
          `select count(*) from launchloom_operations.intakes i join launchloom_operations.clients c on c.id=i.client_id join launchloom_operations.generation_requests r on r.intake_id=i.id join launchloom_operations.generation_attempts a on a.request_id=r.id join launchloom_operations.dispatch_outbox o on o.attempt_id=a.id where i.invite_id='${invite}';`,
        ),
      ).toBe("1");
      expect(
        await psql(
          `select o.state from launchloom_operations.dispatch_outbox o join launchloom_operations.generation_attempts a on a.id=o.attempt_id join launchloom_operations.generation_requests r on r.id=a.request_id join launchloom_operations.intakes i on i.id=r.intake_id where i.invite_id='${invite}';`,
        ),
      ).toBe("blocked_unconfirmed");
    });

    it("rejects a changed fingerprint or a second submission bound to the invite", async () => {
      await psql(create());
      await expect(psql(create("b".repeat(64)))).rejects.toThrow(
        "acceptance_conflict",
      );
      await expect(psql(create("a".repeat(64), "other"))).rejects.toThrow(
        "acceptance_conflict",
      );
    });

    it.each([
      ["payload", '{"synthetic":true}', '{"synthetic":false}'],
      ["consent", '"termsVersion":"v1"', '"termsVersion":"v2"'],
      ["profile", "'care')", "'trades')"],
      ["payload version", "', 1, '", "', 2, '"],
    ])(
      "rejects replay with changed %s even if the supplied fingerprint is unchanged",
      async (_, from, to) => {
        const original = JSON.parse(await psql(create()));
        await expect(psql(create().replace(from, to))).rejects.toThrow(
          "acceptance_conflict",
        );
        expect(JSON.parse(await psql(create()))).toEqual({
          ...original,
          created: false,
        });
      },
    );

    it("confirms acceptance and outbox eligibility atomically and idempotently", async () => {
      const r = JSON.parse(await psql(create()));
      await psql(
        `select launchloom_operations.confirm_acceptance('${r.intake_id}'); select launchloom_operations.confirm_acceptance('${r.intake_id}');`,
      );
      expect(
        await psql(
          `select i.acceptance_state || ':' || o.state from launchloom_operations.intakes i, launchloom_operations.dispatch_outbox o where i.id='${r.intake_id}' and o.id='${r.operation_id}';`,
        ),
      ).toBe("confirmed:pending");
      await expect(
        psql(
          "select launchloom_operations.confirm_acceptance('00000000-0000-0000-0000-000000000000');",
        ),
      ).rejects.toThrow("intake_not_found");
    });

    it("reads back private versioned data and never includes payload or consent in dispatch inputs", async () => {
      const r = JSON.parse(await psql(create()));
      const record = JSON.parse(
        await psql(
          `select record from launchloom_operations.get_intake('${r.intake_id}');`,
        ),
      );
      expect(record).toMatchObject({
        schemaVersion: 1,
        inviteId: invite,
        submissionId: suffix,
        payloadVersion: 1,
        payload: { synthetic: true },
        consent: { termsVersion: "v1", rightsConfirmed: true },
        profile: "care",
      });
      const payload = JSON.parse(
        await psql(
          `select payload from launchloom_operations.dispatch_outbox where id='${r.operation_id}';`,
        ),
      );
      expect(payload).toEqual({
        schemaVersion: 1,
        intakeId: r.intake_id,
        requestId: r.request_id,
        attemptId: r.attempt_id,
        operationId: r.operation_id,
      });
    });

    it.each(["leased", "dispatched", "attention"])(
      "confirmation replay never regresses an advanced %s outbox",
      async (state) => {
        const r = JSON.parse(
          await psql(create().replace(invite, `${state}-${suffix}`)),
        );
        await psql(
          `select launchloom_operations.confirm_acceptance('${r.intake_id}');`,
        );
        const confirmedAt = await psql(
          `select confirmed_at from launchloom_operations.intakes where id='${r.intake_id}';`,
        );
        await psql(
          `update launchloom_operations.dispatch_outbox set state='${state}', fencing_version=7, retry_count=2 where id='${r.operation_id}'; select launchloom_operations.confirm_acceptance('${r.intake_id}');`,
        );
        expect(
          await psql(
            `select state || ':' || fencing_version || ':' || retry_count from launchloom_operations.dispatch_outbox where id='${r.operation_id}';`,
          ),
        ).toBe(`${state}:7:2`);
        expect(
          await psql(
            `select confirmed_at from launchloom_operations.intakes where id='${r.intake_id}';`,
          ),
        ).toBe(confirmedAt);
      },
    );

    it("rejects null, missing, mistyped, additional and mismatched payload identifiers", async () => {
      const r = JSON.parse(await psql(create()));
      const malformed = [
        "'null'::jsonb",
        "'[]'::jsonb",
        "payload || '{\"extra\":true}'::jsonb",
      ];
      for (const key of [
        "schemaVersion",
        "intakeId",
        "requestId",
        "attemptId",
        "operationId",
      ]) {
        malformed.push(
          `payload - '${key}'`,
          `jsonb_set(payload, '{${key}}', 'null')`,
          `jsonb_set(payload, '{${key}}', 'false')`,
          `jsonb_set(payload, '{${key}}', '{}')`,
          `jsonb_set(payload, '{${key}}', '[]')`,
          `jsonb_set(payload, '{${key}}', '123')`,
        );
        if (key !== "schemaVersion")
          malformed.push(
            `jsonb_set(payload, '{${key}}', '"00000000-0000-0000-0000-000000000000"')`,
          );
      }
      malformed.push(
        `jsonb_set(payload, '{schemaVersion}', '"1"')`,
        `jsonb_set(payload, '{schemaVersion}', '2')`,
      );
      for (const value of malformed)
        await expect(
          psql(
            `begin; update launchloom_operations.dispatch_outbox set payload=${value} where id='${r.operation_id}'; rollback;`,
          ),
        ).rejects.toThrow("dispatch_outbox_payload_check");
    });

    it("rejects internally consistent payloads whose relational IDs point at a different intake/request", async () => {
      const a = JSON.parse(await psql(create()));
      const b = JSON.parse(
        await psql(create().replace(invite, `foreign-${suffix}`)),
      );
      await expect(
        psql(
          `begin; update launchloom_operations.dispatch_outbox set request_id='${b.request_id}', intake_id='${b.intake_id}', payload=payload || jsonb_build_object('requestId','${b.request_id}','intakeId','${b.intake_id}') where id='${a.operation_id}'; rollback;`,
        ),
      ).rejects.toThrow("dispatch_outbox_attempt_request_fkey");
      await expect(
        psql(
          `begin; update launchloom_operations.dispatch_outbox set intake_id='${b.intake_id}', payload=payload || jsonb_build_object('intakeId','${b.intake_id}') where id='${a.operation_id}'; rollback;`,
        ),
      ).rejects.toThrow("dispatch_outbox_request_intake_fkey");
    });

    it("rolls back confirmation if unblocking fails", async () => {
      const r = JSON.parse(
        await psql(create().replace(invite, `confirm-rollback-${suffix}`)),
      );
      await expect(
        psql(
          `begin; alter table launchloom_operations.dispatch_outbox add constraint synthetic_confirm_failure check (state <> 'pending') not valid; select launchloom_operations.confirm_acceptance('${r.intake_id}'); commit;`,
        ),
      ).rejects.toThrow("synthetic_confirm_failure");
      expect(
        await psql(
          `select i.acceptance_state || ':' || o.state from launchloom_operations.intakes i, launchloom_operations.dispatch_outbox o where i.id='${r.intake_id}' and o.id='${r.operation_id}';`,
        ),
      ).toBe("unconfirmed:blocked_unconfirmed");
    });

    it("rolls back the whole acceptance when the final outbox insert fails", async () => {
      // A transaction-local constraint forces the last insert to fail without altering shared schema.
      const other = `rollback-${suffix}`;
      await expect(
        psql(
          `begin; alter table launchloom_operations.dispatch_outbox add constraint synthetic_failure check (false) not valid; ${create().replace(invite, other)} commit;`,
        ),
      ).rejects.toThrow("synthetic_failure");
      expect(
        await psql(
          `select count(*) from launchloom_operations.intakes where invite_id='${other}';`,
        ),
      ).toBe("0");
    });

    it("rejects invented unreported cost and preserves decimal amounts", async () => {
      const r = JSON.parse(await psql(create()));
      const insert = (kind: string, amount: string) =>
        `insert into launchloom_operations.stage_events(attempt_id,event_key,stage,transition,cost_kind,amount,currency) values('${r.attempt_id}','cost-${kind}','copy','observed','${kind}',${amount},'USD');`;
      await expect(psql(insert("unreported", "1.25"))).rejects.toThrow(
        "stage_events_cost_check",
      );
      await psql(insert("actual", "0.12345678"));
      expect(
        await psql(
          `select amount::text from launchloom_operations.stage_events where attempt_id='${r.attempt_id}' and event_key='cost-actual';`,
        ),
      ).toBe("0.12345678");
    });

    it("requires consent/rights and rejects missing consent versions at the table boundary", async () => {
      await expect(
        psql(
          create()
            .replace(invite, `invalid-${suffix}`)
            .replace('"termsVersion":"v1",', ""),
        ),
      ).rejects.toThrow("invalid_acceptance");
      const r = JSON.parse(await psql(create()));
      await expect(
        psql(
          `update launchloom_operations.intakes set consent='{"rightsConfirmed":true}' where id='${r.intake_id}';`,
        ),
      ).rejects.toThrow("intakes_consent_check");
    });

    it("grants only the three service functions to the separately preconfigured operations role", async () => {
      // Provisioning roles is deliberately outside this migration/test. An existing
      // disposable fixture must supply this non-login service role for ACL proof.
      expect(
        await psql(
          "select count(*) from pg_roles where rolname='launchloom_operations_worker' and not rolsuper and not rolcreatedb and not rolcreaterole and not rolbypassrls and not rolreplication;",
        ),
      ).toBe("1");
      expect(
        await psql(
          "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='launchloom_operations' and has_function_privilege('launchloom_operations_worker',p.oid,'EXECUTE');",
        ),
      ).toBe("3");
      expect(
        await psql(
          "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='launchloom_operations' and c.relkind='r' and has_table_privilege('launchloom_operations_worker',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');",
        ),
      ).toBe("0");
    });

    it("executes acceptance, replay, confirmation and private reads as the operations role", async () => {
      expect(await asOperations("select current_user;")).toBe(
        "launchloom_operations_worker",
      );
      const sql = create().replace(invite, `effective-role-${suffix}`);
      const r = JSON.parse(await asOperations(sql, true));
      expect(r.created).toBe(true);
      expect(JSON.parse(await asOperations(sql, true))).toEqual({
        ...r,
        created: false,
      });
      const record = JSON.parse(
        await asOperations(
          `select launchloom_operations.confirm_acceptance('${r.intake_id}'); select record from launchloom_operations.get_intake('${r.intake_id}');`,
          true,
        ),
      );
      expect(record).toMatchObject({
        intakeId: r.intake_id,
        acceptanceState: "confirmed",
        payload: { synthetic: true },
      });
      await expect(
        asOperations("select id from launchloom_operations.intakes limit 0;"),
      ).rejects.toThrow(/permission denied/u);
      await expect(
        asOperations(
          "update launchloom_operations.intakes set acceptance_state='confirmed' where false;",
        ),
      ).rejects.toThrow(/permission denied/u);
    });

    it("proves the disposable membership boundary is functional for its own service role", async () => {
      expect(
        await psql(
          `begin; set local role launchloom_worker; select current_user; select * from launchloom_admin.get_member('synthetic-${suffix}'); rollback;`,
        ),
      ).toBe("launchloom_worker");
      expect(
        await psql(
          "select has_function_privilege('launchloom_worker','launchloom_admin.get_member(text)','EXECUTE');",
        ),
      ).toBe("t");
    });

    it("has no inherited membership/admin/schema-owner powers or effective membership privileges", async () => {
      // MEMBER checks transitively include non-inherited memberships that could
      // allow SET ROLE; privilege predicates include effective inherited/PUBLIC ACLs.
      // This dedicated fixture role needs no group memberships at all. Checking
      // every reachable role also catches an arbitrarily named NOINHERIT group
      // that could be reached with SET ROLE and holds membership privileges.
      expect(
        await psql(
          "select count(*) from pg_roles r where r.rolname <> 'launchloom_operations_worker' and pg_has_role('launchloom_operations_worker',r.oid,'MEMBER');",
        ),
      ).toBe("0");
      expect(
        await psql(
          "select count(*) from pg_roles r where (r.rolname in ('launchloom_worker','launchloom_admin') or r.oid in (select nspowner from pg_namespace where nspname in ('launchloom_admin','launchloom_operations'))) and pg_has_role('launchloom_operations_worker',r.oid,'MEMBER');",
        ),
      ).toBe("0");
      expect(
        await psql(
          "select has_schema_privilege('launchloom_operations_worker','launchloom_admin','USAGE,CREATE');",
        ),
      ).toBe("f");
      expect(
        await psql(
          "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='launchloom_admin' and c.relkind='r' and (has_table_privilege('launchloom_operations_worker',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or has_any_column_privilege('launchloom_operations_worker',c.oid,'SELECT,INSERT,UPDATE,REFERENCES'));",
        ),
      ).toBe("0");
      expect(
        await psql(
          "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='launchloom_admin' and has_function_privilege('launchloom_operations_worker',p.oid,'EXECUTE');",
        ),
      ).toBe("0");
      for (const sql of [
        "select subject from launchloom_admin.members limit 0;",
        "update launchloom_admin.members set active=false where false;",
        `select * from launchloom_admin.get_member('synthetic-${suffix}');`,
        "select * from launchloom_admin.list_members();",
        `select launchloom_admin.create_enrollment('synthetic-${suffix}@example.test','${"a".repeat(64)}','synthetic-${suffix}',now()+interval '1 day');`,
      ])
        await expect(asOperations(sql)).rejects.toThrow(/permission denied/u);
      // Every denial probe is rollback-only, and predicates/identities are synthetic.
      expect(await psql("select count(*) from launchloom_admin.members;")).toBe(
        "0",
      );
      expect(
        await psql("select count(*) from launchloom_admin.enrollments;"),
      ).toBe("0");
    });

    it("revokes public execution and direct public table access", async () => {
      expect(
        await psql(
          "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace, lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where n.nspname='launchloom_operations' and acl.grantee=0 and acl.privilege_type='EXECUTE';",
        ),
      ).toBe("0");
      expect(
        await psql(
          "select count(*) from information_schema.table_privileges where table_schema='launchloom_operations' and grantee='PUBLIC';",
        ),
      ).toBe("0");
    });
  },
);
