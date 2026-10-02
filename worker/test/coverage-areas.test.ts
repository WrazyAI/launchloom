import { env, SELF } from "cloudflare:test";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { network } from "./network";
import type { OnboardingInvites } from "../src/onboarding-invites";
import { resetCoverageLookupRateLimit } from "../src/coverage-areas";
import {
  BOUNDED_50_PLUS_WARNING,
  PARTIAL_WARNING,
  TRUNCATED_WARNING,
  destinationPoint,
  verifyCoverageReference,
} from "../../src/lib/coverage-contract.mjs";

const onboardingOrigin = "https://onboard.example.test";
const inviteNamespace = (env as unknown as {
  ONBOARDING_INVITES: DurableObjectNamespace<OnboardingInvites>;
}).ONBOARDING_INVITES;
const COOKEVILLE = { latitude: 36.1628, longitude: -85.5016 };
const METERS_PER_MILE = 1609.344;

function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
}

async function createInvite(inviteId: string, clientEmail: string | null = null) {
  const claims = {
    inviteId,
    ...(clientEmail ? { clientEmail } : {}),
    expiresAt: Date.now() + 30 * 60_000,
    allowedOrigins: [onboardingOrigin],
  };
  const encoded = base64url(new TextEncoder().encode(JSON.stringify(claims)));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("test-onboarding-invite-secret"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encoded)),
  );
  const token = `${encoded}.${base64url(signature)}`;
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
  );
  const tokenHash = [...bytes].map((part) => part.toString(16).padStart(2, "0")).join("");
  await inviteNamespace.getByName("launchloom-onboarding-invites").register({
    inviteId,
    clientEmail,
    expiresAt: claims.expiresAt,
    allowedOrigin: onboardingOrigin,
    tokenHash,
    now: Date.now(),
  });
  return token;
}

function lookup(inviteToken: string | null, primaryCity: string, serviceRadius: string) {
  return SELF.fetch("https://api.launchloom.test/api/coverage-areas", {
    method: "POST",
    headers: { Origin: onboardingOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ inviteToken, primaryCity, serviceRadius }),
  });
}

function geocodePayload({
  city,
  state,
  latitude,
  longitude,
  placeId,
  status = "OK",
  partial = false,
}: {
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  placeId: string;
  status?: string;
  partial?: boolean;
}) {
  return {
    status,
    results: [
      {
        place_id: placeId,
        partial_match: partial,
        types: ["locality", "political"],
        address_components: [
          { short_name: city, long_name: city, types: ["locality", "political"] },
          {
            short_name: state,
            long_name: state,
            types: ["administrative_area_level_1", "political"],
          },
          { short_name: "US", long_name: "United States", types: ["country", "political"] },
        ],
        geometry: { location: { lat: latitude, lng: longitude } },
      },
    ],
  };
}

function nearbyPlace(
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

function nearbyPlaceAt(id: string, name: string, state: string, miles: number, bearing: number) {
  const point = destinationPoint(COOKEVILLE, miles * METERS_PER_MILE, bearing);
  return nearbyPlace(id, name, state, point.latitude, point.longitude);
}

const cookevilleGeocode = () =>
  geocodePayload({
    city: "Cookeville",
    state: "TN",
    latitude: COOKEVILLE.latitude,
    longitude: COOKEVILLE.longitude,
    placeId: "primary-cookeville",
  });

function mockGeocoding(payload: Record<string, unknown>) {
  return http.get("https://maps.googleapis.com/maps/api/geocode/json", () =>
    HttpResponse.json(payload),
  );
}

function mockNearby(
  handler: (body: any, call: number) => Response,
) {
  let call = 0;
  return http.post("https://places.googleapis.com/v1/places:searchNearby", async ({ request }) => {
    const current = (call += 1);
    return handler(await request.json(), current);
  });
}

const algood = nearbyPlace("algood-place", "Algood", "TN", 36.1959, -85.4486);
const baxter = nearbyPlace("baxter-place", "Baxter", "TN", 36.1537, -85.6436);
const monterey = nearbyPlace("monterey-place", "Monterey", "TN", 36.1473, -85.2683);
// An in-radius nearby city the client can deselect during review.
const livingston = nearbyPlaceAt("livingston-place", "Livingston", "TN", 5.5, 120);
const primaryPlace = nearbyPlace(
  "primary-cookeville",
  "Cookeville",
  "TN",
  COOKEVILLE.latitude,
  COOKEVILLE.longitude,
);

async function lookupConfirmedCoverage(inviteToken: string) {
  const response = await lookup(inviteToken, "Cookeville, TN", "10");
  expect(response.status).toBe(200);
  return (await response.json()) as {
    ok: true;
    primary: { label: string };
    candidates: Array<{ id: string; label: string }>;
    reference: string;
  };
}

describe("coverage lookup endpoint", () => {
  it("rejects invalid invitations without calling the map provider", async () => {
    resetCoverageLookupRateLimit();
    let providerCalled = false;
    network.use(
      mockGeocoding(cookevilleGeocode()),
      mockNearby(() => {
        providerCalled = true;
        return HttpResponse.json({ places: [] });
      }),
    );
    const response = await lookup(null, "Cookeville, TN", "10");
    expect(response.status).toBe(403);
    expect(providerCalled).toBe(false);
  });

  it("resolves the primary city and returns in-radius municipalities with a signed reference", async () => {
    resetCoverageLookupRateLimit();
    const inviteToken = await createInvite("invite-coverage-lookup-001");
    let requestBody: any = null;
    network.use(
      mockGeocoding(cookevilleGeocode()),
      mockNearby((body) => {
        requestBody = body;
        return HttpResponse.json({
          places: [primaryPlace, algood, baxter, monterey, algood],
        });
      }),
    );

    const response = await lookup(inviteToken, "Cookeville, TN", "10");
    expect(response.status).toBe(200);
    const payload = (await response.json()) as any;
    expect(payload).toMatchObject({
      ok: true,
      primary: { label: "Cookeville, TN" },
      radius: { selection: "10", miles: 10, label: "10 miles" },
      source: "google_places_locality",
      truncated: false,
      partial: false,
      warnings: [],
    });
    expect(payload.candidates.map((candidate: any) => candidate.label)).toEqual([
      "Algood, TN",
      "Baxter, TN",
    ]);
    expect(payload.candidates[0].distanceMiles).toBeGreaterThan(2);
    expect(payload.candidates[0].distanceMiles).toBeLessThan(5);
    expect(requestBody).toMatchObject({
      includedTypes: ["locality"],
      maxResultCount: 20,
      rankPreference: "DISTANCE",
      locationRestriction: {
        circle: {
          center: { latitude: COOKEVILLE.latitude, longitude: COOKEVILLE.longitude },
        },
      },
    });
    expect(requestBody.locationRestriction.circle.radius).toBeCloseTo(10 * METERS_PER_MILE, 3);

    const reference = await verifyCoverageReference(
      payload.reference,
      "test-onboarding-invite-secret",
    );
    expect(reference).toMatchObject({
      i: "invite-coverage-lookup-001",
      pc: "Cookeville, TN",
      r: 10,
      rs: "10",
      s: "google_places_locality",
    });
    expect(reference?.n.map((entry: any) => entry[0])).toEqual([
      "algood-place",
      "baxter-place",
    ]);
  });

  it("returns an explicit ambiguous code for same-name cities instead of guessing", async () => {
    resetCoverageLookupRateLimit();
    const inviteToken = await createInvite("invite-coverage-ambiguous-001");
    let searchCalled = false;
    network.use(
      http.get("https://maps.googleapis.com/maps/api/geocode/json", () =>
        HttpResponse.json({
          status: "OK",
          results: [
            {
              place_id: "springfield-il",
              types: ["locality", "political"],
              address_components: [
                { short_name: "Springfield", long_name: "Springfield", types: ["locality"] },
                { short_name: "IL", long_name: "Illinois", types: ["administrative_area_level_1"] },
                { short_name: "US", long_name: "United States", types: ["country"] },
              ],
              geometry: { location: { lat: 39.7817, lng: -89.6501 } },
            },
            {
              place_id: "springfield-mo",
              types: ["locality", "political"],
              address_components: [
                { short_name: "Springfield", long_name: "Springfield", types: ["locality"] },
                { short_name: "MO", long_name: "Missouri", types: ["administrative_area_level_1"] },
                { short_name: "US", long_name: "United States", types: ["country"] },
              ],
              geometry: { location: { lat: 37.2089, lng: -93.2923 } },
            },
          ],
        }),
      ),
      mockNearby(() => {
        searchCalled = true;
        return HttpResponse.json({ places: [] });
      }),
    );

    const response = await lookup(inviteToken, "Springfield", "10");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "ambiguous_city",
      retryable: true,
    });
    expect(searchCalled).toBe(false);

    // An explicit state resolves the same query.
    network.use(mockGeocoding(geocodePayload({
      city: "Springfield",
      state: "MO",
      latitude: 37.2089,
      longitude: -93.2923,
      placeId: "springfield-mo",
    })));
    const resolved = await lookup(inviteToken, "Springfield, MO", "10");
    await expect(resolved.json()).resolves.toMatchObject({
      ok: true,
      primary: { label: "Springfield, MO" },
    });
  });

  it("covers the bounded 50-mile disc with satellite searches and reports the interpretation", async () => {
    resetCoverageLookupRateLimit();
    const inviteToken = await createInvite("invite-coverage-wide-001");
    const inRange = nearbyPlaceAt("clarksville-place", "Clarksville", "TN", 45, 300);
    const outOfRange = nearbyPlaceAt("faraway-place", "Faraway", "TN", 55, 300);
    const searchBodies: any[] = [];
    network.use(
      mockGeocoding(cookevilleGeocode()),
      mockNearby((body) => {
        searchBodies.push(body);
        return HttpResponse.json({ places: [algood, inRange, outOfRange] });
      }),
    );

    const response = await lookup(inviteToken, "Cookeville, TN", "50+");
    expect(response.status).toBe(200);
    const payload = (await response.json()) as any;
    expect(payload.ok).toBe(true);
    expect(payload.radius).toMatchObject({ selection: "50+", miles: 50 });
    expect(payload.warnings).toContain(BOUNDED_50_PLUS_WARNING);
    expect(payload.candidates.map((candidate: any) => candidate.id)).toEqual([
      "algood-place",
      "clarksville-place",
    ]);
    expect(searchBodies).toHaveLength(9);
    expect(searchBodies.every((body) => body.locationRestriction.circle.radius === 50_000)).toBe(true);
  });

  it("reports provider truncation honestly", async () => {
    resetCoverageLookupRateLimit();
    const inviteToken = await createInvite("invite-coverage-truncated-001");
    const manyPlaces = Array.from({ length: 20 }, (_, index) =>
      nearbyPlaceAt(`place-${index}`, `Place ${index}`, "TN", 1 + index * 0.2, 0),
    );
    network.use(
      mockGeocoding(cookevilleGeocode()),
      mockNearby(() => HttpResponse.json({ places: manyPlaces })),
    );
    const truncated = (await (await lookup(inviteToken, "Cookeville, TN", "10")).json()) as any;
    expect(truncated.ok).toBe(true);
    expect(truncated.truncated).toBe(true);
    expect(truncated.warnings).toContain(TRUNCATED_WARNING);
  });

  it("reports partial central failures honestly", async () => {
    resetCoverageLookupRateLimit();
    const inviteToken = await createInvite("invite-coverage-partial-001");
    network.use(
      mockGeocoding(cookevilleGeocode()),
      mockNearby((_body, call) =>
        call === 2
          ? new HttpResponse(null, { status: 500 })
          : HttpResponse.json({ places: [algood] }),
      ),
    );
    const partial = (await (await lookup(inviteToken, "Cookeville, TN", "50")).json()) as any;
    expect(partial.ok).toBe(true);
    expect(partial.partial).toBe(true);
    expect(partial.truncated).toBe(false);
    expect(partial.warnings).toContain(PARTIAL_WARNING);
  });

  it("fails visibly when every provider search fails", async () => {
    resetCoverageLookupRateLimit();
    const inviteToken = await createInvite("invite-coverage-failure-001");
    network.use(
      mockGeocoding(cookevilleGeocode()),
      mockNearby(() => new HttpResponse(null, { status: 500 })),
    );
    const response = await lookup(inviteToken, "Cookeville, TN", "10");
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "provider_failure",
      retryable: true,
      primary: { label: "Cookeville, TN" },
    });
  });

  it("rejects unsupported radii before calling the provider", async () => {
    resetCoverageLookupRateLimit();
    const inviteToken = await createInvite("invite-coverage-radius-001");
    let providerCalled = false;
    network.use(
      mockGeocoding(cookevilleGeocode()),
      mockNearby(() => {
        providerCalled = true;
        return HttpResponse.json({ places: [] });
      }),
    );
    const response = await lookup(inviteToken, "Cookeville, TN", "25");
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ ok: false, code: "unsupported_radius" });
    expect(providerCalled).toBe(false);
  });

  it("does not consume the invitation", async () => {
    resetCoverageLookupRateLimit();
    const inviteToken = await createInvite("invite-coverage-unconsumed-001");
    network.use(
      mockGeocoding(cookevilleGeocode()),
      mockNearby(() => HttpResponse.json({ places: [algood] })),
    );
    await lookupConfirmedCoverage(inviteToken);
    const validation = await SELF.fetch(
      "https://api.launchloom.test/api/onboarding-invites/validate",
      {
        method: "POST",
        headers: { Origin: onboardingOrigin, "Content-Type": "application/json" },
        body: JSON.stringify({ token: inviteToken }),
      },
    );
    await expect(validation.json()).resolves.toMatchObject({ valid: true });
  });

  it("rate limits repeated lookups for one invitation", async () => {
    resetCoverageLookupRateLimit();
    const inviteToken = await createInvite("invite-coverage-rate-limit-001");
    network.use(
      mockGeocoding(cookevilleGeocode()),
      mockNearby(() => HttpResponse.json({ places: [] })),
    );
    let lastStatus = 0;
    for (let attempt = 0; attempt < 41; attempt += 1) {
      const response = await lookup(inviteToken, "Cookeville, TN", "10");
      lastStatus = response.status;
      if (attempt < 40) expect(response.status).toBe(200);
    }
    expect(lastStatus).toBe(429);
  });
});

describe("confirmed coverage intake persistence", () => {
  function intakePayload(
    inviteToken: string,
    overrides: Record<string, unknown> = {},
  ) {
    return {
      intakeVersion: "2",
      inviteToken,
      submissionId: `submission-coverage-${Math.random().toString(36).slice(2, 10)}`,
      businessName: "Cumberland Plumbing",
      contactName: "Sam Owner",
      email: "sam@example.test",
      phone: "555-0100",
      address: "1 Main Street, Cookeville, TN",
      industry: "home-services",
      services: ["Drain cleaning", "Water heater repair"],
      primaryCity: "Cookeville, TN",
      serviceAreas: "Cookeville, TN",
      serviceRadius: "10",
      coverageAreas: "Cookeville, TN\nAlgood, TN\nBaxter, TN",
      coverageSelection: JSON.stringify({
        status: "confirmed",
        reference: "",
        selectedIds: ["algood-place", "baxter-place"],
      }),
      differentiators: "Clear communication",
      primaryCta: "Request a quote",
      confirmAccuracy: "yes",
      leadEmail: "leads@example.test",
      ...overrides,
    };
  }

  function mockIntakeDelivery() {
    let issueBody = "";
    let issueCreates = 0;
    let dispatches = 0;
    network.use(
      http.get("https://api.github.com/repos/WrazyAI/launchloom/issues", () =>
        HttpResponse.json([]),
      ),
      http.post("https://api.github.com/repos/WrazyAI/launchloom/issues", async ({ request }) => {
        issueCreates += 1;
        issueBody = ((await request.json()) as { body?: string }).body || "";
        return HttpResponse.json({ number: 4242 }, { status: 201 });
      }),
      http.post("https://api.github.com/repos/WrazyAI/launchloom/dispatches", () => {
        dispatches += 1;
        return new HttpResponse(null, { status: 204 });
      }),
      http.post("https://api.resend.com/emails", () =>
        HttpResponse.json({ id: "email-coverage-receipt" }),
      ),
    );
    return {
      persistedIssue: () => {
        const match = issueBody.match(/```json\s*([\s\S]*?)\s*```/u);
        if (!match) throw new Error("No persisted intake JSON found.");
        return JSON.parse(match[1]) as Record<string, any>;
      },
      issueCreates: () => issueCreates,
      dispatches: () => dispatches,
    };
  }

  function submit(payload: Record<string, unknown>) {
    return SELF.fetch("https://api.launchloom.test/api/intake", {
      method: "POST",
      headers: { Origin: onboardingOrigin, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  it("persists exactly the confirmed cities and none of the excluded ones", async () => {
    resetCoverageLookupRateLimit();
    const inviteToken = await createInvite("invite-coverage-persist-001", "sam@example.test");
    network.use(
      mockGeocoding(cookevilleGeocode()),
      mockNearby(() => HttpResponse.json({ places: [algood, baxter, livingston, monterey] })),
    );
    const lookupPayload = await lookupConfirmedCoverage(inviteToken);
    expect(lookupPayload.candidates.map((candidate) => candidate.id)).toEqual([
      "algood-place",
      "livingston-place",
      "baxter-place",
    ]);

    const delivery = mockIntakeDelivery();
    const payload = intakePayload(inviteToken, {
      submissionId: "submission-coverage-persist-001",
      coverageAreas: "Cookeville, TN\nAlgood, TN\nBaxter, TN",
      coverageSelection: JSON.stringify({
        status: "confirmed",
        reference: lookupPayload.reference,
        selectedIds: ["algood-place", "baxter-place"],
      }),
    });
    const accepted = await submit(payload);
    expect(accepted.status).toBe(200);
    await expect(accepted.json()).resolves.toMatchObject({ ok: true, issue: 4242 });
    expect(delivery.issueCreates()).toBe(1);
    expect(delivery.dispatches()).toBe(1);

    const persisted = delivery.persistedIssue();
    expect(persisted.primaryCity).toBe("Cookeville, TN");
    expect(persisted.coverageAreas).toEqual(["Cookeville, TN", "Algood, TN", "Baxter, TN"]);
    expect(persisted.coverageConfirmation).toMatchObject({
      status: "confirmed",
      source: "google_places_locality",
      primaryCity: "Cookeville, TN",
      radiusSelection: "10",
      radiusMiles: 10,
      candidateCount: 3,
      selectedCount: 2,
      selectedIds: ["algood-place", "baxter-place"],
      truncated: false,
      partial: false,
    });
    expect(typeof persisted.coverageConfirmation.referenceHash).toBe("string");
    expect(persisted.coverageConfirmation.referenceHash).toHaveLength(16);
    // Excluded cities and the raw signed reference never reach the issue.
    expect(delivery.persistedIssue().coverageAreas).not.toContain("Livingston, TN");
    expect(JSON.stringify(persisted)).not.toContain("livingston-place");
    expect(persisted.coverageSelection).toBeUndefined();
  });

  it("rejects stale references whose primary city or radius changed", async () => {
    resetCoverageLookupRateLimit();
    const inviteToken = await createInvite("invite-coverage-stale-001");
    network.use(
      mockGeocoding(cookevilleGeocode()),
      mockNearby(() => HttpResponse.json({ places: [algood] })),
    );
    const lookupPayload = await lookupConfirmedCoverage(inviteToken);
    const delivery = mockIntakeDelivery();

    const changedCity = await submit(
      intakePayload(inviteToken, {
        primaryCity: "Nashville, TN",
        serviceAreas: "Nashville, TN",
        coverageAreas: "Nashville, TN\nAlgood, TN",
        coverageSelection: JSON.stringify({
          status: "confirmed",
          reference: lookupPayload.reference,
          selectedIds: ["algood-place"],
        }),
      }),
    );
    expect(changedCity.status).toBe(400);
    await expect(changedCity.json()).resolves.toMatchObject({ code: "coverage_primary_mismatch" });

    const changedRadius = await submit(
      intakePayload(inviteToken, {
        serviceRadius: "30",
        coverageAreas: "Cookeville, TN\nAlgood, TN",
        coverageSelection: JSON.stringify({
          status: "confirmed",
          reference: lookupPayload.reference,
          selectedIds: ["algood-place"],
        }),
      }),
    );
    expect(changedRadius.status).toBe(400);
    await expect(changedRadius.json()).resolves.toMatchObject({ code: "coverage_radius_mismatch" });
    expect(delivery.issueCreates()).toBe(0);
  });

  it("rejects invented or mislabelled city selections", async () => {
    resetCoverageLookupRateLimit();
    const inviteToken = await createInvite("invite-coverage-tamper-001");
    network.use(
      mockGeocoding(cookevilleGeocode()),
      mockNearby(() => HttpResponse.json({ places: [algood, baxter] })),
    );
    const lookupPayload = await lookupConfirmedCoverage(inviteToken);
    const delivery = mockIntakeDelivery();

    const invented = await submit(
      intakePayload(inviteToken, {
        coverageAreas: "Cookeville, TN\nNashville, TN",
        coverageSelection: JSON.stringify({
          status: "confirmed",
          reference: lookupPayload.reference,
          selectedIds: ["nashville-place"],
        }),
      }),
    );
    expect(invented.status).toBe(400);
    await expect(invented.json()).resolves.toMatchObject({ code: "coverage_selection_mismatch" });

    const relabelled = await submit(
      intakePayload(inviteToken, {
        coverageAreas: "Cookeville, TN\nNashville, TN",
        coverageSelection: JSON.stringify({
          status: "confirmed",
          reference: lookupPayload.reference,
          selectedIds: ["baxter-place"],
        }),
      }),
    );
    expect(relabelled.status).toBe(400);
    await expect(relabelled.json()).resolves.toMatchObject({ code: "coverage_selection_mismatch" });
    expect(delivery.issueCreates()).toBe(0);
  });

  it("accepts older v2 intakes as explicitly unconfirmed primary-city-only coverage", async () => {
    resetCoverageLookupRateLimit();
    const inviteToken = await createInvite("invite-coverage-legacy-001");
    const delivery = mockIntakeDelivery();
    const payload = intakePayload(inviteToken);
    delete (payload as Record<string, unknown>).coverageSelection;
    delete (payload as Record<string, unknown>).coverageAreas;
    delete (payload as Record<string, unknown>).primaryCity;

    const accepted = await submit(payload);
    expect(accepted.status).toBe(200);
    const persisted = delivery.persistedIssue();
    expect(persisted.coverageAreas).toEqual(["Cookeville, TN"]);
    expect(persisted.coverageConfirmation).toMatchObject({
      status: "legacy_unconfirmed",
      source: "unavailable",
      selectedCount: 0,
    });
  });

  it("accepts an explicitly confirmed primary-city-only fallback", async () => {
    resetCoverageLookupRateLimit();
    const inviteToken = await createInvite("invite-coverage-fallback-001");
    const delivery = mockIntakeDelivery();
    const accepted = await submit(
      intakePayload(inviteToken, {
        coverageAreas: "Cookeville, TN",
        coverageSelection: JSON.stringify({
          status: "primary_city_only",
          reason: "provider_failure",
        }),
      }),
    );
    expect(accepted.status).toBe(200);
    expect(delivery.persistedIssue().coverageConfirmation).toMatchObject({
      status: "primary_city_only",
      source: "client_confirmed_primary_city_only",
      reason: "provider_failure",
      selectedCount: 0,
    });
  });

  it("keeps retry idempotency for a confirmed coverage submission", async () => {
    resetCoverageLookupRateLimit();
    const inviteToken = await createInvite("invite-coverage-retry-001", "sam@example.test");
    network.use(
      mockGeocoding(cookevilleGeocode()),
      mockNearby(() => HttpResponse.json({ places: [algood, baxter] })),
    );
    const lookupPayload = await lookupConfirmedCoverage(inviteToken);
    const delivery = mockIntakeDelivery();
    const payload = intakePayload(inviteToken, {
      submissionId: "submission-coverage-retry-001",
      coverageAreas: "Cookeville, TN\nAlgood, TN\nBaxter, TN",
      coverageSelection: JSON.stringify({
        status: "confirmed",
        reference: lookupPayload.reference,
        selectedIds: ["algood-place", "baxter-place"],
      }),
    });

    const first = await submit(payload);
    expect(first.status).toBe(200);
    const second = await submit(payload);
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toMatchObject({ ok: true, duplicate: true, issue: 4242 });
    expect(delivery.issueCreates()).toBe(1);
    expect(delivery.dispatches()).toBe(1);
  });
});
