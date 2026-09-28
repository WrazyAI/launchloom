import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(
  new URL("../scripts/assert-revision-change-scope.mjs", import.meta.url),
);

async function createClientRepo() {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "launchloom-revision-scope-"),
  );
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  execFileSync("git", ["config", "user.email", "tests@example.invalid"], {
    cwd: root,
  });
  execFileSync("git", ["config", "user.name", "Revision scope test"], {
    cwd: root,
  });
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  await fs.writeFile(
    path.join(root, "src/site.config.json"),
    JSON.stringify({ business: {}, revisionReport: {} }),
  );
  execFileSync("git", ["add", "src/site.config.json"], { cwd: root });
  execFileSync("git", ["commit", "--quiet", "-m", "baseline"], { cwd: root });
  execFileSync("git", ["branch", "-M", "main"], { cwd: root });
  const report = path.join(
    os.tmpdir(),
    `revision-template-${path.basename(root)}.json`,
  );
  await fs.writeFile(
    report,
    JSON.stringify({ version: 1, files: ["src/components/Header.astro"] }),
  );
  return { root, report };
}

describe("revision change-scope CLI", () => {
  it("passes when the git diff is limited to deterministic sync output and site config", async () => {
    const { root, report } = await createClientRepo();
    await fs.mkdir(path.join(root, "src/components"), { recursive: true });
    await fs.writeFile(
      path.join(root, "src/components/Header.astro"),
      "<header />",
    );
    await fs.writeFile(
      path.join(root, "src/site.config.json"),
      JSON.stringify({
        business: { name: "Verified client" },
        revisionReport: {},
      }),
    );

    const output = execFileSync(
      process.execPath,
      [
        scriptPath,
        "--client",
        root,
        "--template-report",
        report,
        "--base",
        "main",
      ],
      { encoding: "utf8" },
    );

    expect(JSON.parse(output)).toMatchObject({
      status: "passed",
      changedPaths: ["src/components/Header.astro", "src/site.config.json"],
      creativeBundleAllowed: false,
    });
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(report, { force: true });
  });

  it("rejects unrelated paths and only unlocks the creative bundle after verified repair", async () => {
    const { root, report } = await createClientRepo();
    await fs.mkdir(path.join(root, "src/generated-experiences/selected"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(root, "src/generated-experiences/selected/Experience.jsx"),
      "export default function Experience() {}",
    );
    await fs.writeFile(
      path.join(root, "src/pages-unrelated.astro"),
      "<main />",
    );

    const rejected = spawnSync(
      process.execPath,
      [
        scriptPath,
        "--client",
        root,
        "--template-report",
        report,
        "--base",
        "main",
      ],
      { encoding: "utf8" },
    );
    expect(rejected.status).not.toBe(0);
    expect(rejected.stderr).toContain("src/pages-unrelated.astro");

    const config = {
      business: {},
      design: { experience: { candidateId: "candidate-a" } },
      revisionReport: {
        creativeSourceRepairRequired: true,
        creativeSourceRepairVerified: {
          pass: true,
          candidateId: "candidate-a",
        },
      },
    };
    await fs.writeFile(
      path.join(root, "src/site.config.json"),
      JSON.stringify(config),
    );
    await fs.rm(path.join(root, "src/pages-unrelated.astro"));

    const accepted = execFileSync(
      process.execPath,
      [
        scriptPath,
        "--client",
        root,
        "--template-report",
        report,
        "--base",
        "main",
      ],
      { encoding: "utf8" },
    );
    expect(JSON.parse(accepted).creativeBundleAllowed).toBe(true);
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(report, { force: true });
  });

  it("rejects creative bundle changes when no current feedback requires creative repair", async () => {
    const { root, report } = await createClientRepo();
    await fs.mkdir(path.join(root, "src/generated-experiences/selected"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(root, "src/generated-experiences/selected/Experience.jsx"),
      "export default function Experience() {}",
    );
    await fs.writeFile(
      path.join(root, "src/site.config.json"),
      JSON.stringify({
        business: {},
        design: { experience: { candidateId: "candidate-a" } },
        revisionReport: {
          creativeSourceRepairRequired: false,
          creativeSourceRepairVerified: {
            pass: true,
            candidateId: "candidate-a",
          },
        },
      }),
    );

    const result = spawnSync(
      process.execPath,
      [
        scriptPath,
        "--client",
        root,
        "--template-report",
        report,
        "--base",
        "main",
      ],
      { encoding: "utf8" },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "src/generated-experiences/selected/Experience.jsx",
    );
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(report, { force: true });
  });

  it("rejects a rename from an out-of-scope file into an allowed path", async () => {
    const { root, report } = await createClientRepo();
    await fs.writeFile(report, JSON.stringify({ version: 1, files: [] }));
    await fs.mkdir(path.join(root, "public"), { recursive: true });
    await fs.writeFile(path.join(root, "public/extra.svg"), "<svg />");
    execFileSync("git", ["add", "public/extra.svg"], { cwd: root });
    execFileSync("git", ["commit", "--quiet", "-m", "add public asset"], {
      cwd: root,
    });
    await fs.rename(
      path.join(root, "public/extra.svg"),
      path.join(root, "AGENTS.md"),
    );
    execFileSync("git", ["add", "--all"], { cwd: root });

    const result = spawnSync(
      process.execPath,
      [
        scriptPath,
        "--client",
        root,
        "--template-report",
        report,
        "--base",
        "main",
      ],
      { encoding: "utf8" },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("public/extra.svg");
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(report, { force: true });
  });

  it("rejects an out-of-scope commit already present on the client revision branch", async () => {
    const { root, report } = await createClientRepo();
    execFileSync("git", ["switch", "--quiet", "-c", "review/client-revision"], {
      cwd: root,
    });
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ scripts: {} }),
    );
    execFileSync("git", ["add", "package.json"], { cwd: root });
    execFileSync(
      "git",
      ["commit", "--quiet", "-m", "untrusted branch commit"],
      {
        cwd: root,
      },
    );
    await fs.writeFile(
      path.join(root, "src/site.config.json"),
      JSON.stringify({
        business: { name: "Allowed config edit" },
        revisionReport: {},
      }),
    );

    const result = spawnSync(
      process.execPath,
      [
        scriptPath,
        "--client",
        root,
        "--template-report",
        report,
        "--base",
        "main",
      ],
      { encoding: "utf8" },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("package.json");
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(report, { force: true });
  });

  it("includes allowed commits from the trusted base in its change receipt", async () => {
    const { root, report } = await createClientRepo();
    execFileSync("git", ["switch", "--quiet", "-c", "review/client-revision"], {
      cwd: root,
    });
    await fs.writeFile(
      path.join(root, "src/site.config.json"),
      JSON.stringify({
        business: { name: "Allowed committed edit" },
        revisionReport: {},
      }),
    );
    execFileSync("git", ["add", "src/site.config.json"], { cwd: root });
    execFileSync(
      "git",
      ["commit", "--quiet", "-m", "allowed site config revision"],
      {
        cwd: root,
      },
    );

    const output = execFileSync(
      process.execPath,
      [
        scriptPath,
        "--client",
        root,
        "--template-report",
        report,
        "--base",
        "main",
      ],
      { encoding: "utf8" },
    );

    expect(JSON.parse(output)).toMatchObject({
      status: "passed",
      changedPaths: ["src/site.config.json"],
    });
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(report, { force: true });
  });
});
