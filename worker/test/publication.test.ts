import { env, runInDurableObject } from "cloudflare:test";
import { http, HttpResponse } from "msw";
import { afterEach, describe, it, expect } from "vitest";
import { network } from "./network";
import type { RevisionCoordinator } from "../src/revision-coordinator";
const namespace = (
  env as unknown as {
    REVISION_COORDINATOR: DurableObjectNamespace<RevisionCoordinator>;
  }
).REVISION_COORDINATOR;
const fixtureNames = new Set<string>();
function getCoordinator(name: string) {
  fixtureNames.add(name);
  return namespace.getByName(name);
}
afterEach(async () => {
  for (const name of fixtureNames) {
    await runInDurableObject(
      namespace.getByName(name),
      async (instance, state) => {
        await instance.alarm!();
        await state.storage.deleteAlarm();
        state.storage.sql.exec("DELETE FROM publications");
      },
    );
  }
  fixtureNames.clear();
});
const publication = {
  repo: "WrazyAI/example-client",
  pr: 7,
  headSha: "review-head",
  siteId: "example-client",
  clientEmail: "client@example.test",
  reviewerEmail: "developer@example.test",
  feedbackIssue: 8,
};
function mocks() {
  network.use(
    http.get(
      "https://api.github.com/repos/:owner/:repo/issues/:issue/comments",
      () => HttpResponse.json([]),
    ),
    http.post(
      "https://api.github.com/repos/:owner/:repo/issues/:issue/comments",
      () => HttpResponse.json({ id: 123 }),
    ),
    http.post(
      "https://api.github.com/repos/WrazyAI/launchloom/dispatches",
      () => new HttpResponse(null, { status: 204 }),
    ),
    http.post("https://api.resend.com/emails", () =>
      HttpResponse.json({ id: "mail" }),
    ),
  );
}
describe("ordered publication", () => {
  it("reserves one logical publication for simultaneous approvals", async () => {
    const coordinator = getCoordinator("publication-dedup");
    const [a, b] = await Promise.all([
      coordinator.reservePublication(publication),
      coordinator.reservePublication(publication),
    ]);
    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);
    expect(a.publicationId).toBe(b.publicationId);
    expect([a.duplicate, b.duplicate].sort()).toEqual([false, true]);
  });
  it("queues feedback while a publication owns the client and pauses it on failure", async () => {
    mocks();
    const coordinator = getCoordinator("publication-feedback");
    const p = await coordinator.reservePublication(publication);
    const q = await coordinator.enqueue({
      requestId: "publication-feedback-001",
      fingerprint: "publication-feedback-001",
      stage: "developer",
      repo: publication.repo,
      pr: 7,
      feedbackIssue: 8,
      siteId: publication.siteId,
      clientEmail: publication.clientEmail,
      reviewedPage: "https://example-client.pages.dev/",
      category: "Wording",
      feedback: "Clarify the opening.",
    });
    expect(q).toMatchObject({ ok: true, queueStatus: "queued" });
    await coordinator.publicationCommand({
      action: "fail",
      publicationId: p.publicationId!,
      approvalToken: p.approvalToken ?? undefined,
      reason: "Build failed",
    });
    await runInDurableObject(coordinator, (_, state) => {
      expect(
        state.storage.sql
          .exec<{ status: string }>(
            "SELECT status FROM revision_requests WHERE request_id = 'publication-feedback-001'",
          )
          .toArray()[0],
      ).toEqual({ status: "queued" });
    });
    expect(await coordinator.approvalState()).toMatchObject({ allowed: false });
  });
  it("claims only one publishing workflow and rejects an obsolete workflow before upload", async () => {
    mocks();
    const coordinator = getCoordinator("publication-workflow");
    const p = await coordinator.reservePublication(publication);
    await coordinator.queuePublication(
      p.publicationId!,
      "merge-sha",
      {},
      p.approvalToken ?? undefined,
    );
    expect(
      await coordinator.publicationCommand({
        action: "claim",
        publicationId: p.publicationId!,
        runId: "run-one",
      }),
    ).toMatchObject({ run: true });
    expect(
      await coordinator.publicationCommand({
        action: "claim",
        publicationId: p.publicationId!,
        runId: "run-two",
      }),
    ).toMatchObject({ run: false });
    expect(
      await coordinator.publicationCommand({
        action: "authorize-upload",
        publicationId: p.publicationId!,
        runId: "run-two",
      }),
    ).toMatchObject({ allowed: false });
    expect(
      await coordinator.publicationCommand({
        action: "authorize-upload",
        publicationId: p.publicationId!,
        runId: "run-one",
      }),
    ).toMatchObject({ allowed: true });
  });
  it("persists upload separately so verification retries do not redeploy", async () => {
    mocks();
    const coordinator = getCoordinator("publication-upload-resume");
    const p = await coordinator.reservePublication(publication);
    await coordinator.queuePublication(
      p.publicationId!,
      "merge-sha",
      {},
      p.approvalToken ?? undefined,
    );
    await coordinator.publicationCommand({
      action: "claim",
      publicationId: p.publicationId!,
      runId: "run-one",
    });
    await coordinator.publicationCommand({
      action: "uploaded",
      publicationId: p.publicationId!,
      runId: "run-one",
      deployment: {
        id: "deployment-one",
        origin: "https://example-client.pages.dev",
        commit: "merge-sha",
      },
    });
    await coordinator.publicationCommand({
      action: "fail",
      publicationId: p.publicationId!,
      runId: "run-one",
      reason: "Destination verification interrupted",
    });
    const retry = await coordinator.reservePublication({
      ...publication,
      retry: true,
    });
    await coordinator.queuePublication(
      p.publicationId!,
      "merge-sha",
      {},
      retry.approvalToken ?? undefined,
    );
    expect(
      await coordinator.publicationCommand({
        action: "fail",
        publicationId: p.publicationId!,
        runId: "run-one",
        reason: "Late failure callback",
      }),
    ).toMatchObject({ allowed: false, state: "queued" });
    const resumed = await coordinator.publicationCommand({
      action: "claim",
      publicationId: p.publicationId!,
      runId: "run-two",
    });
    expect(resumed).toMatchObject({
      run: true,
      skipUpload: true,
      deployment: { id: "deployment-one" },
    });
  });
  it("reconciles a crash after merge without merging or creating another publication", async () => {
    mocks();
    let dispatches = 0;
    network.use(
      http.get(
        "https://api.github.com/repos/WrazyAI/example-client/pulls/7",
        () =>
          HttpResponse.json({
            head: { sha: publication.headSha },
            merged: true,
            merge_commit_sha: "recovered-merge",
          }),
      ),
      http.get(
        "https://api.github.com/repos/WrazyAI/example-client/git/ref/heads/main",
        () => HttpResponse.json({ object: { sha: "recovered-merge" } }),
      ),
      http.post(
        "https://api.github.com/repos/WrazyAI/launchloom/dispatches",
        () => {
          dispatches++;
          return new HttpResponse(null, { status: 204 });
        },
      ),
    );
    const coordinator = getCoordinator("publication-merge-crash");
    const p = await coordinator.reservePublication(publication);
    await runInDurableObject(coordinator, async (instance, state) => {
      state.storage.sql.exec(
        "UPDATE publications SET next_attempt_at = 0, approval_lease_until = 0",
      );
      await instance.alarm!();
    });
    expect(
      await coordinator.publicationCommand({
        action: "status",
        publicationId: p.publicationId!,
      }),
    ).toMatchObject({ state: "queued", approvedSha: "recovered-merge" });
    expect(dispatches).toBe(1);
  });
  it("delivers from the email outbox without another deployment and never repeats a successful notification", async () => {
    mocks();
    let messages = 0;
    const keys: string[] = [];
    network.use(
      http.post("https://api.resend.com/emails", ({ request }) => {
        messages++;
        keys.push(request.headers.get("Idempotency-Key")!);
        return messages === 1
          ? HttpResponse.json(
              { error: "provider temporarily unavailable" },
              { status: 503 },
            )
          : HttpResponse.json({ id: "delivered" });
      }),
    );
    const coordinator = getCoordinator("publication-email-recovery");
    const p = await coordinator.reservePublication(publication);
    await coordinator.queuePublication(
      p.publicationId!,
      "merge-sha",
      {},
      p.approvalToken ?? undefined,
    );
    await coordinator.publicationCommand({
      action: "claim",
      publicationId: p.publicationId!,
      runId: "mail-run",
    });
    await coordinator.publicationCommand({
      action: "uploaded",
      publicationId: p.publicationId!,
      runId: "mail-run",
      deployment: {
        id: "deployment-one",
        origin: "https://example-client.pages.dev",
        commit: "merge-sha",
      },
    });
    const complete = {
      action: "published" as const,
      publicationId: p.publicationId!,
      runId: "mail-run",
      delivery: {
        to: publication.clientEmail,
        subject: "Ready",
        html: "<p>Ready</p>",
        text: "Ready",
      },
    };
    expect(await coordinator.publicationCommand(complete)).toMatchObject({
      allowed: true,
      state: "published",
    });
    await runInDurableObject(coordinator, async (instance, state) => {
      await instance.alarm!();
      state.storage.sql.exec("UPDATE publications SET email_due = 0");
      await instance.alarm!();
    });
    expect(await coordinator.publicationCommand(complete)).toMatchObject({
      state: "published",
      deliveryState: "sent",
    });
    await runInDurableObject(coordinator, async (instance) => {
      await instance.alarm!();
    });
    expect(messages).toBe(2);
    expect(keys).toEqual([
      `publication-client-${p.publicationId}`,
      `publication-client-${p.publicationId}`,
    ]);
    await runInDurableObject(coordinator, async (instance, state) => {
      state.storage.sql.exec(
        "UPDATE publications SET email_state = 'pending', email_due = 0, email_started_at = ?",
        Date.now() - 24 * 60 * 60_000,
      );
      await instance.alarm!();
    });
    expect(messages).toBe(2);
    expect(
      await coordinator.publicationCommand({
        action: "status",
        publicationId: p.publicationId!,
      }),
    ).toMatchObject({ state: "published", deliveryState: "attention" });
  });

  it("preserves multiple feedback requests and promotes them from the published commit in order", async () => {
    mocks();
    const dispatches: Record<string, any>[] = [];
    let commentId = 100;
    network.use(
      http.post(
        "https://api.github.com/repos/:owner/:repo/issues/:issue/comments",
        () => HttpResponse.json({ id: ++commentId }),
      ),
      http.post(
        "https://api.github.com/repos/WrazyAI/launchloom/dispatches",
        async ({ request }) => {
          dispatches.push((await request.json()) as Record<string, any>);
          return new HttpResponse(null, { status: 204 });
        },
      ),
    );
    const coordinator = getCoordinator("publication-ordered-feedback");
    const p = await coordinator.reservePublication(publication);
    for (const requestId of ["feedback-first-001", "feedback-second-002"]) {
      expect(
        await coordinator.enqueue({
          requestId,
          fingerprint: requestId,
          stage: "developer",
          repo: publication.repo,
          pr: 7,
          feedbackIssue: 8,
          siteId: publication.siteId,
          clientEmail: publication.clientEmail,
          reviewedPage: "https://preview.example-client.pages.dev/services",
          category: "Wording",
          feedback: requestId,
        }),
      ).toMatchObject({ ok: true, queueStatus: "queued" });
    }
    expect(dispatches).toHaveLength(0);
    await coordinator.queuePublication(
      p.publicationId!,
      "merge-sha",
      {},
      p.approvalToken ?? undefined,
    );
    await coordinator.publicationCommand({
      action: "claim",
      publicationId: p.publicationId!,
      runId: "ordered-run",
    });
    await coordinator.publicationCommand({
      action: "uploaded",
      publicationId: p.publicationId!,
      runId: "ordered-run",
      deployment: {
        id: "deployment-one",
        origin: "https://example-client.pages.dev",
        commit: "merge-sha",
      },
    });
    await coordinator.publicationCommand({
      action: "published",
      publicationId: p.publicationId!,
      runId: "ordered-run",
      delivery: {
        to: publication.clientEmail,
        subject: "Ready",
        html: "<p>Ready</p>",
        text: "Ready",
      },
    });
    expect(dispatches[1]).toMatchObject({
      event_type: "process-client-feedback",
      client_payload: {
        requestId: "feedback-first-001",
        baseSha: "merge-sha",
        reviewedSha: publication.headSha,
        originalStage: "developer",
        reviewedPage: "https://preview.example-client.pages.dev/services",
      },
    });
    await coordinator.claim("feedback-first-001");
    await coordinator.complete("feedback-first-001");
    expect(dispatches[2]).toMatchObject({
      event_type: "process-client-feedback",
      client_payload: {
        requestId: "feedback-second-002",
        baseSha: "merge-sha",
        publicationId: p.publicationId,
      },
    });
  });
  it("dispatches once when approval handoffs overlap", async () => {
    mocks();
    let dispatches = 0;
    network.use(
      http.post(
        "https://api.github.com/repos/WrazyAI/launchloom/dispatches",
        async ({ request }) => {
          expect(request.headers.get("User-Agent")).toBe(
            "LaunchLoom-Cloudflare-Worker",
          );
          expect(request.headers.get("X-GitHub-Api-Version")).toBe(
            "2022-11-28",
          );
          dispatches++;
          await new Promise((resolve) => setTimeout(resolve, 30));
          return new HttpResponse(null, { status: 204 });
        },
      ),
    );
    const coordinator = getCoordinator("publication-dispatch-overlap");
    const p = await coordinator.reservePublication(publication);
    await Promise.all([
      coordinator.queuePublication(
        p.publicationId!,
        "merge-sha",
        {},
        p.approvalToken ?? undefined,
      ),
      coordinator.queuePublication(
        p.publicationId!,
        "merge-sha",
        {},
        p.approvalToken ?? undefined,
      ),
    ]);
    expect(dispatches).toBe(1);
  });
  it("refuses an old publication after a newer reviewed release is reserved", async () => {
    mocks();
    const coordinator = getCoordinator("publication-newer-release");
    const p = await coordinator.reservePublication(publication);
    await coordinator.queuePublication(
      p.publicationId!,
      "merge-sha",
      {},
      p.approvalToken ?? undefined,
    );
    await coordinator.publicationCommand({
      action: "claim",
      publicationId: p.publicationId!,
      runId: "old-run",
    });
    await coordinator.publicationCommand({
      action: "uploaded",
      publicationId: p.publicationId!,
      runId: "old-run",
      deployment: {
        id: "old-deployment",
        origin: "https://example-client.pages.dev",
        commit: "merge-sha",
      },
    });
    await coordinator.publicationCommand({
      action: "published",
      publicationId: p.publicationId!,
      runId: "old-run",
      delivery: {
        to: publication.clientEmail,
        subject: "Ready",
        html: "<p>Ready</p>",
        text: "Ready",
      },
    });
    expect(
      await coordinator.allowsPublicationFeedback(
        publication.pr,
        publication.headSha,
      ),
    ).toBe(true);
    const newer = await coordinator.reservePublication({
      ...publication,
      pr: 8,
      headSha: "new-review-head",
    });
    expect(newer.allowed).toBe(true);
    expect(
      await coordinator.allowsPublicationFeedback(
        publication.pr,
        publication.headSha,
      ),
    ).toBe(false);
    expect(
      await coordinator.reservePublication({ ...publication, retry: true }),
    ).toMatchObject({ allowed: false, code: "stale_publication" });
    expect(
      await coordinator.publicationCommand({
        action: "authorize-upload",
        publicationId: p.publicationId!,
        runId: "old-run",
      }),
    ).toMatchObject({ allowed: false, state: "stale" });
    expect(
      await coordinator.publicationCommand({
        action: "status",
        publicationId: "11111111-1111-4111-8111-111111111111",
      }),
    ).toEqual({
      publicationId: "11111111-1111-4111-8111-111111111111",
      state: "missing",
    });
  });

  it("prevents publication and creative repair from acquiring the same client in either order", async () => {
    const session = {
      sessionId: "f".repeat(32),
      repo: publication.repo,
      pr: 7,
      siteId: publication.siteId,
      headSha: publication.headSha,
      candidateId: "candidate",
      repairAvailable: true,
      previewUrl: "https://preview.example-client.pages.dev",
      findings: [],
    };
    const publishing = getCoordinator("publication-first-creative");
    await publishing.reservePublication(publication);
    await publishing.registerCreativeRepair(session);
    expect(
      await publishing.beginCreativeRepair(
        session.sessionId,
        session.repo,
        session.pr,
        session.headSha,
      ),
    ).toMatchObject({ started: false, status: "publication_in_progress" });
    expect(
      await publishing.claimCreativeRepair(session.sessionId),
    ).toMatchObject({ run: false, status: "publication_in_progress" });
    const repairing = getCoordinator("creative-first-publication");
    await repairing.registerCreativeRepair(session);
    expect(
      await repairing.beginCreativeRepair(
        session.sessionId,
        session.repo,
        session.pr,
        session.headSha,
      ),
    ).toMatchObject({ started: true });
    expect(await repairing.reservePublication(publication)).toMatchObject({
      allowed: false,
      code: "revision_in_progress",
    });
  });
  it("keeps the client reviewed commit distinct and preserves feedback across publication completion", async () => {
    mocks();
    const dispatches: Record<string, any>[] = [];
    network.use(
      http.post(
        "https://api.github.com/repos/WrazyAI/launchloom/dispatches",
        async ({ request }) => {
          dispatches.push((await request.json()) as Record<string, any>);
          return new HttpResponse(null, { status: 204 });
        },
      ),
    );
    const coordinator = getCoordinator("publication-context-boundary");
    const p = await coordinator.reservePublication(publication);
    const feedback = {
      requestId: "client-during-publication",
      fingerprint: "client-during-publication",
      stage: "client" as const,
      repo: publication.repo,
      feedbackIssue: 8,
      siteId: publication.siteId,
      clientEmail: publication.clientEmail,
      reviewedPage: "https://example-client.pages.dev/services",
      reviewedSha: "previous-live-commit",
      category: "text",
      feedback: "Clarify the service scope.",
    };
    expect(await coordinator.enqueue(feedback)).toMatchObject({
      ok: true,
      queueStatus: "queued",
    });
    await coordinator.queuePublication(
      p.publicationId!,
      "new-live-commit",
      {},
      p.approvalToken ?? undefined,
    );
    await coordinator.publicationCommand({
      action: "claim",
      publicationId: p.publicationId!,
      runId: "context-run",
    });
    await coordinator.publicationCommand({
      action: "uploaded",
      publicationId: p.publicationId!,
      runId: "context-run",
      deployment: {
        id: "new-deployment",
        origin: "https://example-client.pages.dev",
        commit: "new-live-commit",
      },
    });
    await coordinator.publicationCommand({
      action: "published",
      publicationId: p.publicationId!,
      runId: "context-run",
      delivery: {
        to: publication.clientEmail,
        subject: "Ready",
        html: "<p>Ready</p>",
        text: "Ready",
      },
    });
    expect(dispatches[1]).toMatchObject({
      event_type: "process-client-feedback",
      client_payload: {
        baseSha: "new-live-commit",
        reviewedSha: "previous-live-commit",
        originalStage: "client",
      },
    });
    expect(
      await coordinator.enqueue({
        ...feedback,
        requestId: "developer-after-publication",
        fingerprint: "developer-after-publication",
        stage: "developer",
        pr: 7,
        reviewedSha: publication.headSha,
      }),
    ).toMatchObject({ ok: true, queueStatus: "queued" });
    await coordinator.claim(feedback.requestId);
    await coordinator.complete(feedback.requestId);
    expect(dispatches[2]).toMatchObject({
      event_type: "process-client-feedback",
      client_payload: {
        baseSha: "new-live-commit",
        reviewedSha: publication.headSha,
        originalStage: "developer",
        publicationId: p.publicationId,
      },
    });
  });
});
