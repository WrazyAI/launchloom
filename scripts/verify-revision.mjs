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
const dist = args.dist ? path.resolve(args.dist) : "";
const htmlPath = args.html || path.join(dist, "index.html");
const html = await fs.readFile(htmlPath, "utf8");
async function collectHtml(directory, root = directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectHtml(target, root);
    if (entry.isFile() && entry.name.endsWith(".html")) {
      const relative = path.relative(root, target).split(path.sep).join("/");
      const routeDirectory = path.posix.dirname(relative);
      const route = routeDirectory === "." ? "/" : `/${routeDirectory}/`;
      return [{ route, html: await fs.readFile(target, "utf8") }];
    }
    return [];
  }));
  return files.flat();
}
const renderedPages = dist ? await collectHtml(dist) : [];
const htmlPages = Object.fromEntries(renderedPages.map((page) => [page.route, page.html]));
htmlPages["/"] = html;
const allHtml = Object.values(htmlPages).join("\n");
const result = verifyRevision(config, config.revisionReport || {}, html, allHtml, htmlPages);
if (!result.ok)
  throw new Error(`Revision verification failed: ${result.failures.join(" ")}`);
console.log("revision_verified=true");
