import fallback from "../fixtures/seo-research/fallback-complete.json";
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
      serviceMetrics: [
        {
          service: "Consultation",
          complete: true,
          primaryKeyword: "consultation Testville",
        },
      ],
    },
    competitors: [
      { domain: "one.test" },
      { domain: "two.test" },
      { domain: "three.test" },
    ],
    cost: {
      usd: 0.1,
      limitUsd: 0.25,
      overBudget: false,
      complete: true,
      unreportedTasks: 0,
    },
    pageMap: ["home", "services-hub", "service", "about", "contact"].map(
      (pageType) => ({
        pageType,
        service: pageType === "service" ? "Consultation" : undefined,
        primaryKeyword:
          pageType === "service"
            ? {
                keyword: "consultation Testville",
                volume: 90,
                kd: 41,
                cpc: 4.1,
                competition: 0.7,
                intent: "commercial",
                provenance: "dataforseo",
                metricSources: {
                  volume: "dataforseo_google_ads_location",
                  kd: "dataforseo_labs_bulk_keyword_difficulty",
                  cpc: "dataforseo_google_ads_location",
                  competition: "dataforseo_google_ads_location",
                  intent: "dataforseo_labs_search_intent",
                },
              }
            : undefined,
      }),
    ),
  },
};
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
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
  for (const route of [
    "/",
    "/services/",
    "/services/consultation/",
    "/about/",
    "/contact/",
  ]) {
    const dir = path.join(dist, route.slice(1));
    await fs.mkdir(dir, { recursive: true });
    const pageData = review
      ? data
      : { ...data, url: new URL(route, origin).href };
    const label =
      route === "/services/consultation/"
        ? "Consultation"
        : route === "/"
          ? "Home"
          : route.split("/").filter(Boolean).join(" ");
    const title = `${label} | Fixture Clinic`;
    const description = `Fixture Clinic provides practical ${label.toLowerCase()} information and decision support for local customers in Testville.`;
    const html = `<html><head><title>${title}</title><meta name="description" content="${description}"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}">${review ? '<meta name="robots" content="noindex, nofollow">' : `<meta property="og:url" content="${new URL(route, origin).href}"><link rel="canonical" href="${new URL(route, origin).href}">`}<script type="application/ld+json">${JSON.stringify(pageData)}</script></head><body><main><h1>${label}</h1>${"Useful local consultation guidance and decision support. ".repeat(12)}</main></body></html>`;
    await fs.writeFile(path.join(dir, "index.html"), html);
  }
  await fs.writeFile(
    path.join(dist, "robots.txt"),
    review
      ? "User-agent: *\nAllow: /\n"
      : `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`,
  );
  await fs.writeFile(
    path.join(dist, "sitemap.xml"),
    `<urlset>${["/", "/services/", "/services/consultation/", "/about/", "/contact/"].map((route) => `<url><loc>${origin}${route}</loc></url>`).join("")}</urlset>`,
  );
  return dist;
}

it("blocks unresolved facts and private fields in a public configuration", async () => {
  const dist = await fixture();
  const failures = await checkSeoRelease({
    mode: "production",
    origin,
    dist,
    config: {
      ...config,
      business: { ...config.business, addressVisibility: "private" },
      factReadiness: { version: 1, launchReady: false, facts: [] },
    },
  });
  expect(failures).toContain(
    "Private location fields remain in the public site configuration.",
  );
  expect(
    failures.some((failure) =>
      failure.includes("Business facts need confirmation"),
    ),
  ).toBe(true);
});

describe("SEO release gate", () => {
  it("accepts a factual, indexable production build", async () => {
    const dist = await fixture();
    expect(
      await checkSeoRelease({ mode: "production", config, dist, origin }),
    ).toEqual([]);
  });
  it("accepts a complete version two measured SEO map and rejects a forged ready flag", async () => {
    const dist = await fixture();
    expect(
      await checkSeoRelease({
        mode: "production",
        config: completeVersionTwoConfig,
        dist,
        origin,
      }),
    ).toEqual([]);
    const incomplete = {
      ...completeVersionTwoConfig,
      seoResearch: {
        ...completeVersionTwoConfig.seoResearch,
        completeness: {
          ...completeVersionTwoConfig.seoResearch.completeness,
          serviceMetrics: [],
        },
      },
    };
    expect(
      (
        await checkSeoRelease({
          mode: "production",
          config: incomplete,
          dist,
          origin,
        })
      ).some((error) => error.includes("SEO research is incomplete")),
    ).toBe(true);
    const unreportedCost = {
      ...completeVersionTwoConfig,
      seoResearch: {
        ...completeVersionTwoConfig.seoResearch,
        cost: {
          ...completeVersionTwoConfig.seoResearch.cost,
          complete: false,
          unreportedTasks: 1,
        },
      },
    };
    expect(
      (
        await checkSeoRelease({
          mode: "production",
          config: unreportedCost,
          dist,
          origin,
        })
      ).some((error) => error.includes("SEO research is incomplete")),
    ).toBe(true);
  });
  it("allows completed cited fallback research for production without inventing measured metrics", async () => {
    const dist = await fixture();
    expect(
      await checkSeoRelease({
        mode: "production",
        config: { ...config, seoResearch: fallback },
        dist,
        origin,
      }),
    ).toEqual([]);
    expect(
      (
        await checkSeoRelease({
          mode: "production",
          config: {
            ...config,
            seoResearch: { ...fallback, externalSearchEvidence: [] },
          },
          dist,
          origin,
        })
      ).some((error) => error.includes("SEO research is incomplete")),
    ).toBe(true);
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
    expect(
      await checkSeoRelease({ mode: "production", config, dist, origin }),
    ).toEqual([]);
  });
  it("accepts an HTML-escaped business name in the title", async () => {
    const dist = await fixture();
    const file = path.join(dist, "index.html");
    const html = await fs.readFile(file, "utf8");
    await fs.writeFile(
      file,
      html.replace("Fixture Clinic</title>", "Fixture &amp; Clinic</title>"),
    );
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
    expect(
      errors.some(
        (error: string) =>
          error === "/: descriptive business-specific title is missing.",
      ),
    ).toBe(false);
  });
  it("does not decode an invalid mixed-case HTML entity in the title", async () => {
    const dist = await fixture();
    const file = path.join(dist, "index.html");
    const html = await fs.readFile(file, "utf8");
    await fs.writeFile(
      file,
      html.replace("Fixture Clinic</title>", "Fixture &aMp; Clinic</title>"),
    );
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
    expect(errors).toContain(
      "/: descriptive business-specific title is missing.",
    );
  });
  it("keeps explicitly grandfathered legacy sites publishable", async () => {
    const dist = await fixture();
    const { seoResearch: _legacyDossier, ...legacyConfig } = config;
    expect(
      await checkSeoRelease({
        mode: "production",
        config: legacyConfig,
        dist,
        origin,
      }),
    ).toEqual([]);
  });
  it("blocks stale canonical and noindex metadata before publishing", async () => {
    const dist = await fixture();
    const file = path.join(dist, "index.html");
    const html = await fs.readFile(file, "utf8");
    await fs.writeFile(
      file,
      html
        .replace(`${origin}/`, "https://wrong.pages.dev/")
        .replace(
          "<link rel=",
          '<meta name="robots" content="noindex"><link rel=',
        ),
    );
    const errors = await checkSeoRelease({
      mode: "production",
      config,
      dist,
      origin,
    });
    expect(errors.some((error: string) => error.includes("canonical"))).toBe(
      true,
    );
    expect(errors.some((error: string) => error.includes("noindex"))).toBe(
      true,
    );
  });
  it("blocks unverified structured facts and incomplete research", async () => {
    const dist = await fixture();
    const file = path.join(dist, "index.html");
    await fs.writeFile(
      file,
      (await fs.readFile(file, "utf8")).replace(
        "1 Main Street",
        "2 Invented Street",
      ),
    );
    const errors = await checkSeoRelease({
      mode: "production",
      config: {
        ...config,
        seoResearch: { mode: "baseline", publishReady: false },
      },
      dist,
      origin,
    });
    expect(
      errors.some((error: string) =>
        error.includes("structured business facts"),
      ),
    ).toBe(true);
    expect(
      errors.some((error: string) => error.includes("research is incomplete")),
    ).toBe(true);
  });
  it("blocks rendered em dashes on production pages", async () => {
    const dist = await fixture();
    const file = path.join(dist, "index.html");
    await fs.writeFile(
      file,
      (await fs.readFile(file, "utf8")).replace("Useful local", "Useful—local"),
    );
    expect(
      (
        await checkSeoRelease({ mode: "production", config, dist, origin })
      ).some((error: string) => error.includes("em dash")),
    ).toBe(true);
  });
  it("requires noindex on review pages without hiding it behind robots disallow", async () => {
    const dist = await fixture(true);
    expect(await checkSeoRelease({ mode: "review", config, dist })).toEqual([]);
    await fs.writeFile(
      path.join(dist, "robots.txt"),
      "User-agent: *\nDisallow: /\n",
    );
    expect(
      (await checkSeoRelease({ mode: "review", config, dist })).some(
        (error: string) => error.includes("robots.txt"),
      ),
    ).toBe(true);
  });
  it("requires an exact noindex directive on review pages", async () => {
    const dist = await fixture(true);
    for (const route of [
      "",
      "services/",
      "services/consultation/",
      "about/",
      "contact/",
    ]) {
      const file = path.join(dist, route, "index.html");
      await fs.writeFile(
        file,
        (await fs.readFile(file, "utf8")).replace(
          "noindex, nofollow",
          "noindexing, nofollow",
        ),
      );
    }
    expect(
      (await checkSeoRelease({ mode: "review", config, dist })).some(
        (error: string) => error.includes("not marked noindex"),
      ),
    ).toBe(true);
  });
});

describe("explicit approved route builds", () => {
  const explicit = {
    ...config,
    business: {
      ...config.business,
      description: "Supplied fixture clinic description for the About page.",
    },
    routePolicy: { version: 1, decisions: [] },
  };
  async function linkedFixture() {
    const dist = await fixture();
    const paths = [
      "/",
      "/services/",
      "/services/consultation/",
      "/about/",
      "/contact/",
    ];
    for (const pathname of paths) {
      const file = path.join(dist, pathname.slice(1), "index.html");
      const html = await fs.readFile(file, "utf8");
      await fs.writeFile(
        file,
        html.replace(
          "</body>",
          paths.map((target) => `<a href="${target}">Page</a>`).join("") +
            "</body>",
        ),
      );
    }
    return dist;
  }
  it("accepts a complete inventory and blocks unapproved extra HTML", async () => {
    const dist = await linkedFixture();
    expect(
      await checkSeoRelease({
        mode: "production",
        config: explicit,
        dist,
        origin,
      }),
    ).toEqual([]);
    await fs.mkdir(path.join(dist, "locations", "unapproved"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(dist, "locations", "unapproved", "index.html"),
      "<html>Unexpected content</html>",
    );
    expect(
      (
        await checkSeoRelease({
          mode: "production",
          config: explicit,
          dist,
          origin,
        })
      ).join(" "),
    ).toContain("unapproved or omitted route");
  });
  it("blocks content for explicitly omitted routes even if it is removed from the sitemap", async () => {
    const dist = await linkedFixture();
    const omitted = {
      ...explicit,
      routePolicy: {
        version: 1,
        decisions: [{ pageType: "about", status: "omitted" }],
      },
    };
    const xml = await fs.readFile(path.join(dist, "sitemap.xml"), "utf8");
    await fs.writeFile(
      path.join(dist, "sitemap.xml"),
      xml.replace(`<url><loc>${origin}/about/</loc></url>`, ""),
    );
    const failures = await checkSeoRelease({
      mode: "production",
      config: omitted,
      dist,
      origin,
    });
    expect(failures.join(" ")).toContain(
      "/about/: unapproved or omitted route",
    );
    expect(failures.join(" ")).toContain("unresolved internal link /about/");
  });
  it("checks anchors and catches a recipe section mismatch", async () => {
    const dist = await linkedFixture();
    const file = path.join(dist, "index.html");
    await fs.appendFile(file, '<a href="/#services">Services</a>');
    expect(
      (
        await checkSeoRelease({
          mode: "production",
          config: explicit,
          dist,
          origin,
        })
      ).join(" "),
    ).toContain("unresolved internal anchor /#services");
    await fs.appendFile(
      file,
      '<section id="services">Confirmed services</section>',
    );
    expect(
      await checkSeoRelease({
        mode: "production",
        config: explicit,
        dist,
        origin,
      }),
    ).toEqual([]);
  });
  it("detects actual orphaned routes despite a complete sitemap", async () => {
    const dist = await linkedFixture();
    for (const pathname of [
      "/",
      "/services/",
      "/services/consultation/",
      "/about/",
      "/contact/",
    ]) {
      const file = path.join(dist, pathname.slice(1), "index.html");
      const html = await fs.readFile(file, "utf8");
      await fs.writeFile(
        file,
        html.replaceAll('<a href="/about/">Page</a>', ""),
      );
    }
    expect(
      (
        await checkSeoRelease({
          mode: "production",
          config: explicit,
          dist,
          origin,
        })
      ).join(" "),
    ).toContain("/about/: rendered route is orphaned");
  });
  it("keeps deliberate noindex pages canonical but excludes them from the sitemap", async () => {
    const dist = await linkedFixture();
    const file = path.join(dist, "about", "index.html");
    const html = await fs.readFile(file, "utf8");
    await fs.writeFile(
      file,
      html.replace(
        "</head>",
        '<meta name="robots" content="noindex, follow"></head>',
      ),
    );
    const xml = await fs.readFile(path.join(dist, "sitemap.xml"), "utf8");
    await fs.writeFile(
      path.join(dist, "sitemap.xml"),
      xml.replace(`<url><loc>${origin}/about/</loc></url>`, ""),
    );
    const c = {
      ...explicit,
      routePolicy: {
        version: 1,
        decisions: [
          { pageType: "about", status: "approved", indexable: false },
        ],
      },
    };
    expect(
      await checkSeoRelease({ mode: "production", config: c, dist, origin }),
    ).toEqual([]);
  });
});

it("reports malformed internal anchor encoding instead of crashing the release gate", async () => {
  const dist = await fixture();
  const configWithPolicy = {
    ...config,
    business: {
      ...config.business,
      description: "Supplied fixture clinic description.",
    },
    routePolicy: { version: 1, decisions: [] },
  };
  await fs.appendFile(
    path.join(dist, "index.html"),
    '<a href="/#bad%ZZ">Malformed anchor</a>',
  );
  const failures = await checkSeoRelease({
    mode: "production",
    config: configWithPolicy,
    dist,
    origin,
  });
  expect(failures.join(" ")).toContain("unresolved internal anchor /#bad%ZZ");
});

it("compares entity-escaped supported metadata as decoded text", async () => {
  const dist = await fixture();
  const description =
    "Discuss scope & preparation with Fixture Clinic before making a consultation enquiry.";
  const introduction =
    "Explain your consultation concern and ask what information would help a focused discussion.";
  const routeId = "service:consultation";
  const pageEvidence = [
    { id: "intro", value: introduction },
    { id: "meta", value: description },
  ].map((record) => ({
    ...record,
    source: "synthetic client notes",
    kind: "client_supplied",
    confirmed: true,
    public: true,
    routeIds: [routeId],
  }));
  const file = path.join(dist, "services/consultation/index.html");
  let html = await fs.readFile(file, "utf8");
  html = html
    .replace(
      /(<meta name="description" content=")[^"]+/,
      "$1" + description.replace("&", "&amp;"),
    )
    .replace("</body>", `<p>${introduction}</p></body>`);
  await fs.writeFile(file, html);
  const supportedConfig = {
    ...config,
    pageEvidence,
    pageContent: {
      [routeId]: {
        introduction: { text: introduction, evidenceIds: ["intro"] },
        metadata: { description: { text: description, evidenceIds: ["meta"] } },
      },
    },
  };
  const failures = await checkSeoRelease({
    mode: "production",
    origin,
    dist,
    config: supportedConfig,
  });
  expect(failures.some((failure) => failure.includes("metadata differs"))).toBe(
    false,
  );
});
