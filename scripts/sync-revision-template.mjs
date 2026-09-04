import fs from "node:fs/promises";
import path from "node:path";

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
  files.add("pages/index.astro");
  files.add("styles/site.css");
  files.add("lib/site.ts");
}
if (kinds.has("show_brand_name")) {
  files.add("components/Header.astro");
  files.add("components/Footer.astro");
  files.add("styles/site.css");
}
for (const relative of files) {
  const source = path.join(template, relative);
  const destination = path.join(client, "src", relative);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(source, destination);
}
console.log(`revision_template_files=${[...files].join(",") || "none"}`);
