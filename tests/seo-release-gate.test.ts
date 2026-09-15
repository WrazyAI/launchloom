import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkSeoRelease } from "../scripts/seo-release-gate.mjs";

const origin = "https://launchloom-gate-fixture.pages.dev";
const config = {
  industry: "wellness",
  business: {
    name: "Fixture Clinic",
    phone: "(555) 123-4567",
    email: "hello@fixture.test",
    address: "1 Main Street",
    serviceAreas: ["Testville"],
  },
  services: [{ name: "Consultation", slug: "consultation" }],
  locations: [],
  seoResearch: { mode: "researched", publishReady: true },
};
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function fixture(review = false) {
  const dist = await fs.mkdtemp(path.join(os.tmpdir(), "launchloom-seo-gate-"));
  dirs.push(dist);
  const data = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: config.business.name,
    telephone: config.business.phone,
    email: config.business.email,
    address: config.business.address,
    areaServed: config.business.serviceAreas,
  };
  for (const route of ["/", "/services/consultation/"]) {
    const dir = path.join(dist, route.slice(1));
    await fs.mkdir(dir, { recursive: true });
    const pageData = review ? data : { ...data, url: new URL(route, origin).href };
    const html = `<html><head><title>Consultation | Fixture Clinic</title><meta name="description" content="Fixture Clinic provides practical consultation support for local customers in Testville.">${review ? '<meta name="robots" content="noindex, nofollow">' : `<link rel="canonical" href="${new URL(route, origin).href}">`}<script type="application/ld+json">${JSON.stringify(pageData)}</script></head><body>${"Useful local consultation guidance and decision support. ".repeat(12)}</body></html>`;
    await fs.writeFile(path.join(dir, "index.html"), html);
  }
  await fs.writeFile(path.join(dist, "robots.txt"), review
    ? "User-agent: *\nAllow: /\n"
    : `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`);
  await fs.writeFile(path.join(dist, "sitemap.xml"),
    `<urlset><url><loc>${origin}/</loc></url><url><loc>${origin}/services/consultation/</loc></url></urlset>`);
  return dist;
}

describe("SEO release gate", () => {
  it("accepts a factual, indexable production build", async () => {
    const dist = await fixture();
    expect(await checkSeoRelease({ mode: "production", config, dist, origin })).toEqual([]);
  });
  it("accepts an HTML-escaped business name in the title", async () => {
    const dist = await fixture();
    const file = path.join(dist, "index.html");
    const html = await fs.readFile(file, "utf8");
    await fs.writeFile(file, html.replace("Fixture Clinic</title>", "Fixture &amp; Clinic</title>"));
    const escapedConfig = {
      ...config,
      business: { ...config.business, name: "Fixture & Clinic" },
    };
    const errors = await checkSeoRelease({
      mode: "production",
      config: escapedConfig,
      dist,
      origin,
    });
    expect(errors.some((error: string) => error === "/: descriptive business-specific title is missing."))
      .toBe(false);
  });
  it("keeps explicitly grandfathered legacy sites publishable", async () => {
    const dist = await fixture();
    const { seoResearch: _legacyDossier, ...legacyConfig } = config;
    expect(await checkSeoRelease({ mode: "production", config: legacyConfig, dist, origin }))
      .toEqual([]);
  });
  it("blocks stale canonical and noindex metadata before publishing", async () => {
    const dist = await fixture();
    const file = path.join(dist, "index.html");
    const html = await fs.readFile(file, "utf8");
    await fs.writeFile(file, html.replace(`${origin}/`, "https://wrong.pages.dev/")
      .replace("<link rel=", '<meta name="robots" content="noindex"><link rel='));
    const errors = await checkSeoRelease({ mode: "production", config, dist, origin });
    expect(errors.some((error: string) => error.includes("canonical"))).toBe(true);
    expect(errors.some((error: string) => error.includes("noindex"))).toBe(true);
  });
  it("blocks unverified structured facts and incomplete research", async () => {
    const dist = await fixture();
    const file = path.join(dist, "index.html");
    await fs.writeFile(file, (await fs.readFile(file, "utf8")).replace("1 Main Street", "2 Invented Street"));
    const errors = await checkSeoRelease({ mode: "production",
      config: { ...config, seoResearch: { mode: "baseline", publishReady: false } }, dist, origin });
    expect(errors.some((error: string) => error.includes("structured business facts"))).toBe(true);
    expect(errors.some((error: string) => error.includes("research is incomplete"))).toBe(true);
  });
  it("blocks rendered em dashes on production pages", async () => {
    const dist = await fixture();
    const file = path.join(dist, "index.html");
    await fs.writeFile(file, (await fs.readFile(file, "utf8")).replace("Useful local", "Useful—local"));
    expect((await checkSeoRelease({ mode: "production", config, dist, origin })).some(
      (error: string) => error.includes("em dash"))).toBe(true);
  });
  it("requires noindex on review pages without hiding it behind robots disallow", async () => {
    const dist = await fixture(true);
    expect(await checkSeoRelease({ mode: "review", config, dist })).toEqual([]);
    await fs.writeFile(path.join(dist, "robots.txt"), "User-agent: *\nDisallow: /\n");
    expect((await checkSeoRelease({ mode: "review", config, dist })).some(
      (error: string) => error.includes("robots.txt"))).toBe(true);
  });
});
