import { describe, expect, it } from "vitest";
import {
  BOUNDED_50_PLUS_WARNING,
  COVERAGE_FALLBACK_SOURCE,
  COVERAGE_SOURCE,
  CoverageContractError,
  MAX_COVERAGE_CANDIDATES,
  boundedRadiusMiles,
  boundedRadiusSelection,
  collectCoverageCandidates,
  coverageSearchCenters,
  createCoverageReferencePayload,
  deriveCoverageConfirmation,
  destinationPoint,
  milesBetween,
  normalizeCoveragePlace,
  parseCoverageSelection,
  signCoverageReference,
  verifyCoverageReference,
} from "../src/lib/coverage-contract.mjs";

const METERS_PER_MILE = 1609.344;
const cookeville = { latitude: 36.1628, longitude: -85.5016 };

function mustPlan<T>(plan: T | null): T {
  if (!plan) throw new Error("Expected a supported coverage search plan.");
  return plan;
}
const bristol = { latitude: 36.5951, longitude: -82.1888 };

function place(
  id: string,
  name: string,
  state: string,
  latitude: number,
  longitude: number,
  types: string[] = ["locality", "political"],
) {
  return {
    id,
    displayName: { text: name },
    types,
    location: { latitude, longitude },
    addressComponents: [
      { shortText: state, longText: state, types: ["administrative_area_level_1"] },
      { shortText: "US", longText: "United States", types: ["country"] },
    ],
  };
}

function placeAt(
  id: string,
  name: string,
  state: string,
  miles: number,
  bearing: number,
  center = cookeville,
) {
  const point = destinationPoint(center, miles * METERS_PER_MILE, bearing);
  return place(id, name, state, point.latitude, point.longitude);
}

describe("coverage radius rules", () => {
  it("bounds supported radius selections and maps 50+ to a bounded 50 miles", () => {
    expect(boundedRadiusSelection("10")).toBe("10");
    expect(boundedRadiusSelection("50+")).toBe("50+");
    expect(boundedRadiusSelection("25")).toBeNull();
    expect(boundedRadiusMiles("10")).toBe(10);
    expect(boundedRadiusMiles("30")).toBe(30);
    expect(boundedRadiusMiles("50+")).toBe(50);
    expect(boundedRadiusMiles("unlimited")).toBeNull();
  });

  it("uses one exact-radius search up to 30 miles and overlapping 50 km circles beyond", () => {
    const narrow = mustPlan(coverageSearchCenters(cookeville, "30"));
    expect(narrow.centers).toHaveLength(1);
    expect(narrow.centers[0].radiusMeters).toBeCloseTo(30 * METERS_PER_MILE, 6);
    expect(narrow.miles).toBe(30);

    const wide = mustPlan(coverageSearchCenters(cookeville, "50"));
    expect(wide.centers).toHaveLength(9);
    expect(wide.centers.every((center) => center.radiusMeters === 50_000)).toBe(true);
    expect(wide.centers[0]).toMatchObject({ latitude: cookeville.latitude, kind: "primary" });

    const boundedPlus = mustPlan(coverageSearchCenters(cookeville, "50+"));
    expect(boundedPlus.miles).toBe(50);
    expect(boundedPlus.selection).toBe("50+");
    expect(boundedPlus.centers).toHaveLength(9);
  });

  it("covers the entire 50-mile disc with the satellite search plan", () => {
    const plan = mustPlan(coverageSearchCenters(cookeville, "50+"));
    const radiusMeters = plan.miles * METERS_PER_MILE;
    for (let distance = 0; distance <= radiusMeters; distance += radiusMeters / 24) {
      for (let bearing = 0; bearing < 360; bearing += 7.5) {
        const point = destinationPoint(cookeville, distance, bearing);
        const covered = plan.centers.some(
          (center) =>
            milesBetween(center, point) * METERS_PER_MILE <= center.radiusMeters + 0.5,
        );
        expect(
          covered,
          `point at ${Math.round(distance)}m bearing ${bearing} is outside the 50-mile search plan`,
        ).toBe(true);
      }
    }
  });

  it("does not accept unsupported radii", () => {
    expect(coverageSearchCenters(cookeville, "25")).toBeNull();
    expect(coverageSearchCenters(cookeville, "")).toBeNull();
  });
});

describe("coverage candidate collection", () => {
  const primary = { name: "Cookeville", state: "TN", placeId: "primary-cookeville", ...cookeville };

  it("keeps unique in-radius municipalities sorted by straight-line distance", () => {
    const result = collectCoverageCandidates({
      primary,
      searches: [
        {
          places: [
            placeAt("algood", "Algood", "TN", 3, 20),
            placeAt("baxter", "Baxter", "TN", 8, 200),
            placeAt("monterey", "Monterey", "TN", 13, 90),
            placeAt("algood", "Algood", "TN", 3, 20),
          ],
        },
      ],
      radiusMiles: 10,
    });
    expect(result.candidates.map((candidate) => candidate.name)).toEqual(["Algood", "Baxter"]);
    expect(result.candidates[0]).toMatchObject({
      id: "algood",
      state: "TN",
      label: "Algood, TN",
    });
    expect(result.candidates[0].distanceMiles).toBeCloseTo(3, 1);
    expect(result.truncated).toBe(false);
    expect(result.partial).toBe(false);
  });

  it("includes the exact radius boundary and excludes genuinely out-of-radius places", () => {
    const result = collectCoverageCandidates({
      primary,
      searches: [
        {
          places: [
            placeAt("edge", "Edge", "TN", 10, 0),
            placeAt("beyond", "Beyond", "TN", 10.01, 45),
          ],
        },
      ],
      radiusMiles: 10,
    });
    expect(result.candidates.map((candidate) => candidate.id)).toEqual(["edge"]);
  });

  it("keeps same-name cities in different states distinct and never re-adds the primary city", () => {
    const bristolPrimary = {
      name: "Bristol",
      state: "TN",
      placeId: "bristol-tn",
      ...bristol,
    };
    const result = collectCoverageCandidates({
      primary: bristolPrimary,
      searches: [
        {
          places: [
            place("bristol-tn", "Bristol", "TN", bristol.latitude, bristol.longitude),
            placeAt("bristol-va", "Bristol", "VA", 4, 10, bristol),
          ],
        },
      ],
      radiusMiles: 10,
    });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({ id: "bristol-va", label: "Bristol, VA" });
  });

  it("reports provider truncation and partial centers honestly", () => {
    const result = collectCoverageCandidates({
      primary,
      searches: [
        { places: [placeAt("algood", "Algood", "TN", 3, 20)], truncated: true },
        { failed: true },
      ],
      radiusMiles: 10,
    });
    expect(result.truncated).toBe(true);
    expect(result.partial).toBe(true);
    expect(result.failedCenters).toBe(1);
    expect(result.candidates).toHaveLength(1);
  });

  it("bounds the candidate list without silently pretending it is complete", () => {
    const places = Array.from({ length: MAX_COVERAGE_CANDIDATES + 5 }, (_, index) =>
      placeAt(`place-${index}`, `Place ${index}`, "TN", 1 + index * 0.01, 0),
    );
    const result = collectCoverageCandidates({ primary, searches: [{ places }], radiusMiles: 10 });
    expect(result.candidates).toHaveLength(MAX_COVERAGE_CANDIDATES);
    expect(result.truncated).toBe(true);
  });

  it("normalizes only municipality places with finite coordinates", () => {
    expect(normalizeCoveragePlace(placeAt("algood", "Algood", "TN", 3, 20))).toMatchObject({
      name: "Algood",
      state: "TN",
      label: "Algood, TN",
    });
    expect(normalizeCoveragePlace(place("shop", "Shop", "TN", 36, -85, ["restaurant"]))).toBeNull();
    expect(normalizeCoveragePlace({ id: "no-location", displayName: { text: "Nowhere" } })).toBeNull();
    expect(normalizeCoveragePlace(null)).toBeNull();
  });
});

describe("coverage selection contract", () => {
  it("treats an absent selection as a legacy intake and rejects malformed ones", () => {
    expect(parseCoverageSelection(undefined)).toBeNull();
    expect(parseCoverageSelection("")).toBeNull();
    expect(() => parseCoverageSelection("{not json")).toThrow(CoverageContractError);
    expect(() => parseCoverageSelection(JSON.stringify({ status: "maybe" }))).toThrow(
      /confirm/iu,
    );
    expect(() =>
      parseCoverageSelection(JSON.stringify({ status: "confirmed" as const, reference: "x", selectedIds: "nope" })),
    ).toThrow(/confirm/iu);
  });

  it("parses confirmed and primary-city-only selections", () => {
    expect(
      parseCoverageSelection(
        JSON.stringify({ status: "confirmed" as const, reference: "signed", selectedIds: ["a", "a", "b"] }),
      ),
    ).toEqual({ status: "confirmed" as const, reference: "signed", selectedIds: ["a", "b"], reason: "" });
    expect(
      parseCoverageSelection(
        JSON.stringify({ status: "primary_city_only", reason: "something-else" }),
      ),
    ).toEqual({
      status: "primary_city_only",
      reference: "",
      selectedIds: [],
      reason: "provider_failure",
    });
  });

  it("signs opaque references and rejects tampering or a wrong secret", async () => {
    const payload = createCoverageReferencePayload({
      inviteId: "invite-1234567890",
      primary: { name: "Cookeville", state: "TN", country: "US", placeId: "primary-cookeville" },
      radiusSelection: "10",
      radiusMiles: 10,
      candidates: [{ id: "algood", name: "Algood", state: "TN" }],
      truncated: false,
      partial: false,
      issuedAt: 1_700_000_000_000,
    });
    const token = await signCoverageReference(payload, "coverage-secret");
    const verified = await verifyCoverageReference(token, "coverage-secret");
    expect(verified).toMatchObject({ i: "invite-1234567890", pc: "Cookeville, TN" });
    await expect(verifyCoverageReference(token, "wrong-secret")).resolves.toBeNull();
    await expect(verifyCoverageReference(`${token}x`, "coverage-secret")).resolves.toBeNull();
    await expect(verifyCoverageReference("not-a-token", "coverage-secret")).resolves.toBeNull();
    await expect(verifyCoverageReference(token, "")).resolves.toBeNull();
  });

  it("rebuilds confirmed coverage from the signed reference only", () => {
    const reference = createCoverageReferencePayload({
      inviteId: "invite-1234567890",
      primary: { name: "Cookeville", state: "TN", country: "US", placeId: "primary-cookeville" },
      radiusSelection: "10",
      radiusMiles: 10,
      candidates: [
        { id: "algood", name: "Algood", state: "TN" },
        { id: "baxter", name: "Baxter", state: "TN" },
        { id: "monterey", name: "Monterey", state: "TN" },
      ],
      truncated: true,
      partial: true,
      issuedAt: 1_700_000_000_000,
    });
    const derived = deriveCoverageConfirmation({
      selection: { status: "confirmed" as const, reference: "token", selectedIds: ["baxter", "algood"], reason: "" },
      reference,
      primaryCity: "Cookeville, TN",
      serviceRadius: "10",
      coverageAreas: ["Cookeville, TN", "Baxter, TN", "Algood, TN"],
      referenceHash: "abc12345",
    });
    expect(derived.ok).toBe(true);
    if (!derived.ok) return;
    expect(derived.coverageAreas).toEqual(["Cookeville, TN", "Baxter, TN", "Algood, TN"]);
    expect(derived.confirmation).toMatchObject({
      status: "confirmed",
      source: COVERAGE_SOURCE,
      primaryCity: "Cookeville, TN",
      radiusSelection: "10",
      radiusMiles: 10,
      candidateCount: 3,
      selectedCount: 2,
      selectedIds: ["baxter", "algood"],
      truncated: true,
      partial: true,
      referenceHash: "abc12345",
      confirmedAt: 1_700_000_000,
    });

    // Deriving twice returns byte-identical metadata, so submission retries
    // keep the same idempotency hash.
    const again = deriveCoverageConfirmation({
      selection: { status: "confirmed" as const, reference: "token", selectedIds: ["baxter", "algood"], reason: "" },
      reference,
      primaryCity: "Cookeville, TN",
      serviceRadius: "10",
      coverageAreas: ["Cookeville, TN", "Baxter, TN", "Algood, TN"],
      referenceHash: "abc12345",
    });
    expect(JSON.stringify(again)).toBe(JSON.stringify(derived));
  });

  it("rejects stale or mismatched confirmed selections", () => {
    const reference = createCoverageReferencePayload({
      inviteId: "invite-1234567890",
      primary: { name: "Cookeville", state: "TN", country: "US", placeId: "primary-cookeville" },
      radiusSelection: "10",
      radiusMiles: 10,
      candidates: [{ id: "algood", name: "Algood", state: "TN" }],
      truncated: false,
      partial: false,
      issuedAt: 1_700_000_000_000,
    });
    const base: Parameters<typeof deriveCoverageConfirmation>[0] = {
      selection: { status: "confirmed", reference: "token", selectedIds: ["algood"], reason: "" },
      reference,
      primaryCity: "Cookeville, TN",
      serviceRadius: "10",
      coverageAreas: ["Cookeville, TN", "Algood, TN"],
      referenceHash: "abc12345",
    };
    expect(
      deriveCoverageConfirmation({ ...base, primaryCity: "Nashville, TN" }),
    ).toMatchObject({ ok: false, code: "coverage_primary_mismatch" });
    expect(
      deriveCoverageConfirmation({ ...base, serviceRadius: "20" }),
    ).toMatchObject({ ok: false, code: "coverage_radius_mismatch" });
    expect(
      deriveCoverageConfirmation({
        ...base,
        selection: { status: "confirmed" as const, reference: "token", selectedIds: ["invented"], reason: "" },
      }),
    ).toMatchObject({ ok: false, code: "coverage_selection_mismatch" });
    expect(
      deriveCoverageConfirmation({ ...base, coverageAreas: ["Cookeville, TN", "Monterey, TN"] }),
    ).toMatchObject({ ok: false, code: "coverage_selection_mismatch" });
    expect(
      deriveCoverageConfirmation({ ...base, reference: null }),
    ).toMatchObject({ ok: false, code: "coverage_reference_invalid" });
  });

  it("keeps a confirmed primary-city-only fallback and rejects hidden extras", () => {
    const fallback: Parameters<typeof deriveCoverageConfirmation>[0] = {
      selection: {
        status: "primary_city_only",
        reference: "",
        selectedIds: [],
        reason: "provider_failure",
      },
      reference: null,
      primaryCity: "Cookeville, TN",
      serviceRadius: "20",
      coverageAreas: ["Cookeville, TN"],
      referenceHash: "",
    };
    const derived = deriveCoverageConfirmation(fallback);
    expect(derived.ok).toBe(true);
    if (!derived.ok) return;
    expect(derived.coverageAreas).toEqual(["Cookeville, TN"]);
    expect(derived.confirmation).toMatchObject({
      status: "primary_city_only",
      source: COVERAGE_FALLBACK_SOURCE,
      reason: "provider_failure",
      radiusMiles: 20,
    });
    expect(
      deriveCoverageConfirmation({
        ...fallback,
        coverageAreas: ["Cookeville, TN", "Algood, TN"],
      }),
    ).toMatchObject({ ok: false, code: "coverage_selection_mismatch" });
  });

  it("includes the bounded 50+ warning text", () => {
    expect(BOUNDED_50_PLUS_WARNING).toMatch(/bounded 50-mile/u);
  });
});


it("keeps the resolved country fallback in signed primary-city labels without a state", () => {
  const reference = createCoverageReferencePayload({inviteId:"invite-test",primary:{name:"Singapore",state:"",country:"SG",placeId:"singapore"},radiusSelection:"10",radiusMiles:10,candidates:[],truncated:false,partial:false,issuedAt:100000});
  expect(reference.pc).toBe("Singapore, SG");
});

describe('editable additional places', () => {
  it('rejects more than five additional cities including typed entries', () => {
    expect(() => parseCoverageSelection(JSON.stringify({status:'confirmed',reference:'signed',selectedIds:['1','2','3','4','5','6']}))).toThrow();
    expect(() => parseCoverageSelection(JSON.stringify({status:'confirmed',reference:'signed',selectedIds:['1','2','3','4','5'],manualAreas:['Sparta, TN']}))).toThrow();
  });
  it('preserves typed places as client assertions while deriving fetched labels from the signed reference', () => {
    const selection = parseCoverageSelection(JSON.stringify({status:'confirmed',reference:'signed',selectedIds:['algood'],manualAreas:['Sparta, TN']}));
    const reference = createCoverageReferencePayload({inviteId:'test',primary:{name:'Cookeville',state:'TN',country:'US',placeId:'cookeville'},radiusSelection:'10',radiusMiles:10,candidates:[{id:'algood',name:'Algood',state:'TN'}],truncated:false,partial:false,issuedAt:1700000000000});
    const result = deriveCoverageConfirmation({selection:selection!,reference,primaryCity:'Cookeville, TN',serviceRadius:'10',coverageAreas:['Cookeville, TN','Algood, TN','Sparta, TN'],referenceHash:'hash'});
    expect(result.ok).toBe(true);
    if(result.ok) {expect(result.coverageAreas).toEqual(['Cookeville, TN','Algood, TN','Sparta, TN']);expect(result.confirmation).toMatchObject({selectedCount:2,manualAreas:['Sparta, TN'],source:'client_confirmed_mixed_coverage'});}
  });
  it('rejects duplicate manual cities, missing region and control characters', () => {
    for(const manualAreas of [['Sparta'],['Sparta, TN','sparta, tn'],['Sparta, TN\nBaxter, TN']]) expect(()=>parseCoverageSelection(JSON.stringify({status:'confirmed',reference:'signed',selectedIds:[],manualAreas}))).toThrow();
  });
});
