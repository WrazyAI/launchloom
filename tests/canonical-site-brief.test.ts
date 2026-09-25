import { describe, expect, it } from "vitest";
import { compileCanonicalSiteBrief } from "../scripts/compile-canonical-site-brief.mjs";

describe("canonical site brief compilation", () => {
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
        assets: { logo: "https://assets.launchloom.wrazyos.com/submission/logo.png" },
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
          { id: "service:drain", pageType: "service", title: "Drain Cleaning", slug: "/services/drain-cleaning/", service: "Drain Cleaning", primaryKeyword: { keyword: "drain cleaning Tacoma", volume: 90, kd: 41, cpc: 12.5, competition: 0.7, intent: "commercial", provenance: "dataforseo" }, supportingKeywords: [], fanOutQuestions: [], priority: "high", evidence: [{ type: "keyword_overview" }] },
          { id: "service:roof", pageType: "service", title: "Roof Repair", slug: "/services/roof-repair/", service: "Roof Repair", supportingKeywords: [], fanOutQuestions: [], priority: "high", evidence: [{ type: "keyword_overview" }] },
          { id: "location:lakewood", pageType: "location", title: "Plumbing in Lakewood", slug: "/locations/lakewood/", location: "Lakewood", localFacts: [{ value: "Client confirmed service coverage in Lakewood", provenance: "client_confirmed_coverage" }], supportingKeywords: [], fanOutQuestions: [], priority: "medium", evidence: [{ type: "local_serp" }] },
          { id: "location:seattle", pageType: "location", title: "Plumbing in Seattle", slug: "/locations/seattle/", location: "Seattle", localFacts: [{ value: "A local claim", provenance: "client_confirmed_coverage" }], supportingKeywords: [], fanOutQuestions: [], priority: "high", evidence: [{ type: "local_serp" }] },
        ],
      },
    });

    expect(brief.type).toBe("CanonicalSiteBrief");
    expect(brief.services).toEqual(["Drain cleaning", "Water heater repair"]);
    expect(brief.serviceAreas).toBe("Tacoma, WA\nLakewood\nPuyallup");
    expect(brief.pageMap.map((page) => page.id)).toEqual(["service:drain", "location:lakewood"]);
    expect(brief.pageMap[0].service).toBe("Drain cleaning");
    expect(brief.businessTruth.services.map((service) => service.provenance)).toEqual(["client_confirmed", "client_confirmed"]);
    expect(brief.brand.primaryColor).toBe("#245a46");
    expect(brief.verifiedAssets.logo).toMatchObject({ url: "https://assets.launchloom.wrazyos.com/submission/logo.png", provenance: "client_supplied_asset" });
    expect(brief.assets.logo).toBe("https://assets.launchloom.wrazyos.com/submission/logo.png");
    expect(brief.seoResearch.pageMap.some((page) => page.service === "Roof Repair")).toBe(false);
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
      research: { version: 2, mode: "context-only", publishReady: false, pageMap: [] },
    });

    expect(brief.legacy).toBe(true);
    expect(brief.services).toEqual(["Interior painting"]);
    expect(brief.coverageAreas).toEqual(["Tacoma, WA", "Lakewood, WA"]);
    expect(brief.primaryCity).toBe("Tacoma, WA");
    expect(brief.seoResearch.publishReady).toBe(false);
  });
});
