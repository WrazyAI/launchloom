import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { neon } from "@neondatabase/serverless";
import {
  MembershipError,
  createMembershipStore,
  hashEnrollmentToken,
  type MembershipSql,
  type MembershipStore,
} from "../worker/src/admin/membership-store";
import type { VerifiedSession } from "../worker/src/admin/neon-auth";
import { legacyAccessId } from "../worker/src/admin/workspace-api";

const connectionString = process.env.ADMIN_DATABASE_URL || "";

describe.skipIf(!connectionString)("durable membership against the isolated development database", () => {
  const prefix = `test-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const subjects = new Set<string>();
  const subject = (name: string) => `${prefix}-${name}`;
  const email = (name: string) => `${prefix}-${name}@launchloom.test`;
  let sql!: ReturnType<typeof neon>;
  let store!: MembershipStore;
  const owner = {
    subject: subject("owner"),
    email: email("owner"),
    displayName: "Fixture Owner",
  };
  let tokenSequence = 0;

  const verified = (subjectValue: string, emailValue: string): VerifiedSession => ({
    subject: subjectValue,
    email: emailValue,
    emailVerified: true,
    displayName: "Fixture Person",
    expiresAt: Date.now() + 60_000,
  });

  async function seedMember(name: string, role: "owner" | "admin") {
    const subjectValue = subject(name);
    const emailValue = email(name);
    await sql.query(
      `insert into launchloom_admin.members(subject, email, display_name, role, active)
       values ($1, $2, $3, $4, true)`,
      [subjectValue, emailValue, `Fixture ${name}`, role],
    );
    subjects.add(subjectValue);
    return { subject: subjectValue, email: emailValue };
  }

  async function enrollmentFor(ownerSubject: string, emailValue: string) {
    const created = await store.createEnrollment(ownerSubject, emailValue);
    const link = new URL(created.url, "https://api.launchloom.test");
    const token = new URLSearchParams(link.hash.slice(1)).get("enroll");
    if (!token) throw new Error("test token missing");
    return { ...created, token };
  }

  async function rejection(promise: Promise<unknown>) {
    try {
      await promise;
    } catch (error) {
      return error as MembershipError;
    }
    throw new Error("expected rejection");
  }

  beforeAll(async () => {
    sql = neon(connectionString);
    store = createMembershipStore(sql as unknown as MembershipSql);
    subjects.add(owner.subject);
    await sql.query(
      `insert into launchloom_admin.members(subject, email, display_name, role, active)
       values ($1, $2, $3, 'owner', true)`,
      [owner.subject, owner.email, owner.displayName],
    );
  });

  afterAll(async () => {
    const values = [...subjects];
    await sql.query(
      `delete from launchloom_admin.enrollments
       where email like $1 or created_by = any($2::text[])`,
      [`${prefix}%`, values],
    );
    await sql.query(
      `delete from launchloom_admin.membership_audit
       where actor_subject = any($1::text[]) or target_subject = any($1::text[])`,
      [values],
    );
    await sql.query(
      `delete from launchloom_admin.legacy_identity_links where subject = any($1::text[])`,
      [values],
    );
    await sql.query(
      `delete from launchloom_admin.members where subject = any($1::text[])`,
      [values],
    );
  });

  it("binds an enrollment only to the verified matching email, once", async () => {
    const invitee = {
      subject: subject("invitee"),
      email: email("invitee"),
    };
    subjects.add(invitee.subject);
    const enrollment = await enrollmentFor(owner.subject, invitee.email);

    // The secret is stored as a SHA-256 hash only.
    const stored = (await sql.query(
      `select token_hash from launchloom_admin.enrollments where id = $1`,
      [enrollment.enrollmentId],
    )) as Array<{ token_hash: string }>;
    expect(stored[0].token_hash).toBe(await hashEnrollmentToken(enrollment.token));
    expect(stored[0].token_hash).not.toBe(enrollment.token);

    // An unverified session cannot touch the database path.
    const unverified = await rejection(
      store.acceptEnrollment(
        { ...verified(invitee.subject, invitee.email), emailVerified: false },
        enrollment.token,
      ),
    );
    expect(unverified).toMatchObject({ code: "forbidden", status: 403 });

    // A verified wrong email is rejected without consuming the invitation.
    const wrongEmail = await rejection(
      store.acceptEnrollment(verified(invitee.subject, email("someone-else")), enrollment.token),
    );
    expect(wrongEmail).toMatchObject({ code: "email_mismatch", status: 403 });

    const claimed = await store.acceptEnrollment(
      verified(invitee.subject, invitee.email.toUpperCase()),
      enrollment.token,
    );
    expect(claimed).toMatchObject({
      id: invitee.subject,
      email: invitee.email,
      role: "admin",
      authSource: "neon",
    });
    const linked = (await sql.query(
      `select legacy_id, subject from launchloom_admin.legacy_identity_links where subject = $1`,
      [invitee.subject],
    )) as Array<{ legacy_id: string; subject: string }>;
    expect(linked).toEqual([
      { legacy_id: await legacyAccessId(invitee.email), subject: invitee.subject },
    ]);

    // A second active membership cannot claim the same verified email.
    const duplicateSubject = subject("duplicate-email");
    subjects.add(duplicateSubject);
    const duplicateEnrollment = await enrollmentFor(owner.subject, invitee.email);
    const duplicate = await rejection(
      store.acceptEnrollment(
        verified(duplicateSubject, invitee.email),
        duplicateEnrollment.token,
      ),
    );
    expect(duplicate).toMatchObject({ code: "conflict", status: 409 });

    const repeated = await rejection(
      store.acceptEnrollment(verified(invitee.subject, invitee.email), enrollment.token),
    );
    expect(repeated).toMatchObject({ code: "enrollment_used", status: 409 });

    // A non-owner active admin cannot mint invitations.
    const forbidden = await rejection(store.createEnrollment(invitee.subject, email("another")));
    expect(forbidden).toMatchObject({ code: "forbidden", status: 403 });
  });

  it("links the verified legacy identity once and refuses cross-account overwrite", async () => {
    const invitee = { subject: subject("legacy-invitee"), email: email("legacy-invitee") };
    const other = { subject: subject("legacy-other"), email: email("legacy-other") };
    subjects.add(invitee.subject);
    subjects.add(other.subject);
    await sql.query(
      `insert into launchloom_admin.members(subject, email, display_name, role, active)
       values ($1, $2, $3, 'admin', true), ($4, $5, $6, 'admin', true)`,
      [
        invitee.subject,
        invitee.email,
        "Legacy Invitee",
        other.subject,
        other.email,
        "Legacy Other",
      ],
    );
    const legacyId = await legacyAccessId(invitee.email.toUpperCase());

    await expect(
      sql.query("select * from launchloom_admin.link_legacy_identity($1, $2)", [
        legacyId,
        invitee.subject,
      ]),
    ).resolves.toMatchObject([{ legacy_id: legacyId, subject: invitee.subject }]);
    // Repeating the same association is idempotent and does not rewrite it.
    await expect(
      sql.query("select * from launchloom_admin.link_legacy_identity($1, $2)", [
        legacyId,
        invitee.subject,
      ]),
    ).resolves.toMatchObject([{ legacy_id: legacyId, subject: invitee.subject }]);
    const count = (await sql.query(
      `select count(*)::int as count from launchloom_admin.legacy_identity_links
       where legacy_id = $1 and subject = $2`,
      [legacyId, invitee.subject],
    )) as Array<{ count: number }>;
    expect(count[0].count).toBe(1);

    // A different account cannot take over an existing legacy ID.
    const conflict = await rejection(
      sql.query("select * from launchloom_admin.link_legacy_identity($1, $2)", [
        legacyId,
        other.subject,
      ]) as unknown as Promise<unknown>,
    );
    expect(String(conflict.message)).toContain("legacy_identity_conflict");
    const retained = (await sql.query(
      `select subject from launchloom_admin.legacy_identity_links where legacy_id = $1`,
      [legacyId],
    )) as Array<{ subject: string }>;
    expect(retained).toEqual([{ subject: invitee.subject }]);
  });

  it("rolls back member creation and token use when the legacy link conflicts", async () => {
    const invitee = { subject: subject("atomic-invitee"), email: email("atomic-invitee") };
    const other = { subject: subject("atomic-other"), email: email("atomic-other") };
    subjects.add(invitee.subject);
    subjects.add(other.subject);
    await sql.query(
      `insert into launchloom_admin.members(subject, email, display_name, role, active)
       values ($1, $2, $3, 'admin', true)`,
      [other.subject, other.email, "Atomic Other"],
    );
    const legacyId = await legacyAccessId(invitee.email);
    await sql.query("select * from launchloom_admin.link_legacy_identity($1, $2)", [
      legacyId,
      other.subject,
    ]);
    const enrollment = await enrollmentFor(owner.subject, invitee.email);

    const conflict = await rejection(
      store.acceptEnrollment(verified(invitee.subject, invitee.email), enrollment.token),
    );
    expect(conflict).toMatchObject({ code: "conflict", status: 409 });

    // The failed acceptance must not leave an active unlinked member or spend
    // the one-use token.
    const members = (await sql.query(
      `select subject from launchloom_admin.members where subject = $1`,
      [invitee.subject],
    )) as Array<{ subject: string }>;
    expect(members).toEqual([]);
    const state = (await sql.query(
      `select consumed_at from launchloom_admin.enrollments where id = $1`,
      [enrollment.enrollmentId],
    )) as Array<{ consumed_at: string | null }>;
    expect(state[0].consumed_at).toBeNull();

    // Repairing the conflicting link lets the same token claim succeed.
    await sql.query(
      `delete from launchloom_admin.legacy_identity_links where legacy_id = $1`,
      [legacyId],
    );
    const claimed = await store.acceptEnrollment(
      verified(invitee.subject, invitee.email),
      enrollment.token,
    );
    expect(claimed).toMatchObject({ id: invitee.subject, role: "admin" });
    const link = (await sql.query(
      `select legacy_id, subject from launchloom_admin.legacy_identity_links where legacy_id = $1`,
      [legacyId],
    )) as Array<{ legacy_id: string; subject: string }>;
    expect(link).toEqual([{ legacy_id: legacyId, subject: invitee.subject }]);
  });

  it("rejects an expired invitation", async () => {
    const invitee = email(`expired-${tokenSequence++}`);
    const token = `${prefix}expiredtoken`
      .replace(/[^A-Za-z0-9_-]/gu, "")
      .padEnd(43, "x")
      .slice(0, 43);
    const hash = await hashEnrollmentToken(token);
    await sql.query(
      `insert into launchloom_admin.enrollments(email, token_hash, created_by, expires_at)
       values ($1, $2, $3, now() - interval '1 minute')`,
      [invitee, hash, owner.subject],
    );
    const expired = await rejection(
      store.acceptEnrollment(verified(subject("expired"), invitee), token),
    );
    expect(expired).toMatchObject({ code: "expired", status: 410 });
  });

  it("updates only profile fields and round-trips Unicode text", async () => {
    const invitee = {
      subject: subject("profile"),
      email: email("profile"),
    };
    subjects.add(invitee.subject);
    const enrollment = await enrollmentFor(owner.subject, invitee.email);
    await store.acceptEnrollment(verified(invitee.subject, invitee.email), enrollment.token);

    const displayName = "Chloé 李雷 <not-markup>";
    const updated = await store.updateOwnProfile(invitee.subject, {
      displayName,
      avatarKey: "initials-sage",
    });
    expect(updated.displayName).toBe(displayName);
    expect(updated.avatarKey).toBe("initials-sage");
    expect(updated.initials).toBe("C李");

    const row = (await sql.query(
      `select display_name, avatar_key, email, role from launchloom_admin.members where subject = $1`,
      [invitee.subject],
    )) as Array<{ display_name: string; avatar_key: string; email: string; role: string }>;
    expect(row[0]).toMatchObject({
      display_name: displayName,
      avatar_key: "initials-sage",
      email: invitee.email,
      role: "admin",
    });

    const audit = (await sql.query(
      `select action, actor_subject from launchloom_admin.membership_audit
       where target_subject = $1 order by id`,
      [invitee.subject],
    )) as Array<{ action: string; actor_subject: string | null }>;
    expect(audit.map((entry) => entry.action)).toEqual(
      expect.arrayContaining(["enrollment_accepted", "profile_updated"]),
    );
    expect(audit.find((entry) => entry.action === "profile_updated")?.actor_subject).toBe(
      invitee.subject,
    );

    await expect(
      store.updateOwnProfile(invitee.subject, { avatarKey: "https://evil.example/a.png" }),
    ).rejects.toMatchObject({ code: "invalid" });
    await expect(
      store.updateOwnProfile(invitee.subject, { displayName: "x".repeat(101) }),
    ).rejects.toMatchObject({ code: "invalid" });
  });

  it("claims a one-use invitation exactly once under concurrent acceptance", async () => {
    const inviteeEmail = email("race");
    const first = subject("race-a");
    const second = subject("race-b");
    subjects.add(first);
    subjects.add(second);
    const enrollment = await enrollmentFor(owner.subject, inviteeEmail);

    const results = await Promise.allSettled([
      store.acceptEnrollment(verified(first, inviteeEmail), enrollment.token),
      store.acceptEnrollment(verified(second, inviteeEmail), enrollment.token),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect((rejected as PromiseRejectedResult).reason).toMatchObject({
      code: "enrollment_used",
      status: 409,
    });
    const active = (await sql.query(
      `select count(*)::int as count from launchloom_admin.members
       where lower(email) = lower($1) and active`,
      [inviteeEmail],
    )) as Array<{ count: number }>;
    expect(active[0].count).toBe(1);
  });

  it("lets an owner promote, demote and deactivate while retaining audit history", async () => {
    const invitee = {
      subject: subject("promoted"),
      email: email("promoted"),
    };
    subjects.add(invitee.subject);
    const enrollment = await enrollmentFor(owner.subject, invitee.email);
    await store.acceptEnrollment(verified(invitee.subject, invitee.email), enrollment.token);

    const promoted = await store.changeMember(owner.subject, invitee.subject, {
      role: "owner",
    });
    expect(promoted.role).toBe("owner");
    const demoted = await store.changeMember(owner.subject, invitee.subject, {
      role: "admin",
    });
    expect(demoted.role).toBe("admin");

    const deactivated = await store.changeMember(owner.subject, invitee.subject, {
      active: false,
    });
    expect(deactivated.active).toBe(false);
    expect(await store.findActive(invitee.subject)).toBeNull();
    await expect(
      store.updateOwnProfile(invitee.subject, { displayName: "Deactivated" }),
    ).rejects.toMatchObject({ code: "not_found" });
    const listed = await store.list();
    expect(listed.find((entry) => entry.id === invitee.subject)).toMatchObject({
      active: false,
      role: "admin",
    });

    const audit = (await sql.query(
      `select actor_subject, action, target_subject, detail from launchloom_admin.membership_audit
       where target_subject = $1 order by id`,
      [invitee.subject],
    )) as Array<{
      actor_subject: string | null;
      action: string;
      target_subject: string | null;
      detail: Record<string, unknown>;
    }>;
    expect(audit.filter((row) => row.action === "member_changed")).toHaveLength(3);
    expect(audit.filter((row) => row.action === "member_changed").every((row) => row.actor_subject === owner.subject)).toBe(true);
    expect(audit.at(-1)?.detail).toMatchObject({ role: null, active: false });
  });

  it("rechecks owner authorization after acquiring the serialization lock", async () => {
    const actor = await seedMember(`stale-actor-${tokenSequence++}`, "owner");
    const target = await seedMember(`stale-target-${tokenSequence++}`, "admin");
    // Hold the workspace guard so the action blocks before authorizing its
    // actor. The direct deactivation simulates a competing committed request.
    const hold = sql.transaction([
      sql`select 1 from launchloom_admin.workspace_guard where id for update`,
      sql`select pg_sleep(2)`,
    ]);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const action = store
      .changeMember(actor.subject, target.subject, { role: "owner" })
      .then(
        (value) => ({ status: "fulfilled" as const, value }),
        (reason: MembershipError) => ({ status: "rejected" as const, reason }),
      );
    await new Promise((resolve) => setTimeout(resolve, 250));
    await sql.query(
      `update launchloom_admin.members set active = false where subject = $1`,
      [actor.subject],
    );
    await hold;
    const outcome = await action;
    expect(outcome.status).toBe("rejected");
    if (outcome.status === "rejected")
      expect(outcome.reason).toMatchObject({ code: "forbidden", status: 403 });
    const targetRow = (await sql.query(
      `select role from launchloom_admin.members where subject = $1`,
      [target.subject],
    )) as Array<{ role: string }>;
    expect(targetRow[0].role).toBe("admin");
  }, 30_000);

  it("serializes concurrent deactivation of the last two test owners", async () => {
    const pair = await Promise.all([
      seedMember(`concurrent-a-${tokenSequence++}`, "owner"),
      seedMember(`concurrent-b-${tokenSequence++}`, "owner"),
    ]);
    const [a, b] = pair;
    const results = await Promise.allSettled([
      store.changeMember(a.subject, b.subject, { active: false }),
      store.changeMember(b.subject, a.subject, { active: false }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect((rejected as PromiseRejectedResult).reason).toBeInstanceOf(MembershipError);
    // Depending on which request commits first, the loser is either blocked by
    // the last-owner count or its actor was just deactivated (`forbidden`).
    // Both are safe refusals; exactly one operation may succeed.
    expect(["last_owner", "forbidden"]).toContain(
      ((rejected as PromiseRejectedResult).reason as MembershipError).code,
    );

    const rows = (await sql.query(
      `select subject, active from launchloom_admin.members
       where subject = any($1::text[])`,
      [[a.subject, b.subject]],
    )) as Array<{ subject: string; active: boolean }>;
    expect(rows).toHaveLength(2);
    expect(rows.filter((row) => row.active)).toHaveLength(1);
  });

  it("never modified the existing development owner", async () => {
    const rows = (await sql.query(
      `select subject, email, role, active from launchloom_admin.members
       where subject = $1`,
      ["4b4f068f-728c-468f-8247-ad3d4cbf7dbb"],
    )) as Array<{ subject: string; email: string; role: string; active: boolean }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      subject: "4b4f068f-728c-468f-8247-ad3d4cbf7dbb",
      email: "dev-owner@launchloom.test",
      role: "owner",
      active: true,
    });
  });
});

