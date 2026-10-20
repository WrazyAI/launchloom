import { describe, expect, it } from "vitest";
import {
  BootstrapError,
  parseBootstrapArgs,
  runBootstrap,
} from "../scripts/bootstrap-admin-owner.mjs";

const secretUrl = "postgresql://private-role:private-password@db.example.test/launchloom_admin";

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

describe("bootstrap-admin-owner script", () => {
  it("is a dry run by default and requires an explicit confirmation flag", () => {
    const parsed = parseBootstrapArgs([
      "--subject",
      "test-subject",
      "--email",
      "Owner@Example.Test",
      "--name",
      "Opera Tør",
    ]);
    expect(parsed).toMatchObject({
      subject: "test-subject",
      email: "owner@example.test",
      name: "Opera Tør",
      confirm: false,
      help: false,
    });
    expect(
      parseBootstrapArgs([
        "--subject",
        "test-subject",
        "--email",
        "owner@example.test",
        "--name",
        "Owner",
        "--confirm",
        "--database-url-file",
        "/tmp/opencode/example",
      ]),
    ).toMatchObject({ confirm: true, databaseUrlFile: "/tmp/opencode/example" });
  });

  it.each([
    [["--subject", "s", "--email", "not-an-email", "--name", "N"]],
    [["--subject", "", "--email", "owner@example.test", "--name", "N"]],
    [["--subject", "s", "--email", "owner@example.test", "--name", "   "]],
    [["--subject", "s", "--email", "owner@example.test", "--name", "x".repeat(101)]],
    [["--unknown", "value"]],
  ])("rejects invalid input %j", (argv) => {
    expect(() => parseBootstrapArgs(argv as string[])).toThrow(BootstrapError);
  });

  it("shows the intended action without a connection or secret in dry-run mode", async () => {
    const sql = fakeSql(() => [{ count: 1 }]);
    const lines: string[] = [];
    const code = await runBootstrap({
      argv: ["--subject", "test-subject", "--email", "owner@example.test", "--name", "Owner"],
      env: { ADMIN_DATABASE_URL: secretUrl },
      sql,
      stdout: (line) => lines.push(line),
    });
    const output = lines.join("\n");
    expect(code).toBe(0);
    expect(output).toContain("dry run");
    expect(output).toContain("owner@example.test");
    expect(output).toContain("No changes written");
    expect(output).not.toContain(secretUrl);
    expect(output).not.toContain("private-password");
    expect(sql.calls.some((call) => /bootstrap_owner/u.test(call.text))).toBe(false);
  });

  it("refuses a confirmed write when an active owner already exists", async () => {
    const sql = fakeSql(() => [{ count: 1 }]);
    const lines: string[] = [];
    const code = await runBootstrap({
      argv: [
        "--subject",
        "test-subject",
        "--email",
        "owner@example.test",
        "--name",
        "Owner",
        "--confirm",
      ],
      env: { ADMIN_DATABASE_URL: secretUrl },
      sql,
      stdout: (line) => lines.push(line),
    });
    expect(code).toBe(1);
    expect(lines.join("\n")).toMatch(/refus|already exists/iu);
    expect(sql.calls.some((call) => /bootstrap_owner/u.test(call.text))).toBe(false);
  });

  it("bootstraps only the empty-owner workspace and reports no secret", async () => {
    const sql = fakeSql((text) => {
      if (/count\(\*\)/u.test(text)) return [{ count: 0 }];
      return [
        {
          subject: "test-subject",
          email: "owner@example.test",
          display_name: "Opera Tør",
          role: "owner",
          active: true,
        },
      ];
    });
    const lines: string[] = [];
    const code = await runBootstrap({
      argv: [
        "--subject",
        "test-subject",
        "--email",
        "owner@example.test",
        "--name",
        "Opera Tør",
        "--confirm",
      ],
      env: { ADMIN_DATABASE_URL: secretUrl },
      sql,
      stdout: (line) => lines.push(line),
    });
    const output = lines.join("\n");
    expect(code).toBe(0);
    expect(output).toContain("owner@example.test");
    expect(output).not.toContain(secretUrl);
    expect(output).not.toContain("private-password");
    const write = sql.calls.find((call) => /bootstrap_owner/u.test(call.text));
    expect(write?.params).toEqual(["test-subject", "owner@example.test", "Opera Tør"]);
  });

  it("requires a database URL from the environment or a file path", async () => {
    const lines: string[] = [];
    await expect(
      runBootstrap({
        argv: ["--subject", "test-subject", "--email", "owner@example.test", "--name", "Owner"],
        env: {},
        stdout: (line) => lines.push(line),
      }),
    ).rejects.toMatchObject({ code: "missing_database_url" });
  });
});
