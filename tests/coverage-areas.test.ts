import { describe, expect, it } from "vitest";
import { discoverCoverageAreas } from "../scripts/coverage-areas.mjs";

describe("service coverage area discovery", () => {
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
