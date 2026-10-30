import { env } from "cloudflare:workers";
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type {
  AttemptEventInput,
  AttemptInput,
  AttemptSummary,
} from "../../src/lib/admin-contracts";
import type { GenerationLedger } from "../src/generation-ledger";

function attempt(overrides: Partial<AttemptInput> = {}): AttemptInput {
  return {
    attemptId: crypto.randomUUID(),
    requestId: null,
    clientId: null,
    issueNumber: null,
    profile: "full",
    repository: null,
    runId: null,
    runAttempt: null,
    initiator: {
      kind: "client",
      id: "synthetic-client",
      name: "Test client",
      email: "client@example.test",
      source: "intake",
    },
    invitationCreator: {
      kind: "admin",
      id: "synthetic-admin",
      name: "Test admin",
      email: "admin@example.test",
      source: "cloudflare-access",
    },
    executionStatus: "queued",
    deliveryStatus: "none",
    stale: false,
    createdAt: 1000,
    startedAt: null,
    completedAt: null,
    updatedAt: 1000,
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
function event(
  eventKey: string,
  overrides: Partial<AttemptEventInput> = {},
): AttemptEventInput {
  return {
    eventKey,
    stage: "authoring",
    status: "recorded",
    costKind: "actual",
    costUsd: 0.2,
    createdAt: 1000,
    observedAt: 2000,
    source: "callback",
    ...overrides,
  };
}
function ledger() {
  return env.GENERATION_LEDGER.getByName(
    `admin-attempts-${crypto.randomUUID()}`,
  );
}
// The test API defaults its DO environment to Cloudflare.Env, while this ledger
// deliberately has no environment dependencies. Keep the compatibility cast here.
function inside(
  store: ReturnType<typeof ledger>,
  callback: (
    instance: GenerationLedger,
    state: DurableObjectState,
  ) => void | Promise<void>,
) {
  return runInDurableObject(store, (instance, state) =>
    callback(instance as unknown as GenerationLedger, state),
  );
}

describe("GenerationLedger attempt history", () => {
  it("retains a failed execution after a successful rerun sharing the dispatch", async () => {
    const store = ledger();
    await store.upsertAttempt(
      attempt({
        attemptId: "q-1",
        requestId: "request-1",
        repository: "WrazyAI/launchloom",
        runId: "9001",
        runAttempt: 1,
        executionStatus: "failed",
      }),
    );
    await store.upsertAttempt(
      attempt({
        attemptId: "q-2",
        requestId: "request-1",
        repository: "WrazyAI/launchloom",
        runId: "9001",
        runAttempt: 2,
        executionStatus: "succeeded",
      }),
    );
    expect((await store.listAttempts({})).total).toBe(2);
    expect((await store.getAttempt("q-1"))?.executionStatus).toBe("failed");
  });
  it("re-validates diagnostic preview URLs when reading attempts", async () => {
    const store = ledger();
    const trusted = "https://abc123.launchloom-pipeline-preview.pages.dev/";
    await store.upsertAttempt(
      attempt({
        attemptId: "unsafe-preview",
        repository: "WrazyAI/launchloom",
        runId: "9101",
        runAttempt: 1,
        executionStatus: "failed",
        deliveryStatus: "diagnostic",
        previewUrl: "https://evil.pages.dev/",
      }),
    );
    await store.upsertAttempt(
      attempt({
        attemptId: "trusted-preview",
        repository: "WrazyAI/launchloom",
        runId: "9102",
        runAttempt: 1,
        executionStatus: "failed",
        deliveryStatus: "diagnostic",
        previewUrl: trusted,
      }),
    );
    expect((await store.getAttempt("unsafe-preview"))?.previewUrl).toBeNull();
    expect((await store.getAttempt("trusted-preview"))?.previewUrl).toBe(
      trusted,
    );
    const items = (await store.listAttempts({})).items;
    expect(
      items.find((item) => item.attemptId === "unsafe-preview")?.previewUrl,
    ).toBeNull();
    expect(
      items.find((item) => item.attemptId === "trusted-preview")?.previewUrl,
    ).toBe(trusted);
  });
  it("enriches an unlinked attempt from its intake issue", async () => {
    const store = ledger();
    await store.upsertClient({
      clientId: "submission:s1",
      inviteId: "i1",
      submissionId: "s1",
      issueNumber: 202,
      businessName: "Northline Dental Studio",
      contactName: "Priya Raman",
      email: "northline@example.test",
      phone: null,
      creator: {
        kind: "admin",
        id: "a1",
        name: "Admin",
        email: null,
        source: "neon",
      },
      submittedAt: 100,
    });
    await store.upsertAttempt(
      attempt({
        attemptId: "github:1:1",
        issueNumber: 202,
        clientId: null,
        executionStatus: "succeeded",
      }),
    );
    const item = (await store.listAttempts({})).items.find(
      (entry) => entry.attemptId === "github:1:1",
    );
    expect(item?.clientId).toBe("submission:s1");
    expect(item?.clientName).toBe("Northline Dental Studio");
  });

  it("exposes the verified issue preview URL only on delivered attempts", async () => {
    const store = ledger();
    const previewUrl =
      "https://review-initial.launchloom-202-northline.pages.dev/";
    await store.upsertGeneration({
      generationId: "issue:202",
      issueNumber: 202,
      previewUrl,
    });
    await store.upsertAttempt(
      attempt({
        attemptId: "delivered",
        issueNumber: 202,
        executionStatus: "succeeded",
        deliveryStatus: "preview_ready",
      }),
    );
    await store.upsertAttempt(
      attempt({
        attemptId: "failed-later",
        issueNumber: 202,
        executionStatus: "failed",
        deliveryStatus: "none",
        createdAt: 2000,
      }),
    );
    const page = await store.listAttempts({});
    expect(
      page.items.find((item) => item.attemptId === "delivered")?.siteUrl,
    ).toBe(previewUrl);
    expect(
      page.items.find((item) => item.attemptId === "failed-later")?.siteUrl,
    ).toBeUndefined();
  });

  it("returns one canonical ID for repeated executed identity", async () => {
    const store = ledger();
    const input = attempt({
      attemptId: "first",
      repository: "WrazyAI/launchloom",
      runId: "9001",
      runAttempt: 1,
    });
    expect(await store.upsertAttempt(input)).toEqual({
      attemptId: "first",
      created: true,
    });
    expect(
      await store.upsertAttempt({
        ...input,
        attemptId: "callback-alias",
        repository: "wrazyai/launchloom",
      }),
    ).toEqual({ attemptId: "first", created: false });
    expect((await store.listAttempts({})).total).toBe(1);
  });
  it("rejects conflicting immutable creator, initiator, client, request, profile and workflow bindings", async () => {
    const store = ledger();
    const input = attempt({
      clientId: "client-1",
      requestId: "req-1",
      issueNumber: 9,
      repository: "WrazyAI/launchloom",
      runId: "9001",
      runAttempt: 1,
    });
    await store.upsertAttempt(input);
    for (const changes of [
      { clientId: "other" },
      { requestId: "other" },
      { issueNumber: 10 },
      { profile: "seo-only" as const },
      { invitationCreator: { ...input.invitationCreator, id: "other" } },
      { initiator: { ...input.initiator, id: "other" } },
      { repository: "other/repo" },
      { runId: "9002" },
      { runAttempt: 2 },
      { attemptId: "alias", clientId: "other" },
    ])
      await inside(store, async (instance) => {
        await expect(
          instance.upsertAttempt({ ...input, ...changes }),
        ).rejects.toThrow(/conflict/i);
      });
    expect((await store.getAttempt(input.attemptId))?.clientId).toBe(
      "client-1",
    );
  });
  it("binds queued identity once without changing list order or actor snapshots", async () => {
    const store = ledger();
    const input = attempt({ attemptId: "older" });
    await store.upsertAttempt(input);
    await store.upsertAttempt(attempt({ attemptId: "newer", createdAt: 2000 }));
    await store.upsertAttempt({
      ...input,
      clientId: "client-1",
      repository: "org/repo",
      runId: "9001",
      runAttempt: 1,
      createdAt: 9999,
      startedAt: 5000,
      updatedAt: 5000,
      executionStatus: "running",
    });
    expect(
      (await store.listAttempts({})).items.map((item) => item.attemptId),
    ).toEqual(["newer", "older"]);
    expect(await store.getAttempt("older")).toMatchObject({
      createdAt: 1000,
      startedAt: 5000,
      clientId: "client-1",
      initiator: input.initiator,
    });
  });
  it("retains failed execution independently of diagnostic delivery and truthful missing costs", async () => {
    const store = ledger();
    await store.upsertAttempt(
      attempt({
        attemptId: "failed",
        executionStatus: "failed",
        deliveryStatus: "diagnostic",
      }),
    );
    expect(await store.getAttempt("failed")).toMatchObject({
      executionStatus: "failed",
      deliveryStatus: "diagnostic",
      costs: { actualUsd: null, estimatedUsd: null, unreportedCount: 0 },
    });
  });
  it("updates a cost key once per attempt and ignores older observations", async () => {
    const store = ledger();
    for (const id of ["a", "b"])
      await store.upsertAttempt(attempt({ attemptId: id }));
    await store.recordAttemptEvents("a", [event("cost:authoring")]);
    await store.recordAttemptEvents("a", [
      event("cost:authoring", {
        costUsd: 0.4,
        observedAt: 3000,
        createdAt: 9999,
      }),
    ]);
    await store.recordAttemptEvents("a", [
      event("cost:authoring", { costUsd: 99, observedAt: 2500 }),
    ]);
    await store.recordAttemptEvents("b", [event("cost:authoring")]);
    await store.recordAttemptEvents("a", [
      event("cost:image", { costKind: "estimated", costUsd: 0.1 }),
      event("cost:unknown", { costKind: "unreported", costUsd: null }),
    ]);
    expect(await store.getAttempt("a")).toMatchObject({
      eventCount: 3,
      costs: { actualUsd: 0.4, estimatedUsd: 0.1, unreportedCount: 1 },
    });
    expect(
      (await store.getAttempt("a"))?.events.find(
        (item) => item.eventKey === "cost:authoring",
      )?.createdAt,
    ).toBe(1000);
    expect(await store.getAttempt("b")).toMatchObject({
      eventCount: 1,
      costs: { actualUsd: 0.2, estimatedUsd: null },
    });
  });
  it("never revives terminal GitHub execution with late progress but accepts newer delivery", async () => {
    const store = ledger();
    const input = attempt({ attemptId: "a", executionStatus: "running" });
    await store.upsertAttempt(input);
    await store.recordAttemptEvents("a", [
      event("github:execution", {
        stage: "execution",
        status: "failed",
        source: "github-reconcile",
        observedAt: 4000,
        costUsd: null,
        costKind: "unreported",
      }),
    ]);
    await store.upsertAttempt({
      ...input,
      executionStatus: "running",
      updatedAt: 5000,
    });
    await store.recordAttemptEvents("a", [
      event("callback:execution", {
        stage: "execution",
        status: "running",
        observedAt: 6000,
      }),
    ]);
    await store.recordAttemptEvents("a", [
      event("callback:delivery", {
        stage: "delivery",
        status: "diagnostic",
        observedAt: 7000,
      }),
    ]);
    await store.recordAttemptEvents("a", [
      event("old:delivery", {
        stage: "delivery",
        status: "preview_ready",
        observedAt: 2000,
      }),
    ]);
    expect(await store.getAttempt("a")).toMatchObject({
      executionStatus: "failed",
      deliveryStatus: "diagnostic",
      completedAt: null,
    });
  });
  it("prefers authoritative terminal evidence even if older than callback progress", async () => {
    const store = ledger();
    await store.upsertAttempt(
      attempt({ attemptId: "a", updatedAt: 9000, executionStatus: "running" }),
    );
    await store.recordAttemptEvents("a", [
      event("github", {
        stage: "execution",
        status: "cancelled",
        source: "github-reconcile",
        observedAt: 4000,
      }),
    ]);
    await store.recordAttemptEvents("a", [
      event("github-old", {
        stage: "execution",
        status: "succeeded",
        source: "github-reconcile",
        observedAt: 3000,
      }),
    ]);
    expect((await store.getAttempt("a"))?.executionStatus).toBe("cancelled");
  });
  it("pages all 251 attempts and counts matching filters over the full dataset", async () => {
    const store = ledger();
    await inside(store, async (instance) => {
      for (let i = 0; i < 251; i++)
        await instance.upsertAttempt(
          attempt({
            attemptId: `attempt-${String(i).padStart(3, "0")}`,
            clientId: `client-${i}`,
            executionStatus: i % 2 ? "failed" : "queued",
          }),
        );
    });
    const all: AttemptSummary[] = [];
    let cursor: string | undefined;
    do {
      const page = await store.listAttempts({ cursor });
      expect(page.total).toBe(251);
      expect(page.items.length).toBeLessThanOrEqual(50);
      all.push(...page.items);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(all).toHaveLength(251);
    expect(new Set(all.map((item) => item.attemptId)).size).toBe(251);
    expect(all[0].attemptId).toBe("attempt-250");
    expect(all[250].attemptId).toBe("attempt-000");
    expect(
      (
        await store.listAttempts({
          executionStatus: "failed",
          from: 1000,
          to: 1000,
        })
      ).total,
    ).toBe(125);
    expect(
      (await store.listAttempts({ search: "client-250" })).items.map(
        (item) => item.attemptId,
      ),
    ).toEqual(["attempt-250"]);
    expect(
      (
        await store.listAttempts({
          initiatorId: "synthetic-client",
          creatorId: "synthetic-admin",
          profile: "full",
          clientId: "client-250",
        })
      ).total,
    ).toBe(1);
    expect((await store.listAttempts({ from: 1001 })).total).toBe(0);
    expect((await store.listAttempts({ limit: 999 })).items).toHaveLength(100);
  });
  it("filters attention across execution, stale and delivery evidence", async () => {
    const store = ledger();
    await store.upsertAttempt(
      attempt({ attemptId: "attention-failed", executionStatus: "failed" }),
    );
    await store.upsertAttempt(
      attempt({ attemptId: "attention-unknown", executionStatus: "unknown" }),
    );
    await store.upsertAttempt(
      attempt({
        attemptId: "attention-diagnostic",
        executionStatus: "succeeded",
        deliveryStatus: "diagnostic",
      }),
    );
    await store.upsertAttempt(
      attempt({
        attemptId: "attention-stale",
        executionStatus: "running",
        deliveryStatus: "preview_ready",
        stale: true,
      }),
    );
    await store.upsertAttempt(
      attempt({
        attemptId: "attention-clear",
        executionStatus: "succeeded",
        deliveryStatus: "published",
      }),
    );
    const page = await store.listAttempts({ attention: true, limit: 10 });
    expect(page.total).toBe(4);
    expect(page.items.map((item) => item.attemptId).sort()).toEqual([
      "attention-diagnostic",
      "attention-failed",
      "attention-stale",
      "attention-unknown",
    ]);
  });

  it("rejects cursors reused with different filters or event attempts", async () => {
    const store = ledger();
    for (const id of ["a", "b"])
      await store.upsertAttempt(attempt({ attemptId: id }));
    const page = await store.listAttempts({ limit: 1, search: "  " });
    await inside(store, async (instance) => {
      await expect(
        instance.listAttempts({
          limit: 1,
          cursor: page.nextCursor!,
          executionStatus: "failed",
        }),
      ).rejects.toThrow(/cursor/i);
      await expect(
        instance.listAttempts({ cursor: "not-a-cursor" }),
      ).rejects.toThrow(/cursor/i);
    });
    expect(
      (await store.listAttempts({ limit: 10, cursor: page.nextCursor! })).items,
    ).toHaveLength(1);
    await store.recordAttemptEvents("a", [event("a"), event("b")]);
    const events = await store.getAttemptEvents("a", undefined, 1);
    await inside(store, async (instance) => {
      await expect(
        instance.getAttemptEvents("b", events.nextCursor!),
      ).rejects.toThrow(/cursor/i);
    });
  });
  it("pages all 451 events exactly once including equal timestamps", async () => {
    const store = ledger();
    await store.upsertAttempt(attempt({ attemptId: "a" }));
    await store.recordAttemptEvents(
      "a",
      Array.from({ length: 451 }, (_, i) =>
        event(`event-${String(i).padStart(3, "0")}`),
      ),
    );
    const detail = await store.getAttempt("a");
    expect(detail?.eventCount).toBe(451);
    expect(detail?.events).toHaveLength(50);
    expect(detail?.eventsNextCursor).toBeTruthy();
    const keys: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await store.getAttemptEvents("a", cursor, 1000);
      expect(page.total).toBe(451);
      expect(page.items.length).toBeLessThanOrEqual(100);
      keys.push(...page.items.map((item) => item.eventKey));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(keys).toHaveLength(451);
    expect(new Set(keys).size).toBe(451);
  });
  it("returns unknown health honestly and rejects orphan events and invalid identity", async () => {
    const store = ledger();
    expect(await store.getHealth()).toEqual({
      lastSyncAt: null,
      coverageStart: null,
      partial: true,
      lastError: null,
      pendingProjectionCount: 0,
    });
    expect(await store.getAttempt("missing")).toBeNull();
    expect(await store.getAttemptEvents("missing")).toEqual({
      items: [],
      nextCursor: null,
      total: 0,
    });
    await inside(store, async (instance) => {
      await expect(
        instance.recordAttemptEvents("missing", [event("x")]),
      ).rejects.toThrow(/not found/i);
      await expect(
        instance.upsertAttempt(attempt({ attemptId: "" })),
      ).rejects.toThrow(/invalid/i);
      await expect(
        instance.upsertAttempt(attempt({ runAttempt: 0 })),
      ).rejects.toThrow(/invalid/i);
    });
  });
  it("does not let an empty delivery snapshot hide older explicit delivery evidence", async () => {
    const store = ledger();
    const input = attempt({ attemptId: "a" });
    await store.upsertAttempt(input);
    await store.upsertAttempt({
      ...input,
      updatedAt: 5000,
      executionStatus: "running",
    });
    await store.recordAttemptEvents("a", [
      event("delivery", {
        stage: "delivery",
        status: "diagnostic",
        observedAt: 4000,
      }),
    ]);
    expect((await store.getAttempt("a"))?.deliveryStatus).toBe("diagnostic");
  });
  it("rejects stale observations from the same source even across different event keys", async () => {
    const store = ledger();
    await store.upsertAttempt(attempt({ attemptId: "a" }));
    await store.recordAttemptEvents("a", [
      event("github-new", {
        stage: "execution",
        status: "running",
        source: "github-reconcile",
        observedAt: 8000,
      }),
    ]);
    await store.recordAttemptEvents("a", [
      event("callback-new", {
        stage: "execution",
        status: "running",
        observedAt: 9000,
      }),
    ]);
    await store.recordAttemptEvents("a", [
      event("github-old", {
        stage: "execution",
        status: "failed",
        source: "github-reconcile",
        observedAt: 4000,
      }),
    ]);
    expect((await store.getAttempt("a"))?.executionStatus).toBe("running");
  });
  it("keeps dispatch binding, events and source watermarks across eviction and schema re-entry", async () => {
    const store = ledger();
    const input = attempt({ attemptId: "original", requestId: "dispatch" });
    await store.upsertAttempt(input);
    await store.registerInitialDispatch({
      requestId: "dispatch",
      initialAttemptId: "original",
    });
    await store.recordAttemptEvents("original", [
      event("github", {
        stage: "execution",
        status: "failed",
        source: "github-reconcile",
        observedAt: 4000,
      }),
    ]);
    await evictDurableObject(store);
    await store.upsertAttempt(
      attempt({
        attemptId: "rerun",
        requestId: "dispatch",
        executionStatus: "succeeded",
      }),
    );
    await store.upsertAttempt({
      ...input,
      executionStatus: "running",
      updatedAt: 9000,
    });
    expect(await store.getAttempt("original")).toMatchObject({
      executionStatus: "failed",
      eventCount: 1,
    });
    await runInDurableObject(store, (_instance, state) => {
      expect(
        state.storage.sql
          .exec(
            "SELECT initial_attempt_id FROM generation_dispatches WHERE request_id='dispatch'",
          )
          .one(),
      ).toEqual({ initial_attempt_id: "original" });
    });
    expect((await store.listAttempts({})).total).toBe(2);
  });
  it("rolls back an entire event batch on invalid evidence", async () => {
    const store = ledger();
    await store.upsertAttempt(attempt({ attemptId: "a" }));
    await inside(store, async (instance) => {
      await expect(
        instance.recordAttemptEvents("a", [
          event("good"),
          event("bad", { costUsd: -1 }),
        ]),
      ).rejects.toThrow(/invalid/i);
    });
    expect((await store.getAttempt("a"))?.eventCount).toBe(0);
  });
  it("does not invent execution timestamps from observation versions", async () => {
    const store = ledger();
    await store.upsertAttempt(attempt({ attemptId: "a" }));
    await store.recordAttemptEvents("a", [
      event("running", {
        stage: "execution",
        status: "running",
        observedAt: 5000,
      }),
    ]);
    expect((await store.getAttempt("a"))?.startedAt).toBeNull();
    await store.recordAttemptEvents("a", [
      event("failed", {
        stage: "execution",
        status: "failed",
        source: "github-reconcile",
        observedAt: 9000,
      }),
    ]);
    expect((await store.getAttempt("a"))?.completedAt).toBeNull();
    await store.upsertAttempt(
      attempt({
        attemptId: "a",
        executionStatus: "failed",
        startedAt: 3000,
        completedAt: 7000,
        updatedAt: 10000,
      }),
    );
    expect(await store.getAttempt("a")).toMatchObject({
      executionStatus: "failed",
      startedAt: 3000,
      completedAt: 7000,
    });
  });
  it("reports a conflict when partial binding would collide with an existing execution", async () => {
    const store = ledger();
    await store.upsertAttempt(
      attempt({ attemptId: "partial", repository: "org/repo", runId: "9001" }),
    );
    await store.upsertAttempt(
      attempt({
        attemptId: "bound",
        repository: "org/repo",
        runId: "9001",
        runAttempt: 1,
      }),
    );
    await inside(store, async (instance) => {
      await expect(
        instance.upsertAttempt(
          attempt({ attemptId: "partial", runAttempt: 1 }),
        ),
      ).rejects.toThrow(/conflict/i);
    });
    expect((await store.getAttempt("partial"))?.runAttempt).toBeNull();
  });
  it("accepts verified failure details after terminal reconciliation without unlocking execution", async () => {
    const store = ledger();
    const input = attempt({ attemptId: "a" });
    await store.upsertAttempt(input);
    await store.recordAttemptEvents("a", [
      event("github", {
        stage: "execution",
        status: "failed",
        source: "github-reconcile",
        observedAt: 4000,
      }),
    ]);
    const failure = {
      category: "setup",
      stage: "checkout",
      summary: "Synthetic checkout failed",
      evidenceUrl: "https://github.com/org/repo/actions/runs/9001",
      nextStep: null,
    };
    await store.upsertAttempt({
      ...input,
      executionStatus: "failed",
      failure,
      updatedAt: 5000,
    });
    await store.upsertAttempt({
      ...input,
      executionStatus: "running",
      updatedAt: 6000,
    });
    expect(await store.getAttempt("a")).toMatchObject({
      executionStatus: "failed",
      failure,
    });
  });

  it.each(["callback-first", "github-first"] as const)(
    "retains same-key authoritative terminal evidence with %s arrival",
    async (order) => {
      const store = ledger();
      await store.upsertAttempt(attempt({ attemptId: "a" }));
      const callback = event("execution", {
        stage: "execution",
        status: "running",
        observedAt: 9000,
      });
      const github = event("execution", {
        stage: "execution",
        status: "failed",
        source: "github-reconcile",
        observedAt: 4000,
      });
      for (const observation of order === "callback-first"
        ? [callback, github]
        : [github, callback]) {
        await store.recordAttemptEvents("a", [observation]);
      }
      await evictDurableObject(store);
      const detail = await store.getAttempt("a");
      expect(detail?.executionStatus).toBe("failed");
      expect(detail?.events).toHaveLength(1);
      expect(detail?.events[0]).toMatchObject({
        eventKey: "execution",
        source: "github-reconcile",
        status: "failed",
        observedAt: 4000,
      });
      expect(await store.recordAttemptEvents("a", [github, callback])).toEqual({
        recorded: 0,
      });
      expect((await store.getAttempt("a"))?.executionStatus).toBe("failed");
    },
  );

  it("does not infer an initial dispatch binding from rerun or initial-run membership", async () => {
    const store = ledger();
    for (const runAttempt of [2, 1]) {
      await store.upsertAttempt(
        attempt({
          attemptId: `run-${runAttempt}`,
          requestId: "dispatch",
          repository: "org/repo",
          runId: "9001",
          runAttempt,
        }),
      );
    }
    await inside(store, (_instance, state) => {
      expect(
        state.storage.sql
          .exec(
            "SELECT * FROM generation_dispatches WHERE request_id='dispatch'",
          )
          .toArray(),
      ).toEqual([]);
    });
    await store.registerInitialDispatch({
      requestId: "dispatch",
      initialAttemptId: "run-1",
    });
    await inside(store, (_instance, state) => {
      expect(
        state.storage.sql
          .exec(
            "SELECT initial_attempt_id FROM generation_dispatches WHERE request_id='dispatch'",
          )
          .one(),
      ).toEqual({ initial_attempt_id: "run-1" });
    });
  });

  it("binds delayed queued projection explicitly and never rewrites its verified initial binding", async () => {
    const store = ledger();
    await store.upsertAttempt(
      attempt({
        attemptId: "rerun",
        requestId: "dispatch",
        repository: "org/repo",
        runId: "9001",
        runAttempt: 2,
      }),
    );
    await store.upsertAttempt(
      attempt({ attemptId: "queued", requestId: "dispatch" }),
    );
    expect(
      await store.registerInitialDispatch({
        requestId: "dispatch",
        initialAttemptId: "queued",
      }),
    ).toEqual({ requestId: "dispatch", attemptId: "queued" });
    await evictDurableObject(store);
    expect(
      await store.registerInitialDispatch({
        requestId: "dispatch",
        initialAttemptId: "queued",
      }),
    ).toEqual({ requestId: "dispatch", attemptId: "queued" });
    await store.upsertAttempt(
      attempt({ attemptId: "other", requestId: "dispatch" }),
    );
    await inside(store, async (instance) => {
      await expect(
        instance.registerInitialDispatch({
          requestId: "dispatch",
          initialAttemptId: "other",
        }),
      ).rejects.toThrow(/conflict/i);
      await expect(
        instance.registerInitialDispatch({
          requestId: "dispatch",
          initialAttemptId: "rerun",
        }),
      ).rejects.toThrow(/conflict/i);
      await expect(
        instance.registerInitialDispatch({
          requestId: "another",
          initialAttemptId: "queued",
        }),
      ).rejects.toThrow(/conflict/i);
      await expect(
        instance.registerInitialDispatch({
          requestId: "dispatch",
          initialAttemptId: "missing",
        }),
      ).rejects.toThrow(/not found/i);
    });
    await inside(store, (_instance, state) => {
      expect(
        state.storage.sql
          .exec(
            "SELECT initial_attempt_id FROM generation_dispatches WHERE request_id='dispatch'",
          )
          .one(),
      ).toEqual({ initial_attempt_id: "queued" });
    });
    expect((await store.listAttempts({})).total).toBe(3);
  });
});
