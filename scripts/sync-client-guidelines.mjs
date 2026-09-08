import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Called by both initial generation and revision workflows. Keep client
// instructions beside their source, never inside the public asset directory.
export async function syncClientGuidelines(client) {
  const repository = fileURLToPath(new URL("../", import.meta.url));
  await fs.mkdir(path.join(client, "docs"), { recursive: true });
  await fs.copyFile(
    path.join(repository, "docs/site-generation-guidelines.md"),
    path.join(client, "docs/site-generation-guidelines.md"),
  );
  const instructions =
    "# Client website instructions\n\nRead docs/site-generation-guidelines.md before editing this website.\nPreserve the approved design recipe and business facts in src/site.config.json.\nApply feedback only to the requested sections; do not invent reviews or claims.\nNever use em dashes. Verify desktop and mobile output before reporting success.\nKeep review, conversion-tool, and lead-form integrations intact.\n";
  // Respect any client-specific instructions already present.
  try {
    await fs.writeFile(path.join(client, "AGENTS.md"), instructions, {
      flag: "wx",
    });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const client = process.argv[2];
  if (!client) throw new Error("Client directory is required.");
  await syncClientGuidelines(path.resolve(client));
}
