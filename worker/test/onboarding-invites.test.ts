import { env, runDurableObjectAlarm, runInDurableObject, SELF } from "cloudflare:test";
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
    creator: {kind:"admin",id:"verified-inviter",name:"Verified inviter",email:"inviter@example.test",source:"cloudflare-access"},
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
  it("keeps accepted intake successful and retries receipt delivery without redispatching generation", async () => {
    const inviteId = "invite-receipt-outbox-001";
    const submissionId = "submission-receipt-outbox-001";
    const token = await registeredInvite(inviteId, "sam@example.test");
    let dispatches = 0;
    let receiptAttempts = 0;
    const receiptKeys: Array<string | null> = [];
    let savedIssueBody = "";
    network.use(
      http.get("https://api.github.com/repos/WrazyAI/launchloom/issues", () =>
        HttpResponse.json([]),
      ),
      http.post("https://api.github.com/repos/WrazyAI/launchloom/issues", async ({ request }) => {
        savedIssueBody = String(((await request.json()) as { body?: string }).body || "");
        return HttpResponse.json({ number: 981 }, { status: 201 });
      }),
      http.post(
        "https://api.github.com/repos/WrazyAI/launchloom/dispatches",
        () => {
          dispatches += 1;
          return new HttpResponse(null, { status: 204 });
        },
      ),
      http.post("https://api.resend.com/emails", ({ request }) => {
        receiptAttempts += 1;
        receiptKeys.push(request.headers.get("Idempotency-Key"));
        return receiptAttempts <= 3
          ? HttpResponse.json(
              { error: "temporary provider failure" },
              { status: 500 },
            )
          : HttpResponse.json(
              { id: "email-receipt-recovered" },
              { status: 200 },
            );
      }),
    );
    const intake = {
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
      researchLanguageCode: "ES",
      excludedServices: "Septic pumping",
      industry: "home-services",
      services: ["Drain cleaning"],
      primaryCity: "Tacoma, WA",
      serviceAreas: "Tacoma, WA",
      serviceRadius: "20",
      differentiators: "Clear communication",
      primaryCta: "Request a quote",
      confirmAccuracy: "yes",
      leadEmail: "leads@example.test",
    };
    const submit = () =>
      SELF.fetch("https://api.launchloom.test/api/intake", {
        method: "POST",
        headers: {
          Origin: onboardingOrigin,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(intake),
      });

    const accepted = await submit();
    expect(accepted.status).toBe(200);
    const acceptedClients = await (env as unknown as Env).GENERATION_LEDGER.getByName("launchloom-generations").listClients({});
    const acceptedClient = acceptedClients.items.find(item => item.submissionId === submissionId);
    expect(acceptedClient).toMatchObject({ businessName: "Harbor Plumbing", previewUrl: null });
    const queued = await (env as unknown as Env).GENERATION_LEDGER.getByName("launchloom-generations").listAttempts({ clientId: acceptedClient!.clientId });
    expect(queued.items[0]).toMatchObject({ initiator: { kind: "client" }, invitationCreator:{id:"verified-inviter"}, deliveryStatus: "none", executionStatus: "queued", startedAt: null });
    expect(savedIssueBody).toContain('"addressVisibility": "private"');
    expect(savedIssueBody).toContain('"researchLanguageCode": "es"');
    expect(savedIssueBody).toContain('"hours": "Monday to Friday, 9 to 5"');
    expect(savedIssueBody).toContain('"Septic pumping"');
    await expect(accepted.json()).resolves.toMatchObject({
      ok: true,
      issue: 981,
    });
    await runInDurableObject(
      inviteNamespace.getByName("launchloom-onboarding-invites"),
      (_instance, state) => {
        state.storage.sql.exec(
          "UPDATE intake_outbox SET next_attempt_at = ? WHERE submission_id = ? AND task_type = 'receipt' AND status = 'pending'",
          Date.now(),
          submissionId,
        );
      },
    );
    await expect(
      runDurableObjectAlarm(
        inviteNamespace.getByName("launchloom-onboarding-invites"),
      ),
    ).resolves.toBe(true);
    const duplicateResponses = await Promise.all([submit(), submit()]);
    expect(duplicateResponses.map((response) => response.status)).toEqual([
      200, 200,
    ]);
    expect(dispatches).toBe(1);
    expect(receiptAttempts).toBe(4);
    expect(receiptKeys).toHaveLength(4);
    expect(new Set(receiptKeys).size).toBe(1);
    expect(receiptKeys[0]).toMatch(/^client-intake-received-[a-f0-9-]{36}$/u);
    await runInDurableObject(
      inviteNamespace.getByName("launchloom-onboarding-invites"),
      async (_instance, state) => {
        const row = state.storage.sql
          .exec<{ status: string; attempts: number }>(
            "SELECT status, attempts FROM intake_outbox WHERE submission_id = ? AND task_type = 'receipt'",
            submissionId,
          )
          .toArray()[0];
        expect(row).toEqual({ status: "delivered", attempts: 2 });
      },
    );
  });

  it("retries a failed generation dispatch from the persisted outbox", async () => {
    const inviteId = "invite-dispatch-outbox-001";
    const submissionId = "submission-dispatch-outbox-001";
    const token = await registeredInvite(inviteId, "sam@example.test");
    let dispatchAttempts = 0;
    network.use(
      http.get("https://api.github.com/repos/WrazyAI/launchloom/issues", () =>
        HttpResponse.json([]),
      ),
      http.post("https://api.github.com/repos/WrazyAI/launchloom/issues", () =>
        HttpResponse.json({ number: 982 }, { status: 201 }),
      ),
      http.post(
        "https://api.github.com/repos/WrazyAI/launchloom/dispatches",
        () => {
          dispatchAttempts += 1;
          return dispatchAttempts === 1
            ? HttpResponse.json(
                { error: "temporary GitHub failure" },
                { status: 503 },
              )
            : new HttpResponse(null, { status: 204 });
        },
      ),
      http.post("https://api.resend.com/emails", () =>
        HttpResponse.json(
          { id: "email-receipt-dispatch-outbox" },
          { status: 200 },
        ),
      ),
    );
    const intake = {
      intakeVersion: "2",
      inviteToken: token,
      submissionId,
      businessName: "Harbor Plumbing",
      contactName: "Sam Owner",
      email: "sam@example.test",
      phone: "555-0100",
      address: "1 Main Street, Tacoma, WA",
      industry: "home-services",
      services: ["Drain cleaning"],
      primaryCity: "Tacoma, WA",
      serviceAreas: "Tacoma, WA",
      serviceRadius: "20",
      differentiators: "Clear communication",
      primaryCta: "Request a quote",
      confirmAccuracy: "yes",
      leadEmail: "leads@example.test",
    };
    const submit = () =>
      SELF.fetch("https://api.launchloom.test/api/intake", {
        method: "POST",
        headers: {
          Origin: onboardingOrigin,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(intake),
      });

    const accepted = await submit();
    expect(accepted.status).toBe(200);
    expect(dispatchAttempts).toBe(1);
    await runInDurableObject(
      inviteNamespace.getByName("launchloom-onboarding-invites"),
      (_instance, state) => {
        state.storage.sql.exec(
          "UPDATE intake_outbox SET next_attempt_at = ? WHERE submission_id = ? AND task_type = 'workflow' AND status = 'pending'",
          Date.now(),
          submissionId,
        );
      },
    );
    await expect(
      runDurableObjectAlarm(
        inviteNamespace.getByName("launchloom-onboarding-invites"),
      ),
    ).resolves.toBe(true);
    expect(dispatchAttempts).toBe(2);
    expect((await submit()).status).toBe(200);
    expect(dispatchAttempts).toBe(2);
    await runInDurableObject(
      inviteNamespace.getByName("launchloom-onboarding-invites"),
      async (_instance, state) => {
        const row = state.storage.sql
          .exec<{ status: string; attempts: number }>(
            "SELECT status, attempts FROM intake_outbox WHERE submission_id = ? AND task_type = 'workflow'",
            submissionId,
          )
          .toArray()[0];
        expect(row).toEqual({ status: "delivered", attempts: 2 });
      },
    );
  });

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
    expect(dispatched).toBe(1);
    expect(issueComments[0]).not.toContain(token);
    await expect((await submit()).json()).resolves.toMatchObject({ ok: true, duplicate: true, issue: 987 });
    expect(receiptRequests).toHaveLength(2);
    expect(receiptAttempts).toBe(2);
    expect(deliveredReceiptKeys.size).toBe(1);
    expect(new Set(receiptRequests.map(({ key }) => key))).toEqual(deliveredReceiptKeys);
    expect(receiptRequests[0].key).toMatch(/^client-intake-received-[a-f0-9-]{36}$/u);
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
    const priorPayload = { email: "sam@example.test", differentiators: "Original positioning" };
    const priorBytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(priorPayload))));
    const priorHash = [...priorBytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
    await coordinator.reserveSubmission(inviteId, tokenHash, claims.expiresAt, onboardingOrigin, submissionId, priorHash, "sam@example.test", Date.now() - 121_000);
    const operation = await coordinator.intakeOperation(inviteId, submissionId);
    const marker = `<!-- launchloom-intake-operation:${operation!.operationId}:${priorHash} -->\n\n\`\`\`json\n${JSON.stringify(priorPayload)}\n\`\`\``;
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
      expect(row).toEqual({ reserved_submission_hash: priorHash, status: "unused" });
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

  it("persists the Postgres routing mode at reservation and never switches on retry", async () => {
    const inviteId = "invite-postgres-routing-001";
    const submissionId = "submission-postgres-routing-001";
    const now = Date.now();
    const expiresAt = now + 30 * 60_000;
    const origin = onboardingOrigin;
    const token = await signedInvite({
      inviteId,
      expiresAt,
      allowedOrigins: [origin],
    });
    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
    );
    const tokenHash = [...digest]
      .map((part) => part.toString(16).padStart(2, "0"))
      .join("");
    const coordinator = inviteNamespace.getByName("test-postgres-routing-flow");
    await coordinator.register({
      inviteId,
      clientEmail: null,
      expiresAt,
      allowedOrigin: origin,
      tokenHash,
      now,
    });

    await expect(
      coordinator.reserveSubmission(
        inviteId,
        tokenHash,
        expiresAt,
        origin,
        submissionId,
        "payload-hash-a",
        "owner@example.test",
        now,
        "postgres",
      ),
    ).resolves.toMatchObject({
      accepted: true,
      mode: "postgres",
      state: "unconfirmed",
      expired: false,
    });
    // A later deployment may default the flag off. The persisted reservation wins.
    await expect(
      coordinator.reserveSubmission(
        inviteId,
        tokenHash,
        expiresAt,
        origin,
        submissionId,
        "payload-hash-a",
        "owner@example.test",
        now + 1,
        "legacy",
      ),
    ).resolves.toMatchObject({
      accepted: true,
      mode: "postgres",
      state: "unconfirmed",
    });
    await expect(
      coordinator.acceptanceRoutingMode(inviteId, submissionId),
    ).resolves.toBe("postgres");
    await expect(
      coordinator.acceptanceReservation(inviteId, submissionId),
    ).resolves.toMatchObject({
      mode: "postgres",
      state: "unconfirmed",
      fingerprint: "payload-hash-a",
    });
  });

  it("confirms an exact Postgres reservation idempotently without consuming the invite", async () => {
    const inviteId = "invite-postgres-confirm-001";
    const submissionId = "submission-postgres-confirm-001";
    const now = Date.now();
    const expiresAt = now + 30 * 60_000;
    const origin = onboardingOrigin;
    const token = await signedInvite({
      inviteId,
      expiresAt,
      allowedOrigins: [origin],
    });
    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
    );
    const tokenHash = [...digest]
      .map((part) => part.toString(16).padStart(2, "0"))
      .join("");
    const coordinator = inviteNamespace.getByName("test-postgres-confirm-flow");
    await coordinator.register({
      inviteId,
      clientEmail: null,
      expiresAt,
      allowedOrigin: origin,
      tokenHash,
      now,
    });
    await coordinator.reserveSubmission(
      inviteId,
      tokenHash,
      expiresAt,
      origin,
      submissionId,
      "payload-hash-a",
      "owner@example.test",
      now,
      "postgres",
    );
    const acceptance = {
      intakeId: "11111111-1111-4111-8111-111111111111",
      requestId: "22222222-2222-4222-8222-222222222222",
      attemptId: "33333333-3333-4333-8333-333333333333",
      operationId: "44444444-4444-4444-8444-444444444444",
    };

    await expect(
      coordinator.confirmPostgresAcceptance({
        inviteId,
        submissionId,
        fingerprint: "payload-hash-a",
        acceptance,
        now,
      }),
    ).resolves.toEqual({ confirmed: true, duplicate: false });
    await expect(
      coordinator.confirmPostgresAcceptance({
        inviteId,
        submissionId,
        fingerprint: "payload-hash-a",
        acceptance,
        now: now + 1,
      }),
    ).resolves.toEqual({ confirmed: true, duplicate: true });
    await expect(
      coordinator.confirmPostgresAcceptance({
        inviteId,
        submissionId,
        fingerprint: "payload-hash-a",
        acceptance: {
          ...acceptance,
          intakeId: "55555555-5555-4555-8555-555555555555",
        },
        now: now + 2,
      }),
    ).resolves.toEqual({ confirmed: false, reason: "identity" });
    await expect(
      coordinator.confirmPostgresAcceptance({
        inviteId,
        submissionId,
        fingerprint: "payload-hash-b",
        acceptance,
        now: now + 3,
      }),
    ).resolves.toEqual({ confirmed: false, reason: "reservation" });

    await runInDurableObject(coordinator, async (_instance, state) => {
      const row = state.storage.sql
        .exec<{
          status: string;
          issue_number: number | null;
          reservation_phase: string;
          acceptance_state: string;
          accepted_intake_id: string;
          accepted_operation_id: string;
          operation_id: string;
        }>(
          "SELECT status, issue_number, reservation_phase, acceptance_state, accepted_intake_id, accepted_operation_id, operation_id FROM onboarding_invites WHERE invite_id = ?",
          inviteId,
        )
        .toArray()[0];
      expect(row).toMatchObject({
        status: "unused",
        issue_number: null,
        acceptance_state: "confirmed",
        accepted_intake_id: acceptance.intakeId,
        accepted_operation_id: acceptance.operationId,
        operation_id: acceptance.operationId,
      });
    });
  });

  it("keeps an expired Postgres reservation recoverable and refuses to release it", async () => {
    const inviteId = "invite-postgres-expired-001";
    const submissionId = "submission-postgres-expired-001";
    const now = Date.now();
    const expiresAt = now + 1_000;
    const origin = onboardingOrigin;
    const token = await signedInvite({
      inviteId,
      expiresAt,
      allowedOrigins: [origin],
    });
    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
    );
    const tokenHash = [...digest]
      .map((part) => part.toString(16).padStart(2, "0"))
      .join("");
    const coordinator = inviteNamespace.getByName("test-postgres-expired-flow");
    await coordinator.register({
      inviteId,
      clientEmail: null,
      expiresAt,
      allowedOrigin: origin,
      tokenHash,
      now,
    });
    await coordinator.reserveSubmission(
      inviteId,
      tokenHash,
      expiresAt,
      origin,
      submissionId,
      "payload-hash-a",
      "owner@example.test",
      now,
      "postgres",
    );

    await expect(
      coordinator.reserveSubmission(
        inviteId,
        tokenHash,
        expiresAt,
        origin,
        submissionId,
        "payload-hash-a",
        "owner@example.test",
        now + 5_000,
        "legacy",
      ),
    ).resolves.toMatchObject({
      accepted: true,
      mode: "postgres",
      state: "unconfirmed",
      expired: true,
    });
    await expect(
      coordinator.reserveSubmission(
        inviteId,
        tokenHash,
        expiresAt,
        origin,
        submissionId,
        "payload-hash-b",
        "owner@example.test",
        now + 5_000,
        "postgres",
      ),
    ).resolves.toMatchObject({
      accepted: false,
      reason: "submission_mismatch",
      mode: "postgres",
    });
    await expect(
      coordinator.reopenFailedSubmission(
        inviteId,
        submissionId,
        "payload-hash-a",
        now + 5_000,
      ),
    ).resolves.toBe(false);
    await expect(coordinator.revoke(inviteId, now + 5_000)).resolves.toBe(
      false,
    );
    await expect(
      coordinator.acceptanceReservation(inviteId, submissionId, now + 5_000),
    ).resolves.toMatchObject({
      mode: "postgres",
      state: "unconfirmed",
      expired: true,
    });
  });

  it("queues the idempotent receipt after Postgres confirmation without any workflow dispatch or issue", async () => {
    const inviteId = "invite-postgres-receipt-001";
    const submissionId = "submission-postgres-receipt-001";
    const now = Date.now();
    const expiresAt = now + 30 * 60_000;
    const origin = onboardingOrigin;
    const token = await signedInvite({
      inviteId,
      expiresAt,
      allowedOrigins: [origin],
    });
    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
    );
    const tokenHash = [...digest]
      .map((part) => part.toString(16).padStart(2, "0"))
      .join("");
    const coordinator = inviteNamespace.getByName("test-postgres-receipt-flow");
    await coordinator.register({
      inviteId,
      clientEmail: null,
      expiresAt,
      allowedOrigin: origin,
      tokenHash,
      now,
    });
    await coordinator.reserveSubmission(
      inviteId,
      tokenHash,
      expiresAt,
      origin,
      submissionId,
      "payload-hash-a",
      "owner@example.test",
      now,
      "postgres",
    );
    const acceptance = {
      intakeId: "11111111-1111-4111-8111-111111111111",
      requestId: "22222222-2222-4222-8222-222222222222",
      attemptId: "33333333-3333-4333-8333-333333333333",
      operationId: "44444444-4444-4444-8444-444444444444",
    };
    const receiptKeys: Array<string | null> = [];
    network.use(
      http.post("https://api.resend.com/emails", ({ request }) => {
        receiptKeys.push(request.headers.get("Idempotency-Key"));
        return HttpResponse.json(
          { id: "email-postgres-receipt" },
          { status: 200 },
        );
      }),
    );

    await coordinator.confirmPostgresAcceptance({
      inviteId,
      submissionId,
      fingerprint: "payload-hash-a",
      acceptance,
      now,
    });
    await coordinator.queueIntakeReceipt(
      inviteId,
      submissionId,
      "sam@example.test",
      "Harbor Plumbing",
      now,
    );
    await coordinator.queueIntakeReceipt(
      inviteId,
      submissionId,
      "sam@example.test",
      "Harbor Plumbing",
      now + 1,
    );

    expect(receiptKeys).toHaveLength(1);
    expect(receiptKeys[0]).toBe(
      `client-intake-received-${acceptance.operationId}`,
    );
    await runInDurableObject(coordinator, async (_instance, state) => {
      const tasks = state.storage.sql
        .exec<{ task_type: string }>(
          "SELECT task_type FROM intake_outbox WHERE invite_id = ? AND submission_id = ?",
          inviteId,
          submissionId,
        )
        .toArray();
      expect(tasks).toEqual([{ task_type: "receipt" }]);
      const invite = state.storage.sql
        .exec<{ issue_number: number | null; status: string }>(
          "SELECT issue_number, status FROM onboarding_invites WHERE invite_id = ?",
          inviteId,
        )
        .toArray()[0];
      expect(invite).toEqual({ issue_number: null, status: "unused" });
    });
  });

  it("attributes a link-only invite to the email submitted with the intake", async () => {
    const inviteId = "invite-attribution-001";
    const submissionId = "submission-attribution-001";
    const token = await registeredInvite(inviteId, null);
    let dispatchPayload: Record<string, unknown> | undefined;
    network.use(
      http.get("https://api.github.com/repos/WrazyAI/launchloom/issues", () =>
        HttpResponse.json([]),
      ),
      http.post("https://api.github.com/repos/WrazyAI/launchloom/issues", () =>
        HttpResponse.json({ number: 993 }, { status: 201 }),
      ),
      http.post(
        "https://api.github.com/repos/WrazyAI/launchloom/dispatches",
        async ({ request }) => {
          dispatchPayload = (await request.json()) as Record<string, unknown>;
          return new HttpResponse(null, { status: 204 });
        },
      ),
      http.post("https://api.resend.com/emails", () =>
        HttpResponse.json({ id: "email-receipt-attribution" }),
      ),
    );

    const response = await SELF.fetch("https://api.launchloom.test/api/intake", {
      method: "POST",
      headers: { Origin: onboardingOrigin, "Content-Type": "application/json" },
      body: JSON.stringify({
        intakeVersion: "2", inviteToken: token, submissionId,
        businessName: "Juniper Legal", contactName: "Ada Owner", email: "owner@link-only.test",
        phone: "555-0102", address: "2 Main Street, Tacoma, WA", industry: "professional-services",
        services: ["Estate planning"], primaryCity: "Tacoma, WA", serviceRadius: "20",
        differentiators: "Plain-language guidance", primaryCta: "Request a consultation", confirmAccuracy: "yes",
        leadEmail: "leads@link-only.test",
      }),
    });

    expect(response.status).toBe(200);
    expect(dispatchPayload).toMatchObject({
      event_type: "intake-submitted",
      client_payload: {
        issue: 993,
        submission_id: submissionId,
        client_email: "owner@link-only.test",
      },
    });
    const listed = await runInDurableObject(
      inviteNamespace.getByName("launchloom-onboarding-invites"),
      async (untypedInstance) =>
        (untypedInstance as OnboardingInvites).list(Date.now()),
    );
    const invite = listed.find((item) => item.inviteId === inviteId);
    expect(invite?.clientEmail).toBeNull();
    expect(invite?.submitterEmail).toBe("owner@link-only.test");
  });
});


function recoveryIntake(inviteToken: string, submissionId: string) {
  return {
    intakeVersion: "2", inviteToken, submissionId,
    businessName: "Recovery Plumbing", contactName: "Sam", email: "sam@example.test",
    phone: "555-0100", address: "1 Main Street", industry: "home-services",
    services: ["Drain cleaning"], primaryCity: "Tacoma, WA", serviceRadius: "20",
    confirmAccuracy: "yes",
  };
}
function submitRecoveryIntake(input: ReturnType<typeof recoveryIntake>) {
  return SELF.fetch("https://api.launchloom.test/api/intake", {
    method: "POST", headers: { Origin: onboardingOrigin, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}
async function ageCreation(inviteId: string) {
  await runInDurableObject(inviteNamespace.getByName("launchloom-onboarding-invites"), (_, state) => {
    state.storage.sql.exec("UPDATE onboarding_invites SET reserved_at = ? WHERE invite_id = ?", Date.now() - 121_000, inviteId);
  });
}

describe("owner-bound intake recovery", () => {
  it("does not adopt a different invitation's issue with the same public submission id", async () => {
    const token = await registeredInvite("invite-owner-collision-001");
    const submissionId = "submission-owner-collision-001";
    let created = 0;
    network.use(
      http.get("https://api.github.com/repos/WrazyAI/launchloom/issues", () => HttpResponse.json([
        { number: 1001, body: `<!-- launchloom-intake:${submissionId} -->` },
      ])),
      http.post("https://api.github.com/repos/WrazyAI/launchloom/issues", () => { created++; return HttpResponse.json({ number: 1002 }, { status: 201 }); }),
      http.post("https://api.github.com/repos/WrazyAI/launchloom/dispatches", () => new HttpResponse(null, { status: 204 })),
      http.post("https://api.resend.com/emails", () => HttpResponse.json({ id: "receipt-owner" })),
    );
    const response = await submitRecoveryIntake(recoveryIntake(token, submissionId));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ issue: 1002 });
    expect(created).toBe(1);
  });

  it("retains the reservation when the issue creation response is ambiguous", async () => {
    const inviteId = "invite-owner-ambiguous-001";
    const token = await registeredInvite(inviteId);
    network.use(
      http.get("https://api.github.com/repos/WrazyAI/launchloom/issues", () => HttpResponse.json([])),
      http.post("https://api.github.com/repos/WrazyAI/launchloom/issues", () => HttpResponse.json({ message: "response lost after commit" }, { status: 503 })),
    );
    expect((await submitRecoveryIntake(recoveryIntake(token, "submission-owner-ambiguous-001"))).status).toBe(500);
    await runInDurableObject(inviteNamespace.getByName("launchloom-onboarding-invites"), (_, state) => {
      const row = state.storage.sql.exec<{reservation_phase: string; reserved_submission_id: string}>(
        "SELECT reservation_phase, reserved_submission_id FROM onboarding_invites WHERE invite_id = ?", inviteId).toArray()[0];
      expect(row).toMatchObject({ reservation_phase: "creating_issue", reserved_submission_id: "submission-owner-ambiguous-001" });
    });
  });

  it("recovers an owned issue from the second page after response loss without creating twice", async () => {
    const inviteId = "invite-owner-page2-001";
    const token = await registeredInvite(inviteId);
    const intake = recoveryIntake(token, "submission-owner-page2-001");
    let savedBody = "";
    let creates = 0;
    network.use(
      http.get("https://api.github.com/repos/WrazyAI/launchloom/issues", ({ request }) => {
        if (new URL(request.url).searchParams.get("page") === "2") return HttpResponse.json([{ number: 1003, body: savedBody }]);
        return HttpResponse.json(savedBody ? Array.from({length: 100}, (_, i) => ({ number: 2000 + i, body: "unrelated" })) : []);
      }),
      http.post("https://api.github.com/repos/WrazyAI/launchloom/issues", async ({ request }) => {
        creates++; savedBody = String((await request.json() as {body: string}).body);
        return HttpResponse.json({ message: "lost after commit" }, { status: 503 });
      }),
      http.post("https://api.github.com/repos/WrazyAI/launchloom/dispatches", () => new HttpResponse(null, { status: 204 })),
      http.post("https://api.resend.com/emails", () => HttpResponse.json({ id: "receipt-page2" })),
    );
    expect((await submitRecoveryIntake(intake)).status).toBe(500);
    await ageCreation(inviteId);
    const recovered = await submitRecoveryIntake(intake);
    expect(recovered.status).toBe(200);
    expect(await recovered.json()).toMatchObject({ issue: 1003 });
    expect(creates).toBe(1);
    expect(savedBody).toMatch(/launchloom-intake-operation:[a-f0-9-]+:[a-f0-9]{64}/u);
  });

  it("requires operator recovery after three empty sweeps without releasing an ambiguous creation", async () => {
    const inviteId = "invite-owner-exhausted-001";
    const token = await registeredInvite(inviteId);
    const intake = recoveryIntake(token, "submission-owner-exhausted-001");
    let creates = 0;
    network.use(
      http.get("https://api.github.com/repos/WrazyAI/launchloom/issues", () => HttpResponse.json([])),
      http.post("https://api.github.com/repos/WrazyAI/launchloom/issues", () => { creates++; return HttpResponse.json({}, { status: 503 }); }),
    );
    await submitRecoveryIntake(intake);
    await ageCreation(inviteId);
    await submitRecoveryIntake(intake);
    await submitRecoveryIntake(intake);
    const exhausted = await submitRecoveryIntake(intake);
    expect(exhausted.status).toBe(409);
    expect(await exhausted.json()).toMatchObject({ code: "recovery_required" });
    expect(creates).toBe(1);
  });
});


describe("intake recovery compatibility and interruption", () => {
  it("requires operator reconciliation for a legacy incomplete reservation without assigning a new owner", async () => {
    const inviteId = "invite-legacy-recovery-001";
    const token = await registeredInvite(inviteId);
    const intake = recoveryIntake(token, "submission-legacy-recovery-001");
    const coordinator = inviteNamespace.getByName("launchloom-onboarding-invites");
    await runInDurableObject(coordinator, (_, state) => {
      state.storage.sql.exec("UPDATE onboarding_invites SET reserved_submission_id = ?, reserved_submission_hash = ?, reserved_at = ?, reservation_phase = 'creating_issue', operation_id = NULL WHERE invite_id = ?", intake.submissionId, "legacy-hash", Date.now() - 121_000, inviteId);
    });
    const response = await submitRecoveryIntake(intake);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "recovery_required" });
    const list = await coordinator.list();
    expect(list.find(item => item.inviteId === inviteId)).toMatchObject({ recoveryRequired: true, status: "unused" });
  });

  it("does not accept an owned marker whose actual issue payload was changed", async () => {
    const inviteId = "invite-tampered-payload-001";
    const token = await registeredInvite(inviteId);
    const intake = recoveryIntake(token, "submission-tampered-payload-001");
    let savedBody = ""; let creates = 0;
    network.use(
      http.get("https://api.github.com/repos/WrazyAI/launchloom/issues", () => HttpResponse.json(savedBody ? [{number: 1004, body: savedBody.replace('"Recovery Plumbing"', '"Changed Business"')}] : [])),
      http.post("https://api.github.com/repos/WrazyAI/launchloom/issues", async ({request}) => { creates++; savedBody = String((await request.json() as {body: string}).body); return HttpResponse.json({}, {status: 503}); }),
    );
    await submitRecoveryIntake(intake); await ageCreation(inviteId);
    const response = await submitRecoveryIntake(intake);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({code: "in_progress"});
    expect(creates).toBe(1);
  });

  it("resumes the persisted page after a failed page read", async () => {
    const inviteId = "invite-interrupted-pages-001";
    const token = await registeredInvite(inviteId);
    const intake = recoveryIntake(token, "submission-interrupted-pages-001");
    let savedBody = ""; let page2Fails = true; const pages: number[] = [];
    network.use(
      http.get("https://api.github.com/repos/WrazyAI/launchloom/issues", ({request}) => {
        const page = Number(new URL(request.url).searchParams.get("page") || 1); pages.push(page);
        if (page === 1) return HttpResponse.json(Array.from({length: 100}, (_, i) => ({number: 3000 + i, body: "unrelated"})));
        if (page2Fails) return HttpResponse.json({}, {status: 503});
        return HttpResponse.json([{number: 1005, body: savedBody}]);
      }),
      http.post("https://api.github.com/repos/WrazyAI/launchloom/issues", async ({request}) => { savedBody = String((await request.json() as {body: string}).body); return HttpResponse.json({}, {status: 503}); }),
      http.post("https://api.github.com/repos/WrazyAI/launchloom/dispatches", () => new HttpResponse(null, {status: 204})),
      http.post("https://api.resend.com/emails", () => HttpResponse.json({id: "receipt-interrupted"})),
    );
    await submitRecoveryIntake(intake); await ageCreation(inviteId);
    const interrupted = await submitRecoveryIntake(intake);
    expect(interrupted.status).toBe(500);
    page2Fails = false;
    const recovered = await submitRecoveryIntake(intake);
    expect(recovered.status).toBe(200);
    expect(await recovered.json()).toMatchObject({issue: 1005});
    expect(pages).toEqual([1, 2, 2]);
  });

  it("uses distinct receipt idempotency keys for different owners reusing a public submission id", async () => {
    const first = await registeredInvite("invite-receipt-owner-a");
    const second = await registeredInvite("invite-receipt-owner-b");
    const keys: string[] = []; let issue = 4000;
    network.use(
      http.get("https://api.github.com/repos/WrazyAI/launchloom/issues", () => HttpResponse.json([])),
      http.post("https://api.github.com/repos/WrazyAI/launchloom/issues", () => HttpResponse.json({number: ++issue}, {status: 201})),
      http.post("https://api.github.com/repos/WrazyAI/launchloom/dispatches", () => new HttpResponse(null, {status: 204})),
      http.post("https://api.resend.com/emails", ({request}) => { keys.push(request.headers.get("Idempotency-Key") || ""); return HttpResponse.json({id: "receipt-distinct"}); }),
    );
    expect((await submitRecoveryIntake(recoveryIntake(first, "submission-shared-receipt-001"))).status).toBe(200);
    expect((await submitRecoveryIntake(recoveryIntake(second, "submission-shared-receipt-001"))).status).toBe(200);
    expect(new Set(keys).size).toBe(2);
  });
});


it("bounds repeated recovery transport failures without ever recreating the issue", async () => {
  const inviteId = "invite-recovery-transport-001";
  const token = await registeredInvite(inviteId);
  const intake = recoveryIntake(token, "submission-recovery-transport-001");
  let creates = 0;
  network.use(
    http.get("https://api.github.com/repos/WrazyAI/launchloom/issues", () => HttpResponse.json({}, {status: 503})),
    http.post("https://api.github.com/repos/WrazyAI/launchloom/issues", () => { creates++; return HttpResponse.json({}, {status: 503}); }),
  );
  await submitRecoveryIntake(intake); await ageCreation(inviteId);
  await submitRecoveryIntake(intake); await submitRecoveryIntake(intake);
  const response = await submitRecoveryIntake(intake);
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({code: "recovery_required"});
  expect(creates).toBe(1);
});

it("does not consume an invitation when GitHub's successful response has no issue number", async () => {
  const inviteId = "invite-recovery-malformed-001";
  const token = await registeredInvite(inviteId);
  network.use(http.post("https://api.github.com/repos/WrazyAI/launchloom/issues", () => HttpResponse.json({}, {status: 201})));
  const response = await submitRecoveryIntake(recoveryIntake(token, "submission-recovery-malformed-001"));
  expect(response.status).toBe(500);
  const list = await inviteNamespace.getByName("launchloom-onboarding-invites").list();
  expect(list.find(item => item.inviteId === inviteId)).toMatchObject({status: "unused", issueNumber: null});
});

it("does not release an ambiguous creation when recovery listing is rejected", async () => {
  const inviteId = "invite-recovery-list-denied-001";
  const token = await registeredInvite(inviteId);
  const intake = recoveryIntake(token, "submission-recovery-list-denied-001");
  let creates = 0;
  network.use(
    http.get("https://api.github.com/repos/WrazyAI/launchloom/issues", () => HttpResponse.json({}, {status: 403})),
    http.post("https://api.github.com/repos/WrazyAI/launchloom/issues", () => { creates++; return HttpResponse.json({}, {status: 503}); }),
  );
  await submitRecoveryIntake(intake); await ageCreation(inviteId);
  expect((await submitRecoveryIntake(intake)).status).toBe(500);
  await runInDurableObject(inviteNamespace.getByName("launchloom-onboarding-invites"), (_, state) => {
    const row = state.storage.sql.exec<{reservation_phase: string; reserved_submission_id: string}>("SELECT reservation_phase, reserved_submission_id FROM onboarding_invites WHERE invite_id = ?", inviteId).toArray()[0];
    expect(row).toMatchObject({reservation_phase: "creating_issue", reserved_submission_id: intake.submissionId});
  });
  expect(creates).toBe(1);
});

it("enforces durable rate limits on coverage lookups per invitation and resets after window expiry", async () => {
  const coordinator = inviteNamespace.getByName("launchloom-onboarding-invites");
  const inviteId = "invite-coverage-limit-unit-001";
  const start = 1_000_000;

  for (let i = 0; i < 40; i += 1) {
    const res = await coordinator.allowCoverageLookup(inviteId, start + i * 100);
    expect(res).toEqual({ allowed: true, retryAfterSeconds: 0 });
  }

  const blocked = await coordinator.allowCoverageLookup(inviteId, start + 5000);
  expect(blocked.allowed).toBe(false);
  expect(blocked.retryAfterSeconds).toBeGreaterThan(0);

  // Sliding window: the oldest lookup (at `start`) expires first, freeing
  // exactly one slot, and Retry-After points at that expiry.
  expect(blocked.retryAfterSeconds).toBe(595);
  const justBefore = await coordinator.allowCoverageLookup(inviteId, start + 599_999);
  expect(justBefore.allowed).toBe(false);
  const oneSlot = await coordinator.allowCoverageLookup(inviteId, start + 600_000);
  expect(oneSlot).toEqual({ allowed: true, retryAfterSeconds: 0 });
  const stillFull = await coordinator.allowCoverageLookup(inviteId, start + 600_001);
  expect(stillFull.allowed).toBe(false);

  // Once every earlier lookup has expired the invite has a full quota again.
  const afterWindow = await coordinator.allowCoverageLookup(inviteId, start + 1_200_001);
  expect(afterWindow).toEqual({ allowed: true, retryAfterSeconds: 0 });
});

it("prunes expired coverage lookup events so storage stays bounded", async () => {
  const coordinator = inviteNamespace.getByName("launchloom-onboarding-invites");
  await coordinator.resetCoverageLookupLimits();
  for (let i = 0; i < 30; i += 1)
    await coordinator.allowCoverageLookup(`invite-prune-${i}`, 1_000);
  await coordinator.allowCoverageLookup("invite-prune-fresh", 1_000 + 600_001);
  const remaining = await runInDurableObject(coordinator, async (_instance, state) =>
    state.storage.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM coverage_lookup_events").one().count,
  );
  expect(remaining).toBe(1);
});
