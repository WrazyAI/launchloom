import { confirmedCoverageFromIntake, applyCoverageEnrichment } from "../scripts/confirmed-coverage.mjs";
import { describe, expect, it } from "vitest";
import {
  discoverCoverageAreas,
  primaryCityFromIntake,
} from "../scripts/coverage-areas.mjs";

describe("service coverage area discovery", () => {
  it("uses the first semicolon-delimited service area as the primary geocoding city", () => {
    expect(
      primaryCityFromIntake({
        serviceAreas:
          "Portland, OR; Beaverton, OR; Lake Oswego, OR",
      }),
    ).toBe("Portland, OR");
  });

  it("retains only confirmed coverage when the submitted radius is unsupported", async () => {
    let geocodingCalled = false;
    const result = await discoverCoverageAreas({
      primaryCity: "Portland, OR",
      serviceRadius: "25",
      geocodeCity: async () => {
        geocodingCalled = true;
        return { latitude: 45.5152, longitude: -122.6784 };
      },
      reverseGeocode: async () => [],
    });

    expect(geocodingCalled).toBe(false);
    expect(result.primaryCity).toBe("Portland, OR");
    expect(result.serviceRadiusMiles).toBeNull();
    expect(result.coverageAreas).toEqual(["Portland, OR"]);
    expect(result.warnings).toContain(
      "A supported travel radius was not available; only the confirmed primary city is retained.",
    );
  });

  it("keeps only unique named communities whose returned center is within the confirmed radius", async () => {
    let call = 0;
    const result = await discoverCoverageAreas({
      primaryCity: "Tacoma, WA",
      serviceRadius: "20",
      geocodeCity: async () => ({ latitude: 47.2529, longitude: -122.4443 }),
      reverseGeocode: async () => {
        call += 1;
        if (call === 1) return [{ name: "Lakewood", latitude: 47.1718, longitude: -122.5185 }];
        if (call === 2) return [{ name: "Lakewood", latitude: 47.1718, longitude: -122.5185 }];
        if (call === 3) return [{ name: "Seattle", latitude: 47.6062, longitude: -122.3321 }];
        return [];
      },
    });

    expect(result.coverageAreas).toEqual(["Tacoma, WA", "Lakewood"]);
    expect(result.coverageEvidence.source).toBe("google_geocoding");
    expect(result.warnings).toContain("Google returned fewer than 10 distinct nearby service communities.");
  });

  it("caps a 50+ request at 50 miles and records that wider coverage was not mapped", async () => {
    const result = await discoverCoverageAreas({
      primaryCity: "Tacoma, WA",
      serviceRadius: "50+",
      geocodeCity: async () => ({ latitude: 47.2529, longitude: -122.4443 }),
      reverseGeocode: async () => [],
    });

    expect(result.serviceRadiusMiles).toBe(50);
    expect(result.warnings).toContain("The selected 50+ mile radius was mapped conservatively to 50 miles; wider coverage was not mapped.");
  });

  it("preserves the primary city when Google geocoding is unavailable", async () => {
    const result = await discoverCoverageAreas({
      primaryCity: "Tacoma, WA",
      serviceRadius: "20",
      geocodeCity: async () => { throw new Error("provider offline"); },
      reverseGeocode: async () => [],
    });

    expect(result.coverageAreas).toEqual(["Tacoma, WA"]);
    expect(result.coverageEvidence.source).toBe("unavailable");
    expect(result.warnings).toContain("Coverage discovery was unavailable; the confirmed primary city is retained.");
  });
});


it("preserves confirmed coverage instead of discovery suggestions, including primary-only fallback", () => {
  const intake = { primaryCity: "Cookeville, TN", serviceRadius: "10", coverageAreas: ["Cookeville, TN", "Algood, TN"], coverageConfirmation: { status: "confirmed", primaryCity: "Cookeville, TN", radiusSelection: "10", selectedCount: 1 } };
  const enrichment = { coverageAreas: ["Cookeville, TN", "Baxter, TN"], coverageEvidence: {source:"google_geocoding"} };
  expect(applyCoverageEnrichment(intake, enrichment).coverageAreas).toEqual(intake.coverageAreas);
  expect(confirmedCoverageFromIntake(intake)!.coverageEvidence.source).toBe("client_confirmed_coverage");
  const only = { ...intake, coverageAreas: [intake.primaryCity], coverageConfirmation: { ...intake.coverageConfirmation, status: "primary_city_only", selectedCount: 0 } };
  expect(applyCoverageEnrichment(only, enrichment).coverageAreas).toEqual([intake.primaryCity]);
  expect(() => confirmedCoverageFromIntake({...intake,serviceRadius:"20"})).toThrow(/confirmed city, radius/);
});
