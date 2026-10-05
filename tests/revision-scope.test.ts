import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, expect, it } from "vitest";

const exec = promisify(execFile);
const script = path.resolve("scripts/revision-scope.mjs");
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
});

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "launchloom-scope-"));
  dirs.push(root);
  const client = path.join(root, "client");
  await fs.mkdir(path.join(client, "src"), { recursive: true });
  await fs.mkdir(path.join(client, "docs"));
  await fs.writeFile(path.join(client, "src/site.config.json"), "{}\n");
  await fs.writeFile(path.join(client, "src/components.txt"), "base\n");
  await fs.writeFile(
    path.join(client, "docs/site-generation-guidelines.md"),
    "base\n",
  );
  await exec("git", ["init", "-q", client]);
  await exec("git", ["-C", client, "config", "user.name", "Test"]);
  await exec("git", ["-C", client, "config", "user.email", "test@example.com"]);
  await exec("git", ["-C", client, "add", "."]);
  await exec("git", ["-C", client, "commit", "-qm", "base"]);
  const { stdout: base } = await exec("git", [
    "-C",
    client,
    "rev-parse",
    "HEAD",
  ]);
  const manifest = path.join(root, "manifest.json");
  await fs.writeFile(
    manifest,
    JSON.stringify({
      version: 1,
      baseSha: base.trim(),
      allowedPaths: [
        "src/site.config.json",
        "docs/site-generation-guidelines.md",
      ],
    }),
  );
  const run = (...args: string[]) =>
    exec("node", [
      script,
      "validate",
      "--client",
      client,
      "--manifest",
      manifest,
      ...args,
    ]);
  return { root, client, manifest, base: base.trim(), run };
}

it.each(["staged", "unstaged", "untracked", "deleted", "renamed"])(
  "rejects an out-of-scope %s path before staging",
  async (state) => {
    const { client, run } = await fixture();
    const outside = path.join(client, "src/components.txt");
    if (state === "staged" || state === "unstaged")
      await fs.writeFile(outside, "changed\n");
    if (state === "staged")
      await exec("git", ["-C", client, "add", "src/components.txt"]);
    if (state === "untracked")
      await fs.writeFile(path.join(client, "public-leak.txt"), "leak\n");
    if (state === "deleted") await fs.unlink(outside);
    if (state === "renamed")
      await exec("git", [
        "-C",
        client,
        "mv",
        "src/components.txt",
        "src/renamed.txt",
      ]);
    await expect(run("--stage")).rejects.toThrow(/outside revision scope/i);
    const { stdout } = await exec("git", [
      "-C",
      client,
      "diff",
      "--cached",
      "--name-only",
    ]);
    if (state !== "staged" && state !== "renamed") expect(stdout).toBe("");
  },
);

it("stages only exact allowed changes while leaving unrelated committed history in scope checks", async () => {
  const { client, run } = await fixture();
  await fs.writeFile(
    path.join(client, "src/site.config.json"),
    '{"changed":true}\n',
  );
  await fs.writeFile(
    path.join(client, "docs/site-generation-guidelines.md"),
    "changed\n",
  );
  const result = await run("--stage");
  expect(result.stdout).toContain("revision_scope_paths=2");
  const { stdout } = await exec("git", [
    "-C",
    client,
    "diff",
    "--cached",
    "--name-only",
  ]);
  expect(stdout.trim().split("\n")).toEqual([
    "docs/site-generation-guidelines.md",
    "src/site.config.json",
  ]);
  await exec("git", ["-C", client, "commit", "-qm", "allowed"]);
  await fs.writeFile(path.join(client, "src/components.txt"), "changed\n");
  await exec("git", ["-C", client, "commit", "-qam", "outside"]);
  await expect(run()).rejects.toThrow(/outside revision scope/i);
});

it("rejects traversal and absolute paths in the manifest", async () => {
  const { manifest, base, run } = await fixture();
  for (const bad of [
    "../escape",
    "src/../escape",
    "/tmp/escape",
    "src\\escape",
  ]) {
    await fs.writeFile(
      manifest,
      JSON.stringify({ version: 1, baseSha: base, allowedPaths: [bad] }),
    );
    await expect(run()).rejects.toThrow(/invalid manifest path/i);
  }
});

it("rejects a manifest symlink that resolves inside the client repository", async () => {
  const { root, client, base } = await fixture();
  const internalManifest = path.join(client, "src/site.config.json");
  await fs.writeFile(
    internalManifest,
    JSON.stringify({
      version: 1,
      baseSha: base,
      allowedPaths: ["src/site.config.json"],
    }),
  );
  const externalAlias = path.join(root, "external-scope.json");
  await fs.symlink(internalManifest, externalAlias);

  await expect(
    exec("node", [
      script,
      "validate",
      "--client",
      client,
      "--manifest",
      externalAlias,
    ]),
  ).rejects.toThrow(/outside the client repository|symlink/iu);
});

it("rejects a changed symlink at an allowed path", async () => {
  const { client, run } = await fixture();
  await fs.unlink(path.join(client, "src/site.config.json"));
  await fs.symlink("components.txt", path.join(client, "src/site.config.json"));
  await expect(run("--stage")).rejects.toThrow(/symlink/i);
});

it("rejects an allowed path that is already a tracked symlink in the base commit", async () => {
  const { client, manifest, run } = await fixture();
  await fs.unlink(path.join(client, "src/site.config.json"));
  await fs.symlink("components.txt", path.join(client, "src/site.config.json"));
  await exec("git", ["-C", client, "add", "src/site.config.json"]);
  await exec("git", ["-C", client, "commit", "-qm", "linked config"]);
  const { stdout: base } = await exec("git", [
    "-C",
    client,
    "rev-parse",
    "HEAD",
  ]);
  await fs.writeFile(
    manifest,
    JSON.stringify({
      version: 1,
      baseSha: base.trim(),
      allowedPaths: ["src/site.config.json"],
    }),
  );

  await expect(run()).rejects.toThrow(/symlink/i);
});

it("rejects an allowed path beneath a tracked symlink ancestor in the base commit", async () => {
  const { root, client, manifest, run } = await fixture();
  const docs = path.join(client, "docs");
  const realDocs = path.join(root, "real-docs");
  await fs.rename(docs, realDocs);
  await fs.symlink("../real-docs", docs);
  await exec("git", ["-C", client, "add", "-A"]);
  await exec("git", ["-C", client, "commit", "-qm", "linked docs"]);
  const { stdout: base } = await exec("git", [
    "-C",
    client,
    "rev-parse",
    "HEAD",
  ]);
  await fs.writeFile(
    manifest,
    JSON.stringify({
      version: 1,
      baseSha: base.trim(),
      allowedPaths: ["docs/site-generation-guidelines.md"],
    }),
  );

  await expect(run()).rejects.toThrow(/symlink/i);
});

it("preflights known write destinations before feedback mutates the client checkout", async () => {
  const { client } = await fixture();
  await fs.unlink(path.join(client, "src/site.config.json"));
  await fs.symlink("components.txt", path.join(client, "src/site.config.json"));
  await exec("git", ["-C", client, "add", "src/site.config.json"]);
  await exec("git", ["-C", client, "commit", "-qm", "linked config"]);
  const { stdout: linkedBase } = await exec("git", [
    "-C",
    client,
    "rev-parse",
    "HEAD",
  ]);

  await expect(
    exec("node", [
      script,
      "preflight",
      "--client",
      client,
      "--base",
      linkedBase.trim(),
    ]),
  ).rejects.toThrow(/symlink/i);
});

it("rejects a dirty client checkout during preflight", async () => {
  const { client, base } = await fixture();
  await fs.writeFile(path.join(client, "src/site.config.json"), "changed\n");

  await expect(
    exec("node", [script, "preflight", "--client", client, "--base", base]),
  ).rejects.toThrow(/clean client checkout/i);
});

it("rejects an allowed path reached through a symlink ancestor", async () => {
  const { root, client, run } = await fixture();
  await fs.rename(path.join(client, "docs"), path.join(root, "real-docs"));
  await fs.symlink("../real-docs", path.join(client, "docs"));
  await fs.writeFile(
    path.join(root, "real-docs/site-generation-guidelines.md"),
    "changed\n",
  );
  await expect(run("--stage")).rejects.toThrow(
    /symlink|outside revision scope: docs/i,
  );
});

it("creates only the selected candidate paths after required creative repair", async () => {
  const { root, client, base } = await fixture();
  const guidelines = path.join(root, "guidelines.json");
  await fs.writeFile(
    guidelines,
    JSON.stringify(["docs/site-generation-guidelines.md"]),
  );
  const create = async (required: string) => {
    const out = path.join(root, `manifest-${required}.json`);
    await exec("node", [
      script,
      "create",
      "--client",
      client,
      "--base",
      base,
      "--out",
      out,
      "--guidelines-written",
      guidelines,
      "--repair-required",
      required,
    ]);
    return JSON.parse(await fs.readFile(out, "utf8"));
  };
  const noRepair = await create("false");
  await fs.writeFile(
    path.join(client, "src/site.config.json"),
    JSON.stringify({
      design: {
        experience: { renderer: "creative-candidate", candidateId: "selected" },
      },
      revisionReport: {
        creativeSourceRepairRequired: true,
        creativeSourceRepairVerified: null,
        operations: [{ kind: "set_social_proof" }],
      },
    }),
  );
  await expect(create("true")).rejects.toThrow(
    /not verified for the selected candidate/iu,
  );
  await fs.writeFile(
    path.join(client, "src/site.config.json"),
    JSON.stringify({
      design: {
        experience: { renderer: "creative-candidate", candidateId: "selected" },
      },
      revisionReport: {
        creativeSourceRepairRequired: true,
        creativeSourceRepairVerified: {
          pass: true,
          candidateId: "selected",
        },
        operations: [{ kind: "set_social_proof" }],
      },
    }),
  );
  const repair = await create("true");
  expect(noRepair.allowedPaths).not.toContain("AGENTS.md");
  expect(noRepair.allowedPaths).not.toContain(
    "src/generated-experiences/selected/Experience.jsx",
  );
  expect(
    repair.allowedPaths.filter((entry: string) =>
      entry.startsWith("src/generated-experiences/selected/"),
    ),
  ).toEqual([
    "src/generated-experiences/selected/Experience.jsx",
    "src/generated-experiences/selected/motion.js",
    "src/generated-experiences/selected/styles.css",
  ]);
  expect(repair.allowedPaths).toContain("src/components/LeadForm.astro");
  expect(repair.allowedPaths).toContain("src/layouts/SiteLayout.astro");
  expect(repair.allowedPaths).toContain("src/pages/index.astro");
  expect(
    repair.allowedPaths.every((entry: string) => !entry.includes("**")),
  ).toBe(true);
});

it("does not allow a repair verified for a different candidate", async () => {
  const { root, client, base } = await fixture();
  const guidelines = path.join(root, "guidelines.json");
  const out = path.join(root, "manifest.json");
  await fs.writeFile(guidelines, JSON.stringify(["docs/site-generation-guidelines.md"]));
  await fs.writeFile(
    path.join(client, "src/site.config.json"),
    JSON.stringify({
      design: {
        experience: { renderer: "creative-candidate", candidateId: "candidate-a" },
      },
      revisionReport: {
        creativeSourceRepairRequired: true,
        creativeSourceRepairVerified: { pass: true, candidateId: "candidate-b" },
      },
    }),
  );

  await expect(
    exec("node", [
      script,
      "create",
      "--client",
      client,
      "--base",
      base,
      "--out",
      out,
      "--guidelines-written",
      guidelines,
      "--repair-required",
      "true",
    ]),
  ).rejects.toThrow(/not verified for the selected candidate/iu);
});

it("rejects a deleted tracked symlink even when its path is allowed", async () => {
  const { client, manifest, run } = await fixture();
  await fs.symlink("components.txt", path.join(client, "linked.txt"));
  await exec("git", ["-C", client, "add", "linked.txt"]);
  await exec("git", ["-C", client, "commit", "-qm", "link"]);
  const { stdout } = await exec("git", ["-C", client, "rev-parse", "HEAD"]);
  await fs.writeFile(
    manifest,
    JSON.stringify({
      version: 1,
      baseSha: stdout.trim(),
      allowedPaths: ["linked.txt"],
    }),
  );
  await fs.unlink(path.join(client, "linked.txt"));
  await expect(run("--stage")).rejects.toThrow(/symlink/i);
});

it("keeps installed dependencies and build outputs out of the sealed source revision", async () => {
  const {root, client, run} = await fixture();
  await exec(process.execPath, [path.resolve("scripts/revision-checkpoint.mjs"), "--action", "prepare", "--repo", client, "--request-id", "build-output-canary", "--out", path.join(root,"checkpoint.json"), "--restore-dir", path.join(root,"restore")]);
  for(const relative of ["node_modules/.bin/am-i-vibing", "dist/index.html", ".astro/types.d.ts"]) {
    await fs.mkdir(path.dirname(path.join(client, relative)), {recursive:true});
    await fs.writeFile(path.join(client, relative), "build artifact");
  }
  await fs.writeFile(path.join(client,"src/site.config.json"), '{"revised":true}\n');
  await run("--stage");
  const staged = await exec("git", ["-C",client,"diff","--cached","--name-only"]);
  expect(staged.stdout.trim()).toBe("src/site.config.json");
  await fs.writeFile(path.join(client,"src/unrelated.ts"), "unauthorized source change");
  await expect(run()).rejects.toThrow("Path outside revision scope: src/unrelated.ts");
});

it("refuses linked clone-local ignore metadata without changing the external target", async () => {
  const {root, client} = await fixture();
  const target = path.join(root,"external-ignore.txt");
  await fs.writeFile(target,"preserve external rules\n");
  const exclude = path.join(client,".git/info/exclude");
  await fs.unlink(exclude);
  await fs.symlink(target,exclude);
  await expect(exec(process.execPath,[path.resolve("scripts/revision-checkpoint.mjs"),"--action","prepare","--repo",client,"--request-id","linked-ignore-canary","--out",path.join(root,"checkpoint.json"),"--restore-dir",path.join(root,"restore")])).rejects.toThrow("exclude file must not be linked");
  expect(await fs.readFile(target,"utf8")).toBe("preserve external rules\n");
});
