import { it, expect, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { checkSeoRelease } from "../scripts/seo-release-gate.mjs";
const origin = "https://route-content-fixture.pages.dev";
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
});
const config: any = {
  industry: "home-services",
  business: {
    name: "Fixture Plumbing",
    phone: "555-0100",
    email: "fixture@example.test",
    description: "Synthetic operator-supplied business description.",
    serviceAreas: ["Testville"],
    addressVisibility: "private",
    address: "",
  },
  services: [
    {
      name: "Drain cleaning",
      slug: "drain-cleaning",
      description: "Discuss which drains are affected.",
    },
  ],
  locations: [],
  routePolicy: { version: 1, decisions: [] },
};
const paths = [
  "/",
  "/services/",
  "/services/drain-cleaning/",
  "/about/",
  "/contact/",
];
async function fixture() {
  const dist = await fs.mkdtemp(path.join(os.tmpdir(), "ll-route-content-"));
  dirs.push(dist);
  for (const route of paths) {
    const title = `${route === "/" ? "Home" : route.split("/").filter(Boolean).join(" ")} | Fixture Plumbing`;
    const description = `Read the ${route} service information and supplied preparation details from Fixture Plumbing before discussing your request.`;
    const data = {
      "@context": "https://schema.org",
      "@type": "HomeAndConstructionBusiness",
      "@id": origin + "/#business",
      name: config.business.name,
      telephone: config.business.phone,
      email: config.business.email,
      areaServed: ["Testville"],
      url: origin + route,
    };
    const h1 = route === "/services/drain-cleaning/" ? "Drain cleaning" : title;
    const html = `<html><head><title>${title}</title><meta name="description" content="${description}"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:url" content="${origin + route}"><link rel="canonical" href="${origin + route}"><script type="application/ld+json">${JSON.stringify(data)}</script></head><body><main><h1>${h1}</h1><p>${"Describe your service concern, which fixtures are affected and the information relevant to deciding the next step. ".repeat(8)}</p>${paths.map((p) => `<a href="${p}">More information</a>`).join("")}</main></body></html>`;
    await fs.mkdir(path.join(dist, route.slice(1)), { recursive: true });
    await fs.writeFile(path.join(dist, route.slice(1), "index.html"), html);
  }
  await fs.writeFile(
    path.join(dist, "robots.txt"),
    `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`,
  );
  await fs.writeFile(
    path.join(dist, "sitemap.xml"),
    `<urlset>${paths.map((p) => `<url><loc>${origin + p}</loc></url>`).join("")}</urlset>`,
  );
  return dist;
}
async function change(
  dist: string,
  route: string,
  mutate: (html: string) => string,
) {
  const file = path.join(dist, route.slice(1), "index.html");
  await fs.writeFile(file, mutate(await fs.readFile(file, "utf8")));
}
it("accepts route-specific initial HTML and factual structured identity", async () => {
  const dist = await fixture();
  expect(
    await checkSeoRelease({ mode: "production", config, dist, origin }),
  ).toEqual([]);
});
it("blocks duplicate page metadata rather than counting shared shell text", async () => {
  const dist = await fixture();
  const home = await fs.readFile(path.join(dist, "index.html"), "utf8");
  await change(dist, "/about/", (html) =>
    html.replace(
      /<title>.*?<\/title>/u,
      home.match(/<title>.*?<\/title>/u)![0],
    ),
  );
  expect(
    (await checkSeoRelease({ mode: "production", config, dist, origin })).join(
      " ",
    ),
  ).toContain("duplicate title");
});
it("blocks missing or wrong initial service H1", async () => {
  const dist = await fixture();
  await change(dist, "/services/drain-cleaning/", (html) =>
    html.replace("<h1>Drain cleaning</h1>", "<h1>Unrelated service</h1>"),
  );
  expect(
    (await checkSeoRelease({ mode: "production", config, dist, origin })).join(
      " ",
    ),
  ).toContain("H1");
});
it("blocks wrong route Open Graph destination", async () => {
  const dist = await fixture();
  await change(dist, "/about/", (html) =>
    html.replace(
      `property="og:url" content="${origin}/about/"`,
      `property="og:url" content="${origin}/"`,
    ),
  );
  expect(
    (await checkSeoRelease({ mode: "production", config, dist, origin })).join(
      " ",
    ),
  ).toContain("Open Graph");
});
it("blocks stale identity in an additional schema block", async () => {
  const dist = await fixture();
  await change(dist, "/about/", (html) =>
    html.replace(
      "</head>",
      '<script type="application/ld+json">{"@context":"https://schema.org","@type":"LocalBusiness","name":"Previous Client","url":"https://stale.test/"}</script></head>',
    ),
  );
  expect(
    (await checkSeoRelease({ mode: "production", config, dist, origin })).join(
      " ",
    ),
  ).toContain("schema");
});
it("blocks an invalid later JSON-LD block", async () => {
  const dist = await fixture();
  await change(dist, "/about/", (html) =>
    html.replace(
      "</head>",
      '<script type="application/ld+json">not-json</script></head>',
    ),
  );
  expect(
    (await checkSeoRelease({ mode: "production", config, dist, origin })).join(
      " ",
    ),
  ).toContain("JSON-LD");
});
it("blocks missing local imagery even when an img marker is present", async () => {
  const dist = await fixture();
  await change(dist, "/about/", (html) =>
    html.replace(
      "</main>",
      '<img src="/images/missing.webp" alt="Context"></main>',
    ),
  );
  expect(
    (await checkSeoRelease({ mode: "production", config, dist, origin })).join(
      " ",
    ),
  ).toContain("asset");
});
it("blocks unauthorized placeholders in visible page copy", async () => {
  const dist = await fixture();
  await change(dist, "/about/", (html) =>
    html.replace("</main>", "<p>TODO: replace business information</p></main>"),
  );
  expect(
    (await checkSeoRelease({ mode: "production", config, dist, origin })).join(
      " ",
    ),
  ).toContain("placeholder");
});
it("blocks a known private location value anywhere in public HTML", async () => {
  const dist = await fixture();
  const privateConfig = {
    ...config,
    business: { ...config.business, address: "42 Private Lane" },
  };
  await change(dist, "/about/", (html) =>
    html.replace(
      "</head>",
      '<meta name="debug" content="42 Private Lane"></head>',
    ),
  );
  expect(
    (
      await checkSeoRelease({
        mode: "production",
        config: privateConfig,
        dist,
        origin,
      })
    ).join(" "),
  ).toContain("private location");
});
it("reports per-route technical evidence including every admitted route", async () => {
  const dist = await fixture();
  const module: any = await import("../scripts/seo-release-gate.mjs");
  expect(module.inspectSeoRelease).toBeTypeOf("function");
  if (module.inspectSeoRelease) {
    const report = await module.inspectSeoRelease({
      mode: "production",
      config,
      dist,
      origin,
    });
    expect(report.routes.map((r: any) => r.path)).toEqual(
      expect.arrayContaining(paths),
    );
    expect(report.status).toBe("pass");
    expect(report.routes.every((r: any) => r.status === "pass")).toBe(true);
  }
});

it("blocks long exact city substitutions after removing the shared shell and overlapping area names", async () => {
  const { auditRouteContent } =
    await import("../scripts/route-content-audit.mjs");
  const dist = await fixture();
  const cityConfig = {
    ...config,
    business: {
      ...config.business,
      serviceAreas: ["Testville", "North Testville"],
    },
  };
  const records = ["Testville", "North Testville"].map((target, index) => ({
    id: "location:" + target.toLowerCase(),
    target,
    pageType: "location",
    path: index ? "/locations/north-testville/" : "/locations/testville/",
  }));
  const htmlPages = Object.fromEntries(
    records.map((record) => [
      record.path,
      `<title>${record.target} | Fixture Plumbing</title><main><h1>${record.target}</h1><p>${("Describe your enquiry in " + record.target + " and discuss access, preparation, scope, details and the next step. ").repeat(8)}</p></main>`,
    ]),
  );
  const report = await auditRouteContent({
    config: cityConfig,
    records,
    htmlPages,
    dist,
    origin,
    mode: "production",
  });
  expect(report.failures.join(" ")).toContain("city/service substitution");
});
it("redacts known private fields from observations as well as failures", async () => {
  const module = await import("../scripts/seo-release-gate.mjs");
  const dist = await fixture();
  await change(dist, "/about/", (html) =>
    html.replace("<h1>", "<h1>99 Secret Lane "),
  );
  const report = await module.inspectSeoRelease({
    mode: "production",
    config: {
      ...config,
      business: { ...config.business, address: "99 Secret Lane" },
    },
    dist,
    origin,
  });
  expect(JSON.stringify(report)).not.toContain("99 Secret Lane");
});

it("blocks stale nested publisher identity and fabricated nested ratings", async () => {
  const dist = await fixture();
  await change(dist, "/", (html) =>
    html.replace(
      "</head>",
      '<script type="application/ld+json">' +
        JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebPage",
          publisher: {
            "@type": "LocalBusiness",
            name: "Previous client",
            aggregateRating: {
              "@type": "AggregateRating",
              ratingValue: 5,
              ratingCount: 999,
            },
          },
        }) +
        "</script></head>",
    ),
  );
  const failures = await checkSeoRelease({
    mode: "production",
    config,
    dist,
    origin,
  });
  expect(failures.join(" ")).toContain("schema-business");
  expect(failures.join(" ")).toContain("schema-claims");
});
it("blocks unsupported standalone rating schema", async () => {
  const dist = await fixture();
  await change(dist, "/", (html) =>
    html.replace(
      "</head>",
      '<script type="application/ld+json">' +
        JSON.stringify({
          "@context": "https://schema.org",
          "@type": "AggregateRating",
          ratingValue: 5,
          ratingCount: 999,
        }) +
        "</script></head>",
    ),
  );
  expect(
    (await checkSeoRelease({ mode: "production", config, dist, origin })).join(
      " ",
    ),
  ).toContain("schema");
});

it("accepts current business definitions in a schema graph with partial provider references", async () => {
  const dist = await fixture();
  await change(dist, "/services/drain-cleaning/", (html) =>
    html.replace(
      /<script type="application\/ld\+json">(.*?)<\/script>/u,
      (_, json) => {
        const business = JSON.parse(json);
        return (
          '<script type="application/ld+json">' +
          JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              business,
              {
                "@type": "Service",
                name: "Drain cleaning",
                serviceType: "Drain cleaning",
                provider: {
                  "@type": "LocalBusiness",
                  "@id": origin + "/#business",
                  name: config.business.name,
                  telephone: config.business.phone,
                },
              },
            ],
          }) +
          "</script>"
        );
      },
    ),
  );
  expect(
    await checkSeoRelease({ mode: "production", config, dist, origin }),
  ).toEqual([]);
});

it('blocks unsupported claims nested in an untyped schema publisher',async()=>{const dist=await fixture();await change(dist,'/',html=>html.replace('</head>','<script type="application/ld+json">'+JSON.stringify({'@context':'https://schema.org','@type':'WebPage',publisher:{name:config.business.name,aggregateRating:{ratingValue:5,ratingCount:999}}})+'</script></head>'));expect((await checkSeoRelease({mode:'production',config,dist,origin})).join(' ')).toContain('schema-claims');});
