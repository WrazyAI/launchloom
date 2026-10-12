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

async function signedLeadToken(extra = {}) {
  const encoded = base64url(
    new TextEncoder().encode(
      JSON.stringify({
        project: "example-client",
        recipient,
        allowedOrigins: [origin],
        issuedAt: Date.now(),
        ...extra,
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

function leadRequest(
  token: string,
  overrides: Record<string, unknown> = {},
  clientIp = "192.0.2.1",
) {
  return new Request("https://api.launchloom.test/api/lead", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      "CF-Connecting-IP": clientIp,
    },
    body: JSON.stringify({
      token,
      name: "Taylor Example",
      phone: "555-0100",
      email: "taylor@example.test",
      message: "I would like to ask about a service.",
      qualification: { service: "Repair" },
      consent: "By submitting, you agree to be contacted about your request.",
      "bot-field": "",
      "lead-email": "attacker@example.test",
      pageUrl: `${origin}/contact/`,
      ...overrides,
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
    expect(String(providerRequest?.text)).toContain(
      "Consent shown at submission: By submitting, you agree to be contacted about your request.",
    );
    expect(String(providerRequest?.text)).toContain("NEW WEBSITE ENQUIRY");
    expect(providerRequest).not.toMatchObject({ to: ["attacker@example.test"] });
  });

  it("sends the visitor a confirmation when the token enables it", async () => {
    const providerRequests: Array<Record<string, unknown>> = [];
    network.use(
      http.post("https://api.resend.com/emails", async ({ request }) => {
        providerRequests.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({ id: `email_test_${providerRequests.length}` });
      }),
    );

    const response = await worker.fetch(
      leadRequest(
        await signedLeadToken({
          confirmVisitor: true,
          businessPhone: "(555) 555-0199",
        }),
      ),
      testEnv({
        RESEND_API_KEY: "test-resend-key",
        LAUNCHLOOM_FROM_EMAIL: "LaunchLoom <info@example.com>",
      }),
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    expect(providerRequests).toHaveLength(2);
    expect(providerRequests[0]).toMatchObject({
      to: [recipient],
      tags: [{ name: "launchloom_kind", value: "client-lead" }],
    });
    expect(providerRequests[1]).toMatchObject({
      to: ["taylor@example.test"],
      reply_to: recipient,
      tags: [{ name: "launchloom_kind", value: "lead-confirmation" }],
    });
    expect(String(providerRequests[1].text)).toContain("REQUEST RECEIVED");
    expect(String(providerRequests[1].text)).toContain("(555) 555-0199");
  });

  it("delivers the client notification even when the visitor confirmation fails", async () => {
    let calls = 0;
    network.use(
      http.post("https://api.resend.com/emails", async ({ request }) => {
        const body = (await request.json()) as {
          tags?: Array<{ value?: string }>;
        };
        calls += 1;
        if (body.tags?.[0]?.value === "lead-confirmation")
          return HttpResponse.json({ message: "provider unavailable" }, { status: 503 });
        return HttpResponse.json({ id: "email_test_123" });
      }),
    );

    const response = await worker.fetch(
      leadRequest(await signedLeadToken({ confirmVisitor: true })),
      testEnv({
        RESEND_API_KEY: "test-resend-key",
        LAUNCHLOOM_FROM_EMAIL: "LaunchLoom <info@example.com>",
      }),
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    expect(calls).toBe(2);
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

  it("rate limits repeated lead submissions from the same visitor IP after 10 requests", async () => {
    let providerCalls = 0;
    network.use(
      http.post("https://api.resend.com/emails", () => {
        providerCalls += 1;
        return HttpResponse.json({ id: "resend-msg-ok" });
      }),
    );

    const token = await signedLeadToken({ project: "rate-limit-visitor-client" });
    const envWithResend = testEnv({
      RESEND_API_KEY: "test-resend-key",
      LAUNCHLOOM_FROM_EMAIL: "LaunchLoom <info@example.com>",
    });

    for (let i = 0; i < 10; i += 1) {
      const response = await worker.fetch(
        leadRequest(token, {}, "203.0.113.1"),
        envWithResend,
        {} as ExecutionContext,
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
    }
    expect(providerCalls).toBe(10);

    const blocked = await worker.fetch(
      leadRequest(token, {}, "203.0.113.1"),
      envWithResend,
      {} as ExecutionContext,
    );
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toMatch(/^\d+$/);
    expect(await blocked.json()).toEqual({
      error: "Too many requests from your connection. Please try again later or call the business directly.",
    });
    expect(providerCalls).toBe(10);
  });

  it("enforces project-wide hourly ceiling of 50 leads across different visitor IPs", async () => {
    let providerCalls = 0;
    network.use(
      http.post("https://api.resend.com/emails", () => {
        providerCalls += 1;
        return HttpResponse.json({ id: "resend-msg-ok" });
      }),
    );

    const token = await signedLeadToken({ project: "rate-limit-project-client" });
    const envWithResend = testEnv({
      RESEND_API_KEY: "test-resend-key",
      LAUNCHLOOM_FROM_EMAIL: "LaunchLoom <info@example.com>",
    });

    for (let i = 0; i < 50; i += 1) {
      const response = await worker.fetch(
        leadRequest(token, {}, `198.51.100.${i % 250}`),
        envWithResend,
        {} as ExecutionContext,
      );
      expect(response.status).toBe(200);
    }
    expect(providerCalls).toBe(50);

    const blocked = await worker.fetch(
      leadRequest(token, {}, "198.51.100.254"),
      envWithResend,
      {} as ExecutionContext,
    );
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toMatch(/^\d+$/);
    expect(await blocked.json()).toEqual({
      error: "Too many requests from your connection. Please try again later or call the business directly.",
    });
    expect(providerCalls).toBe(50);
  });

  it("does not consume rate limit quota when honeypot bot-field is filled", async () => {
    let providerCalls = 0;
    network.use(
      http.post("https://api.resend.com/emails", () => {
        providerCalls += 1;
        return HttpResponse.json({ id: "resend-msg-ok" });
      }),
    );

    const token = await signedLeadToken({ project: "rate-limit-honeypot-client" });
    const envWithResend = testEnv({
      RESEND_API_KEY: "test-resend-key",
      LAUNCHLOOM_FROM_EMAIL: "LaunchLoom <info@example.com>",
    });

    for (let i = 0; i < 15; i += 1) {
      const botResponse = await worker.fetch(
        leadRequest(token, { "bot-field": "i-am-a-bot" }, "203.0.113.99"),
        envWithResend,
        {} as ExecutionContext,
      );
      expect(botResponse.status).toBe(200);
      expect(await botResponse.json()).toEqual({ ok: true });
    }
    expect(providerCalls).toBe(0);

    const legitimate = await worker.fetch(
      leadRequest(token, {}, "203.0.113.99"),
      envWithResend,
      {} as ExecutionContext,
    );
    expect(legitimate.status).toBe(200);
    expect(await legitimate.json()).toEqual({ ok: true });
    expect(providerCalls).toBe(1);
  });

  it("does not spend quota on submissions that fail required-field validation", async () => {
    let providerCalls = 0;
    network.use(
      http.post("https://api.resend.com/emails", () => {
        providerCalls += 1;
        return HttpResponse.json({ id: "resend-msg-ok" });
      }),
    );
    const token = await signedLeadToken({ project: "rate-limit-validation-client" });
    const envWithResend = testEnv({
      RESEND_API_KEY: "test-resend-key",
      LAUNCHLOOM_FROM_EMAIL: "LaunchLoom <info@example.com>",
    });
    for (let i = 0; i < 15; i += 1) {
      const invalid = await worker.fetch(
        leadRequest(token, { message: "" }, "203.0.113.50"),
        envWithResend,
        {} as ExecutionContext,
      );
      expect(invalid.status).toBe(400);
    }
    const valid = await worker.fetch(
      leadRequest(token, {}, "203.0.113.50"),
      envWithResend,
      {} as ExecutionContext,
    );
    expect(valid.status).toBe(200);
    expect(providerCalls).toBe(1);
  });

  it("fails open when the lead rate limiter is unavailable", async () => {
    let providerCalls = 0;
    network.use(
      http.post("https://api.resend.com/emails", () => {
        providerCalls += 1;
        return HttpResponse.json({ id: "resend-msg-ok" });
      }),
    );
    const token = await signedLeadToken({ project: "rate-limit-outage-client" });
    const brokenCoordinator = {
      getByName: () => ({
        allowLead: () => Promise.reject(new Error("durable object unavailable")),
      }),
    };
    const response = await worker.fetch(
      leadRequest(token, {}, "203.0.113.60"),
      testEnv({
        RESEND_API_KEY: "test-resend-key",
        LAUNCHLOOM_FROM_EMAIL: "LaunchLoom <info@example.com>",
        REVISION_COORDINATOR: brokenCoordinator as unknown as Env["REVISION_COORDINATOR"],
      }),
      {} as ExecutionContext,
    );
    expect(response.status).toBe(200);
    expect(providerCalls).toBe(1);
  });
});
