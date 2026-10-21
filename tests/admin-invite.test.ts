import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  InviteError,
  parseInviteArgs,
  runInvite,
} from "../scripts/invite-admin.mjs";

const secretUrl = "postgresql://private-role:private-password@db.example.test/launchloom_admin";
const owner = "test-owner-subject";
const directories: string[] = [];

async function privateDirectory() {
  const directory = await mkdtemp(path.join(tmpdir(), "launchloom-invite-"));
  directories.push(directory);
  return directory;
}

function fakeSql(handler: (text: string, params: unknown[]) => unknown) {
  const calls: Array<{ text: string; params: unknown[] }> = [];
  return {
    calls,
    async query<T = Record<string, unknown>>(
      text: string,
      params: unknown[] = [],
    ): Promise<T[]> {
      calls.push({ text, params });
      return (await handler(text, params)) as T[];
    },
  };
}

function workingSql() {
  return fakeSql((text) => {
    if (/from launchloom_admin\.members/u.test(text)) return [{ subject: owner }];
    if (/create_enrollment/u.test(text)) return [{ id: "enrollment-1" }];
    return [];
  });
}

afterAll(async () => {
  await Promise.all(directories.map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("invite-admin script", () => {
  it("is a dry run by default and has a bounded, explicit argument shape", () => {
    expect(
      parseInviteArgs([
        "--owner-subject",
        owner,
        "--email",
        "New.Admin@Example.Test",
        "--out",
        "/tmp/opencode/invite-link",
      ]),
    ).toMatchObject({
      ownerSubject: owner,
      email: "new.admin@example.test",
      out: "/tmp/opencode/invite-link",
      confirm: false,
    });
    expect(
      parseInviteArgs([
        "--owner-subject",
        owner,
        "--email",
        "new.admin@example.test",
        "--out",
        "/tmp/opencode/invite-link",
        "--dry-run",
      ]),
    ).toMatchObject({ confirm: false, dryRun: true });
  });

  it.each([
    [["--email", "new.admin@example.test", "--out", "/tmp/x"]],
    [["--owner-subject", owner, "--out", "/tmp/x"]],
    [["--owner-subject", owner, "--email", "bad", "--out", "/tmp/x"]],
    [["--owner-subject", owner, "--email", "new.admin@example.test", "--confirm"]],
    [["--owner-subject", owner, "--email", "new.admin@example.test", "--out", "/tmp/x", "--unknown"]],
    [["--owner-subject", owner, "--email", "new.admin@example.test", "--out", "/tmp/x", "--confirm", "--dry-run"]],
  ])("rejects invalid or unbounded input %j", (argv) => {
    expect(() => parseInviteArgs(argv as string[])).toThrow(InviteError);
  });

  it("writes nothing in dry-run mode and never prints the database URL", async () => {
    const directory = await privateDirectory();
    const out = path.join(directory, "invite-link");
    const sql = workingSql();
    const lines: string[] = [];
    const code = await runInvite({
      argv: ["--owner-subject", owner, "--email", "new.admin@example.test", "--out", out],
      env: { ADMIN_DATABASE_URL: secretUrl },
      sql,
      stdout: (line) => lines.push(line),
    });
    const output = lines.join("\n");
    expect(code).toBe(0);
    expect(output).toContain("dry run");
    expect(output).toContain("No token generated");
    expect(output).not.toContain(secretUrl);
    expect(output).not.toContain("private-password");
    await expect(stat(out)).rejects.toThrow();
    expect(sql.calls.some((call) => /create_enrollment/u.test(call.text))).toBe(false);
  });

  it("creates one copy-once invite in a private file without printing the token", async () => {
    const directory = await privateDirectory();
    const out = path.join(directory, "invite-link");
    const sql = workingSql();
    const lines: string[] = [];
    const code = await runInvite({
      argv: [
        "--owner-subject",
        owner,
        "--email",
        "New.Admin@Example.Test",
        "--out",
        out,
        "--confirm",
      ],
      env: { ADMIN_DATABASE_URL: secretUrl },
      sql,
      stdout: (line) => lines.push(line),
    });
    const output = lines.join("\n");
    expect(code).toBe(0);
    expect(output).not.toContain(secretUrl);
    expect(output).not.toContain("private-password");

    const file = await readFile(out, "utf8");
    const link = new URL(file.trim(), "https://api.example.test");
    expect(link.search).toBe("");
    expect(link.hash.startsWith("#enroll=")).toBe(true);
    const token = new URLSearchParams(link.hash.slice(1)).get("enroll");
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(output).not.toContain(token);
    expect((await stat(out)).mode & 0o777).toBe(0o600);

    const write = sql.calls.find((call) => /create_enrollment/u.test(call.text));
    expect(write?.params[0]).toBe("new.admin@example.test");
    expect(write?.params[1]).toBe(createHash("sha256").update(token!).digest("hex"));
    expect(write?.params[2]).toBe(owner);
    expect(output).not.toContain(String(write?.params[1]));
  });

  it("refuses to overwrite an existing link file and writes no enrollment", async () => {
    const directory = await privateDirectory();
    const out = path.join(directory, "existing-link");
    await writeFile(out, "do not overwrite\n", { mode: 0o600 });
    const sql = workingSql();
    const lines: string[] = [];
    await expect(
      runInvite({
        argv: ["--owner-subject", owner, "--email", "new.admin@example.test", "--out", out, "--confirm"],
        env: { ADMIN_DATABASE_URL: secretUrl },
        sql,
        stdout: (line) => lines.push(line),
      }),
    ).rejects.toMatchObject({ code: "output_exists" });
    expect(sql.calls.some((call) => /create_enrollment/u.test(call.text))).toBe(false);
    expect(await readFile(out, "utf8")).toBe("do not overwrite\n");
  });

  it("refuses when the supplied owner is not an active owner", async () => {
    const directory = await privateDirectory();
    const out = path.join(directory, "invite-link");
    const sql = fakeSql(() => []);
    const lines: string[] = [];
    await expect(
      runInvite({
        argv: ["--owner-subject", owner, "--email", "new.admin@example.test", "--out", out, "--confirm"],
        env: { ADMIN_DATABASE_URL: secretUrl },
        sql,
        stdout: (line) => lines.push(line),
      }),
    ).rejects.toMatchObject({ code: "owner_not_found" });
    expect(sql.calls.some((call) => /create_enrollment/u.test(call.text))).toBe(false);
    await expect(stat(out)).rejects.toThrow();
  });
});
