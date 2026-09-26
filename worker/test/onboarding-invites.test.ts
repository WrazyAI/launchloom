import { env, runInDurableObject, SELF } from "cloudflare:test";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import worker, { type Env } from "../src/index";
import type { OnboardingInvites } from "../src/onboarding-invites";
import { network } from "./network";

const onboardingOrigin = "https://onboard.example.test";
const signingSecret = "test-onboarding-invite-secret";
const inviteNamespace = (env as unknown as {
  ONBOARDING_INVITES: DurableObjectNamespace<OnboardingInvites>;
}).ONBOARDING_INVITES;

async function registeredInvite(inviteId: string, clientEmail: string | null = null) {
  const expiresAt = Date.now() + 30 * 60_000;
  const claims = { inviteId, ...(clientEmail ? { clientEmail } : {}), expiresAt, allowedOrigins: [onboardingOrigin] };
  const encoded = base64url(new TextEncoder().encode(JSON.stringify(claims)));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(signingSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encoded)));
  const token = `${encoded}.${base64url(signature)}`;
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
  const tokenHash = [...bytes].map((part) => part.toString(16).padStart(2, "0")).join("");
  await inviteNamespace.getByName("launchloom-onboarding-invites").register({
    inviteId, clientEmail, expiresAt, allowedOrigin: onboardingOrigin, tokenHash, now: Date.now(),
  });
  return token;
}

type InviteClaims = {
  inviteId: string;
  clientEmail?: string;
  expiresAt: number;
  allowedOrigins: string[];
};

function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
}

async function signedInvite(claims: InviteClaims) {
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
  return `${encoded}.${base64url(signature)}`;
}

async function validateInvite(token: string, origin = onboardingOrigin) {
  return SELF.fetch("https://api.launchloom.test/api/onboarding-invites/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ token }),
  });
}

describe("private onboarding invitations", () => {
  it("returns a client validation status when the required Turnstile token is missing", async () => {
    const response = await worker.fetch(
      new Request("https://api.launchloom.test/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: onboardingOrigin },
        body: JSON.stringify({}),
      }),
      { ...(env as unknown as Env), TURNSTILE_SECRET_KEY: "turnstile-test-secret" },
      {} as ExecutionContext,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "Please complete the spam check." });
  });

  it("fails closed when invite validation receives no token", async () => {
    const response = await validateInvite("");

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ valid: false });
  });

  it("rejects an intake before creating a GitHub issue when its invite is missing", async () => {
    const response = await SELF.fetch("https://api.launchloom.test/api/intake", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: onboardingOrigin },
      body: JSON.stringify({
        submissionId: "submission-no-invite-001",
        intakeVersion: "2",
        businessName: "Harbor Plumbing",
        contactName: "Sam Owner",
        email: "sam@example.test",
        phone: "555-0100",
        address: "1 Main Street",
        services: "Drain cleaning",
        industry: "home-services",
        serviceAreas: "Tacoma, WA",
        serviceRadius: "20",
        confirmAccuracy: "yes",
      }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringMatching(/invitation/iu) });
  });

  it("does not consume an invite when intake validation fails", async () => {
    const inviteId = "invite-invalid-form-001";
    const token = await registeredInvite(inviteId);
    const claims = JSON.parse(atob(token.split(".")[0])) as InviteClaims;
    const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
    const tokenHash = [...bytes].map((part) => part.toString(16).padStart(2, "0")).join("");
    const response = await SELF.fetch("https://api.launchloom.test/api/intake", {
      method: "POST",
      headers: { Origin: onboardingOrigin, "Content-Type": "application/json" },
      body: JSON.stringify({
        intakeVersion: "2", inviteToken: token, submissionId: "submission-invalid-form-001",
        businessName: "Harbor Plumbing", contactName: "Sam Owner", email: "sam@example.test",
        phone: "555-0100", address: "1 Main Street", services: "", industry: "home-services",
        serviceAreas: "Tacoma, WA", serviceRadius: "20", confirmAccuracy: "yes",
      }),
    });

    expect(response.status).toBe(400);
    await expect(inviteNamespace.getByName("launchloom-onboarding-invites").validate(inviteId, tokenHash, claims.expiresAt, onboardingOrigin)).resolves.toMatchObject({ valid: true });
  });

  it("binds invite email and retries an accepted intake without creating duplicate issues", async () => {
    const inviteId = "invite-accepted-intake-001";
    const submissionId = "submission-accepted-intake-001";
    const invitedEmail = "sam@example.test";
    const token = await registeredInvite(inviteId, invitedEmail);
    const issueComments: string[] = [];
    let createdIssues = 0;
    let dispatched = 0;
    let receiptAttempts = 0;
    const deliveredReceiptKeys = new Set<string>();
    const receiptRequests: Array<{ key: string | null; body: { to: string[]; subject: string; html: string; text: string } }> = [];
    network.use(
      http.get("https://api.github.com/repos/WrazyAI/launchloom/issues", () => HttpResponse.json([])),
      http.post("https://api.github.com/repos/WrazyAI/launchloom/issues", async ({ request }) => {
        const issue = await request.json() as { body: string };
        createdIssues += 1;
        issueComments.push(issue.body);
        return HttpResponse.json({ number: 987 }, { status: 201 });
      }),
      http.post("https://api.github.com/repos/WrazyAI/launchloom/dispatches", () => {
        dispatched += 1;
        return new HttpResponse(null, { status: 204 });
      }),
      http.post("https://api.resend.com/emails", async ({ request }) => {
        receiptAttempts += 1;
        const key = request.headers.get("Idempotency-Key");
        receiptRequests.push({
          key,
          body: await request.json() as { to: string[]; subject: string; html: string; text: string },
        });
        if (receiptAttempts === 1)
          return HttpResponse.json({ error: "temporary provider failure" }, { status: 500 });
        if (key) deliveredReceiptKeys.add(key);
        return HttpResponse.json({ id: "email-receipt-001" }, { status: 200 });
      }),
    );
    const intake = {
      intakeVersion: "2", inviteToken: token, submissionId,
      businessName: "Harbor Plumbing", contactName: "Sam Owner", email: invitedEmail,
      phone: "555-0100", address: "1 Main Street, Tacoma, WA", industry: "home-services",
      services: "Drain cleaning", primaryCity: "Tacoma, WA", serviceAreas: "Tacoma, WA",
      serviceRadius: "20", differentiators: "Clear communication", primaryCta: "Request a quote",
      confirmAccuracy: "yes", leadEmail: "leads@example.test",
    };
    const submit = () => SELF.fetch("https://api.launchloom.test/api/intake", {
      method: "POST",
      headers: { Origin: onboardingOrigin, "Content-Type": "application/json" },
      body: JSON.stringify(intake),
    });
    expect((await submit()).status).toBe(200);
    expect((await submit()).status).toBe(200);
    expect(createdIssues).toBe(1);
    expect(dispatched).toBe(2);
    expect(issueComments[0]).not.toContain(token);
    await expect((await submit()).json()).resolves.toMatchObject({ ok: true, duplicate: true, issue: 987 });
    expect(receiptRequests).toHaveLength(4);
    expect(receiptAttempts).toBe(4);
    expect(deliveredReceiptKeys).toEqual(new Set([`client-intake-received-${submissionId}`]));
    expect(new Set(receiptRequests.map(({ key }) => key))).toEqual(
      new Set([`client-intake-received-${submissionId}`]),
    );
    expect(receiptRequests[0].body).toMatchObject({
      to: [invitedEmail],
      subject: expect.stringMatching(/intake.*received/iu),
    });
    expect(receiptRequests[0].body.text).toContain("processing is starting");
    const edited = await SELF.fetch("https://api.launchloom.test/api/intake", {
      method: "POST",
      headers: { Origin: onboardingOrigin, "Content-Type": "application/json" },
      body: JSON.stringify({ ...intake, differentiators: "Different confirmed positioning" }),
    });
    expect(edited.status).toBe(409);
    expect(createdIssues).toBe(1);
  });

  it("rejects a changed stale payload when its submission marker already has an issue", async () => {
    const inviteId = "invite-stale-existing-issue-001";
    const submissionId = "submission-stale-existing-issue-001";
    const token = await registeredInvite(inviteId, "sam@example.test");
    const claims = JSON.parse(atob(token.split(".")[0])) as InviteClaims;
    const tokenDigest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
    const tokenHash = [...tokenDigest].map((part) => part.toString(16).padStart(2, "0")).join("");
    const coordinator = inviteNamespace.getByName("launchloom-onboarding-invites");
    await coordinator.reserveSubmission(inviteId, tokenHash, claims.expiresAt, onboardingOrigin, submissionId, "prior-payload-hash", "sam@example.test", Date.now() - 121_000);
    const marker = `<!-- launchloom-intake:${submissionId} -->`;
    let createdIssues = 0;
    network.use(
      http.get("https://api.github.com/repos/WrazyAI/launchloom/issues", () => HttpResponse.json([{ number: 991, body: marker } ])),
      http.post("https://api.github.com/repos/WrazyAI/launchloom/issues", () => {
        createdIssues += 1;
        return HttpResponse.json({ number: 992 }, { status: 201 });
      }),
      http.post("https://api.github.com/repos/WrazyAI/launchloom/dispatches", () => new HttpResponse(null, { status: 204 })),
    );

    const response = await SELF.fetch("https://api.launchloom.test/api/intake", {
      method: "POST",
      headers: { Origin: onboardingOrigin, "Content-Type": "application/json" },
      body: JSON.stringify({
        intakeVersion: "2", inviteToken: token, submissionId,
        businessName: "Harbor Plumbing", contactName: "Sam Owner", email: "sam@example.test",
        phone: "555-0100", address: "1 Main Street, Tacoma, WA", industry: "home-services",
        services: ["Drain cleaning"], primaryCity: "Tacoma, WA", serviceRadius: "20",
        differentiators: "Updated positioning", primaryCta: "Request a quote", confirmAccuracy: "yes",
      }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "submission_mismatch" });
    expect(createdIssues).toBe(0);
    await runInDurableObject(coordinator, async (_instance, state) => {
      const row = state.storage.sql.exec<{ reserved_submission_hash: string; status: string }>(
        "SELECT reserved_submission_hash, status FROM onboarding_invites WHERE invite_id = ?", inviteId,
      ).toArray()[0];
      expect(row).toEqual({ reserved_submission_hash: "prior-payload-hash", status: "unused" });
    });
  });

  it("rebinds a changed stale payload and accepts it when no issue marker exists", async () => {
    const inviteId = "invite-stale-empty-issue-001";
    const submissionId = "submission-stale-empty-issue-001";
    const token = await registeredInvite(inviteId, "sam@example.test");
    const claims = JSON.parse(atob(token.split(".")[0])) as InviteClaims;
    const tokenDigest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
    const tokenHash = [...tokenDigest].map((part) => part.toString(16).padStart(2, "0")).join("");
    const coordinator = inviteNamespace.getByName("launchloom-onboarding-invites");
    await coordinator.reserveSubmission(inviteId, tokenHash, claims.expiresAt, onboardingOrigin, submissionId, "prior-payload-hash", "sam@example.test", Date.now() - 121_000);
    let createdIssues = 0;
    let dispatched = 0;
    let receiptEmails = 0;
    network.use(
      http.get("https://api.github.com/repos/WrazyAI/launchloom/issues", () => HttpResponse.json([])),
      http.post("https://api.github.com/repos/WrazyAI/launchloom/issues", () => {
        createdIssues += 1;
        return HttpResponse.json({ number: 993 }, { status: 201 });
      }),
      http.post("https://api.github.com/repos/WrazyAI/launchloom/dispatches", () => {
        dispatched += 1;
        return new HttpResponse(null, { status: 204 });
      }),
      http.post("https://api.resend.com/emails", () => {
        receiptEmails += 1;
        return HttpResponse.json({ id: "email-receipt-stale-recovery" });
      }),
    );

    const response = await SELF.fetch("https://api.launchloom.test/api/intake", {
      method: "POST",
      headers: { Origin: onboardingOrigin, "Content-Type": "application/json" },
      body: JSON.stringify({
        intakeVersion: "2", inviteToken: token, submissionId,
        businessName: "Harbor Plumbing", contactName: "Sam Owner", email: "sam@example.test",
        phone: "555-0100", address: "1 Main Street, Tacoma, WA", industry: "home-services",
        services: ["Drain cleaning"], primaryCity: "Tacoma, WA", serviceRadius: "20",
        differentiators: "Updated positioning", primaryCta: "Request a quote", confirmAccuracy: "yes",
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, duplicate: false, issue: 993 });
    expect(createdIssues).toBe(1);
    expect(dispatched).toBe(1);
    expect(receiptEmails).toBe(1);
  });

  it("returns a generic intake error when GitHub rejects issue creation", async () => {
    const token = await registeredInvite("invite-github-error-001");
    network.use(
      http.get("https://api.github.com/repos/WrazyAI/launchloom/issues", () =>
        HttpResponse.json([])),
      http.post("https://api.github.com/repos/WrazyAI/launchloom/issues", () =>
        HttpResponse.json({ message: "sensitive GitHub validation details" }, { status: 422 })),
    );
    const response = await SELF.fetch("https://api.launchloom.test/api/intake", {
      method: "POST",
      headers: { Origin: onboardingOrigin, "Content-Type": "application/json" },
      body: JSON.stringify({
        intakeVersion: "2", inviteToken: token, submissionId: "submission-github-error-001",
        businessName: "Harbor Plumbing", contactName: "Sam Owner", email: "sam@example.test",
        phone: "555-0100", address: "1 Main Street", services: ["Drain cleaning"],
        industry: "home-services", primaryCity: "Tacoma, WA", serviceRadius: "20",
        confirmAccuracy: "yes",
      }),
    });
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(body).toContain("We couldn’t start your preview. Please try again.");
    expect(body).not.toContain("sensitive GitHub validation details");
  });

  it("rejects a valid signature when no persistent invite is registered", async () => {
    const token = await signedInvite({
      inviteId: "invite-unregistered-001",
      clientEmail: "client@example.test",
      expiresAt: Date.now() + 60_000,
      allowedOrigins: [onboardingOrigin],
    });

    const response = await validateInvite(token);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ valid: false });
  });

  it("rejects an invitation from an origin outside its signed allowlist", async () => {
    const token = await signedInvite({
      inviteId: "invite-origin-001",
      expiresAt: Date.now() + 60_000,
      allowedOrigins: [onboardingOrigin],
    });

    const response = await validateInvite(token, "https://attacker.example.test");

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ valid: false });
  });

  it("only consumes an invite after an accepted issue is recorded and deduplicates its retry", async () => {
    const inviteId = "invite-consume-001";
    const submissionId = "submission-consume-001";
    const origin = onboardingOrigin;
    const expiresAt = Date.now() + 60_000;
    const token = await signedInvite({ inviteId, expiresAt, allowedOrigins: [origin] });
    const tokenHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    const hash = [...new Uint8Array(tokenHash)].map((part) => part.toString(16).padStart(2, "0")).join("");
    const coordinator = inviteNamespace.getByName("test-consumption-flow");
    await coordinator.register({ inviteId, clientEmail: null, expiresAt, allowedOrigin: origin, tokenHash: hash, now: Date.now() });

    await expect(coordinator.validate(inviteId, hash, expiresAt, origin)).resolves.toMatchObject({ valid: true });
    await expect(coordinator.reserveSubmission(inviteId, hash, expiresAt, origin, submissionId, "payload-hash-a", "owner@example.test")).resolves.toMatchObject({ accepted: true, issue: null });
    await expect(coordinator.validate(inviteId, hash, expiresAt, origin)).resolves.toMatchObject({ valid: true });
    await expect(coordinator.recordIssue(inviteId, submissionId, "payload-hash-a", 42)).resolves.toBe(true);
    await expect(coordinator.reserveSubmission(inviteId, hash, expiresAt, origin, submissionId, "payload-hash-a", "owner@example.test")).resolves.toMatchObject({ accepted: true, duplicate: true, issue: 42 });
    await expect(coordinator.reserveSubmission(inviteId, hash, expiresAt, origin, submissionId, "payload-hash-edited", "owner@example.test")).resolves.toMatchObject({ accepted: false, reason: "submission_mismatch" });
    await expect(coordinator.reserveSubmission(inviteId, hash, expiresAt, origin, "submission-replay-002", "payload-hash-b", "owner@example.test")).resolves.toMatchObject({ accepted: false, reason: "consumed" });
    await expect(coordinator.validate(inviteId, hash, expiresAt, origin)).resolves.toMatchObject({ valid: false });
  });

  it("allows only one concurrent submission reservation for an invite", async () => {
    const inviteId = "invite-concurrent-001";
    const expiresAt = Date.now() + 60_000;
    const origin = onboardingOrigin;
    const token = await signedInvite({ inviteId, expiresAt, allowedOrigins: [origin] });
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
    const hash = [...digest].map((part) => part.toString(16).padStart(2, "0")).join("");
    const coordinator = inviteNamespace.getByName("test-concurrency-flow");
    await coordinator.register({ inviteId, clientEmail: null, expiresAt, allowedOrigin: origin, tokenHash: hash, now: Date.now() });

    const results = await Promise.all([
      coordinator.reserveSubmission(inviteId, hash, expiresAt, origin, "submission-concurrent-a", "payload-hash-a", "owner@example.test"),
      coordinator.reserveSubmission(inviteId, hash, expiresAt, origin, "submission-concurrent-b", "payload-hash-b", "owner@example.test"),
    ]);

    expect(results.filter((result) => result.accepted)).toHaveLength(1);
    expect(results.filter((result) => !result.accepted && result.reason === "in_progress")).toHaveLength(1);
    await runInDurableObject(coordinator, async (_instance, state) => {
      const row = state.storage.sql.exec<{ status: string; issue_number: number | null }>(
        "SELECT status, issue_number FROM onboarding_invites WHERE invite_id = ?", inviteId,
      ).toArray()[0];
      expect(row).toEqual({ status: "unused", issue_number: null });
    });
  });

  it("releases a failed reservation without consuming the invitation", async () => {
    const inviteId = "invite-failure-001";
    const submissionId = "submission-failure-001";
    const expiresAt = Date.now() + 60_000;
    const origin = onboardingOrigin;
    const token = await signedInvite({ inviteId, expiresAt, allowedOrigins: [origin] });
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
    const hash = [...digest].map((part) => part.toString(16).padStart(2, "0")).join("");
    const coordinator = inviteNamespace.getByName("test-failure-flow");
    await coordinator.register({ inviteId, clientEmail: null, expiresAt, allowedOrigin: origin, tokenHash: hash, now: Date.now() });
    await coordinator.reserveSubmission(inviteId, hash, expiresAt, origin, submissionId, "payload-hash-a", "owner@example.test");

    await expect(coordinator.reopenFailedSubmission(inviteId, submissionId, "payload-hash-a")).resolves.toBe(true);
    await expect(coordinator.validate(inviteId, hash, expiresAt, origin)).resolves.toMatchObject({ valid: true });
  });

  it("lets the original submission recover a stale reservation without letting another submission take it", async () => {
    const inviteId = "invite-stale-reservation-001";
    const submissionId = "submission-stale-reservation-001";
    const now = Date.now();
    const expiresAt = now + 30 * 60_000;
    const origin = onboardingOrigin;
    const token = await signedInvite({ inviteId, expiresAt, allowedOrigins: [origin] });
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
    const hash = [...digest].map((part) => part.toString(16).padStart(2, "0")).join("");
    const coordinator = inviteNamespace.getByName("test-stale-reservation-flow");
    await coordinator.register({ inviteId, clientEmail: null, expiresAt, allowedOrigin: origin, tokenHash: hash, now });
    await coordinator.reserveSubmission(inviteId, hash, expiresAt, origin, submissionId, "payload-hash-a", "owner@example.test", now);

    await expect(coordinator.reserveSubmission(inviteId, hash, expiresAt, origin, "submission-other-001", "payload-hash-b", "owner@example.test", now + 121_000)).resolves.toMatchObject({ accepted: false, reason: "in_progress" });
    await expect(coordinator.reserveSubmission(inviteId, hash, expiresAt, origin, submissionId, "payload-hash-a", "owner@example.test", now + 121_000)).resolves.toMatchObject({ accepted: true, duplicate: false });
  });

  it("rebinds a stale changed payload only before issue creation is claimed", async () => {
    const inviteId = "invite-stale-rebind-001";
    const submissionId = "submission-stale-rebind-001";
    const now = Date.now();
    const expiresAt = now + 30 * 60_000;
    const token = await signedInvite({ inviteId, expiresAt, allowedOrigins: [onboardingOrigin] });
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
    const tokenHash = [...digest].map((part) => part.toString(16).padStart(2, "0")).join("");
    const coordinator = inviteNamespace.getByName("test-stale-rebind-flow");
    await coordinator.register({ inviteId, clientEmail: null, expiresAt, allowedOrigin: onboardingOrigin, tokenHash, now });
    await coordinator.reserveSubmission(inviteId, tokenHash, expiresAt, onboardingOrigin, submissionId, "payload-hash-a", "owner@example.test", now);

    await expect(coordinator.reserveSubmission(inviteId, tokenHash, expiresAt, onboardingOrigin, submissionId, "payload-hash-b", "owner@example.test", now + 121_000))
      .resolves.toMatchObject({ accepted: false, reason: "stale_submission_mismatch", reservedSubmissionHash: "payload-hash-a" });
    await expect(coordinator.rebindStaleReservation(inviteId, submissionId, "payload-hash-a", "payload-hash-b", now + 121_000)).resolves.toBe(true);
    await expect(coordinator.claimIssueCreation(inviteId, submissionId, "payload-hash-a", now + 121_001)).resolves.toBe(false);
    await expect(coordinator.claimIssueCreation(inviteId, submissionId, "payload-hash-b", now + 121_001)).resolves.toBe(true);
    await expect(coordinator.rebindStaleReservation(inviteId, submissionId, "payload-hash-b", "payload-hash-c", now + 242_001)).resolves.toBe(false);
  });

  it("does not rebind a stale reservation once issue creation has started", async () => {
    const inviteId = "invite-stale-creating-001";
    const submissionId = "submission-stale-creating-001";
    const now = Date.now();
    const expiresAt = now + 30 * 60_000;
    const token = await signedInvite({ inviteId, expiresAt, allowedOrigins: [onboardingOrigin] });
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
    const tokenHash = [...digest].map((part) => part.toString(16).padStart(2, "0")).join("");
    const coordinator = inviteNamespace.getByName("test-stale-creating-flow");
    await coordinator.register({ inviteId, clientEmail: null, expiresAt, allowedOrigin: onboardingOrigin, tokenHash, now });
    await coordinator.reserveSubmission(inviteId, tokenHash, expiresAt, onboardingOrigin, submissionId, "payload-hash-a", "owner@example.test", now);
    await coordinator.claimIssueCreation(inviteId, submissionId, "payload-hash-a", now);

    await expect(coordinator.reserveSubmission(inviteId, tokenHash, expiresAt, onboardingOrigin, submissionId, "payload-hash-b", "owner@example.test", now + 121_000))
      .resolves.toMatchObject({ accepted: false, reason: "submission_mismatch" });
    await expect(coordinator.rebindStaleReservation(inviteId, submissionId, "payload-hash-a", "payload-hash-b", now + 121_000)).resolves.toBe(false);
  });

  it("lets admins revoke stale reservations and clears their replay lock", async () => {
    const inviteId = "invite-stale-revoke-001";
    const submissionId = "submission-stale-revoke-001";
    const now = Date.now();
    const expiresAt = now + 30 * 60_000;
    const token = await signedInvite({ inviteId, expiresAt, allowedOrigins: [onboardingOrigin] });
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
    const tokenHash = [...digest].map((part) => part.toString(16).padStart(2, "0")).join("");
    const coordinator = inviteNamespace.getByName("test-stale-revoke-flow");
    await coordinator.register({ inviteId, clientEmail: null, expiresAt, allowedOrigin: onboardingOrigin, tokenHash, now });
    await coordinator.reserveSubmission(inviteId, tokenHash, expiresAt, onboardingOrigin, submissionId, "payload-hash-a", "owner@example.test", now);

    await expect(coordinator.revoke(inviteId, now + 119_999)).resolves.toBe(false);
    await expect(coordinator.revoke(inviteId, now + 120_000)).resolves.toBe(true);
    await expect(coordinator.reserveSubmission(inviteId, tokenHash, expiresAt, onboardingOrigin, submissionId, "payload-hash-a", "owner@example.test", now + 120_001))
      .resolves.toMatchObject({ accepted: false, reason: "revoked" });
  });
});
