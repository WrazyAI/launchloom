import fs from "node:fs/promises";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, expect, it } from "vitest";

const exec = promisify(execFile);
const dirs: string[] = [];
const sha256 = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex");
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
});

it("refreshes shared SEO files without overwriting client Astro config", async () => {
  const client = await fs.mkdtemp(path.join(os.tmpdir(), "launchloom-sync-"));
  dirs.push(client);
  await fs.mkdir(path.join(client, "src"));
  await fs.mkdir(path.join(client, "src/layouts"));
  await fs.writeFile(
    path.join(client, "src/site.config.json"),
    JSON.stringify({
      business: { primaryCta: "Contact us" },
    }),
  );
  const custom =
    "export default { site: process.env.PUBLIC_SITE_URL, redirects: { '/old': '/new' } };\n";
  await fs.writeFile(path.join(client, "astro.config.mjs"), custom);
  const legacyLayout =
    'const noIndex = true;\nconst canonical = site.business.domain ? `https://${site.business.domain.replace(/^https?:\\/\\//, "").replace(/\\/$/, "")}${Astro.url.pathname}` : undefined;\n<head>\n</head>\n<!-- client-only layout detail -->\n';
  await fs.writeFile(
    path.join(client, "src/layouts/SiteLayout.astro"),
    legacyLayout,
  );
  await exec("node", [
    path.resolve("scripts/sync-revision-template.mjs"),
    "--client",
    client,
  ]);
  expect(await fs.readFile(path.join(client, "astro.config.mjs"), "utf8")).toBe(
    custom,
  );
  const updatedLayout = await fs.readFile(
    path.join(client, "src/layouts/SiteLayout.astro"),
    "utf8",
  );
  expect(updatedLayout).toContain("client-only layout detail");
  expect(updatedLayout).toContain("Astro.site ?? Astro.url");
  expect(updatedLayout).toContain(
    '<meta name="robots" content="noindex, nofollow" />',
  );
  expect(
    await fs.readFile(path.join(client, "src/pages/robots.txt.ts"), "utf8"),
  ).toContain("Allow: /");
  const baseline = JSON.parse(
    await fs.readFile(
      path.join(client, ".launchloom/revision-template-baseline.json"),
      "utf8",
    ),
  );
  expect(baseline.files["src/components/LeadForm.astro"]).toBe(
    sha256(
      await fs.readFile(
        path.resolve("templates/client-site/src/components/LeadForm.astro"),
        "utf8",
      ),
    ),
  );
});

it("preserves a client-authored canonical expression", async () => {
  const client = await fs.mkdtemp(path.join(os.tmpdir(), "launchloom-sync-"));
  dirs.push(client);
  await fs.mkdir(path.join(client, "src/layouts"), { recursive: true });
  await fs.writeFile(
    path.join(client, "src/site.config.json"),
    JSON.stringify({
      business: { primaryCta: "Contact us" },
    }),
  );
  const custom =
    "const canonical = site.business.domain ? `https://${site.business.domain}/special` : undefined;\n";
  await fs.writeFile(path.join(client, "src/layouts/SiteLayout.astro"), custom);
  await exec("node", [
    path.resolve("scripts/sync-revision-template.mjs"),
    "--client",
    client,
  ]);
  expect(
    await fs.readFile(
      path.join(client, "src/layouts/SiteLayout.astro"),
      "utf8",
    ),
  ).toBe(custom);
});

it("preserves a customized shared component and stops for manual attention", async () => {
  const client = await fs.mkdtemp(path.join(os.tmpdir(), "launchloom-sync-"));
  dirs.push(client);
  await fs.mkdir(path.join(client, "src/components"), { recursive: true });
  await fs.writeFile(
    path.join(client, "src/site.config.json"),
    JSON.stringify({
      business: { primaryCta: "Contact us" },
    }),
  );
  const custom =
    '---\n// Client-specific form behavior.\n---\n<form data-client="custom"></form>\n';
  const target = path.join(client, "src/components/LeadForm.astro");
  await fs.writeFile(target, custom);

  let failure: { code?: number; stderr?: string } | undefined;
  try {
    await exec("node", [
      path.resolve("scripts/sync-revision-template.mjs"),
      "--client",
      client,
    ]);
  } catch (error) {
    failure = error as { code?: number; stderr?: string };
  }

  expect(failure?.code).not.toBe(0);
  expect(failure?.stderr).toMatch(/manual attention/iu);
  expect(failure?.stderr).toContain("src/components/LeadForm.astro");
  expect(await fs.readFile(target, "utf8")).toBe(custom);
  await expect(
    fs.stat(path.join(client, "src/components/ReviewBanner.astro")),
  ).rejects.toMatchObject({
    code: "ENOENT",
  });
});

it("refreshes a file that still matches its recorded generated baseline", async () => {
  const client = await fs.mkdtemp(path.join(os.tmpdir(), "launchloom-sync-"));
  dirs.push(client);
  await fs.mkdir(path.join(client, "src/components"), { recursive: true });
  await fs.mkdir(path.join(client, ".launchloom"), { recursive: true });
  await fs.writeFile(
    path.join(client, "src/site.config.json"),
    JSON.stringify({
      business: { primaryCta: "Contact us" },
    }),
  );
  const generatedBaseline =
    "---\n// Generated form from prior template version.\n---\n<form></form>\n";
  const target = path.join(client, "src/components/LeadForm.astro");
  await fs.writeFile(target, generatedBaseline);
  await fs.writeFile(
    path.join(client, ".launchloom/revision-template-baseline.json"),
    JSON.stringify({
      version: 1,
      files: { "src/components/LeadForm.astro": sha256(generatedBaseline) },
    }) + "\n",
  );

  const result = await exec("node", [
    path.resolve("scripts/sync-revision-template.mjs"),
    "--client",
    client,
  ]);
  const currentTemplate = await fs.readFile(
    path.resolve("templates/client-site/src/components/LeadForm.astro"),
    "utf8",
  );

  expect(await fs.readFile(target, "utf8")).toBe(currentTemplate);
  expect(result.stdout).toContain("src/components/LeadForm.astro");
  const baseline = JSON.parse(
    await fs.readFile(
      path.join(client, ".launchloom/revision-template-baseline.json"),
      "utf8",
    ),
  );
  expect(baseline.files["src/components/LeadForm.astro"]).toBe(
    sha256(currentTemplate),
  );
});

it("does not replace a client edit made after a generated baseline was recorded", async () => {
  const client = await fs.mkdtemp(path.join(os.tmpdir(), "launchloom-sync-"));
  dirs.push(client);
  await fs.mkdir(path.join(client, "src/components"), { recursive: true });
  await fs.mkdir(path.join(client, ".launchloom"), { recursive: true });
  await fs.writeFile(
    path.join(client, "src/site.config.json"),
    JSON.stringify({
      business: { primaryCta: "Contact us" },
    }),
  );
  const generatedBaseline =
    "---\n// Original generated form.\n---\n<form></form>\n";
  const custom =
    "---\n// Client changed the form flow.\n---\n<form data-client=custom></form>\n";
  const target = path.join(client, "src/components/LeadForm.astro");
  await fs.writeFile(target, custom);
  await fs.writeFile(
    path.join(client, ".launchloom/revision-template-baseline.json"),
    JSON.stringify({
      version: 1,
      files: { "src/components/LeadForm.astro": sha256(generatedBaseline) },
    }) + "\n",
  );

  let failure: { code?: number; stderr?: string } | undefined;
  try {
    await exec("node", [
      path.resolve("scripts/sync-revision-template.mjs"),
      "--client",
      client,
    ]);
  } catch (error) {
    failure = error as { code?: number; stderr?: string };
  }

  expect(failure?.code).not.toBe(0);
  expect(failure?.stderr).toContain("src/components/LeadForm.astro");
  expect(await fs.readFile(target, "utf8")).toBe(custom);
  await expect(
    fs.stat(path.join(client, "src/components/ReviewBanner.astro")),
  ).rejects.toMatchObject({
    code: "ENOENT",
  });
});

it("applies a supported social-proof insertion without replacing a customized homepage", async () => {
  const client = await fs.mkdtemp(path.join(os.tmpdir(), "launchloom-sync-"));
  dirs.push(client);
  await fs.mkdir(path.join(client, "src/pages"), { recursive: true });
  await fs.writeFile(
    path.join(client, "src/site.config.json"),
    JSON.stringify({
      business: { primaryCta: "Contact us" },
      design: { experience: { packId: "editorial-folio" } },
      revisionReport: { operations: [{ kind: "set_social_proof" }] },
    }),
  );
  const custom = [
    'import Header from "../components/Header.astro";',
    "const clientNote = 'Keep this homepage composition';",
    '<section id="services"><h2>Services</h2></section>',
    "<p>{clientNote}</p>",
  ].join("\n");
  const homepage = path.join(client, "src/pages/index.astro");
  await fs.writeFile(homepage, custom);

  const result = await exec("node", [
    path.resolve("scripts/sync-revision-template.mjs"),
    "--client",
    client,
  ]);

  const revised = await fs.readFile(homepage, "utf8");
  expect(revised).toContain("Keep this homepage composition");
  expect(revised).toContain("<SocialProof />");
  expect(revised).toContain(
    'import SocialProof from "../components/SocialProof.astro";',
  );
  expect(result.stdout).toContain(
    "revision_template_narrow_patch=src/pages/index.astro",
  );
});

it("fails before copying templates when the social-proof insertion point is missing", async () => {
  const client = await fs.mkdtemp(path.join(os.tmpdir(), "launchloom-sync-"));
  dirs.push(client);
  await fs.mkdir(path.join(client, "src/pages"), { recursive: true });
  await fs.writeFile(
    path.join(client, "src/site.config.json"),
    JSON.stringify({
      business: { primaryCta: "Contact us" },
      revisionReport: { operations: [{ kind: "set_social_proof" }] },
    }),
  );
  const custom =
    "<main>Client-authored page with a different structure.</main>\n";
  const homepage = path.join(client, "src/pages/index.astro");
  await fs.writeFile(homepage, custom);

  let failure: { code?: number; stderr?: string } | undefined;
  try {
    await exec("node", [
      path.resolve("scripts/sync-revision-template.mjs"),
      "--client",
      client,
    ]);
  } catch (error) {
    failure = error as { code?: number; stderr?: string };
  }

  expect(failure?.code).not.toBe(0);
  expect(failure?.stderr).toMatch(/manual attention/iu);
  expect(failure?.stderr).toContain("src/pages/index.astro");
  expect(await fs.readFile(homepage, "utf8")).toBe(custom);
  await expect(
    fs.stat(path.join(client, "src/components/LeadForm.astro")),
  ).rejects.toMatchObject({ code: "ENOENT" });
});

it("refreshes the shared experience media rail for pack-based revisions", async () => {
  const client = await fs.mkdtemp(path.join(os.tmpdir(), "launchloom-sync-"));
  dirs.push(client);
  await fs.mkdir(path.join(client, "src/layouts"), { recursive: true });
  await fs.writeFile(
    path.join(client, "src/site.config.json"),
    JSON.stringify({
      business: { primaryCta: "Contact us" },
      design: { experience: { packId: "cinematic-narrative" } },
    }),
  );
  await fs.writeFile(
    path.join(client, "src/layouts/SiteLayout.astro"),
    "<head></head>\n",
  );
  await exec("node", [
    path.resolve("scripts/sync-revision-template.mjs"),
    "--client",
    client,
  ]);
  expect(
    await fs.readFile(
      path.join(client, "src/components/experiences/ExperienceMediaRail.astro"),
      "utf8",
    ),
  ).toContain("xp-media-rail");
});
