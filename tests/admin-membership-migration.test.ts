import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { neon } from "@neondatabase/serverless";
import { splitSqlStatements } from "./admin-sql";

const migrationPath = "db/admin/001-membership.sql";
const linkMigrationPath = "db/admin/002-legacy-identity-link.sql";
const connectionString = process.env.ADMIN_DATABASE_URL || "";

const FUNCTIONS = [
  "get_member",
  "find_active_member",
  "list_members",
  "create_enrollment",
  "accept_enrollment",
  "bootstrap_owner",
  "change_member",
  "update_profile",
];

describe("admin membership migration", () => {
  it("creates the private schema, tables, indexes and functions idempotently", async () => {
    const migration = await readFile(migrationPath, "utf8");
    expect(migration).toContain("CREATE SCHEMA IF NOT EXISTS launchloom_admin");
    for (const table of [
      "workspace_guard",
      "members",
      "enrollments",
      "membership_audit",
      "legacy_identity_links",
    ]) {
      expect(migration).toMatch(
        new RegExp(`CREATE TABLE IF NOT EXISTS launchloom_admin\\.${table}`, "u"),
      );
    }
    for (const fn of FUNCTIONS) {
      expect(migration).toMatch(
        new RegExp(`CREATE OR REPLACE FUNCTION launchloom_admin\\.${fn}`, "u"),
      );
    }
    expect(migration).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS members_active_email",
    );
    expect(migration).toContain("token_hash text NOT NULL UNIQUE");
    expect(migration).toContain("role IN ('owner', 'admin')");
    expect(migration).toContain("last_owner");
    expect(migration).toContain("enrollment_used");
    expect(migration).toContain("enrollment_expired");
  });

  it("reproduces the intended definer functions and fixed search path", async () => {
    const migration = await readFile(migrationPath, "utf8");
    const functionCount = (migration.match(/CREATE OR REPLACE FUNCTION/gu) || []).length;
    expect(functionCount).toBe(FUNCTIONS.length);
    expect((migration.match(/SECURITY DEFINER/gu) || []).length).toBe(FUNCTIONS.length);
    expect((migration.match(/SET search_path = launchloom_admin, pg_temp/gu) || []).length).toBe(
      FUNCTIONS.length,
    );
    expect(migration).not.toContain("SET search_path = launchloom_admin, public");
    expect(migration).not.toMatch(/SECURITY INVOKER/u);

    // The actor is authorized only after the singleton guard is locked.
    const createEnrollment = migration.slice(
      migration.indexOf("FUNCTION launchloom_admin.create_enrollment"),
      migration.indexOf("FUNCTION launchloom_admin.accept_enrollment"),
    );
    expect(createEnrollment.indexOf("workspace_guard WHERE id FOR UPDATE")).toBeGreaterThan(-1);
    expect(createEnrollment.indexOf("workspace_guard WHERE id FOR UPDATE")).toBeLessThan(
      createEnrollment.indexOf("WHERE subject = p_created_by AND active AND role = 'owner'"),
    );
    expect(createEnrollment).toContain("workspace_guard_missing");

    const changeMember = migration.slice(
      migration.indexOf("FUNCTION launchloom_admin.change_member"),
      migration.indexOf("FUNCTION launchloom_admin.update_profile"),
    );
    expect(changeMember.indexOf("workspace_guard WHERE id FOR UPDATE")).toBeGreaterThan(-1);
    expect(changeMember.indexOf("workspace_guard WHERE id FOR UPDATE")).toBeLessThan(
      changeMember.indexOf("WHERE subject = p_actor AND active AND role = 'owner'"),
    );
    expect(changeMember.indexOf("WHERE subject = p_actor AND active AND role = 'owner'")).toBeLessThan(
      changeMember.indexOf("count(*)"),
    );
    expect(changeMember).toContain("workspace_guard_missing");
  });

  it("revokes public access and grants only execute/usage to the worker role", async () => {
    const migration = await readFile(migrationPath, "utf8");
    expect(migration).toContain("REVOKE ALL ON SCHEMA launchloom_admin FROM PUBLIC");
    expect(migration).toContain(
      "REVOKE ALL ON ALL FUNCTIONS IN SCHEMA launchloom_admin FROM PUBLIC",
    );
    expect(migration).toMatch(
      /IF EXISTS \(SELECT 1 FROM pg_roles WHERE rolname = 'launchloom_worker'\)/u,
    );
    expect(migration).toContain(
      "GRANT USAGE ON SCHEMA launchloom_admin TO launchloom_worker",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA launchloom_admin TO launchloom_worker",
    );
    expect(migration).toContain(
      "ALTER DEFAULT PRIVILEGES IN SCHEMA launchloom_admin GRANT EXECUTE ON FUNCTIONS TO launchloom_worker",
    );
    expect(migration).not.toMatch(/GRANT[^;]*\bTO\s+(?:PUBLIC|anon|authenticated|service_role)\b/u);
    expect(migration).not.toMatch(/GRANT[^;]*\bON\s+ALL\s+TABLES\b/u);
    expect(migration).not.toMatch(/\bCREATE POLICY\b/u);
    expect(migration).not.toMatch(/\bENABLE ROW LEVEL SECURITY\b/u);
    expect(migration).not.toContain("pg_graphql");
    expect(migration).not.toContain("supabase");
  });

  it("adds an idempotent, no-overwrite legacy identity link function", async () => {
    const migration = await readFile(linkMigrationPath, "utf8");
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION launchloom_admin.link_legacy_identity",
    );
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = launchloom_admin, pg_temp");
    expect(migration).toContain("ON CONFLICT (legacy_id) DO NOTHING");
    expect(migration).toContain("legacy_identity_conflict");
    expect(migration).toContain("invalid_legacy_id");
    expect(migration).toContain("legacy_identity_linked");
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION launchloom_admin.link_legacy_identity(text, text) FROM PUBLIC",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION launchloom_admin.link_legacy_identity(text, text) TO launchloom_worker",
    );
    expect(migration).not.toMatch(/\b(?:DROP|TRUNCATE|DELETE)\b/u);
    expect(migration).not.toMatch(/GRANT[^;]*\bTO\s+(?:PUBLIC|anon|authenticated|service_role)\b/u);
  });
});

if (connectionString) {
  describe("admin membership migration (live)", () => {
    it("reapplies safely and reproduces the applied security model", async () => {
      const sql = neon(connectionString);
      const migration = await readFile(migrationPath, "utf8");
      const statements = splitSqlStatements(migration);
      // The migration is additive and idempotent; rerunning it must not drop or
      // rewrite membership history.
      for (const statement of statements) await sql.query(statement);
      for (const statement of statements) await sql.query(statement);

      const linkMigration = await readFile(linkMigrationPath, "utf8");
      const linkStatements = splitSqlStatements(linkMigration);
      for (const statement of linkStatements) await sql.query(statement);
      for (const statement of linkStatements) await sql.query(statement);

      const tables = (await sql.query(
        `select table_name from information_schema.tables
         where table_schema = 'launchloom_admin' order by table_name`,
      )) as Array<{ table_name: string }>;
      expect(tables.map((row) => row.table_name)).toEqual(
        expect.arrayContaining([
          "enrollments",
          "legacy_identity_links",
          "members",
          "membership_audit",
          "workspace_guard",
        ]),
      );

      const functions = (await sql.query(
        `select p.proname, p.prosecdef, p.proconfig,
                p.proacl::text as acl,
                has_function_privilege('launchloom_worker', p.oid, 'EXECUTE') as worker_execute
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'launchloom_admin' order by p.proname`,
      )) as Array<{
        proname: string;
        prosecdef: boolean;
        proconfig: string[] | null;
        acl: string | null;
        worker_execute: boolean;
      }>;
      expect(functions.map((row) => row.proname)).toEqual(
        expect.arrayContaining(FUNCTIONS),
      );
      for (const fn of functions) {
        expect(fn.prosecdef).toBe(true);
        expect(fn.proconfig || []).toContain("search_path=launchloom_admin, pg_temp");
        expect(fn.acl || "").not.toMatch(/(?:^|,)=X\//u);
        expect(fn.worker_execute).toBe(true);
      }

      const schema = (await sql.query(
        `select has_schema_privilege('launchloom_worker', 'launchloom_admin', 'USAGE') as worker_usage`,
      )) as Array<{ worker_usage: boolean }>;
      expect(schema[0]).toMatchObject({ worker_usage: true });

      // The migration itself grants no table privileges; a true least-privilege
      // role can only use the definer functions.
      const tableAcls = (await sql.query(
        `select c.relname, c.relacl::text as acl from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'launchloom_admin' and c.relkind = 'r'`,
      )) as Array<{ relname: string; acl: string | null }>;
      for (const table of tableAcls) {
        expect(table.acl || "").not.toContain("launchloom_worker");
        expect(table.acl || "").not.toMatch(/(?:^|,)=[a-zA-Z]*\//u);
      }

      const grants = (await sql.query(
        `select grantee from information_schema.role_table_grants
         where table_schema = 'launchloom_admin' and grantee in ('PUBLIC','anon','authenticated')`,
      )) as Array<{ grantee: string }>;
      expect(grants).toHaveLength(0);
      const policies = (await sql.query(
        `select policyname from pg_policies where schemaname = 'launchloom_admin'`,
      )) as Array<{ policyname: string }>;
      expect(policies).toHaveLength(0);
      const guard = (await sql.query(
        `select count(*)::int as count from launchloom_admin.workspace_guard`,
      )) as Array<{ count: number }>;
      expect(guard[0].count).toBe(1);
      const role = (await sql.query(
        `select current_user as name, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls, rolreplication
         from pg_roles where rolname = current_user`,
      )) as Array<{
        name: string;
        rolsuper: boolean;
        rolcreatedb: boolean;
        rolcreaterole: boolean;
        rolbypassrls: boolean;
        rolreplication: boolean;
      }>;
      expect(role[0]).toMatchObject({ name: "launchloom_admin", rolsuper: false });
    }, 60_000);
  });
}
