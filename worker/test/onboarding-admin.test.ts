import { env, runInDurableObject, SELF } from "cloudflare:test";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import worker, { type Env } from "../src/index";
import type { OnboardingInvites } from "../src/onboarding-invites";
import { network } from "./network";

const apiOrigin = "https://api.launchloom.wrazyos.com";
const testEnv = env as unknown as Env;
const inviteNamespace = (env as unknown as {
  ONBOARDING_INVITES: DurableObjectNamespace<OnboardingInvites>;
}).ONBOARDING_INVITES;

function accessContext(email: string, aud = "launchloom-local-onboarding-admin") {
  return {
    access: {
      aud,
      getIdentity: async () => ({ email }),
    },
  } as unknown as ExecutionContext;
}

describe("Access-protected invite administration", () => {
  it("fails closed when a request arrives without a verified Access identity", async () => {
    const page = await SELF.fetch("https://api.launchloom.test/admin/onboarding-invites");
    const api = await SELF.fetch("https://api.launchloom.test/api/admin/onboarding-invites");

    expect(page.status).toBe(403);
    expect(api.status).toBe(403);
  });

  it("creates one-use links only for the configured Access audience and administrator", async () => {
    const denied = await worker.fetch(
      new Request(`${apiOrigin}/api/admin/onboarding-invites`, {
        method: "POST",
        headers: { Origin: apiOrigin, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create" }),
      }),
      testEnv,
      accessContext("other@example.test"),
    );
    expect(denied.status).toBe(403);
    const wrongAudience = await worker.fetch(
      new Request(`${apiOrigin}/admin/onboarding-invites`),
      testEnv,
      accessContext("admin@example.test", "wrong-audience"),
    );
    expect(wrongAudience.status).toBe(403);

    const adminPage = await worker.fetch(
      new Request(`${apiOrigin}/admin/onboarding-invites`),
      testEnv,
      accessContext("admin@example.test"),
    );
    expect(adminPage.status).toBe(200);
    expect(adminPage.headers.get("Cache-Control")).toBe("no-store");
    expect(adminPage.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    const adminPageHtml = await adminPage.text();
    expect(adminPageHtml).toContain("Operations workspace");
    expect(adminPageHtml).toContain('src="/admin-assets/app.js"');
    expect(adminPageHtml).not.toContain("client@example.test");

    const created = await worker.fetch(
      new Request(`${apiOrigin}/api/admin/onboarding-invites`, {
        method: "POST",
        headers: { Origin: apiOrigin, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", clientEmail: "owner@example.test", creator: { id: "forged", role: "owner" } }),
      }),
      testEnv,
      accessContext("admin@example.test"),
    );
    expect(created.status).toBe(201);
    const result = await created.json() as { inviteId: string; clientEmail: string; url: string };
    expect(result).toMatchObject({ clientEmail: "owner@example.test" });
    const shared = await inviteNamespace.getByName("launchloom-onboarding-invites").listPage({});
    const saved = shared.items.find(item => item.inviteId === result.inviteId);
    expect(saved?.creator).toMatchObject({ kind: "admin", source: "cloudflare-access", email: "admin@example.test" });
    expect(saved?.creator.id).toMatch(/^access:[a-f0-9]{64}$/);
    expect(saved?.creator.id).not.toBe("forged");
    expect(result.url).toMatch(/^https:\/\/onboard\.example\.test\/onboard\/#invite=/u);
    const token = new URL(result.url).hash.slice("#invite=".length);
    const validated = await SELF.fetch("https://api.launchloom.test/api/onboarding-invites/validate", {
      method: "POST",
      headers: { Origin: "https://onboard.example.test", "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    expect(validated.status).toBe(200);
    await expect(validated.json()).resolves.toMatchObject({ valid: true, clientEmail: "owner@example.test" });

    const listing = await worker.fetch(
      new Request(`${apiOrigin}/api/admin/onboarding-invites`, { headers: { Origin: apiOrigin } }),
      testEnv,
      accessContext("admin@example.test"),
    );
    const inviteList = await listing.json() as { invites: Array<Record<string, unknown>> };
    expect(inviteList.invites).toEqual(expect.arrayContaining([
      expect.objectContaining({ inviteId: result.inviteId, status: "unused", clientEmail: "owner@example.test" }),
    ]));
    expect(JSON.stringify(inviteList)).not.toContain("#invite=");

    const revoked = await worker.fetch(
      new Request(`${apiOrigin}/api/admin/onboarding-invites`, {
        method: "POST",
        headers: { Origin: apiOrigin, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke", inviteId: result.inviteId }),
      }),
      testEnv,
      accessContext("admin@example.test"),
    );
    expect(revoked.status).toBe(200);
    const replay = await SELF.fetch("https://api.launchloom.test/api/onboarding-invites/validate", {
      method: "POST",
      headers: { Origin: "https://onboard.example.test", "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    expect(replay.status).toBe(403);
  });

  it("encodes non-ASCII client emails as UTF-8 invite claims", async () => {
    const email = "josé@example.test";
    const created = await worker.fetch(
      new Request(`${apiOrigin}/api/admin/onboarding-invites`, {
        method: "POST",
        headers: { Origin: apiOrigin, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", clientEmail: email }),
      }),
      testEnv,
      accessContext("admin@example.test"),
    );

    expect(created.status).toBe(201);
    const result = await created.json() as { url: string };
    const token = new URL(result.url).hash.slice("#invite=".length);
    const validated = await SELF.fetch("https://api.launchloom.test/api/onboarding-invites/validate", {
      method: "POST",
      headers: { Origin: "https://onboard.example.test", "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });

    expect(validated.status).toBe(200);
    await expect(validated.json()).resolves.toMatchObject({ valid: true, clientEmail: email });
  });

  it("keeps invite administration same-origin while allowing origin-less GETs", async () => {
    const context = accessContext("admin@example.test");
    const crossOriginGet = await worker.fetch(
      new Request(`${apiOrigin}/api/admin/onboarding-invites`, {
        headers: { Origin: "https://untrusted.pages.dev" },
      }),
      testEnv,
      context,
    );
    expect(crossOriginGet.status).toBe(403);
    expect(crossOriginGet.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(crossOriginGet.headers.get("Cache-Control")).toBe("no-store");

    const crossOriginPost = await worker.fetch(
      new Request(`${apiOrigin}/api/admin/onboarding-invites`, {
        method: "POST",
        headers: {
          Origin: "https://untrusted.pages.dev",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "create" }),
      }),
      testEnv,
      context,
    );
    expect(crossOriginPost.status).toBe(403);
    expect(crossOriginPost.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(crossOriginPost.headers.get("Cache-Control")).toBe("no-store");

    const crossOriginOptions = await worker.fetch(
      new Request(`${apiOrigin}/api/admin/onboarding-invites`, {
        method: "OPTIONS",
        headers: {
          Origin: "https://untrusted.pages.dev",
          "Access-Control-Request-Method": "POST",
        },
      }),
      testEnv,
      context,
    );
    expect(crossOriginOptions.status).toBe(403);
    expect(crossOriginOptions.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(crossOriginOptions.headers.get("Cache-Control")).toBe("no-store");

    const sameOriginOptions = await worker.fetch(
      new Request(`${apiOrigin}/api/admin/onboarding-invites`, {
        method: "OPTIONS",
        headers: {
          Origin: apiOrigin,
          "Access-Control-Request-Method": "POST",
        },
      }),
      testEnv,
      context,
    );
    expect(sameOriginOptions.status).toBe(204);
    expect(sameOriginOptions.headers.get("Access-Control-Allow-Origin")).toBe(apiOrigin);
    expect(sameOriginOptions.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    expect(sameOriginOptions.headers.get("Cache-Control")).toBe("no-store");

    const originlessGet = await worker.fetch(
      new Request(`${apiOrigin}/api/admin/onboarding-invites`),
      testEnv,
      context,
    );
    expect(originlessGet.status).toBe(200);
    expect(originlessGet.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(originlessGet.headers.get("Cache-Control")).toBe("no-store");
  });

  it("backfills missing client emails from stored intake issues", async () => {
    const inviteId = "invite-backfill-001";
    const issueNumber = 777;
    const now = Date.now();
    await runInDurableObject(
      inviteNamespace.getByName("launchloom-onboarding-invites"),
      async (_instance, state) => {
        state.storage.sql.exec(
          `INSERT INTO onboarding_invites
             (invite_id, client_email, expires_at, allowed_origin, token_hash, status,
              submission_id, submission_hash, issue_number, created_at, updated_at)
           VALUES (?, NULL, ?, ?, ?, 'consumed', ?, ?, ?, ?, ?)`,
          inviteId,
          now + 30 * 60_000,
          "https://onboard.example.test",
          `hash-${inviteId}`,
          `submission-${inviteId}`,
          "submission-hash",
          issueNumber,
          now,
          now,
        );
      },
    );
    const started = await SELF.fetch(
      "https://api.launchloom.test/api/internal/generations",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer test-generation-tracking-secret",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "start",
          generation: {
            generationId: "issue-777-backfill",
            issueNumber,
            businessName: "Fern & Forge",
          },
        }),
      },
    );
    expect(started.status).toBe(200);
    network.use(
      http.get(
        `https://api.github.com/repos/WrazyAI/launchloom/issues/${issueNumber}`,
        () =>
          HttpResponse.json({
            body: `<!-- launchloom-intake:submission-${inviteId} -->\n\n\`\`\`json\n{\n  "email": "owner@backfill.test"\n}\n\`\`\``,
          }),
      ),
    );

    const backfill = await worker.fetch(
      new Request(`${apiOrigin}/api/admin/onboarding-invites`, {
        method: "POST",
        headers: { Origin: apiOrigin, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "backfill" }),
      }),
      testEnv,
      accessContext("admin@example.test"),
    );
    expect(backfill.status).toBe(200);
    await expect(backfill.json()).resolves.toMatchObject({
      ok: true,
      backfilled: 1,
    });

    const listing = await worker.fetch(
      new Request(`${apiOrigin}/api/admin/onboarding-invites`, {
        headers: { Origin: apiOrigin },
      }),
      testEnv,
      accessContext("admin@example.test"),
    );
    const inviteList = (await listing.json()) as {
      invites: Array<Record<string, unknown>>;
    };
    expect(inviteList.invites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          inviteId,
          clientEmail: null,
          submitterEmail: "owner@backfill.test",
        }),
      ]),
    );

    const generations = await worker.fetch(
      new Request(`${apiOrigin}/api/admin/onboarding-invites/generations`, {
        headers: { Origin: apiOrigin },
      }),
      testEnv,
      accessContext("admin@example.test"),
    );
    const ledger = (await generations.json()) as {
      generations: Array<Record<string, unknown>>;
    };
    expect(ledger.generations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          generationId: "issue-777-backfill",
          clientEmail: "owner@backfill.test",
        }),
      ]),
    );
  });
});

async function seedRecoveryReservation(inviteId: string, payload: Record<string, unknown>, operationId: string | null = null) {
  const coordinator = inviteNamespace.getByName("launchloom-onboarding-invites");
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(payload))));
  const payloadHash = [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
  await coordinator.register({inviteId, clientEmail: "owner@example.test", allowedOrigin: "https://onboard.example.test", expiresAt: Date.now()+3600000, tokenHash: `token-${inviteId}`, now: Date.now()});
  await runInDurableObject(coordinator, (_, state) => {
    state.storage.sql.exec("UPDATE onboarding_invites SET reserved_submission_id = ?, reserved_submission_hash = ?, reservation_phase = 'creating_issue', reserved_at = ?, operation_id = ?, recovery_sweeps = 3 WHERE invite_id = ?", String(payload.submissionId), payloadHash, Date.now()-121000, operationId, inviteId);
  });
  return {coordinator,payloadHash};
}
function recoveryAdminRequest(inviteId: string, issueNumber: number, confirmed = true) {
  return new Request(`${apiOrigin}/api/admin/onboarding-invites`, {method: "POST",headers:{Origin:apiOrigin,"Content-Type":"application/json"},body:JSON.stringify({action:"recover-intake",inviteId,issueNumber,confirmed})});
}

describe("interim Access principal", () => {
  const meUrl = `${apiOrigin}/api/admin/onboarding-invites/workspace/me`;

  async function expectedId(email: string) {
    const bytes = new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(email),
      ),
    );
    return `access:${[...bytes]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")}`;
  }

  it("returns only the verified Access principal and ignores browser identity", async () => {
    const response = await worker.fetch(
      new Request(`${meUrl}?email=forged@example.test`, {
        headers: {
          Origin: apiOrigin,
          "X-Admin-Email": "forged@example.test",
          "X-Access-Email": "forged@example.test",
        },
      }),
      testEnv,
      accessContext(" Admin@Example.test "),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Type")).toBe("application/json");
    const payload = (await response.json()) as {
      principal: Record<string, unknown>;
    };
    expect(payload).toEqual({
      principal: {
        id: await expectedId("admin@example.test"),
        email: "admin@example.test",
        displayName: null,
        role: "admin",
        authSource: "cloudflare-access",
      },
    });
    expect(JSON.stringify(payload)).not.toContain("forged");
    expect(payload.principal).not.toHaveProperty("owner");

    const denied = await worker.fetch(
      new Request(meUrl, { headers: { Origin: apiOrigin } }),
      testEnv,
      accessContext("other@example.test"),
    );
    expect(denied.status).toBe(403);
    const wrongAudience = await worker.fetch(
      new Request(meUrl),
      testEnv,
      accessContext("admin@example.test", "wrong-audience"),
    );
    expect(wrongAudience.status).toBe(403);
    const signedOut = await worker.fetch(
      new Request(meUrl),
      testEnv,
      {} as ExecutionContext,
    );
    expect(signedOut.status).toBe(401);
  });

  it("does not fabricate a principal when Neon mode is selected", async () => {
    const response = await worker.fetch(
      new Request(meUrl),
      { ...testEnv, ADMIN_AUTH_MODE: "neon" } as Env,
      accessContext("admin@example.test"),
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "not_enabled",
        message: "Persistent account profiles are not enabled.",
      },
    });
  });
});

describe("operator-confirmed intake reconciliation", () => {
  it("binds a verified legacy issue with an audit receipt and delivers its outbox once", async () => {
    const inviteId = "invite-admin-recovery-001";
    const payload = {submissionId:"submission-admin-recovery-001",email:"owner@example.test",businessName:"Synthetic Recovery"};
    const {coordinator} = await seedRecoveryReservation(inviteId,payload);
    let dispatches=0,receipts=0;
    network.use(
      http.get("https://api.github.com/repos/WrazyAI/launchloom/issues/12001",()=>HttpResponse.json({number:12001,body:"```json\n"+JSON.stringify(payload)+"\n```"})),
      http.post("https://api.github.com/repos/WrazyAI/launchloom/dispatches",()=>{dispatches++;return new HttpResponse(null,{status:204});}),
      http.post("https://api.resend.com/emails",()=>{receipts++;return HttpResponse.json({id:"synthetic-recovery-receipt"});}),
    );
    const response=await worker.fetch(recoveryAdminRequest(inviteId,12001),testEnv,accessContext("admin@example.test"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ok:true,issue:12001});
    const repeated=await worker.fetch(recoveryAdminRequest(inviteId,12001),testEnv,accessContext("admin@example.test"));
    expect(repeated.status).toBe(200);
    expect(dispatches).toBe(1);expect(receipts).toBe(1);
    const attempts = await testEnv.GENERATION_LEDGER.getByName("launchloom-generations").listAttempts({clientId:`submission:${payload.submissionId}`});
    expect(attempts.items).toHaveLength(1);
    expect(attempts.items[0].initiator).toMatchObject({kind:"admin",email:"admin@example.test",source:"cloudflare-access"});
    const accepted = (await coordinator.acceptedPage({})).items.find(item=>item.submissionId===payload.submissionId);
    expect(accepted).toMatchObject({businessName:"Synthetic Recovery",email:"owner@example.test"});
    expect((await coordinator.list()).find(row=>row.inviteId===inviteId)).toMatchObject({status:"consumed",issueNumber:12001,recoveryRequired:false});
    await runInDurableObject(coordinator,(_,state)=>{
      expect(state.storage.sql.exec<{issue_number:number;reviewer_email:string}>("SELECT issue_number, reviewer_email FROM intake_reconciliations WHERE invite_id = ?",inviteId).toArray()[0]).toEqual({issue_number:12001,reviewer_email:"admin@example.test"});
    });
  });

  it("rejects a selected issue with different payload even after operator confirmation", async () => {
    const inviteId="invite-admin-recovery-mismatch";
    await seedRecoveryReservation(inviteId,{submissionId:"submission-admin-mismatch",email:"owner@example.test",businessName:"Original"});
    network.use(http.get("https://api.github.com/repos/WrazyAI/launchloom/issues/12002",()=>HttpResponse.json({number:12002,body:'```json\n{"businessName":"Other"}\n```'})));
    const response=await worker.fetch(recoveryAdminRequest(inviteId,12002),testEnv,accessContext("admin@example.test"));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({code:"recovery_mismatch"});
  });

  it("requires explicit confirmation and a verified Access identity", async () => {
    const inviteId="invite-admin-recovery-unconfirmed";
    const denied=await worker.fetch(recoveryAdminRequest(inviteId,12003),testEnv,accessContext("other@example.test"));
    expect(denied.status).toBe(403);
    const response=await worker.fetch(recoveryAdminRequest(inviteId,12003,false),testEnv,accessContext("admin@example.test"));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({code:"recovery_confirmation_required"});
  });
});

it("does not let operator confirmation adopt another operation with the same payload", async () => {
  const inviteId="invite-admin-recovery-owner-check";
  const payload={submissionId:"submission-admin-owner-check",email:"owner@example.test",businessName:"Original"};
  const {payloadHash}=await seedRecoveryReservation(inviteId,payload,"owner-operation-001");
  network.use(http.get("https://api.github.com/repos/WrazyAI/launchloom/issues/12004",()=>HttpResponse.json({number:12004,body:'<!-- launchloom-intake-operation:other-operation-001:'+payloadHash+' -->\n```json\n'+JSON.stringify(payload)+'\n```'})));
  const response=await worker.fetch(recoveryAdminRequest(inviteId,12004),testEnv,accessContext("admin@example.test"));
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({code:"recovery_mismatch"});
});
