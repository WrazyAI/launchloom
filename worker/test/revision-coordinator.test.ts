import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import type { RevisionRequestInput } from "../src/revision-coordinator";
import { network } from "./network";

let commentId = 100;
let dispatchCount = 0;
let failureEmails: Array<Record<string, unknown>> = [];

function request(
  requestId: string,
  feedback: string,
  stage: "developer" | "client" = "developer",
): RevisionRequestInput {
  return {
    requestId,
    fingerprint: `fingerprint-${requestId}`,
    stage,
    repo: "WrazyAI/example-client",
    pr: 2,
    feedbackIssue: 8,
    siteId: "example-client",
    clientEmail: "client@example.com",
    reviewedPage: "https://review.example.pages.dev/",
    category: "Wording",
    feedback,
  };
}

describe("RevisionCoordinator", () => {
  beforeEach(() => {
    commentId = 100;
    dispatchCount = 0;
    failureEmails = [];
    network.use(
      http.get(
        "https://api.github.com/repos/:owner/:repo/issues/:issue/comments",
        () => HttpResponse.json([]),
      ),
      http.post(
        "https://api.github.com/repos/:owner/:repo/issues/:issue/comments",
        () => HttpResponse.json({ id: ++commentId }, { status: 201 }),
      ),
      http.post(
        "https://api.github.com/repos/WrazyAI/launchloom/dispatches",
        () => {
          dispatchCount += 1;
          return new HttpResponse(null, { status: 204 });
        },
      ),
      http.post("https://api.resend.com/emails", async ({ request }) => {
        failureEmails.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({ id: "email-1" });
      }),
    );
  });

  it("allows one active and one queued request, then rejects a third", async () => {
    const coordinator = env.REVISION_COORDINATOR.getByName("capacity-test");
    const results = await Promise.all([
      coordinator.enqueue(
        request("request-0001", "Make the headline clearer."),
      ),
      coordinator.enqueue(request("request-0002", "Add the service area.")),
      coordinator.enqueue(request("request-0003", "Change the photo.")),
    ]);

    expect(
      results.map((result) => (result.ok ? result.queueStatus : result.code)),
    ).toEqual(["started", "queued", "revision_queue_full"]);
    expect(dispatchCount).toBe(1);
  });

  it("does not redispatch after GitHub accepted the request", async () => {
    const coordinator = env.REVISION_COORDINATOR.getByName("single-dispatch-test");
    await coordinator.enqueue(request("request-single-dispatch", "Tighten the heading."));
    expect(dispatchCount).toBe(1);

    await runInDurableObject(coordinator, async (instance, state) => {
      await instance.alarm!();
      const row = state.storage.sql.exec<{ status: string; dispatch_attempts: number }>(
        "SELECT status, dispatch_attempts FROM revision_requests WHERE request_id = ?",
        "request-single-dispatch",
      ).toArray()[0];
      expect(row).toEqual({ status: "dispatched", dispatch_attempts: 1 });
    });
    expect(dispatchCount).toBe(1);
  });

  it("promotes exactly one queued request after completion", async () => {
    const coordinator = env.REVISION_COORDINATOR.getByName("promotion-test");
    await coordinator.enqueue(request("request-1001", "Refine the headline."));
    await coordinator.enqueue(
      request("request-1002", "Use a warmer palette.", "client"),
    );
    await expect(coordinator.claim("request-1001")).resolves.toEqual({
      run: true,
      status: "running",
    });

    const completed = await coordinator.complete("request-1001");
    expect(completed.promoted).toMatchObject({
      requestId: "request-1002",
      stage: "client",
      feedback: "Use a warmer palette.",
    });
    await expect(coordinator.complete("request-1001")).resolves.toEqual(
      completed,
    );
    expect(dispatchCount).toBe(2);
    await expect(coordinator.claim("request-1002")).resolves.toEqual({
      run: true,
      status: "running",
    });
    await coordinator.complete("request-1002");
    await expect(coordinator.complete("request-1001")).resolves.toEqual({
      ok: true,
      promoted: null,
    });
    expect(dispatchCount).toBe(2);
  });

  it("deduplicates retries and blocks approval while work is pending", async () => {
    const coordinator = env.REVISION_COORDINATOR.getByName("duplicate-test");
    const input = request("request-2001", "Increase contrast.");
    await coordinator.enqueue(input);

    await expect(coordinator.enqueue(input)).resolves.toMatchObject({
      ok: true,
      queueStatus: "duplicate",
      requestId: "request-2001",
    });
    await expect(coordinator.approvalState()).resolves.toEqual({
      allowed: false,
      code: "revision_in_progress",
    });
    expect(dispatchCount).toBe(1);
  });

  it("rejects a changed payload that reuses an accepted submission id", async () => {
    const coordinator = env.REVISION_COORDINATOR.getByName(
      "changed-retry-test",
    );
    const input = request("request-changed-retry", "Original wording.");
    await coordinator.enqueue(input);

    await expect(
      coordinator.enqueue({
        ...input,
        fingerprint: "different-fingerprint",
        feedback: "Edited wording after an ambiguous retry.",
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "revision_request_mismatch",
      error: expect.stringContaining("Refresh the review page"),
    });
    expect(dispatchCount).toBe(1);
  });

  it("lets feedback proceed after a creative-release dispatch lock goes stale", async () => {
    const coordinator = env.REVISION_COORDINATOR.getByName(
      "stale-creative-release-test",
    );
    const session = {
      sessionId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      repo: "WrazyAI/example-client",
      pr: 2,
      siteId: "example-client",
      headSha: "a".repeat(40),
      candidateId: "candidate-a",
      repairAvailable: false,
      previewUrl: "https://creative-diagnostic.example.pages.dev",
      findings: [],
    };
    await coordinator.registerCreativeRepair(session);
    await expect(
      coordinator.beginCreativeOverride({
        sessionId: session.sessionId,
        repo: session.repo,
        pr: session.pr,
        headSha: session.headSha,
        candidateId: session.candidateId,
        reviewerEmail: "developer@example.com",
      }),
    ).resolves.toEqual({ started: true, status: "dispatching" });

    await runInDurableObject(coordinator, async (_instance, state) => {
      state.storage.sql.exec(
        "UPDATE creative_override_publications SET updated_at = ? WHERE session_id = ?",
        Date.now() - 2 * 60_000 - 1,
        session.sessionId,
      );
    });

    await expect(
      coordinator.enqueue(
        request("request-stale-release", "Update the field preview."),
      ),
    ).resolves.toMatchObject({
      ok: true,
      queueStatus: "started",
    });
    expect(dispatchCount).toBe(1);
  });

  it("surfaces terminal dispatch failure only after bounded retries", async () => {
    const coordinator = env.REVISION_COORDINATOR.getByName("dispatch-exhaustion-test");
    network.use(
      http.post(
        "https://api.github.com/repos/WrazyAI/launchloom/dispatches",
        () => {
          dispatchCount += 1;
          return HttpResponse.json({ message: "dispatch unavailable" }, { status: 503 });
        },
      ),
    );

    await expect(
      coordinator.enqueue(request("request-dispatch-fail", "Keep this draft safe.")),
    ).resolves.toMatchObject({
      ok: true,
      queueStatus: "started",
    });
    expect(dispatchCount).toBe(1);
    expect(failureEmails).toHaveLength(0);

    await runInDurableObject(coordinator, async (instance, state) => {
      await instance.alarm!();
      await instance.alarm!();
      let row = state.storage.sql.exec<{ status: string; dispatch_attempts: number }>(
        "SELECT status, dispatch_attempts FROM revision_requests WHERE request_id = ?",
        "request-dispatch-fail",
      ).toArray()[0];
      expect(row).toEqual({ status: "dispatching", dispatch_attempts: 3 });

      await instance.alarm!();
      row = state.storage.sql.exec<{ status: string; dispatch_attempts: number }>(
        "SELECT status, dispatch_attempts FROM revision_requests WHERE request_id = ?",
        "request-dispatch-fail",
      ).toArray()[0];
      expect(row).toEqual({ status: "failed", dispatch_attempts: 3 });
    });

    expect(dispatchCount).toBe(3);
    expect(failureEmails).toHaveLength(1);
    expect(String(failureEmails[0].text)).toContain("Revision workflow could not be started.");
    expect(String(failureEmails[0].text)).toContain("Open reviewed website: https://review.example.pages.dev/");
  });

  it("promotes the waiting request when dispatch retries are exhausted", async () => {
    const coordinator = env.REVISION_COORDINATOR.getByName(
      "dispatch-exhaustion-promotion-test",
    );
    network.use(
      http.post(
        "https://api.github.com/repos/WrazyAI/launchloom/dispatches",
        () => {
          dispatchCount += 1;
          return HttpResponse.json(
            { message: "dispatch unavailable" },
            { status: 503 },
          );
        },
      ),
    );

    await coordinator.enqueue(
      request("request-exhaust-active", "First request."),
    );
    await coordinator.enqueue(
      request("request-exhaust-queued", "Second request."),
    );

    await runInDurableObject(coordinator, async (instance, state) => {
      await instance.alarm!();
      await instance.alarm!();
      await instance.alarm!();

      const rows = state.storage.sql
        .exec<{ request_id: string; status: string; dispatch_attempts: number }>(
          "SELECT request_id, status, dispatch_attempts FROM revision_requests WHERE request_id IN (?, ?) ORDER BY request_id",
          "request-exhaust-active",
          "request-exhaust-queued",
        )
        .toArray();
      expect(rows).toEqual([
        {
          request_id: "request-exhaust-active",
          status: "failed",
          dispatch_attempts: 3,
        },
        {
          request_id: "request-exhaust-queued",
          status: "dispatching",
          dispatch_attempts: 1,
        },
      ]);
      expect(await state.storage.getAlarm()).not.toBeNull();
    });
  });

  it("keeps the promoted revision alarm while retrying a failed failure-email notice", async () => {
    const coordinator = env.REVISION_COORDINATOR.getByName(
      "failure-notice-and-promotion-test",
    );
    let resendAttempts = 0;
    network.use(
      http.post("https://api.resend.com/emails", async ({ request }) => {
        failureEmails.push((await request.json()) as Record<string, unknown>);
        resendAttempts += 1;
        return resendAttempts === 1
          ? HttpResponse.json({ message: "temporary email failure" }, { status: 503 })
          : HttpResponse.json({ id: "email-retry-ok" });
      }),
    );

    await coordinator.enqueue(
      request("request-notice-fail", "First request fails."),
    );
    await coordinator.enqueue(
      request("request-notice-promoted", "Second request continues."),
    );
    await coordinator.claim("request-notice-fail");
    await coordinator.fail("request-notice-fail", "Build failed.");

    expect(dispatchCount).toBe(2);
    expect(resendAttempts).toBe(1);

    await runInDurableObject(coordinator, async (instance, state) => {
      const notices = await state.storage.list<{
        nextAttemptAt: number;
      }>({ prefix: "pending-failure-notice:" });
      expect(notices.size).toBe(1);
      for (const [key, notice] of notices)
        await state.storage.put(key, { ...notice, nextAttemptAt: 0 });

      await instance.alarm!();

      const promoted = state.storage.sql
        .exec<{ status: string }>(
          "SELECT status FROM revision_requests WHERE request_id = ?",
          "request-notice-promoted",
        )
        .toArray()[0];
      expect(promoted.status).toBe("dispatched");
      expect(await state.storage.getAlarm()).not.toBeNull();
      expect(
        (await state.storage.list({ prefix: "pending-failure-notice:" })).size,
      ).toBe(0);
    });
    expect(resendAttempts).toBe(2);
  });

  it("rate limits AI chat per visitor and resets the window", async () => {
    const coordinator = env.REVISION_COORDINATOR.getByName("ai-rate-test");
    for (let count = 0; count < 12; count += 1)
      await expect(coordinator.allowAiChat("visitor", 1_000)).resolves.toEqual({
        allowed: true,
        retryAfterSeconds: 0,
      });
    await expect(coordinator.allowAiChat("visitor", 1_000)).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 600,
    });
    await expect(
      coordinator.allowAiChat("visitor", 10 * 60_000 + 1_000),
    ).resolves.toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  it("uses a validated deployed preview for downstream failure notification and strips tokens", async () => {
    const coordinator = env.REVISION_COORDINATOR.getByName("failure-preview-test");
    await coordinator.enqueue(request("request-preview-failure", "Keep the revised preview reachable."));
    await coordinator.claim("request-preview-failure");
    await coordinator.fail(
      "request-preview-failure",
      "Email delivery failed after deploy.",
      "https://review-revision-123.example.pages.dev/services/?review=signed-secret#section",
      "https://github.com/WrazyAI/launchloom/actions/runs/123456?check_suite_focus=true#logs",
    );

    expect(failureEmails).toHaveLength(1);
    const text = String(failureEmails[0].text);
    expect(text).toContain(
      "Open reviewed website: https://review-revision-123.example.pages.dev/services/",
    );
    expect(text).not.toContain("signed-secret");
    expect(text).toContain(
      "Actions run: https://github.com/WrazyAI/launchloom/actions/runs/123456",
    );
    expect(text).not.toContain("check_suite_focus");
    const primaryHref = String(failureEmails[0].html).match(/href="([^"]+)"/)?.[1];
    expect(primaryHref).toBe(
      "https://review-revision-123.example.pages.dev/services/",
    );
  });

  it("preserves failures without blocking the next queued request", async () => {
    const coordinator = env.REVISION_COORDINATOR.getByName("failure-test");
    await coordinator.enqueue(request("request-3001", "Update the offer."));
    await coordinator.enqueue(request("request-3002", "Add an FAQ."));
    await coordinator.claim("request-3001");
    await coordinator.fail("request-3001", "Build failed.");

    expect(failureEmails).toHaveLength(1);
    expect(failureEmails[0]).toMatchObject({
      to: ["developer@example.com"],
      subject: expect.stringContaining("Revision needs attention"),
      text: expect.stringContaining("Update the offer."),
    });
    expect(String(failureEmails[0].text)).toContain(
      "Open reviewed website: https://review.example.pages.dev/",
    );
    expect(String(failureEmails[0].text)).toContain(
      "Pull request: https://github.com/WrazyAI/example-client/pull/2",
    );
    const primaryHref = String(failureEmails[0].html).match(/href="([^"]+)"/)?.[1];
    expect(primaryHref).toBe("https://review.example.pages.dev/");

    expect(dispatchCount).toBe(2);
    await expect(coordinator.claim("request-3002")).resolves.toEqual({
      run: true,
      status: "running",
    });
    await expect(
      coordinator.enqueue(request("request-3003", "Change the CTA.")),
    ).resolves.toMatchObject({
      ok: true,
      queueStatus: "queued",
    });
    await runInDurableObject(coordinator, async (_instance, state) => {
      const rows = state.storage.sql
        .exec<{ request_id: string; status: string }>(
          "SELECT request_id, status FROM revision_requests WHERE request_id IN (?, ?, ?) ORDER BY request_id",
          "request-3001",
          "request-3002",
          "request-3003",
        )
        .toArray();
      expect(rows).toEqual([
        { request_id: "request-3001", status: "failed" },
        { request_id: "request-3002", status: "running" },
        { request_id: "request-3003", status: "queued" },
      ]);
    });

    await expect(
      coordinator.dismiss("request-3001", "Handled manually."),
    ).resolves.toEqual({
      ok: true,
    });
    await expect(coordinator.approvalState()).resolves.toEqual({
      allowed: false,
      code: "revision_in_progress",
    });
    const completed = await coordinator.complete("request-3002");
    expect(completed.promoted).toMatchObject({ requestId: "request-3003" });
    expect(dispatchCount).toBe(3);
  });
});
