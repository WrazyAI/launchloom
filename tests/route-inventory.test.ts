import { describe, it, expect } from "vitest";
import {
  compileRouteInventory,
  approvedRoutes,
  normalizeRoutePath,
  routeReadiness,
} from "../templates/client-site/src/lib/route-inventory.mjs";
const base = {
  industry: "home-services",
  business: {
    name: "Fixture Plumbing",
    description: "Client supplied plumbing details.",
    serviceAreas: ["Testville", "North Testville"],
    domain: "example.com",
  },
  services: [
    {
      name: "Leak repair",
      slug: "leak-repair",
      description: "Find the cause of a water leak.",
    },
  ],
  locations: [],
  blogArticles: [],
};
const policy = { version: 1 as const, decisions: [] };
const admission = {
  services: ["Leak repair"],
  visitorNeed: "Check flood-access constraints for this neighborhood.",
  distinctValue: "Specific access preparation supplied by the client.",
  localFacts: [
    {
      value: "Ask about rear service access on these properties.",
      provenance: "client_supplied_local_information",
      source: "client intake notes",
    },
  ],
};
const location = (name = "Testville", slug = "testville") => ({
  name,
  slug,
  description: "Client supplied neighborhood details.",
});
const decision = (target = "Testville") => ({
  pageType: "location",
  target,
  status: "approved",
  evidence: ["operator review fixture"],
  admission,
});
const routes = (config: any) =>
  approvedRoutes(compileRouteInventory(config)).map((r) => r.path);
describe("route inventory", () => {
  it("adapts absent legacy policy and distinguishes explicit zero selections", () => {
    expect(routes({ ...base, locations: [location()] })).toContain(
      "/locations/testville/",
    );
    expect(
      routes({ ...base, locations: [], routePolicy: policy }),
    ).not.toContain("/locations/testville/");
    expect(
      routes({ ...base, industry: "wellness", locations: [location()] }),
    ).not.toContain("/locations/testville/");
  });
  it("keeps coverage and research suggestions separate from page approval", () => {
    const config = {
      ...base,
      locations: [location()],
      routePolicy: policy,
      seoPageMap: [
        { pageType: "location", location: "Testville", approval: "approved" },
      ],
    };
    expect(routes(config)).not.toContain("/locations/testville/");
    expect(config.business.serviceAreas).toHaveLength(2);
    expect(
      compileRouteInventory(config).records.find(
        (r) => r.pageType === "location",
      )?.approval.status,
    ).toBe("proposed");
  });
  it("admits one or multiple approved locations without a service-city product", () => {
    const config = {
      ...base,
      locations: [location(), location("North Testville", "north-testville")],
      routePolicy: {
        ...policy,
        decisions: [decision(), decision("North Testville")],
      },
    };
    expect(routes(config).filter((p) => p.startsWith("/locations/"))).toEqual([
      "/locations/testville/",
      "/locations/north-testville/",
    ]);
    expect(routes(config).filter((p) => p.startsWith("/services/"))).toEqual([
      "/services/",
      "/services/leak-repair/",
    ]);
    expect(routeReadiness(config).allowed).toBe(true);
  });
  it("defers an approved location lacking useful supported local information", () => {
    const config = {
      ...base,
      locations: [location()],
      routePolicy: {
        ...policy,
        decisions: [
          {
            ...decision(),
            admission: {
              ...admission,
              localFacts: [
                {
                  value: "Testville is served",
                  provenance: "client_confirmed_coverage",
                  source: "intake",
                },
              ],
            },
          },
        ],
      },
    };
    expect(routes(config)).not.toContain("/locations/testville/");
    expect(routeReadiness(config).allowed).toBe(false);
    expect(compileRouteInventory(config).issues.join(" ")).toContain(
      "beyond coverage",
    );
  });
  it("rejects unconfirmed coverage, excluded services and unresolved approval records", () => {
    const config = {
      ...base,
      excludedServices: ["Leak repair"],
      locations: [location("Wrongville", "wrongville")],
      routePolicy: {
        ...policy,
        decisions: [
          decision("Wrongville"),
          {
            pageType: "service",
            target: "Invented service",
            status: "approved",
          },
        ],
      },
    };
    expect(routeReadiness(config).allowed).toBe(false);
    expect(routes(config)).not.toContain("/services/leak-repair/");
    expect(routes(config)).not.toContain("/locations/wrongville/");
  });
  it("preserves omitted supporting routes and blocks requested legal pages without supplied content", () => {
    const config = {
      ...base,
      routePolicy: {
        ...policy,
        decisions: [
          { pageType: "about", status: "omitted" },
          { pageType: "contact", status: "omitted" },
          { pageType: "privacy", status: "approved" },
        ],
      },
    };
    expect(routes(config)).not.toContain("/about/");
    expect(routes(config)).not.toContain("/contact/");
    expect(routes(config)).not.toContain("/privacy/");
    expect(routeReadiness(config).allowed).toBe(false);
    expect(
      routes({
        ...config,
        supportingPages: {
          privacy: {
            reviewed: true,
            body: "Client supplied policy text.",
            source: "client approved document",
          },
        },
      }),
    ).toContain("/privacy/");
  });
  it("keeps approved nonindexable/preview-only pages out of the sitemap and production routes", () => {
    const config = {
      ...base,
      routePolicy: {
        ...policy,
        decisions: [
          { pageType: "about", status: "approved", indexable: false },
          { pageType: "contact", status: "approved", previewOnly: true },
        ],
      },
    };
    const inventory = compileRouteInventory(config);
    expect(
      inventory.records.filter((r) => r.discovery.sitemap).map((r) => r.path),
    ).not.toContain("/about/");
    expect(
      approvedRoutes(inventory, { production: true }).map((r) => r.path),
    ).not.toContain("/contact/");
  });
  it("detects duplicate paths and unresolved links", () => {
    const config = {
      ...base,
      services: [...base.services, { name: "Inspection", slug: "leak-repair" }],
      routePolicy: {
        ...policy,
        decisions: [
          { pageType: "home", status: "approved", internalLinks: ["missing:"] },
        ],
      },
    };
    expect(compileRouteInventory(config).issues.join(" ")).toContain(
      "Duplicate route path",
    );
    expect(compileRouteInventory(config).issues.join(" ")).toContain(
      "unresolved internal target",
    );
  });
  it("retains supplied blog articles but creates no research filler", () => {
    expect(routes(base)).not.toContain("/blog/");
    expect(
      routes({
        ...base,
        blogArticles: [
          { slug: "prepare", title: "Prepare", body: "Supplied content." },
        ],
      }),
    ).toContain("/blog/prepare/");
  });
  it("captures migration proposals without activating redirects or custom domains", () => {
    const inventory = compileRouteInventory({
      ...base,
      routePolicy: {
        ...policy,
        existingUrls: [
          {
            url: "https://old.example/old-leaks/",
            routeId: "service:leak repair",
          },
          "https://old.example/unmapped/",
        ],
      },
    });
    expect(inventory.redirectProposal).toMatchObject([
      { to: "/services/leak-repair/", active: false, status: "proposed" },
      { to: null, status: "needs-mapping" },
    ]);
    expect(inventory.domainTransition).toMatchObject({
      status: "deferred",
      requestedDomain: "example.com",
    });
  });
  it("normalizes paths and rejects unsafe or ambiguous values", () => {
    expect(normalizeRoutePath("/services/leak-repair")).toBe(
      "/services/leak-repair/",
    );
    for (const path of [
      "//evil.test",
      "/../secret",
      "/foo?x=1",
      "/foo%2fbar",
      "/foo\\bar",
      "https://evil.test",
    ])
      expect(() => normalizeRoutePath(path)).toThrow();
  });
  it("does not accept stale inventory approval instead of the policy", () => {
    const config = {
      ...base,
      routePolicy: policy,
      locations: [location()],
      routeInventory: {
        records: [
          { path: "/locations/testville/", approval: { status: "approved" } },
        ],
      },
    };
    expect(routes(config)).not.toContain("/locations/testville/");
  });
});

it("keeps authored card targets approved without mutating canonical service or coverage facts", async () => {
  const { routeLinkedContent } =
    await import("../templates/client-site/src/lib/route-inventory.mjs");
  const config = {
    ...base,
    locations: [location()],
    routePolicy: {
      ...policy,
      decisions: [
        { pageType: "service", target: "Leak repair", status: "omitted" },
      ],
    },
  };
  expect(routeLinkedContent(config).services).toEqual([]);
  expect(routeLinkedContent(config).locations).toEqual([]);
  expect(config.services).toHaveLength(1);
  expect(config.business.serviceAreas).toHaveLength(2);
  expect(
    routeLinkedContent({ ...base, locations: [location()] }).locations,
  ).toHaveLength(1);
});

it("does not treat a new explicit report with its policy removed as a legacy authorization", () => {
  const report = compileRouteInventory({
    ...base,
    routePolicy: policy,
    locations: [location()],
  });
  const config = { ...base, locations: [location()], routeInventory: report };
  expect(routeReadiness(config).allowed).toBe(false);
  expect(routes(config)).not.toContain("/locations/testville/");
});

it("reports unresolved location slug collisions and empty slugs against their decision IDs", () => {
  const config = {
    ...base,
    locations: [location()],
    routePolicy: {
      ...policy,
      decisions: [
        { pageType: "location", target: "Testville!", status: "proposed" },
        { pageType: "location", target: "!!!", status: "proposed" },
      ],
    },
  };
  const inventory = compileRouteInventory(config);
  expect(
    inventory.records.filter(
      (record) => record.path === "/locations/testville/",
    ),
  ).toHaveLength(1);
  expect(inventory.issues.join(" ")).toContain("location:testville!:");
  expect(inventory.issues.join(" ")).toContain("location:!!!:");
  expect(inventory.issues.join(" ")).toContain(
    "Location content is not supplied",
  );
});
