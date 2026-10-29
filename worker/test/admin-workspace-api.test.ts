import {
  env,
  evictDurableObject,
  runDurableObjectAlarm,
  runInDurableObject,
} from "cloudflare:test";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import worker, { type Env } from "../src/index";
import type { ClientInput, AttemptInput } from "../../src/lib/admin-contracts";
import type { GenerationLedger } from "../src/generation-ledger";
import type { OnboardingInvites } from "../src/onboarding-invites";
import { network } from "./network";

const bindings = env as unknown as Env;
const origin = "https://api.launchloom.test";
const base = `${origin}/api/admin/onboarding-invites/workspace`;
const context = (email = "admin@example.test") =>
  ({
    access: {
      aud: "launchloom-local-onboarding-admin",
      getIdentity: async () => ({ email }),
    },
  }) as unknown as ExecutionContext;
const creator = {
  kind: "admin",
  id: "admin-1",
  name: "Admin",
  email: "admin@example.test",
  source: "cloudflare-access",
} as const;
const client = (n: number): ClientInput => ({
  clientId: `submission:s-${n}`,
  inviteId: `i-${n}`,
  submissionId: `s-${n}`,
  issueNumber: n + 1,
  businessName: n === 0 ? "Oldest unique business" : `Business ${n}`,
  contactName: "Sam",
  email: "same@example.test",
  phone: null,
  creator,
  submittedAt: 1000 + n,
});
const ledger = () =>
  bindings.GENERATION_LEDGER.getByName("launchloom-generations");
const invites = () =>
  bindings.ONBOARDING_INVITES.getByName("launchloom-onboarding-invites");

function attemptSeed(
  overrides: Pick<AttemptInput, "attemptId" | "issueNumber"> &
    Partial<AttemptInput>,
): AttemptInput {
  const createdAt = overrides.createdAt ?? 10_000;
  return {
    requestId: null,
    clientId: null,
    profile: "full",
    initiator: creator,
    invitationCreator: creator,
    repository: "WrazyAI/launchloom",
    runId: null,
    runAttempt: null,
    executionStatus: "failed",
    deliveryStatus: "none",
    stale: false,
    createdAt,
    startedAt: createdAt,
    completedAt: createdAt + 1_000,
    updatedAt: createdAt + 1_000,
    failure: {
      category: null,
      stage: null,
      summary: null,
      evidenceUrl: null,
      nextStep: null,
    },
    ...overrides,
  };
}
const relatedDetail = (attemptId: string) =>
  worker.fetch(
    new Request(`${base}/attempts/${encodeURIComponent(attemptId)}`, {
      headers: { Origin: origin },
    }),
    bindings,
    context(),
  );

describe("shared workspace", () => {
  it("assigns stable correlation to migrated pending operations on alarm recovery without a queue RPC", async () => {
    const coordinator = bindings.ONBOARDING_INVITES.getByName(
      "fix1-migrated-pending",
    );
    const operationTime = Date.now() - 60000;
    await runInDurableObject(coordinator, async (_instance, state) => {
      state.storage.sql
        .exec(`INSERT INTO onboarding_invites(invite_id,expires_at,allowed_origin,token_hash,status,submission_id,issue_number,created_at,updated_at)
        VALUES('migrated-pending',9999999999999,'https://onboard.example.test','migrated-pending-hash','consumed','migrated-submission',91001,1000,2000)`);
      state.storage.sql.exec(
        `INSERT INTO intake_outbox(invite_id,submission_id,task_type,issue_number,status,next_attempt_at,created_at,updated_at)
        VALUES('migrated-pending','migrated-submission','workflow',91001,'pending',?,?,?)`,
        operationTime,
        operationTime,
        operationTime,
      );
      await state.storage.deleteAlarm();
    });
    const payloads: Array<Record<string, unknown>> = [];
    network.use(
      http.post(
        "https://api.github.com/repos/WrazyAI/launchloom/dispatches",
        async ({ request }) => {
          payloads.push(
            (
              (await request.json()) as {
                client_payload: Record<string, unknown>;
              }
            ).client_payload,
          );
          return new HttpResponse(null, {
            status: payloads.length === 1 ? 500 : 204,
          });
        },
      ),
    );
    await evictDurableObject(coordinator);
    await coordinator.acceptedPage({});
    expect(await runDurableObjectAlarm(coordinator)).toBe(true);
    expect(payloads).toHaveLength(1);
    expect(payloads[0].request_id).toEqual(expect.any(String));
    expect(payloads[0].attempt_id).toEqual(expect.any(String));
    const attempts = await ledger().listAttempts({
      clientId: "submission:migrated-submission",
    });
    expect(attempts.items).toHaveLength(1);
    expect(attempts.items[0]).toMatchObject({
      attemptId: payloads[0].attempt_id,
      requestId: payloads[0].request_id,
      createdAt: operationTime,
      executionStatus: "queued",
    });
    expect(await coordinator.projectionHealth()).toMatchObject({
      pendingProjectionCount: 0,
    });
    await runInDurableObject(coordinator, (_instance, state) => {
      state.storage.sql.exec(
        "UPDATE intake_outbox SET next_attempt_at=? WHERE status='pending'",
        Date.now() - 1,
      );
    });
    await evictDurableObject(coordinator);
    await coordinator.acceptedPage({});
    expect(await runDurableObjectAlarm(coordinator)).toBe(true);
    expect(payloads).toHaveLength(2);
    expect(payloads[1]).toEqual(payloads[0]);
    expect(
      (
        await ledger().listAttempts({
          clientId: "submission:migrated-submission",
        })
      ).items,
    ).toHaveLength(1);
    await runInDurableObject(ledger(), (_instance, state) => {
      expect(
        state.storage.sql
          .exec<{ initial_attempt_id: string }>(
            "SELECT initial_attempt_id FROM generation_dispatches WHERE request_id=?",
            String(payloads[0].request_id),
          )
          .one().initial_attempt_id,
      ).toBe(payloads[0].attempt_id);
    });
  });

  it("does not invent correlation for already-delivered legacy operations, even on queue replay", async () => {
    const coordinator = bindings.ONBOARDING_INVITES.getByName(
      "fix1-migrated-delivered",
    );
    await runInDurableObject(coordinator, async (_instance, state) => {
      state.storage.sql
        .exec(`INSERT INTO onboarding_invites(invite_id,expires_at,allowed_origin,token_hash,status,submission_id,issue_number,created_at,updated_at)
        VALUES('migrated-delivered',9999999999999,'https://onboard.example.test','migrated-delivered-hash','consumed','delivered-submission',91002,1000,2000)`);
      state.storage.sql
        .exec(`INSERT INTO intake_outbox(invite_id,submission_id,task_type,issue_number,status,next_attempt_at,created_at,updated_at)
        VALUES('migrated-delivered','delivered-submission','workflow',91002,'delivered',1000,1000,2000)`);
      await state.storage.deleteAlarm();
    });
    await evictDurableObject(coordinator);
    await coordinator.acceptedPage({});
    await runDurableObjectAlarm(coordinator);
    await coordinator.queueWorkflowDispatch(
      "migrated-delivered",
      "delivered-submission",
      91002,
    );
    await runInDurableObject(coordinator, (_instance, state) => {
      expect(
        state.storage.sql
          .exec(
            "SELECT request_id,attempt_id,status FROM intake_outbox WHERE invite_id='migrated-delivered'",
          )
          .one(),
      ).toEqual({ request_id: null, attempt_id: null, status: "delivered" });
    });
    expect(
      (
        await ledger().listAttempts({
          clientId: "submission:delivered-submission",
        })
      ).items,
    ).toHaveLength(0);
  });

  it("uses actual delayed workflow operation creation time, not acceptance or projection enqueue time", async () => {
    const coordinator =
      bindings.ONBOARDING_INVITES.getByName("fix1-delayed-queue");
    const acceptedAt = Date.now() - 3600000;
    const operationTime = Date.now() - 60000;
    const expiresAt = Date.now() + 60000;
    await coordinator.register({
      inviteId: "delayed-queue",
      clientEmail: null,
      expiresAt,
      allowedOrigin: origin,
      tokenHash: "delayed-hash",
      now: acceptedAt,
      creator,
    });
    expect(
      await coordinator.reserveSubmission(
        "delayed-queue",
        "delayed-hash",
        expiresAt,
        origin,
        "delayed-submission",
        "payload",
        "client@example.test",
        acceptedAt,
      ),
    ).toMatchObject({ accepted: true });
    await coordinator.recordIssue(
      "delayed-queue",
      "delayed-submission",
      "payload",
      91003,
      acceptedAt,
      { businessName: "Delayed client", email: "client@example.test" },
    );
    await runInDurableObject(coordinator, (_instance, state) => {
      const row = state.storage.sql
        .exec<{ data: string }>(
          "SELECT data FROM intake_projection_outbox WHERE invite_id='delayed-queue'",
        )
        .one();
      expect(JSON.parse(row.data)).toMatchObject({
        dispatchCreatedAt: null,
        requestId: null,
        attemptId: null,
      });
      // Old snapshots can contain the acceptance-time fallback from FIX_BASE;
      // registration must ignore it in favor of the actual workflow operation.
      state.storage.sql.exec(
        "UPDATE intake_projection_outbox SET data=? WHERE invite_id='delayed-queue'",
        JSON.stringify({
          ...JSON.parse(row.data),
          dispatchCreatedAt: acceptedAt,
        }),
      );
    });
    network.use(
      http.post(
        "https://api.github.com/repos/WrazyAI/launchloom/dispatches",
        () => new HttpResponse(null, { status: 204 }),
      ),
    );
    await coordinator.queueWorkflowDispatch(
      "delayed-queue",
      "delayed-submission",
      91003,
      operationTime,
    );
    const before = (
      await ledger().listAttempts({ clientId: "submission:delayed-submission" })
    ).items;
    expect(before).toHaveLength(1);
    expect(before[0]).toMatchObject({
      createdAt: operationTime,
      updatedAt: operationTime,
      startedAt: null,
    });
    await evictDurableObject(coordinator);
    await evictDurableObject(ledger());
    await coordinator.queueWorkflowDispatch(
      "delayed-queue",
      "delayed-submission",
      91003,
      Date.now(),
    );
    expect(
      (
        await ledger().listAttempts({
          clientId: "submission:delayed-submission",
        })
      ).items,
    ).toEqual(before);
    expect(
      (
        await ledger().listAttempts({
          clientId: "submission:delayed-submission",
          to: acceptedAt,
        })
      ).total,
    ).toBe(0);
    expect(
      (
        await ledger().listAttempts({
          clientId: "submission:delayed-submission",
          from: operationTime,
          to: operationTime,
        })
      ).total,
    ).toBe(1);
  });

  it("paginates and searches all 251 explicitly bound clients without merging email matches", async () => {
    const store = bindings.GENERATION_LEDGER.getByName(
      "workspace-client-pagination",
    );
    await runInDurableObject(store, async (raw) => {
      const instance = raw as unknown as GenerationLedger;
      for (let n = 0; n < 251; n++) await instance.upsertClient(client(n));
    });
    let cursor: string | undefined;
    const ids: string[] = [];
    do {
      const page = await store.listClients({ limit: 100, cursor });
      expect(page.total).toBe(251);
      ids.push(...page.items.map((item) => item.clientId));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(new Set(ids).size).toBe(251);
    expect(
      (await store.listClients({ search: "oldest unique" })).items.map(
        (c) => c.clientId,
      ),
    ).toEqual(["submission:s-0"]);
    await runInDurableObject(store, async (raw) => {
      const instance = raw as unknown as GenerationLedger;
      await expect(
        instance.upsertClient({ ...client(0), inviteId: "different" }),
      ).rejects.toThrow(/conflict/);
      const retained = await instance.upsertClient({
        ...client(0),
        inviteId: null,
      });
      expect(retained.inviteId).toBe("i-0");
      await expect(
        instance.listClients({ cursor: "not-a-cursor" }),
      ).rejects.toThrow(/invalid/);
    });
  });

  it("pages all 151 invitations and accepted source evidence without exposing token hashes", async () => {
    await runInDurableObject(invites(), async (raw) => {
      const instance = raw as unknown as OnboardingInvites;
      for (let n = 0; n < 151; n++)
        await instance.register({
          inviteId: `invite-${n}`,
          clientEmail: null,
          expiresAt: 9999999999999,
          allowedOrigin: origin,
          tokenHash: `private-${n}`,
          now: n,
          creator,
        });
    });
    const first = await invites().listPage({ limit: 100 });
    const second = await invites().listPage({
      limit: 100,
      cursor: first.nextCursor!,
    });
    expect(first.total).toBe(151);
    expect(second.items).toHaveLength(51);
    expect(
      (await invites().listPage({ search: "invite-0" })).items[0].creator,
    ).toEqual(creator);
    expect(JSON.stringify(first)).not.toContain("private-");
    expect(await invites().acceptedPage({})).toEqual({
      items: [],
      total: 0,
      nextCursor: null,
    });
  });

  it("returns equal shared IDs to two allowed admins and safe detail/errors with no dispatch side effects", async () => {
    await ledger().upsertClient(client(0));
    const environment = {
      ...bindings,
      ONBOARDING_ADMIN_EMAILS: "admin@example.test,second@example.test",
    };
    const read = (path: string, email?: string) =>
      worker.fetch(new Request(`${base}${path}`), environment, context(email));
    const a = await read("/clients");
    const b = await read("/clients", "second@example.test");
    expect(a.status).toBe(200);
    expect(await a.json()).toEqual(await b.json());
    const detail = await read("/clients/submission%3As-0");
    expect(await detail.json()).toMatchObject({
      client: { clientId: "submission:s-0", previewUrl: null },
    });
    expect((await read("/clients/missing")).status).toBe(404);
    expect((await read("/clients?limit=invalid")).status).toBe(400);
    const health = await read("/health");
    expect(await health.json()).toMatchObject({
      partial: true,
      lastSyncAt: null,
    });
    const anonymous = await worker.fetch(
      new Request(`${base}/clients`),
      environment,
      {} as ExecutionContext,
    );
    expect(anonymous.status).toBe(401);
    const cross = await worker.fetch(
      new Request(`${base}/clients`, {
        headers: { Origin: "https://evil.test" },
      }),
      environment,
      context(),
    );
    expect(cross.status).toBe(403);
    expect((await read("/clients", "denied@example.test")).status).toBe(403);
  });

  it("retries rejected projections independently of workflow and receipt deliveries with stable dispatch correlation", async () => {
    const coordinator = invites();
    const now = Date.now();
    await coordinator.register({
      inviteId: "projection-outage",
      clientEmail: null,
      expiresAt: now + 60000,
      allowedOrigin: origin,
      tokenHash: "hash",
      now,
      creator,
    });
    await coordinator.reserveSubmission(
      "projection-outage",
      "hash",
      now + 60000,
      origin,
      "outage-submission",
      "payload",
      "client@example.test",
      now,
    );
    await coordinator.recordIssue(
      "projection-outage",
      "outage-submission",
      "payload",
      7711,
      now,
      {
        businessName: "Outage business",
        email: "client@example.test",
        contactName: "Client",
      },
    );
    let dispatches = 0;
    let receipts = 0;
    const payloads: Array<Record<string, unknown>> = [];
    network.use(
      http.post(
        "https://api.github.com/repos/WrazyAI/launchloom/dispatches",
        async ({ request }) => {
          payloads.push(
            (
              (await request.json()) as {
                client_payload: Record<string, unknown>;
              }
            ).client_payload,
          );
          dispatches++;
          return new HttpResponse(null, {
            status: dispatches === 1 ? 500 : 204,
          });
        },
      ),
      http.post("https://api.resend.com/emails", () => {
        receipts++;
        return HttpResponse.json({ id: "receipt" });
      }),
    );
    // A conflicting synthetic ledger snapshot rejects projection without mocking its persistence.
    await ledger().upsertClient({
      clientId: "submission:outage-submission",
      inviteId: "projection-outage",
      submissionId: "outage-submission",
      issueNumber: 7711,
      businessName: "Conflicting snapshot",
      contactName: "Client",
      email: "client@example.test",
      phone: null,
      creator,
      submittedAt: now,
    });
    try {
      await coordinator.queueWorkflowDispatch(
        "projection-outage",
        "outage-submission",
        7711,
      );
      await coordinator.queueIntakeReceipt(
        "projection-outage",
        "outage-submission",
        "client@example.test",
        "Outage business",
      );
      expect(receipts).toBe(1);
      expect(await coordinator.projectionHealth()).toMatchObject({
        partial: true,
        pendingProjectionCount: 1,
      });
      const api = await worker.fetch(
        new Request(`${base}/clients`),
        bindings,
        context(),
      );
      expect(await api.json()).toMatchObject({
        health: { partial: true, pendingProjectionCount: 1 },
      });
      await runInDurableObject(coordinator, (_instance, state) => {
        state.storage.sql.exec(
          "UPDATE intake_outbox SET next_attempt_at=? WHERE status='pending'",
          Date.now() - 1,
        );
        state.storage.sql.exec(
          "UPDATE intake_projection_outbox SET next_attempt_at=? WHERE status='pending'",
          Date.now() - 1,
        );
      });
    } finally {
      await runInDurableObject(ledger(), (_instance, state) => {
        state.storage.sql.exec(
          "DELETE FROM admin_clients WHERE client_id='submission:outage-submission'",
        );
      });
    }
    await runDurableObjectAlarm(coordinator);
    expect(dispatches).toBe(2);
    expect(receipts).toBe(1);
    expect(payloads[0]).toMatchObject({
      invite_id: "projection-outage",
      submission_id: "outage-submission",
    });
    expect(payloads[0].request_id).toBeTruthy();
    expect(payloads[0].attempt_id).toBeTruthy();
    expect(payloads[1]).toEqual(payloads[0]);
    const attempts = await ledger().listAttempts({
      clientId: "submission:outage-submission",
    });
    expect(attempts.items).toHaveLength(1);
    expect(attempts.items[0]).toMatchObject({
      initiator: { kind: "client" },
      invitationCreator: creator,
      executionStatus: "queued",
      deliveryStatus: "none",
    });
    expect(await coordinator.projectionHealth()).toMatchObject({
      pendingProjectionCount: 0,
      partial: false,
    });
    await runInDurableObject(coordinator, async (raw) => {
      await expect(
        (raw as unknown as OnboardingInvites).queueWorkflowDispatch(
          "projection-outage",
          "outage-submission",
          9999,
        ),
      ).rejects.toThrow(/conflict/);
    });
  });

  it("never exposes private or signed evidence URLs through attempt detail and event APIs", async () => {
    await ledger().upsertClient(client(1));
    const request = {
      requestId: "safe-request",
      attemptId: "safe-attempt",
      clientId: "submission:s-1",
      inviteId: "i-1",
      submissionId: "s-1",
      issueNumber: 2,
      initiator: creator,
      invitationCreator: creator,
      createdAt: 1001,
    };
    await ledger().registerDispatch(request);
    const { createdAt, ...rest } = request;
    await expect(
      ledger().registerDispatch({ createdAt, ...rest }),
    ).resolves.toEqual({
      requestId: "safe-request",
      attemptId: "safe-attempt",
    });
    expect(
      (await ledger().listAttempts({ search: "Business 1" })).items.map(
        (item) => item.attemptId,
      ),
    ).toEqual(["safe-attempt"]);
    await ledger().recordAttemptEvents("safe-attempt", [
      {
        eventKey: "private",
        stage: "diagnosis",
        status: "unknown",
        observedAt: 2000,
        source: "callback",
        detail:
          "Read https://api.launchloom.test/private/source?token=private-token",
      },
    ]);
    const response = await worker.fetch(
      new Request(`${base}/attempts/safe-attempt/events`),
      bindings,
      context(),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain("private-token");
  });

  it("links a failed full attempt to the latest verified preview for the exact issue", async () => {
    const issue = 7401;
    await ledger().upsertAttempt(
      attemptSeed({
        attemptId: "related-older-success",
        issueNumber: issue,
        runId: "40737000000",
        runAttempt: 1,
        executionStatus: "succeeded",
        deliveryStatus: "preview_ready",
        createdAt: 8_000,
        completedAt: 9_000,
        updatedAt: 9_000,
      }),
    );
    await ledger().upsertAttempt(
      attemptSeed({
        attemptId: "related-latest-success",
        issueNumber: issue,
        runId: "40737253021",
        runAttempt: 2,
        executionStatus: "succeeded",
        deliveryStatus: "preview_ready",
        createdAt: 9_000,
        completedAt: 9_500,
        updatedAt: 9_500,
      }),
    );
    await ledger().upsertAttempt(
      attemptSeed({
        attemptId: "related-failed-attempt",
        issueNumber: issue,
        runId: "40745664388",
        runAttempt: 1,
        executionStatus: "failed",
        deliveryStatus: "none",
        createdAt: 10_000,
        completedAt: 10_500,
        updatedAt: 10_500,
      }),
    );
    await ledger().upsertGeneration({
      generationId: `issue:${issue}`,
      issueNumber: issue,
      status: "failed",
      previewUrl: "https://review-initial.launchloom-7401-test.pages.dev/",
      startedAt: 9_000,
      updatedAt: 10_500,
    });

    const response = await relatedDetail("related-failed-attempt");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Content-Type")).toContain("application/json");
    const body = (await response.json()) as {
      attempt: {
        relatedPreview: Record<string, unknown> | null;
        clientId: string | null;
      };
    };
    expect(body.attempt.clientId).toBeNull();
    expect(body.attempt.relatedPreview).toEqual({
      attemptId: "related-latest-success",
      issueNumber: issue,
      runId: "40737253021",
      runAttempt: 2,
      completedAt: 9_500,
      deliveryStatus: "preview_ready",
      previewUrl: "https://review-initial.launchloom-7401-test.pages.dev/",
    });
  });

  const seedDelivered = (
    attemptId: string,
    issueNumber: number,
    overrides: Partial<AttemptInput> = {},
  ) =>
    ledger().upsertAttempt(
      attemptSeed({
        attemptId,
        issueNumber,
        runId: `run-${attemptId}`,
        runAttempt: 1,
        executionStatus: "succeeded",
        deliveryStatus: "preview_ready",
        createdAt: 8_000,
        completedAt: 9_000,
        updatedAt: 9_000,
        ...overrides,
      }),
    );
  const seedGeneration = (issueNumber: number, previewUrl: string | null) =>
    ledger().upsertGeneration({
      generationId: `issue:${issueNumber}`,
      issueNumber,
      status: "failed",
      previewUrl,
      startedAt: 8_000,
      updatedAt: 9_000,
    });
  const expectNoRelated = async (attemptId: string) => {
    const response = await relatedDetail(attemptId);
    expect(response.status, attemptId).toBe(200);
    const body = (await response.json()) as {
      attempt: { relatedPreview: unknown };
    };
    expect(body.attempt.relatedPreview, attemptId).toBeNull();
  };

  it("never substitutes another attempt when delivery, issue or URL evidence is unproven", async () => {
    // Focused attempts are diagnostic evidence only, even with a complete
    // successful full attempt for the same issue.
    await seedDelivered("focused-related-success", 7410);
    await seedGeneration(
      7410,
      "https://review-initial.launchloom-7410-test.pages.dev/",
    );
    await ledger().upsertAttempt(
      attemptSeed({
        attemptId: "focused-failed-attempt",
        issueNumber: 7410,
        profile: "creative-only",
        executionStatus: "failed",
        deliveryStatus: "diagnostic",
        createdAt: 10_000,
      }),
    );

    // A succeeded execution without preview delivery is not a verified preview.
    await seedDelivered("unverified-delivery-success", 7411, {
      deliveryStatus: "attention",
    });
    await seedGeneration(
      7411,
      "https://review-initial.launchloom-7411-test.pages.dev/",
    );
    await ledger().upsertAttempt(
      attemptSeed({
        attemptId: "unverified-delivery-failed",
        issueNumber: 7411,
        createdAt: 10_000,
      }),
    );

    // A success for a different issue is never a fallback.
    await seedDelivered("other-issue-success", 7413);
    await ledger().upsertAttempt(
      attemptSeed({
        attemptId: "other-issue-failed",
        issueNumber: 7412,
        createdAt: 10_000,
      }),
    );

    // No recorded issue preview means no link, even with a delivered attempt.
    await seedDelivered("missing-url-success", 7414);
    await ledger().upsertAttempt(
      attemptSeed({
        attemptId: "missing-url-failed",
        issueNumber: 7414,
        createdAt: 10_000,
      }),
    );

    for (const attemptId of [
      "focused-failed-attempt",
      "unverified-delivery-failed",
      "other-issue-failed",
      "missing-url-failed",
    ])
      await expectNoRelated(attemptId);
  }, 15_000);

  it("rejects unsafe, stale, published and superseded delivery evidence", async () => {
    // Unsafe, tokenized and focused-preview URLs are never presented as an
    // approved client delivery.
    const unsafeIssues: Array<[number, string]> = [
      [7415, "https://evil.example/"],
      [7416, "https://abc.launchloom-pipeline-preview.pages.dev/"],
      [7417, "https://review-initial.launchloom-7417.pages.dev/?token=secret"],
    ];
    for (const [issueNumber, previewUrl] of unsafeIssues) {
      await seedDelivered(`unsafe-success-${issueNumber}`, issueNumber);
      await seedGeneration(issueNumber, previewUrl);
      await ledger().upsertAttempt(
        attemptSeed({
          attemptId: `unsafe-failed-${issueNumber}`,
          issueNumber,
          createdAt: 10_000,
        }),
      );
    }
    for (const [issueNumber] of unsafeIssues)
      await expectNoRelated(`unsafe-failed-${issueNumber}`);

    // A published attempt delivered its own preview; never relabel another
    // attempt's preview as the answer.
    await seedDelivered("published-related-success", 7418);
    await seedGeneration(
      7418,
      "https://review-initial.launchloom-7418-test.pages.dev/",
    );
    await ledger().upsertAttempt(
      attemptSeed({
        attemptId: "published-own-attempt",
        issueNumber: 7418,
        executionStatus: "succeeded",
        deliveryStatus: "published",
        createdAt: 10_000,
      }),
    );
    await expectNoRelated("published-own-attempt");

    // Stale outcomes are not verified delivery evidence.
    await seedDelivered("stale-related-success", 7419, { stale: true });
    await seedGeneration(
      7419,
      "https://review-initial.launchloom-7419-test.pages.dev/",
    );
    await ledger().upsertAttempt(
      attemptSeed({
        attemptId: "stale-related-failed",
        issueNumber: 7419,
        createdAt: 10_000,
      }),
    );
    await expectNoRelated("stale-related-failed");
  }, 15_000);

  it("suppresses the related preview when the client already has its own site link", async () => {
    const ownClient = await ledger().upsertClient(client(7420));
    await runInDurableObject(ledger(), (_instance, state) => {
      state.storage.sql.exec(
        "UPDATE admin_clients SET data=? WHERE client_id=?",
        JSON.stringify({
          ...ownClient,
          previewUrl: "https://own-preview.pages.dev/",
        }),
        ownClient.clientId,
      );
    });
    await seedDelivered("own-link-related-success", ownClient.issueNumber);
    await seedGeneration(
      ownClient.issueNumber,
      "https://review-initial.launchloom-own-test.pages.dev/",
    );
    await ledger().upsertAttempt(
      attemptSeed({
        attemptId: "own-link-failed",
        issueNumber: ownClient.issueNumber,
        clientId: ownClient.clientId,
        createdAt: 10_000,
      }),
    );
    await expectNoRelated("own-link-failed");
  }, 15_000);

  it("requires admin authorization for related preview detail and keeps it uncached", async () => {
    const denied = await worker.fetch(
      new Request(`${base}/attempts/related-failed-attempt`),
      bindings,
      {} as ExecutionContext,
    );
    expect(denied.status).toBe(401);
    expect(denied.headers.get("Cache-Control")).toBe("no-store");
    const body = (await denied.json()) as {
      error?: { code?: string };
      attempt?: unknown;
    };
    expect(body.attempt).toBeUndefined();
    expect(body.error?.code).toBe("signed_out");
  });

  it("recovers accepted legacy source gaps after restart without inventing actors, timestamps or dispatches", async () => {
    const coordinator = invites();
    await runInDurableObject(coordinator, async (_instance, state) => {
      state.storage.sql
        .exec(`INSERT INTO onboarding_invites(invite_id,expires_at,allowed_origin,token_hash,status,submission_id,issue_number,created_at,updated_at)
        VALUES('legacy-gap',9999999999999,'https://onboard.example.test','legacy-hash','consumed','legacy-submission',8123,1000,2000)`);
      await state.storage.deleteAlarm();
    });
    await evictDurableObject(coordinator);
    const accepted = await coordinator.acceptedPage({});
    expect(
      accepted.items.find((item) => item.inviteId === "legacy-gap"),
    ).toMatchObject({
      initiator: { kind: "unknown" },
      creator: { kind: "unknown" },
      businessName: null,
      submittedAt: null,
      outboxState: "missing",
    });
    await runInDurableObject(coordinator, async (_instance, state) => {
      expect(await state.storage.getAlarm()).not.toBeNull();
    });
    await runDurableObjectAlarm(coordinator);
    const client = await ledger().getClient("submission:legacy-submission");
    expect(client).toMatchObject({
      businessName: null,
      submittedAt: null,
      previewUrl: null,
    });
    expect(
      (
        await ledger().listAttempts({
          clientId: "submission:legacy-submission",
        })
      ).items,
    ).toHaveLength(0);
    expect(await coordinator.projectionHealth()).toMatchObject({
      pendingProjectionCount: 0,
    });
  });

  it("preserves approved client site links and redacts unsafe URLs", async () => {
    const seeded = await ledger().upsertClient(client(902));
    await runInDurableObject(ledger(), (_instance, state) => {
      state.storage.sql.exec(
        "UPDATE admin_clients SET data=? WHERE client_id=?",
        JSON.stringify({
          ...seeded,
          previewUrl: "https://demo.pages.dev/",
          productionUrl: "https://evil.example/?token=private",
        }),
        seeded.clientId,
      );
    });
    const response = await worker.fetch(
      new Request(`${base}/clients/${encodeURIComponent(seeded.clientId)}`, {
        headers: { Origin: origin },
      }),
      bindings,
      context(),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      client: { previewUrl: string; productionUrl: string };
    };
    expect(body.client.previewUrl).toBe("https://demo.pages.dev/");
    expect(body.client.productionUrl).toBe("[link redacted]");
  });

  it("enforces an enriched invitation binding on later client writes", async () => {
    await ledger().upsertClient({ ...client(300), inviteId: null });
    await ledger().upsertClient(client(300));
    await runInDurableObject(ledger(), async (raw) => {
      const instance = raw as unknown as GenerationLedger;
      await expect(
        instance.upsertClient({ ...client(301), inviteId: "i-300" }),
      ).rejects.toThrow(/conflict/);
    });
  });

  it("returns a redacted dependency error when Access identity readback fails", async () => {
    const ctx = {
      access: {
        aud: "launchloom-local-onboarding-admin",
        getIdentity: async () => {
          throw new Error("private upstream credential");
        },
      },
    } as unknown as ExecutionContext;
    const response = await worker.fetch(
      new Request(`${base}/clients`),
      bindings,
      ctx,
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: {
        code: "unavailable",
        message: "Workspace authorization is temporarily unavailable.",
      },
    });
  });
});
