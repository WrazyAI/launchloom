import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { neon } from "@neondatabase/serverless";
import {
  MembershipError,
  createMembershipStore,
  type MembershipSql,
  type MembershipStore,
} from "../worker/src/admin/membership-store";
import { legacyAccessId } from "../worker/src/admin/workspace-api";
import { splitSqlStatements } from "./admin-sql";

const baseConnectionString = process.env.ADMIN_DATABASE_URL || "";
function siblingTestDatabase(value: string) {
  if (!value) return "";
  try {
    const url = new URL(value);
    url.pathname = "/launchloom_admin_test";
    return url.href;
  } catch {
    return "";
  }
}
const connectionString =
  process.env.ADMIN_TEST_DATABASE_URL || siblingTestDatabase(baseConnectionString);
const prefix = `test-owner-safety-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const subject = (name: string) => `${prefix}-${name}`;

describe.skipIf(!connectionString)("last-owner safety in an isolated two-owner workspace", () => {
  const a = { subject: subject("a"), email: `${subject("a")}@launchloom.test` };
  const b = { subject: subject("b"), email: `${subject("b")}@launchloom.test` };
  let sql!: ReturnType<typeof neon>;
  let store!: MembershipStore;

  const resetOwners = async () => {
    await sql.query(
      `update launchloom_admin.members set role = 'owner', active = true
       where subject = any($1::text[])`,
      [[a.subject, b.subject]],
    );
  };

  const ownerCount = async () => {
    const rows = (await sql.query(
      `select count(*)::int as count from launchloom_admin.members
       where active and role = 'owner'`,
    )) as Array<{ count: number }>;
    return rows[0].count;
  };

  beforeAll(async () => {
    sql = neon(connectionString);
    store = createMembershipStore(sql as unknown as MembershipSql);
    const migration = await readFile("db/admin/001-membership.sql", "utf8");
    for (const statement of splitSqlStatements(migration)) await sql.query(statement);
    for (const file of [
      "db/admin/002-legacy-identity-link.sql",
      "db/admin/003-atomic-legacy-link.sql",
    ]) {
      const additive = await readFile(file, "utf8");
      for (const statement of splitSqlStatements(additive)) await sql.query(statement);
    }

    // The dedicated test database is disposable; clear leftovers from an
    // interrupted run before asserting the two-owner fixture is isolated.
    await sql.query(
      `delete from launchloom_admin.enrollments where email like 'test-%' or created_by like 'test-%'`,
    );
    await sql.query(
      `delete from launchloom_admin.membership_audit where actor_subject like 'test-%' or target_subject like 'test-%'`,
    );
    await sql.query(
      `delete from launchloom_admin.legacy_identity_links where subject like 'test-%'`,
    );
    await sql.query(`delete from launchloom_admin.members where subject like 'test-%'`);

    const leftovers = (await sql.query(
      `select count(*)::int as count from launchloom_admin.members`,
    )) as Array<{ count: number }>;
    if (leftovers[0].count > 0)
      throw new Error("The isolated test database is not empty; refusing to run.");

    const bootstrapSubject = subject("bootstrap");
    const bootstrapEmail = `${bootstrapSubject}@launchloom.test`;
    const bootstrapLegacyId = await legacyAccessId(bootstrapEmail);
    const bootstrapped = (await sql.query(
      `select * from launchloom_admin.bootstrap_owner($1, $2, $3, $4)`,
      [bootstrapSubject, bootstrapEmail, "Bootstrap Owner", bootstrapLegacyId],
    )) as Array<{ subject: string; role: string; active: boolean }>;
    expect(bootstrapped[0]).toMatchObject({
      subject: bootstrapSubject,
      role: "owner",
      active: true,
    });
    const bootstrapLink = (await sql.query(
      `select legacy_id, subject from launchloom_admin.legacy_identity_links where subject = $1`,
      [bootstrapSubject],
    )) as Array<{ legacy_id: string; subject: string }>;
    expect(bootstrapLink).toEqual([
      { legacy_id: bootstrapLegacyId, subject: bootstrapSubject },
    ]);
    await sql.query(
      `delete from launchloom_admin.membership_audit where target_subject = $1`,
      [bootstrapSubject],
    );
    await sql.query(
      `delete from launchloom_admin.legacy_identity_links where subject = $1`,
      [bootstrapSubject],
    );
    await sql.query(`delete from launchloom_admin.members where subject = $1`, [
      bootstrapSubject,
    ]);

    await sql.query(
      `insert into launchloom_admin.members(subject, email, display_name, role, active)
       values ($1, $2, 'Owner A', 'owner', true), ($3, $4, 'Owner B', 'owner', true)`,
      [a.subject, a.email, b.subject, b.email],
    );
    expect(await ownerCount()).toBe(2);
  }, 60_000);

  afterAll(async () => {
    const subjects = [a.subject, b.subject];
    await sql.query(
      `delete from launchloom_admin.enrollments where created_by = any($1::text[]) or email like $2`,
      [subjects, `${prefix}%`],
    );
    await sql.query(
      `delete from launchloom_admin.membership_audit
       where actor_subject = any($1::text[]) or target_subject = any($1::text[])`,
      [subjects],
    );
    await sql.query(
      `delete from launchloom_admin.legacy_identity_links where subject = any($1::text[])`,
      [subjects],
    );
    await sql.query(
      `delete from launchloom_admin.members where subject = any($1::text[])`,
      [subjects],
    );
  });

  it("keeps one active owner when both owners concurrently demote themselves", async () => {
    const results = await Promise.allSettled([
      store.changeMember(a.subject, a.subject, { role: "admin" }),
      store.changeMember(b.subject, b.subject, { role: "admin" }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect((rejected as PromiseRejectedResult).reason).toBeInstanceOf(MembershipError);
    expect((rejected as PromiseRejectedResult).reason).toMatchObject({
      code: "last_owner",
      status: 409,
    });
    expect(await ownerCount()).toBe(1);
  });

  it("refuses the deactivated owner's concurrent deactivation of the survivor", async () => {
    await resetOwners();
    const results = await Promise.allSettled([
      store.changeMember(a.subject, b.subject, { active: false }),
      store.changeMember(b.subject, a.subject, { active: false }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect((rejected as PromiseRejectedResult).reason).toMatchObject({
      code: "forbidden",
      status: 403,
    });
    expect(await ownerCount()).toBe(1);
  });

  it("does not mint an invitation for an owner deactivated while waiting for the guard", async () => {
    await resetOwners();
    const hold = sql.transaction([
      sql`select 1 from launchloom_admin.workspace_guard where id for update`,
      sql`select pg_sleep(2)`,
    ]);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const action = store
      .createEnrollment(a.subject, `${prefix}-invitee@launchloom.test`)
      .then(
        (value) => ({ status: "fulfilled" as const, value }),
        (reason: MembershipError) => ({ status: "rejected" as const, reason }),
      );
    await new Promise((resolve) => setTimeout(resolve, 250));
    await sql.query(
      `update launchloom_admin.members set active = false where subject = $1`,
      [a.subject],
    );
    await hold;
    const outcome = await action;
    expect(outcome.status).toBe("rejected");
    if (outcome.status === "rejected")
      expect(outcome.reason).toMatchObject({ code: "forbidden", status: 403 });
    const rows = (await sql.query(
      `select count(*)::int as count from launchloom_admin.enrollments where email = $1`,
      [`${prefix}-invitee@launchloom.test`],
    )) as Array<{ count: number }>;
    expect(rows[0].count).toBe(0);
  }, 30_000);
});
