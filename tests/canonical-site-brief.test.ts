import { describe, expect, it } from "vitest";
import { compileCanonicalSiteBrief } from "../scripts/compile-canonical-site-brief.mjs";
import { normalise } from "../scripts/generate-site-config.mjs";

describe("canonical site brief compilation", () => {
  it("carries an explicit synthetic demo notice through config generation", () => {
    const brief = compileCanonicalSiteBrief({
      intake: {
        submissionId: "demo-precision-20260923",
        businessName: "Precision Auto Care",
        industry: "automotive",
        services: "Digital vehicle inspections\nBrake service",
        confirmAccuracy: "synthetic demo brief; not a real client attestation",
        additionalNotes:
          "FICTIONAL DEMO ONLY. Never publish this as a real client site.",
      },
      research: { pageMap: [] },
    });

    expect(brief.demoNotice).toBe("Fictional pipeline demo");
    expect(normalise({}, brief).demoNotice).toBe("Fictional pipeline demo");
  });

  it("does not turn an ordinary client mention of a demo into a synthetic-site label", () => {
    const brief = compileCanonicalSiteBrief({
      intake: {
        submissionId: "submission-client-001",
        businessName: "Harbor Auto Care",
        industry: "automotive",
        services: "Brake service",
        confirmAccuracy: "yes",
        additionalNotes:
          "We use demo vehicles when explaining our inspection process.",
      },
      research: { pageMap: [] },
    });

    expect(brief).not.toHaveProperty("demoNotice");
    expect(normalise({}, brief)).not.toHaveProperty("demoNotice");
  });

  it("keeps client-confirmed business truth ahead of researched service and page suggestions", () => {
    const brief = compileCanonicalSiteBrief({
      intake: {
        intakeVersion: "2",
        submissionId: "submission-canonical-001",
        businessName: "Harbor Plumbing",
        contactName: "Sam Owner",
        email: "sam@example.test",
        phone: "555-0100",
        address: "1 Main Street, Tacoma, WA",
        industry: "home-services",
        services: ["Drain cleaning", "Water heater repair"],
        serviceAreas: "Tacoma, WA",
        serviceRadius: "20",
        confirmAccuracy: "yes",
        brandNotes: "Forest green and straightforward",
        brandColor: "#245a46",
        assets: {
          logo: "https://assets.launchloom.wrazyos.com/submission/logo.png",
        },
        leadEmail: "leads@example.test",
      },
      enrichment: {
        primaryCity: "Tacoma, WA",
        serviceRadiusMiles: 20,
        coverageAreas: ["Tacoma, WA", "Lakewood", "Puyallup"],
        coverageEvidence: { source: "google_geocoding", lookups: 16 },
        warnings: [],
      },
      research: {
        version: 2,
        mode: "researched",
        publishReady: true,
        pageMap: [
          {
            id: "service:drain",
            pageType: "service",
            title: "Drain Cleaning",
            slug: "/services/drain-cleaning/",
            service: "Drain Cleaning",
            primaryKeyword: {
              keyword: "drain cleaning Tacoma",
              volume: 90,
              kd: 41,
              cpc: 12.5,
              competition: 0.7,
              intent: "commercial",
              provenance: "dataforseo",
            },
            supportingKeywords: [],
            fanOutQuestions: [],
            priority: "high",
            evidence: [{ type: "keyword_overview" }],
          },
          {
            id: "service:roof",
            pageType: "service",
            title: "Roof Repair",
            slug: "/services/roof-repair/",
            service: "Roof Repair",
            supportingKeywords: [],
            fanOutQuestions: [],
            priority: "high",
            evidence: [{ type: "keyword_overview" }],
          },
          {
            id: "location:lakewood",
            pageType: "location",
            title: "Plumbing in Lakewood",
            slug: "/locations/lakewood/",
            location: "Lakewood",
            localFacts: [
              {
                value: "Client confirmed service coverage in Lakewood",
                provenance: "client_confirmed_coverage",
              },
            ],
            supportingKeywords: [],
            fanOutQuestions: [],
            priority: "medium",
            evidence: [{ type: "local_serp" }],
          },
          {
            id: "location:seattle",
            pageType: "location",
            title: "Plumbing in Seattle",
            slug: "/locations/seattle/",
            location: "Seattle",
            localFacts: [
              {
                value: "A local claim",
                provenance: "client_confirmed_coverage",
              },
            ],
            supportingKeywords: [],
            fanOutQuestions: [],
            priority: "high",
            evidence: [{ type: "local_serp" }],
          },
        ],
      },
    });

    expect(brief.type).toBe("CanonicalSiteBrief");
    expect(brief.services).toEqual(["Drain cleaning", "Water heater repair"]);
    expect(brief.serviceAreas).toBe("Tacoma, WA\nLakewood\nPuyallup");
    expect(brief.pageMap.map((page) => page.id)).toEqual([
      "service:drain",
      "location:lakewood",
    ]);
    expect(brief.pageMap[0].service).toBe("Drain cleaning");
    expect(
      brief.businessTruth.services.map((service) => service.provenance),
    ).toEqual(["client_confirmed", "client_confirmed"]);
    expect(brief.brand.primaryColor).toBe("#245a46");
    expect(brief.verifiedAssets.logo).toMatchObject({
      url: "https://assets.launchloom.wrazyos.com/submission/logo.png",
      provenance: "client_supplied_asset",
    });
    expect(brief.assets.logo).toBe(
      "https://assets.launchloom.wrazyos.com/submission/logo.png",
    );
    expect(
      brief.seoResearch.pageMap.some((page) => page.service === "Roof Repair"),
    ).toBe(false);
  });

  it("retains legacy intake shape while safely falling back to only its confirmed city", () => {
    const brief = compileCanonicalSiteBrief({
      intake: {
        submissionId: "submission-legacy-001",
        businessName: "Legacy Painter",
        contactName: "Alex Owner",
        email: "alex@example.test",
        phone: "555-0101",
        address: "2 Main Street",
        services: "Interior painting",
        serviceAreas: "Tacoma, WA\nLakewood, WA",
        confirmAccuracy: "yes",
        confirmRights: "yes",
        confirmSeoResearch: "yes",
      },
      research: {
        version: 2,
        mode: "context-only",
        publishReady: false,
        pageMap: [],
      },
    });

    expect(brief.legacy).toBe(true);
    expect(brief.services).toEqual(["Interior painting"]);
    expect(brief.coverageAreas).toEqual(["Tacoma, WA", "Lakewood, WA"]);
    expect(brief.primaryCity).toBe("Tacoma, WA");
    expect(brief.seoResearch.publishReady).toBe(false);
  });

  it("splits comma-delimited legacy scalar services while preserving city commas", () => {
    const brief = compileCanonicalSiteBrief({
      intake: {
        intakeVersion: "1",
        services: "Drain cleaning, Water heater repair",
        serviceAreas: "Tacoma, WA\nLakewood, WA",
      },
      research: { pageMap: [] },
    });

    expect(brief.services).toEqual(["Drain cleaning", "Water heater repair"]);
    expect(brief.coverageAreas).toEqual(["Tacoma, WA", "Lakewood, WA"]);
  });

  it("splits semicolon-delimited service areas without splitting commas inside place names", () => {
    const brief = compileCanonicalSiteBrief({
      intake: {
        services: "Interior painting",
        serviceAreas: "Portland, OR; Beaverton, OR; Lake Oswego, OR",
        serviceRadius: "30",
      },
      research: { pageMap: [] },
    });

    expect(brief.primaryCity).toBe("Portland, OR");
    expect(brief.coverageAreas).toEqual([
      "Portland, OR",
      "Beaverton, OR",
      "Lake Oswego, OR",
    ]);
    expect(brief.serviceAreas).toBe(
      "Portland, OR\nBeaverton, OR\nLake Oswego, OR",
    );
  });

  it("does not discard client-confirmed towns when coverage enrichment adds suggestions", () => {
    const brief = compileCanonicalSiteBrief({
      intake: {
        serviceAreas: "Portland, OR; Beaverton, OR; Lake Oswego, OR",
      },
      enrichment: {
        coverageAreas: ["Portland, OR", "Tigard, OR"],
        coverageEvidence: { source: "google_geocoding", lookups: 16 },
      },
      research: { pageMap: [] },
    });

    expect(brief.coverageAreas).toEqual([
      "Portland, OR",
      "Beaverton, OR",
      "Lake Oswego, OR",
      "Tigard, OR",
    ]);
    expect(brief.businessTruth.coverageAreas).toMatchObject([
      { value: "Portland, OR", provenance: "client_confirmed_primary_city" },
      { value: "Beaverton, OR", provenance: "legacy_client_supplied_area" },
      { value: "Lake Oswego, OR", provenance: "legacy_client_supplied_area" },
      { value: "Tigard, OR", provenance: "google_geocoding" },
    ]);
  });

  it("does not retain an unsupported travel radius as confirmed canonical truth", () => {
    const brief = compileCanonicalSiteBrief({
      intake: {
        primaryCity: "Portland, OR",
        serviceRadius: "25",
      },
      enrichment: {
        coverageAreas: ["Portland, OR", "Tigard, OR"],
        coverageEvidence: { source: "google_geocoding", lookups: 16 },
      },
      research: { pageMap: [] },
    });

    expect(brief.serviceRadius).toBeNull();
    expect(brief.coverageAreas).toEqual(["Portland, OR"]);
    expect(brief.businessTruth.serviceRadius).toBeNull();
    expect(brief.coverage.evidence).toEqual({
      source: "client_confirmed_primary_city",
      lookups: 0,
    });
    expect(brief.coverage.warnings).toContain(
      "The submitted travel radius is not supported; only explicitly confirmed coverage areas are retained.",
    );
  });

  it("preserves commas within one confirmed service from intake through the page map", () => {
    const brief = compileCanonicalSiteBrief({
      intake: {
        businessName: "North Sound Heating",
        confirmedServices: ["Heating, ventilation and AC"],
        primaryCity: "Tacoma, WA",
        industry: "home-services",
      },
      research: {
        pageMap: [
          {
            id: "service:heating-ventilation-ac",
            pageType: "service",
            title: "Heating, ventilation and AC",
            service: "Heating, ventilation and AC",
            slug: "/services/heating-ventilation-ac/",
            evidence: [{ type: "keyword_overview" }],
          },
        ],
      },
    });

    expect(brief.services).toEqual(["Heating, ventilation and AC"]);
    expect(brief.pageMap).toHaveLength(1);
    expect(brief.pageMap[0].service).toBe("Heating, ventilation and AC");
  });

  it("keeps research and canonical service sets aligned at five services", () => {
    const services = ["A", "B", "C", "D", "E", "F"];
    const brief = compileCanonicalSiteBrief({
      intake: { confirmedServices: services, primaryCity: "Tacoma, WA" },
      research: {
        warnings: ["Existing research warning."],
        pageMap: services.map((service) => ({
          id: `service:${service.toLowerCase()}`,
          pageType: "service",
          title: service,
          service,
          slug: `/services/${service.toLowerCase()}/`,
          evidence: [{ type: "keyword_overview" }],
        })),
      },
    });

    expect(brief.services).toEqual(services.slice(0, 5));
    expect(brief.pageMap.map((page) => page.service)).toEqual(
      services.slice(0, 5),
    );
    expect(brief.seoResearch.warnings).toEqual(
      expect.arrayContaining([
        "Existing research warning.",
        "Only the first 5 client-confirmed services were included in the canonical site brief.",
      ]),
    );
  });
});

it("does not re-add excluded cities to a confirmed coverage list or location pages", () => {
  const brief = compileCanonicalSiteBrief({
    intake: {
      intakeVersion: "2",
      services: "Drain cleaning",
      primaryCity: "Cookeville, TN",
      serviceRadius: "10",
      coverageAreas: ["Cookeville, TN", "Algood, TN"],
      coverageConfirmation: {
        status: "confirmed",
        primaryCity: "Cookeville, TN",
        radiusSelection: "10",
        selectedCount: 1,
      },
    },
    enrichment: { coverageAreas: ["Cookeville, TN", "Baxter, TN"] },
    research: {
      pageMap: [
        {
          id: "location:baxter",
          pageType: "location",
          location: "Baxter, TN",
          evidence: [{ type: "serp" }],
          localFacts: [
            {
              value: "Client serves Baxter",
              provenance: "client_confirmed_coverage",
            },
          ],
        },
      ],
    },
  });
  expect(brief.coverageAreas).toEqual(["Cookeville, TN", "Algood, TN"]);
  expect(brief.pageMap).toEqual([]);
  expect(brief.businessTruth.coverageAreas[1].provenance).toBe(
    "client_confirmed_coverage",
  );
});

it("carries explicit route decisions and migration URLs through canonical and config generation", () => {
  const routePolicy = {
    version: 1,
    decisions: [
      {
        pageType: "location",
        target: "Lakewood",
        status: "approved",
        evidence: ["operator review"],
        admission: {
          services: ["Drain cleaning"],
          visitorNeed: "Prepare property access.",
          distinctValue: "Client access instructions.",
          localFacts: [
            {
              value:
                "Ask the property owner to open the side gate before a visit.",
              source: "client notes",
              provenance: "client_supplied_local_information",
            },
          ],
        },
      },
    ],
    existingUrls: [
      { url: "https://old.example/drain/", routeId: "service:drain cleaning" },
    ],
  };
  const brief = compileCanonicalSiteBrief({
    intake: {
      businessName: "Fixture Plumbing",
      industry: "home-services",
      services: "Drain cleaning",
      primaryCity: "Lakewood",
      serviceAreas: "Lakewood",
      phone: "555-555-0100",
      email: "fixture@example.com",
      leadEmail: "fixture@example.com",
      routePolicy,
    },
    research: { version: 2, pageMap: [] },
  });
  expect(brief.routePolicy).toEqual(routePolicy);
  const config = normalise({}, brief);
  expect(config.routePolicy).toEqual(routePolicy);
  expect(
    config.locations.map((location: { name: string }) => location.name),
  ).toEqual(["Lakewood"]);
  expect(config.locations[0].localNote).toContain("side gate");
  expect(
    config.routeInventory.records.find(
      (
        route: import("../templates/client-site/src/lib/route-inventory.mjs").RouteRecord,
      ) => route.pageType === "location",
    )?.approval.status,
  ).toBe("approved");
  expect(config.routeInventory.redirectProposal[0]).toMatchObject({
    to: "/services/drain-cleaning/",
    active: false,
  });
});

it('carries approved page inputs through canonical generation and rejects model replacement',()=>{
 const routeId='service:drain cleaning';const introduction='Describe which drain is affected before discussing the requested service scope.';const metadata='Discuss drainage symptoms and preparation before making a drain cleaning enquiry.';const pageEvidence=[{id:'intro',value:introduction},{id:'meta',value:metadata}].map(record=>({...record,source:'synthetic client confirmation',kind:'client_supplied',confirmed:true,public:true,routeIds:[routeId]}));const pageContent={[routeId]:{introduction:{text:introduction,evidenceIds:['intro']},metadata:{description:{text:metadata,evidenceIds:['meta']}}}};
 const brief=compileCanonicalSiteBrief({intake:{businessName:'Fixture Plumbing',industry:'home-services',services:'Drain cleaning',businessDescription:'Fictional plumbing fixture.',pageContent,pageEvidence},research:{pageMap:[]}});expect(brief.pageContent).toEqual(pageContent);expect(brief.pageEvidence).toEqual(pageEvidence);
 const result=normalise({pageContent:{[routeId]:{introduction:'Invented model claim.'}},pageEvidence:[]},brief);expect(result.pageContent).toEqual(pageContent);expect(result.pageEvidence).toEqual(pageEvidence);expect(result.pageBriefs.briefs.find((page:any)=>page.routeId===routeId)).toMatchObject({mode:'supported',ready:true,introduction});
});
