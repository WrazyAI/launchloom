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
});
