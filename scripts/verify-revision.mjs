import fs from "node:fs/promises";
import path from "node:path";
import { verifyRevision } from "./revision-engine.mjs";

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce(
      (pairs, value, index, all) =>
        index % 2 === 0
          ? [...pairs, [value.replace(/^--/, ""), all[index + 1]]]
          : pairs,
      [],
    ),
);
if (!args.config || (!args.html && !args.dist))
  throw new Error("--config and either --html or --dist are required.");
const config = JSON.parse(await fs.readFile(args.config, "utf8"));
const htmlPath = args.html || path.join(args.dist, "index.html");
const html = await fs.readFile(htmlPath, "utf8");
async function collectHtml(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectHtml(target);
    if (entry.isFile() && entry.name.endsWith(".html"))
      return [await fs.readFile(target, "utf8")];
    return [];
  }));
  return files.flat();
}
const allHtml = args.dist ? (await collectHtml(args.dist)).join("\n") : html;
const result = verifyRevision(config, config.revisionReport || {}, html, allHtml);
if (!result.ok)
  throw new Error(`Revision verification failed: ${result.failures.join(" ")}`);
console.log("revision_verified=true");
