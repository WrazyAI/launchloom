import fs from "node:fs/promises";
import path from "node:path";
import { syncClientGuidelines } from "./sync-client-guidelines.mjs";
import { ensureLegacySocialProofMarkup } from "./revision-engine.mjs";

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
await syncClientGuidelines(client);
const operations = config.revisionReport?.operations || [];
const kinds = new Set(operations.map((operation) => operation.kind));
const repository = path.resolve(new URL("..", import.meta.url).pathname);
const template = path.join(repository, "templates/client-site/src");
// These two components carry globally enforced visitor-facing wording. They
// are safe to refresh on every revision and keep legacy client repositories
// inside the no-em-dash content gate.
const files = new Set([
  "components/LeadForm.astro",
  "components/ReviewBanner.astro",
]);
if (kinds.has("set_social_proof")) {
  files.add("components/SocialProof.astro");
  files.add("styles/site.css");
  files.add("lib/site.ts");
}
if (kinds.has("show_brand_name")) {
  files.add("components/Header.astro");
  files.add("components/Footer.astro");
  files.add("styles/site.css");
  files.add("lib/site.ts");
}
if (kinds.has("set_color_palette")) {
  files.add("layouts/SiteLayout.astro");
  files.add("styles/site.css");
  files.add("lib/site.ts");
}
if (kinds.has("set_conversion_feature")) {
  files.add("components/QuickAnswers.astro");
  files.add("components/ExitOffer.astro");
  files.add("layouts/SiteLayout.astro");
  files.add("lib/page-recipe.ts");
  files.add("lib/site.ts");
  files.add("styles/site.css");
}
if (
  operations.some(
    (operation) =>
      operation.kind === "set_copy" &&
      ["heroHeading", "heroBody"].includes(operation.field),
  )
) {
  files.add("components/PageSections.astro");
  files.add("lib/site.ts");
}
if (
  [...kinds].some((kind) =>
    [
      "set_section_enabled",
      "reorder_section",
      "set_section_variant",
      "set_design_treatment",
    ].includes(kind),
  )
) {
  files.add("components/PageSections.astro");
  files.add("components/SocialProof.astro");
  files.add("pages/index.astro");
  files.add("lib/page-recipe.ts");
  files.add("lib/site.ts");
  files.add("styles/site.css");
}
for (const relative of files) {
  const source = path.join(template, relative);
  const destination = path.join(client, "src", relative);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(source, destination);
}
if (kinds.has("set_social_proof")) {
  const homepage = path.join(client, "src/pages/index.astro");
  const source = await fs.readFile(homepage, "utf8");
  const revised = ensureLegacySocialProofMarkup(source);
  if (revised !== source) await fs.writeFile(homepage, revised, "utf8");
}
console.log(`revision_template_files=${[...files].join(",") || "none"}`);
