import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";

const roots: string[] = [];

async function workspace() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "activity-changes-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

it("reports applied candidate inserts, deletes and replacements without including other files", async () => {
  const { captureCandidateSources, compareCandidateSources } =
    await import("../scripts/generation-activity-changes.mjs");
  const root = await workspace();
  const put = (name: string, body: string) => fs.writeFile(path.join(root, name), body);
  await put("Experience.jsx", "keep\nold\n");
  await put("motion.js", "remove\n");
  const before = await captureCandidateSources(root);
  await put("Experience.jsx", "keep\nnew\n");
  await fs.unlink(path.join(root, "motion.js"));
  await put("styles.css", "add\n");
  await put("metadata.json", "private\n");
  const after = await captureCandidateSources(root);
  const diff = await compareCandidateSources(before, after);
  expect(diff).toMatchObject({ filesChanged: 3, additions: 2, deletions: 2 });
  const patch = "patch" in diff ? diff.patch : undefined;
  expect(patch).toContain("\n-old\n+new\n");
  expect(patch).not.toContain("private");
  expect(await compareCandidateSources(after, after)).toEqual({
    filesChanged: 0, additions: 0, deletions: 0,
  });
});

it("compares final source to the starting commit without counting reverted edits or private artifacts", async () => {
  const { summarizeCommittedChanges } =
    await import("../scripts/generation-activity-changes.mjs");
  const root = await workspace();
  const git = (...args: string[]) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  git("init", "-q");
  const commit = (message: string) => {
    git("add", ".");
    git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.com", "commit", "-qm", message);
    return git("rev-parse", "HEAD");
  };
  await fs.mkdir(path.join(root, "src"));
  const put = (name: string, body: string) => fs.writeFile(path.join(root, "src", name), body);
  await put("page.astro", "original\n");
  const baseSha = commit("baseline");
  await put("page.astro", "intermediate\n");
  commit("intermediate");
  await put("page.astro", "original\n");
  await put("styles.css", "added\n");
  await put("site.config.json", "private\n");
  const headSha = commit("final");
  expect(await summarizeCommittedChanges(root, "WrazyAI/client-site", baseSha, headSha))
    .toEqual({ repository: "WrazyAI/client-site", baseSha, headSha, filesChanged: 1, additions: 1, deletions: 0 });
  await expect(summarizeCommittedChanges(root, "WrazyAI/client-site", headSha, baseSha))
    .rejects.toThrow();
});
