import { env } from "cloudflare:workers";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import worker, { type Env } from "../src/index";
import { network } from "./network";

const origin = "https://example-client.pages.dev";
const recipient = "leads@example-client.test";

function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
}

async function signedLeadToken() {
  const encoded = base64url(
    new TextEncoder().encode(
      JSON.stringify({
        project: "example-client",
        recipient,
        allowedOrigins: [origin],
        issuedAt: Date.now(),
      }),
    ),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    // Keep this aligned with the test-only Worker binding in vitest.worker.config.ts.
    new TextEncoder().encode("test-lead-secret"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encoded)),
  );
  return `${encoded}.${base64url(signature)}`;
}

function leadRequest(token: string) {
  return new Request("https://api.launchloom.test/api/lead", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({
      token,
      name: "Taylor Example",
      phone: "555-0100",
      email: "taylor@example.test",
      message: "I would like to ask about a service.",
      qualification: { service: "Repair" },
      "bot-field": "",
      "lead-email": "attacker@example.test",
      pageUrl: `${origin}/contact/`,
    }),
  });
}

function testEnv(overrides: Partial<Env>): Env {
  return Object.assign({}, env, overrides) as Env;
}

describe("generated-site lead email delivery", () => {
  it("sends submissions to the signed client recipient and uses the visitor as reply-to", async () => {
    let providerRequest: Record<string, unknown> | undefined;
    network.use(
      http.post("https://api.resend.com/emails", async ({ request }) => {
        providerRequest = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: "email_test_123" });
      }),
    );

    const response = await worker.fetch(
      leadRequest(await signedLeadToken()),
      testEnv({
        RESEND_API_KEY: "test-resend-key",
        LAUNCHLOOM_FROM_EMAIL: "LaunchLoom <info@example.com>",
      }),
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    expect(providerRequest).toMatchObject({
      to: [recipient],
      reply_to: "taylor@example.test",
      tags: [{ name: "launchloom_kind", value: "client-lead" }],
    });
    expect(providerRequest).not.toMatchObject({ to: ["attacker@example.test"] });
  });

  it("does not acknowledge a lead when the email provider is not configured", async () => {
    let providerCalls = 0;
    network.use(
      http.post("https://api.resend.com/emails", () => {
        providerCalls += 1;
        return HttpResponse.json({ id: "unexpected" });
      }),
    );

    const response = await worker.fetch(
      leadRequest(await signedLeadToken()),
      testEnv({ RESEND_API_KEY: undefined, LAUNCHLOOM_FROM_EMAIL: undefined }),
      {} as ExecutionContext,
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "We could not send your request right now. Please call the business directly.",
    });
    expect(providerCalls).toBe(0);
  });

  it("returns a retryable failure instead of success when Resend rejects the email", async () => {
    network.use(
      http.post("https://api.resend.com/emails", () =>
        HttpResponse.json({ message: "provider unavailable" }, { status: 503 }),
      ),
    );

    const response = await worker.fetch(
      leadRequest(await signedLeadToken()),
      testEnv({
        RESEND_API_KEY: "test-resend-key",
        LAUNCHLOOM_FROM_EMAIL: "LaunchLoom <info@example.com>",
      }),
      {} as ExecutionContext,
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "We could not send your request right now. Please call the business directly.",
    });
  });
});
