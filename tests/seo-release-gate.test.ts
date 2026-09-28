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
const completeVersionTwoConfig = {
  ...config,
  seoResearch: {
    version: 2,
    mode: "researched",
    publishReady: true,
    completeness: {
      keywordOverview: true,
      searchIntent: true,
      keywordDifficulty: true,
      serviceSerps: 1,
      serviceSerpsRequired: 1,
      serviceMetrics: [{ service: "Consultation", complete: true, primaryKeyword: "consultation Testville" }],
    },
    competitors: [{ domain: "one.test" }, { domain: "two.test" }, { domain: "three.test" }],
    cost: { usd: 0.1, limitUsd: 0.25, overBudget: false, complete: true, unreportedTasks: 0 },
    pageMap: ["home", "services-hub", "service", "about", "contact"].map((pageType) => ({
      pageType,
      service: pageType === "service" ? "Consultation" : undefined,
      primaryKeyword: pageType === "service" ? {
        keyword: "consultation Testville", volume: 90, kd: 41, cpc: 4.1, competition: 0.7,
        intent: "commercial", provenance: "dataforseo",
        metricSources: { volume: "dataforseo_google_ads_location", kd: "dataforseo_labs_bulk_keyword_difficulty", cpc: "dataforseo_google_ads_location", competition: "dataforseo_google_ads_location", intent: "dataforseo_labs_search_intent" },
      } : undefined,
    })),
  },
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
  for (const route of ["/", "/services/", "/services/consultation/", "/about/", "/contact/"]) {
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
    `<urlset>${["/", "/services/", "/services/consultation/", "/about/", "/contact/"].map((route) => `<url><loc>${origin}${route}</loc></url>`).join("")}</urlset>`);
  return dist;
}

describe("SEO release gate", () => {
  it("accepts a factual, indexable production build", async () => {
    const dist = await fixture();
    expect(await checkSeoRelease({ mode: "production", config, dist, origin })).toEqual([]);
  });
  it("accepts a complete version two measured SEO map and rejects a forged ready flag", async () => {
    const dist = await fixture();
    expect(await checkSeoRelease({ mode: "production", config: completeVersionTwoConfig, dist, origin })).toEqual([]);
    const incomplete = {
      ...completeVersionTwoConfig,
      seoResearch: {
        ...completeVersionTwoConfig.seoResearch,
        completeness: { ...completeVersionTwoConfig.seoResearch.completeness, serviceMetrics: [] },
      },
    };
    expect((await checkSeoRelease({ mode: "production", config: incomplete, dist, origin }))
      .some((error) => error.includes("SEO research is incomplete"))).toBe(true);
    const unreportedCost = {
      ...completeVersionTwoConfig,
      seoResearch: {
        ...completeVersionTwoConfig.seoResearch,
        cost: { ...completeVersionTwoConfig.seoResearch.cost, complete: false, unreportedTasks: 1 },
      },
    };
    expect((await checkSeoRelease({ mode: "production", config: unreportedCost, dist, origin }))
      .some((error) => error.includes("SEO research is incomplete"))).toBe(true);
  });
  it("accepts meta descriptions containing apostrophes", async () => {
    const dist = await fixture();
    const file = path.join(dist, "services/consultation/index.html");
    const html = await fs.readFile(file, "utf8");
    await fs.writeFile(
      file,
      html.replace(
        "Fixture Clinic provides practical consultation support for local customers in Testville.",
        "Fixture Clinic's practical consultation support helps local customers in Testville.",
      ),
    );
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
  it("does not decode an invalid mixed-case HTML entity in the title", async () => {
    const dist = await fixture();
    const file = path.join(dist, "index.html");
    const html = await fs.readFile(file, "utf8");
    await fs.writeFile(file, html.replace("Fixture Clinic</title>", "Fixture &aMp; Clinic</title>"));
    const mixedCaseConfig = {
      ...config,
      business: { ...config.business, name: "Fixture & Clinic" },
    };
    const errors = await checkSeoRelease({
      mode: "production",
      config: mixedCaseConfig,
      dist,
      origin,
    });
    expect(errors).toContain("/: descriptive business-specific title is missing.");
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
  it("requires an exact noindex directive on review pages", async () => {
    const dist = await fixture(true);
    for (const route of ["", "services/", "services/consultation/", "about/", "contact/"]) {
      const file = path.join(dist, route, "index.html");
      await fs.writeFile(
        file,
        (await fs.readFile(file, "utf8")).replace("noindex, nofollow", "noindexing, nofollow"),
      );
    }
    expect((await checkSeoRelease({ mode: "review", config, dist })).some(
      (error: string) => error.includes("not marked noindex"))).toBe(true);
  });
});
