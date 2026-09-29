import fs from "node:fs/promises";
import path from "node:path";
import { syncClientGuidelines } from "./sync-client-guidelines.mjs";
import { ensureLegacySocialProofMarkup } from "./revision-engine.mjs";
import { revisionTemplatePaths } from "./revision-template-paths.mjs";

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
const client = path.resolve(String(args.client || ""));
if (!client) throw new Error("--client is required.");
const config = JSON.parse(
  await fs.readFile(path.join(client, "src/site.config.json"), "utf8"),
);
const guidelinesWritten = await syncClientGuidelines(client);
if (args["guidelines-written"]) {
  const evidencePath = path.resolve(args["guidelines-written"]);
  const previous = JSON.parse(
    await fs.readFile(evidencePath, "utf8").catch((error) => {
      if (error.code === "ENOENT") return "[]";
      throw error;
    }),
  );
  await fs.writeFile(
    evidencePath,
    `${JSON.stringify([...new Set([...previous, ...guidelinesWritten])])}\n`,
  );
}
const operations = config.revisionReport?.operations || [];
const kinds = new Set(operations.map((operation) => operation.kind));
const repository = path.resolve(new URL("..", import.meta.url).pathname);
const template = path.join(repository, "templates/client-site/src");
const files = revisionTemplatePaths(config);
for (const relative of files) {
  const source = path.join(repository, "templates/client-site", relative);
  const destination = path.join(client, relative);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(source, destination);
}
// Upgrade only the known legacy canonical expression. Preserve any other
// client-authored layout changes; an unknown layout must fail the release gate
// rather than be overwritten during unrelated feedback.
const layoutFile = path.join(client, "src/layouts/SiteLayout.astro");
const legacyLayout = await fs.readFile(layoutFile, "utf8").catch((error) => {
  if (error.code === "ENOENT") return "";
  throw error;
});
const legacyCanonical = 'const canonical = site.business.domain ? `https://${site.business.domain.replace(/^https?:\\/\\//, "").replace(/\\/$/, "")}${Astro.url.pathname}` : undefined;';
if (legacyLayout.includes(legacyCanonical)) {
  const templateLayout = await fs.readFile(
    path.join(template, "layouts/SiteLayout.astro"), "utf8",
  );
  const currentCanonical = templateLayout.match(/^const canonical = .*;$/mu)?.[0];
  if (!currentCanonical) throw new Error("Shared canonical expression is missing.");
  const currentRobots = templateLayout.match(
    /^\s*\{noIndex && <meta name="robots"[^\n]+$/mu,
  )?.[0]?.trim();
  if (!currentRobots) throw new Error("Shared robots metadata is missing.");
  const migratedLayout = legacyLayout
    .replace(legacyCanonical, currentCanonical)
    .replace(
      /<\/head>/iu,
      legacyLayout.includes('name="robots"')
        ? "</head>"
        : `  ${currentRobots}\n  </head>`,
    );
  await fs.writeFile(
    layoutFile,
    migratedLayout,
    "utf8",
  );
}
if (kinds.has("set_social_proof")) {
  const homepage = path.join(client, "src/pages/index.astro");
  const source = await fs.readFile(homepage, "utf8");
  const revised = ensureLegacySocialProofMarkup(source);
  if (revised !== source) await fs.writeFile(homepage, revised, "utf8");
}
console.log(`revision_template_files=${files.join(",") || "none"}`);
