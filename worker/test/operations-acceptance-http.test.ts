import { env } from "cloudflare:test";
import { http, HttpResponse } from "msw";
import { beforeAll, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../src/index";
import type { OnboardingInvites } from "../src/onboarding-invites";
import { network } from "./network";

const fake = vi.hoisted(() => ({
  failCreate: true,
  creates: 0,
  confirms: 0,
  intakeId: "11111111-1111-4111-8111-111111111111",
  requestId: "22222222-2222-4222-8222-222222222222",
  attemptId: "33333333-3333-4333-8333-333333333333",
  operationId: "44444444-4444-4444-8444-444444444444",
}));

vi.mock("../src/operations/acceptance", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/operations/acceptance")>();
  return {
    ...actual,
    operationsStoreFromEnv: () => ({
      async createAcceptance() {
        fake.creates += 1;
        if (fake.failCreate) throw new Error("synthetic database outage");
        return {
          intakeId: fake.intakeId,
          requestId: fake.requestId,
          attemptId: fake.attemptId,
          operationId: fake.operationId,
          created: fake.creates === 2,
        };
      },
      async confirmAcceptance() {
        fake.confirms += 1;
      },
      async getIntake() {
        return null;
      },
      async getIntakeByBinding() {
        return null;
      },
    }),
  };
});

const onboardingOrigin = "https://onboard.example.test";
const signingSecret = "test-onboarding-invite-secret";
const inviteNamespace = (
  env as unknown as {
    ONBOARDING_INVITES: DurableObjectNamespace<OnboardingInvites>;
  }
).ONBOARDING_INVITES;

function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
}

async function registerInvite(inviteId: string, expiresAt: number) {
  const claims = {
    inviteId,
    expiresAt,
    allowedOrigins: [onboardingOrigin],
  };
  const encoded = base64url(new TextEncoder().encode(JSON.stringify(claims)));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingSecret),
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
  const tokenHash = [...bytes]
    .map((part) => part.toString(16).padStart(2, "0"))
    .join("");
  await inviteNamespace.getByName("launchloom-onboarding-invites").register({
    inviteId,
    clientEmail: "sam@example.test",
    expiresAt,
    allowedOrigin: onboardingOrigin,
    tokenHash,
    now: Date.now(),
  });
  return token;
}

function intakeBody(token: string, submissionId: string) {
  return {
    intakeVersion: "2",
    inviteToken: token,
    submissionId,
    businessName: "Harbor Plumbing",
    contactName: "Sam Owner",
    email: "sam@example.test",
    phone: "555-0100",
    address: "1 Main Street, Tacoma, WA",
    addressVisibility: "private",
    hours: "Monday to Friday, 9 to 5",
    industry: "home-services",
    services: ["Drain cleaning"],
    primaryCity: "Tacoma, WA",
    serviceAreas: "Tacoma, WA",
    serviceRadius: "20",
    differentiators: "Clear communication",
    primaryCta: "Request a quote",
    confirmAccuracy: "yes",
    confirmRights: "yes",
    confirmSeoResearch: "yes",
    leadEmail: "leads@example.test",
  };
}

function submit(token: string, submissionId: string) {
  return worker.fetch(
    new Request("https://api.launchloom.test/api/intake", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: onboardingOrigin,
      },
      body: JSON.stringify(intakeBody(token, submissionId)),
    }),
    {
      ...(env as unknown as Env),
      OPERATIONS_INTAKE_MODE: "postgres",
      OPERATIONS_DATABASE_URL: "postgresql://fake.invalid/test",
    },
    {} as ExecutionContext,
  );
}

describe("expired invitation replay over HTTP", () => {
  beforeAll(() => {
    network.use(
      http.post("https://api.resend.com/emails", () =>
        HttpResponse.json({ id: "email-expired-replay" }, { status: 200 }),
      ),
    );
  });

  it("replays only the exact existing reservation after the credential expires", async () => {
    const inviteId = "invite-http-expired-replay-001";
    const submissionId = "submission-http-expired-replay-001";
    const token = await registerInvite(inviteId, Date.now() + 1_200);

    const first = await submit(token, submissionId);
    expect(first.status).toBe(503);
    expect(fake.creates).toBe(1);

    await new Promise((resolve) => setTimeout(resolve, 1_300));

    const differentSubmission = await submit(
      token,
      "submission-http-expired-replay-002",
    );
    expect(differentSubmission.status).toBe(403);

    fake.failCreate = false;
    const replay = await submit(token, submissionId);
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toMatchObject({
      ok: true,
      duplicate: false,
      intakeId: fake.intakeId,
    });
    expect(fake.creates).toBe(2);
    expect(fake.confirms).toBe(1);
  });

  it("never starts a new intake with an expired credential", async () => {
    const inviteId = "invite-http-expired-new-001";
    const token = await registerInvite(inviteId, Date.now() + 600);
    await new Promise((resolve) => setTimeout(resolve, 750));

    const response = await submit(token, "submission-http-expired-new-001");
    expect(response.status).toBe(403);
    expect(fake.creates).toBe(2);
  });
});
