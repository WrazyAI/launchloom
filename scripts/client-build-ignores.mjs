import fs from "node:fs/promises";
import path from "node:path";

export const CLIENT_BUILD_IGNORES = ["/node_modules/", "/dist/", "/.astro/"];

// A legacy client clone may have no .gitignore. Keep npm/Astro artifacts out
// of source staging using clone-local Git metadata; tracked changes and all
// untracked source files still pass through the sealed revision scope.
export async function ensureClientBuildIgnores(repo) {
  const root = path.resolve(repo);
  const gitDirectory = path.join(root, ".git");
  const gitStat = await fs.lstat(gitDirectory);
  if (!gitStat.isDirectory() || gitStat.isSymbolicLink())
    throw new Error("Client build ignores require a regular cloned Git directory.");
  const info = path.join(gitDirectory, "info");
  const infoStat = await fs.lstat(info).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (infoStat && (!infoStat.isDirectory() || infoStat.isSymbolicLink()))
    throw new Error("Client Git info directory must not be linked.");
  if (!infoStat) await fs.mkdir(info);
  const destination = path.join(info, "exclude");
  const stat = await fs.lstat(destination).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (stat && (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1))
    throw new Error("Client Git exclude file must not be linked.");
  const existing = stat ? await fs.readFile(destination, "utf8") : "";
  const rules = new Set(existing.split(/\r?\n/u));
  const missing = CLIENT_BUILD_IGNORES.filter((rule) => !rules.has(rule));
  if (missing.length)
    await fs.writeFile(destination,
      `${existing}${existing && !existing.endsWith("\n") ? "\n" : ""}${missing.join("\n")}\n`);
}
