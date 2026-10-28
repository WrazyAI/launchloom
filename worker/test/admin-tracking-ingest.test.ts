import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker, { type Env } from "../src/index";

const bindings = env as unknown as Env;
const context = {} as ExecutionContext;
const observation = (extra = {}) => ({
  repository: "WrazyAI/launchloom",
  runId: "9001",
  runAttempt: 1,
  profile: "full",
  issueNumber: null,
  requestId: null,
  attemptId: null,
  triggeringActor: "qa-operator",
  executionStatus: "failed",
  deliveryStatus: "diagnostic",
  observedAt: 1000,
  source: "callback",
  ...extra,
});
const post = (
  body: unknown,
  secret = "test-secret",
  route = "generation-attempts",
) =>
  worker.fetch(
    new Request(`https://api.launchloom.test/api/internal/${route}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      body: JSON.stringify(body),
    }),
    { ...bindings, GENERATION_TRACKING_SECRET: "test-secret" },
    context,
  );
const ledger = () =>
  bindings.GENERATION_LEDGER.getByName("launchloom-generations");
describe("trusted attempt ingestion", () => {
  it("preserves a diagnostic URL on the exact run attempt after reconciliation", async () => {
    const previewUrl = "https://abc123.launchloom-pipeline-preview.pages.dev/";
    expect(
      (
        await post({
          observation: observation({
            runId: "9099",
            profile: "creative-only",
            previewUrl,
          }),
          events: [],
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await post({
          observation: observation({
            runId: "9099",
            profile: "creative-only",
            source: "github-reconcile",
            observedAt: 2000,
          }),
          events: [],
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await post({
          observation: observation({
            runId: "9099",
            runAttempt: 2,
            profile: "creative-only",
            deliveryStatus: "none",
          }),
          events: [],
        })
      ).status,
    ).toBe(200);
    const items = (await ledger().listAttempts({})).items.filter(
      (a) => a.runId === "9099",
    );
    expect(items.find((a) => a.runAttempt === 1)?.previewUrl).toBe(previewUrl);
    expect(
      items.find((a) => a.runAttempt === 2)?.previewUrl ?? null,
    ).toBeNull();
  });
  it("redacts prefixed structured credentials before persistence", async () => {
    const detail = {
      OPENROUTER_API_KEY: "synthetic-persist-value",
      CLOUDFLARE_ACCESS_CLIENT_SECRET:
        'synthetic-escaped"synthetic-suffix\\synthetic-tail',
      complete: true,
    };
    const payload = {
      observation: observation({ runId: "9090" }),
      events: [
        {
          eventKey: "structured-object",
          stage: "author",
          status: "recorded",
          detail,
        },
        {
          eventKey: "structured-string",
          stage: "author",
          status: "recorded",
          detail: JSON.stringify(detail),
        },
      ],
    };
    expect((await post(payload)).status).toBe(200);
    const item = (await ledger().listAttempts({ search: "9090" })).items.find(
      (a) => a.runId === "9090",
    )!;
    const stored = await ledger().getAttempt(item.attemptId);
    expect(JSON.stringify(stored)).not.toMatch(
      /synthetic-(?:persist|escaped|suffix|tail)/,
    );
    for (const key of ["structured-object", "structured-string"])
      expect(
        JSON.parse(stored!.events.find((e) => e.eventKey === key)!.detail!),
      ).toMatchObject({ complete: true });
  });
  it("redacts prefixed escaped JSON credentials on workspace reads of older raw details", async () => {
    const detail = {
      OPENROUTER_API_KEY: "synthetic-persist-value",
      CLOUDFLARE_ACCESS_CLIENT_SECRET:
        'synthetic-escaped"synthetic-suffix\\synthetic-tail',
      complete: true,
    };
    expect(
      (await post({ observation: observation({ runId: "9091" }), events: [] }))
        .status,
    ).toBe(200);
    const item = (await ledger().listAttempts({ search: "9091" })).items.find(
      (a) => a.runId === "9091",
    )!;
    // Bypass ingestion only to simulate an already-retained raw legacy detail.
    await ledger().recordAttemptEvents(item.attemptId, [
      {
        eventKey: "legacy-raw-json",
        stage: "author",
        status: "recorded",
        source: "callback",
        observedAt: 2000,
        detail: JSON.stringify(detail),
      },
    ]);
    expect(JSON.stringify(await ledger().getAttempt(item.attemptId))).toContain(
      "synthetic-persist-value",
    );
    const response = await worker.fetch(
      new Request(
        `https://api.launchloom.test/api/admin/onboarding-invites/workspace/attempts/${encodeURIComponent(item.attemptId)}/events`,
      ),
      bindings,
      {
        access: {
          aud: "launchloom-local-onboarding-admin",
          getIdentity: async () => ({ email: "admin@example.test" }),
        },
      } as unknown as ExecutionContext,
    );
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).not.toMatch(/synthetic-(?:persist|escaped|suffix|tail)/);
    expect(body).toContain("complete");
  });
  it("keeps a recorded failure diagnosis when newer GitHub evidence has no diagnosis", async () => {
    const first = {
      observation: observation({
        runId: "9080",
        failure: {
          category: "pipeline",
          stage: "research",
          summary: "Recorded research stage failed.",
        },
      }),
      events: [],
    };
    expect((await post(first)).status).toBe(200);
    expect(
      (
        await post({
          observation: observation({
            runId: "9080",
            source: "github-reconcile",
            observedAt: 5000,
          }),
          events: [],
        })
      ).status,
    ).toBe(200);
    const item = (await ledger().listAttempts({})).items.find(
      (a) => a.runId === "9080",
    )!;
    expect(item.failure.summary).toBe("Recorded research stage failed.");
  });
  it("fills unknown GitHub actors once and rejects a conflicting established login", async () => {
    expect(
      (
        await post({
          observation: observation({ runId: "9060", triggeringActor: null }),
          events: [],
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await post({
          observation: observation({ runId: "9060", observedAt: 2000 }),
          events: [],
        })
      ).status,
    ).toBe(200);
    const item = (await ledger().listAttempts({})).items.find(
      (a) => a.runId === "9060",
    )!;
    expect(item.initiator).toMatchObject({ kind: "github", id: "qa-operator" });
    expect(
      (
        await post({
          observation: observation({
            runId: "9060",
            triggeringActor: "other-login",
            observedAt: 3000,
          }),
          events: [],
        })
      ).status,
    ).toBe(409);
  });
  it("replays parent/reusable observations and costs as one event set without duplicating totals", async () => {
    const payload = {
      observation: observation({ runId: "9070" }),
      events: [
        {
          eventKey: "cost:author",
          stage: "author",
          status: "recorded",
          costUsd: 0.5,
          costKind: "actual",
        },
      ],
    };
    for (let i = 0; i < 2; i++) expect((await post(payload)).status).toBe(200);
    const item = (await ledger().listAttempts({})).items.find(
      (a) => a.runId === "9070",
    )!;
    expect(item.costs.actualUsd).toBe(0.5);
    expect((await ledger().getAttempt(item.attemptId))?.eventCount).toBe(3);
  });
  it("requires the existing secret and strict shape without private error bodies", async () => {
    expect(
      (await post({ observation: observation(), events: [] }, "wrong")).status,
    ).toBe(401);
    expect(
      (await post({ observation: observation({ role: "owner" }), events: [] }))
        .status,
    ).toBe(400);
    expect(
      (await post({ observation: observation(), events: Array(101).fill({}) }))
        .status,
    ).toBe(400);
    const invalid = {
      attempts: [],
      checkpoint: "not-a-cursor",
      health: {
        lastSyncAt: 1000,
        coverageStart: null,
        partial: true,
        lastError: null,
      },
    };
    expect(
      (await post(invalid, "test-secret", "generation-reconciliation")).status,
    ).toBe(400);
  });
  it("atomically rejects conflicting immutable execution bindings and a whole reconciliation page", async () => {
    expect(
      (await post({ observation: observation(), events: [] })).status,
    ).toBe(200);
    expect(
      (
        await post({
          observation: observation({ profile: "seo-only" }),
          events: [],
        })
      ).status,
    ).toBe(409);
    const batch = {
      attempts: [
        {
          observation: observation({
            runId: "9050",
            source: "github-reconcile",
          }),
          events: [],
        },
        {
          observation: observation({
            profile: "seo-only",
            source: "github-reconcile",
          }),
          events: [],
        },
      ],
      checkpoint: null,
      health: {
        lastSyncAt: 9000,
        coverageStart: 1,
        partial: false,
        lastError: null,
      },
    };
    expect(
      (await post(batch, "test-secret", "generation-reconciliation")).status,
    ).toBe(409);
    expect(
      (await ledger().listAttempts({})).items.some((a) => a.runId === "9050"),
    ).toBe(false);
    expect((await ledger().getHealth()).lastSyncAt).toBeNull();
  });
  it("fails a reconciliation page closed with a precise preview reason", async () => {
    const batch = {
      attempts: [
        {
          observation: observation({
            runId: "9095",
            profile: "creative-only",
            source: "github-reconcile",
          }),
          events: [],
        },
        {
          observation: observation({
            runId: "9096",
            profile: "creative-only",
            source: "github-reconcile",
            previewUrl: "https://-abc.launchloom-pipeline-preview.pages.dev/",
          }),
          events: [],
        },
      ],
      checkpoint: null,
      health: {
        lastSyncAt: 9000,
        coverageStart: 1,
        partial: false,
        lastError: null,
      },
    };
    const response = await post(
      batch,
      "test-secret",
      "generation-reconciliation",
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toMatchObject({ error: { code: "invalid_input" } });
    expect(JSON.stringify(body)).toContain("preview_url");
    const items = (await ledger().listAttempts({})).items;
    expect(items.some((item) => item.runId === "9095")).toBe(false);
    expect(items.some((item) => item.runId === "9096")).toBe(false);
  });
  it("records one canonical execution and github actor, terminal authority and safe detail", async () => {
    expect(
      (
        await post({
          observation: observation({
            failure: {
              summary:
                "Bearer private-secret https://private.test/?token=secret",
            },
          }),
          events: [],
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await post({
          observation: observation({
            source: "github-reconcile",
            executionStatus: "cancelled",
            observedAt: 2000,
          }),
          events: [],
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await post({
          observation: observation({
            executionStatus: "running",
            deliveryStatus: "none",
            observedAt: 3000,
          }),
          events: [],
        })
      ).status,
    ).toBe(200);
    const rows = await ledger().listAttempts({ search: "9001" });
    expect(rows.items).toHaveLength(1);
    expect(rows.items[0]).toMatchObject({
      executionStatus: "cancelled",
      deliveryStatus: "diagnostic",
      initiator: { kind: "github", id: "qa-operator", source: "github" },
      invitationCreator: { kind: "unknown" },
      costs: { actualUsd: null },
    });
    expect(
      JSON.stringify(await ledger().getAttempt(rows.items[0].attemptId)),
    ).not.toMatch(/private-secret|token=secret/);
  });
  it("resolves only explicit persisted dispatch evidence, never acceptance or initial-attempt guesses", async () => {
    const creator = {
      kind: "admin",
      id: "a1",
      name: "Admin",
      email: null,
      source: "cloudflare-access",
    } as const;
    await ledger().upsertClient({
      clientId: "submission:s1",
      inviteId: "i1",
      submissionId: "s1",
      issueNumber: 5,
      businessName: null,
      contactName: null,
      email: null,
      phone: null,
      creator,
      submittedAt: 100,
    });
    await ledger().registerDispatch({
      requestId: "request-1",
      attemptId: "queue-1",
      clientId: "submission:s1",
      inviteId: "i1",
      submissionId: "s1",
      issueNumber: 5,
      createdAt: 200,
      initiator: {
        kind: "client",
        id: "s1",
        name: null,
        email: null,
        source: "intake",
      },
      invitationCreator: creator,
    });
    expect(
      (
        await post({
          observation: observation({
            requestId: "request-1",
            attemptId: "queue-1",
            issueNumber: 5,
            runId: "9010",
          }),
          events: [],
        })
      ).status,
    ).toBe(200);
    expect(await ledger().getAttempt("queue-1")).toMatchObject({
      runId: "9010",
      createdAt: 200,
      initiator: { kind: "client" },
    });
    expect(
      (
        await post({
          observation: observation({
            requestId: "request-1",
            attemptId: "queue-1",
            issueNumber: 6,
            runId: "9010",
          }),
          events: [],
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await post({
          observation: observation({
            requestId: "request-1",
            issueNumber: 5,
            runId: "9010",
            runAttempt: 2,
          }),
          events: [],
        })
      ).status,
    ).toBe(200);
    const rerun = (await ledger().listAttempts({})).items.find(
      (a) => a.runAttempt === 2,
    )!;
    expect(rerun.attemptId).not.toBe("queue-1");
    expect(rerun.initiator.kind).toBe("github");
  });
  it("persists reconciliation health/checkpoint only after a valid batch and rejects callbacks in batch", async () => {
    const body = {
      attempts: [
        {
          observation: observation({ source: "github-reconcile" }),
          events: [],
        },
      ],
      checkpoint: '{"workflow":1,"page":1,"from":0}',
      health: {
        lastSyncAt: 4000,
        coverageStart: 1000,
        partial: true,
        lastError: null,
      },
    };
    expect(
      (await post(body, "test-secret", "generation-reconciliation")).status,
    ).toBe(200);
    expect(await ledger().getHealth()).toMatchObject({
      lastSyncAt: 4000,
      coverageStart: 1000,
      partial: true,
    });
    expect(
      (
        await post(
          { ...body, attempts: [{ observation: observation(), events: [] }] },
          "test-secret",
          "generation-reconciliation",
        )
      ).status,
    ).toBe(400);
    await runInDurableObject(ledger(), async (_instance, state) => {
      expect(
        state.storage.sql
          .exec<{ checkpoint: string }>(
            "SELECT checkpoint FROM generation_reconciliation_state WHERE id=1",
          )
          .one().checkpoint,
      ).toBe(body.checkpoint);
    });
  });
});
