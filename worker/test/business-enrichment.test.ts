import { env, SELF } from "cloudflare:test";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { network } from "./network";
import type { OnboardingInvites } from "../src/onboarding-invites";

const inviteOrigin = "https://onboard.example.test";
const inviteNamespace = (env as unknown as {
  ONBOARDING_INVITES: DurableObjectNamespace<OnboardingInvites>;
}).ONBOARDING_INVITES;

function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

async function createInvite(inviteId: string) {
  const claims = { inviteId, expiresAt: Date.now() + 60_000, allowedOrigins: [inviteOrigin] };
  const encoded = base64url(new TextEncoder().encode(JSON.stringify(claims)));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("test-onboarding-invite-secret"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encoded)));
  const token = `${encoded}.${base64url(signature)}`;
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
  const tokenHash = [...bytes].map((part) => part.toString(16).padStart(2, "0")).join("");
  await inviteNamespace.getByName("launchloom-onboarding-invites").register({
    inviteId, clientEmail: null, expiresAt: claims.expiresAt, allowedOrigin: inviteOrigin, tokenHash, now: Date.now(),
  });
  return token;
}

describe("business enrichment", () => {
  it("does not call Google Places without a valid private invite", async () => {
    let placeLookupCalled = false;
    network.use(http.post("https://places.googleapis.com/v1/places:searchText", () => {
      placeLookupCalled = true;
      return HttpResponse.json({ places: [] });
    }));
    const response = await SELF.fetch("https://api.launchloom.test/api/places", {
      method: "POST",
      headers: { Origin: inviteOrigin, "Content-Type": "application/json" },
      body: JSON.stringify({ query: "Harbor Plumbing Tacoma" }),
    });
    expect(response.status).toBe(403);
    expect(placeLookupCalled).toBe(false);
  });

  it("returns Google category and coordinates with the Places-prefilled facts", async () => {
    const inviteToken = await createInvite("invite-place-lookup-001");
    let fieldMask = "";
    network.use(
      http.post("https://places.googleapis.com/v1/places:searchText", ({ request }) => {
        fieldMask = request.headers.get("X-Goog-FieldMask") || "";
        return HttpResponse.json({
          places: [{
            id: "place-123",
            displayName: { text: "Harbor Plumbing" },
            formattedAddress: "1 Main Street, Tacoma, WA",
            primaryType: "plumber",
            types: ["plumber", "home_goods_store"],
            location: { latitude: 47.2529, longitude: -122.4443 },
          }],
        });
      }),
    );

    const response = await SELF.fetch("https://api.launchloom.test/api/places", {
      method: "POST",
      headers: { Origin: inviteOrigin, "Content-Type": "application/json" },
      body: JSON.stringify({ query: "Harbor Plumbing Tacoma", inviteToken }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      place: {
        primaryType: "plumber",
        types: ["plumber", "home_goods_store"],
        location: { latitude: 47.2529, longitude: -122.4443 },
      },
    });
    expect(fieldMask).toContain("places.primaryType");
    expect(fieldMask).toContain("places.location");
  });

  it("returns suggestions separately so intake normalization only confirms checked services", async () => {
    const inviteToken = await createInvite("invite-services-001");
    let modelPrompt = "";
    network.use(http.post("https://openrouter.ai/api/v1/chat/completions", async ({ request }) => {
      const body = await request.json() as { messages?: Array<{ content?: string }> };
      modelPrompt = body.messages?.[1]?.content || "";
      return HttpResponse.json({ choices: [{ message: { content: JSON.stringify({ services: ["Drain cleaning", "Septic pumping", "Water heater repair"] }) } }] });
    }));
    const response = await SELF.fetch("https://api.launchloom.test/api/service-suggestions", {
      method: "POST",
      headers: { Origin: inviteOrigin, "Content-Type": "application/json" },
      body: JSON.stringify({ inviteToken, businessName: "Harbor Plumbing", primaryType: "plumber", placeTypes: ["plumber"] }),
    });

    expect(response.status).toBe(200);
    expect(modelPrompt).toContain("plumber");
    await expect(response.json()).resolves.toMatchObject({
      suggestions: ["Drain cleaning", "Septic pumping", "Water heater repair"],
      provenance: "model_suggestion_unconfirmed",
    });
  });

  it("proxies US street-address autocomplete for an invited client", async () => {
    const inviteToken = await createInvite("invite-place-autocomplete-001");
    let requestBody: Record<string, unknown> = {};
    network.use(
      http.post(
        "https://places.googleapis.com/v1/places:autocomplete",
        async ({ request }) => {
          requestBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({
            suggestions: [
              {
                placePrediction: {
                  placeId: "place-street-1",
                  text: { text: "812 Meeting St, Charleston, SC 29403, USA" },
                  structuredFormat: {
                    mainText: { text: "812 Meeting St" },
                    secondaryText: { text: "Charleston, SC 29403, USA" },
                  },
                  types: ["street_address"],
                },
              },
              { placePrediction: { placeId: "", text: { text: "incomplete" } } },
            ],
          });
        },
      ),
    );
    const response = await SELF.fetch(
      "https://api.launchloom.test/api/places",
      {
        method: "POST",
        headers: { Origin: inviteOrigin, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "autocomplete",
          query: "812 Meeting St",
          state: "SC",
          inviteToken,
        }),
      },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      suggestions: [
        {
          placeId: "place-street-1",
          main: "812 Meeting St",
          secondary: "Charleston, SC 29403, USA",
          description: "812 Meeting St, Charleston, SC 29403, USA",
        },
      ],
    });
    expect(String(requestBody.input)).toBe("812 Meeting St, SC");
    expect(requestBody.includedRegionCodes).toEqual(["us"]);
  });

  it("resolves a selected suggestion into address, city, and state", async () => {
    const inviteToken = await createInvite("invite-place-resolve-001");
    network.use(
      http.get(
        "https://places.googleapis.com/v1/places/place-street-1",
        () =>
          HttpResponse.json({
            id: "place-street-1",
            formattedAddress: "812 Meeting St, Charleston, SC 29403, USA",
            addressComponents: [
              { shortText: "812", longText: "812", types: ["street_number"] },
              { shortText: "Meeting St", longText: "Meeting Street", types: ["route"] },
              { shortText: "Charleston", longText: "Charleston", types: ["locality"] },
              { shortText: "SC", longText: "South Carolina", types: ["administrative_area_level_1"] },
              { shortText: "29403", longText: "29403", types: ["postal_code"] },
              { shortText: "US", longText: "United States", types: ["country"] },
            ],
            location: { latitude: 32.79, longitude: -79.94 },
          }),
      ),
    );
    const response = await SELF.fetch(
      "https://api.launchloom.test/api/places",
      {
        method: "POST",
        headers: { Origin: inviteOrigin, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "resolve",
          placeId: "place-street-1",
          inviteToken,
        }),
      },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      place: {
        address: "812 Meeting St, Charleston, SC 29403, USA",
        city: "Charleston",
        state: "SC",
        postalCode: "29403",
        country: "US",
      },
    });
  });

  it("does not call Google for short queries or invalid place ids", async () => {
    const inviteToken = await createInvite("invite-place-guards-001");
    let calls = 0;
    network.use(
      http.post(
        "https://places.googleapis.com/v1/places:autocomplete",
        () => {
          calls += 1;
          return HttpResponse.json({});
        },
      ),
    );
    const short = await SELF.fetch("https://api.launchloom.test/api/places", {
      method: "POST",
      headers: { Origin: inviteOrigin, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "autocomplete", query: "12", inviteToken }),
    });
    expect(short.status).toBe(200);
    await expect(short.json()).resolves.toEqual({ suggestions: [] });
    const invalid = await SELF.fetch(
      "https://api.launchloom.test/api/places",
      {
        method: "POST",
        headers: { Origin: inviteOrigin, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve", placeId: "x", inviteToken }),
      },
    );
    expect(invalid.status).toBe(400);
    expect(calls).toBe(0);
  });
});
