import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, expect, it } from "vitest";

const exec = promisify(execFile);
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

it("refreshes shared SEO files without overwriting client Astro config", async () => {
  const client = await fs.mkdtemp(path.join(os.tmpdir(), "launchloom-sync-"));
  dirs.push(client);
  await fs.mkdir(path.join(client, "src"));
  await fs.mkdir(path.join(client, "src/layouts"));
  await fs.writeFile(path.join(client, "src/site.config.json"), JSON.stringify({
    business: { primaryCta: "Contact us" },
  }));
  const custom = "export default { site: process.env.PUBLIC_SITE_URL, redirects: { '/old': '/new' } };\n";
  await fs.writeFile(path.join(client, "astro.config.mjs"), custom);
  const legacyLayout = 'const noIndex = true;\nconst canonical = site.business.domain ? `https://${site.business.domain.replace(/^https?:\\/\\//, "").replace(/\\/$/, "")}${Astro.url.pathname}` : undefined;\n<!-- client-only layout detail -->\n';
  await fs.writeFile(path.join(client, "src/layouts/SiteLayout.astro"), legacyLayout);
  await exec("node", [path.resolve("scripts/sync-revision-template.mjs"), "--client", client]);
  expect(await fs.readFile(path.join(client, "astro.config.mjs"), "utf8")).toBe(custom);
  const updatedLayout = await fs.readFile(path.join(client, "src/layouts/SiteLayout.astro"), "utf8");
  expect(updatedLayout).toContain("client-only layout detail");
  expect(updatedLayout).toContain("Astro.site ?? Astro.url");
  expect(await fs.readFile(path.join(client, "src/pages/robots.txt.ts"), "utf8"))
    .toContain("Allow: /");
});

it("preserves a client-authored canonical expression", async () => {
  const client = await fs.mkdtemp(path.join(os.tmpdir(), "launchloom-sync-"));
  dirs.push(client);
  await fs.mkdir(path.join(client, "src/layouts"), { recursive: true });
  await fs.writeFile(path.join(client, "src/site.config.json"), JSON.stringify({
    business: { primaryCta: "Contact us" },
  }));
  const custom = 'const canonical = site.business.domain ? `https://${site.business.domain}/special` : undefined;\n';
  await fs.writeFile(path.join(client, "src/layouts/SiteLayout.astro"), custom);
  await exec("node", [path.resolve("scripts/sync-revision-template.mjs"), "--client", client]);
  expect(await fs.readFile(path.join(client, "src/layouts/SiteLayout.astro"), "utf8"))
    .toBe(custom);
});
