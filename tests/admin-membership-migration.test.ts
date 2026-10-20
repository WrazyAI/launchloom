import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { neon } from "@neondatabase/serverless";

const migrationPath = "db/admin/001-membership.sql";
const connectionString = process.env.ADMIN_DATABASE_URL || "";

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
    for (const fn of [
      "get_member",
      "find_active_member",
      "list_members",
      "create_enrollment",
      "accept_enrollment",
      "bootstrap_owner",
      "change_member",
      "update_profile",
    ]) {
      expect(migration).toMatch(
        new RegExp(`CREATE OR REPLACE FUNCTION launchloom_admin\\.${fn}`, "u"),
      );
    }
    expect(migration).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS members_active_email",
    );
    expect(migration).toContain("token_hash text NOT NULL UNIQUE");
    expect(migration).toContain("role IN ('owner', 'admin')");
    expect(migration).toContain("SET search_path = launchloom_admin, public");
    // Owner safety must lock the singleton guard before checking the owner count.
    const changeMember = migration.slice(
      migration.indexOf("FUNCTION launchloom_admin.change_member"),
      migration.indexOf("FUNCTION launchloom_admin.update_profile"),
    );
    expect(changeMember.indexOf("workspace_guard WHERE id FOR UPDATE")).toBeGreaterThan(-1);
    expect(changeMember.indexOf("workspace_guard WHERE id FOR UPDATE")).toBeLessThan(
      changeMember.indexOf("count(*)"),
    );
    expect(migration).toContain("last_owner");
    expect(migration).toContain("enrollment_used");
    expect(migration).toContain("enrollment_expired");
  });

  it("grants no public, Data API or browser role access", async () => {
    const migration = await readFile(migrationPath, "utf8");
    expect(migration).not.toMatch(/\bGRANT\b/u);
    expect(migration).not.toMatch(/\bCREATE POLICY\b/u);
    expect(migration).not.toMatch(/\bENABLE ROW LEVEL SECURITY\b/u);
    expect(migration).not.toMatch(/\b(?:anon|authenticated|service_role)\b/u);
    expect(migration).not.toContain("pg_graphql");
    expect(migration).not.toContain("supabase");
  });
});

/** Split additive DDL on top-level semicolons, preserving $$ function bodies. */
function splitSqlStatements(source: string) {
  const statements: string[] = [];
  const withoutLineComments = source
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
  let current = "";
  let dollarQuoted = false;
  for (let index = 0; index < withoutLineComments.length; index += 1) {
    if (withoutLineComments.startsWith("$$", index)) {
      dollarQuoted = !dollarQuoted;
      current += "$$";
      index += 1;
      continue;
    }
    const character = withoutLineComments[index];
    current += character;
    if (!dollarQuoted && character === ";") {
      statements.push(current.trim());
      current = "";
    }
  }
  if (current.trim()) statements.push(current.trim());
  return statements.filter((statement) => {
    const withoutComments = statement
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n")
      .trim();
    return withoutComments.length > 0 && statement !== ";";
  });
}

if (connectionString) {
  describe("admin membership migration (live)", () => {
    it("reapplies safely and keeps the schema private", async () => {
      const sql = neon(connectionString);
      const migration = await readFile(migrationPath, "utf8");
      const statements = splitSqlStatements(migration);
      // The migration is additive and idempotent; rerunning it must not drop or
      // rewrite membership history.
      for (const statement of statements) await sql.query(statement);
      for (const statement of statements) await sql.query(statement);

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
        `select routine_name from information_schema.routines
         where routine_schema = 'launchloom_admin'`,
      )) as Array<{ routine_name: string }>;
      expect(functions.map((row) => row.routine_name)).toEqual(
        expect.arrayContaining([
          "accept_enrollment",
          "bootstrap_owner",
          "change_member",
          "create_enrollment",
          "find_active_member",
          "get_member",
          "list_members",
          "update_profile",
        ]),
      );
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
        `select current_user as name, rolsuper from pg_roles where rolname = current_user`,
      )) as Array<{ name: string; rolsuper: boolean }>;
      expect(role[0]).toMatchObject({ name: "launchloom_admin", rolsuper: false });
    }, 60_000);
  });
}
