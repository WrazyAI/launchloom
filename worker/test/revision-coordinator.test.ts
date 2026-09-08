import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import type { RevisionRequestInput } from "../src/revision-coordinator";
import { network } from "./network";

let commentId = 100;
let dispatchCount = 0;

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

  it("halts after failure while preserving the queued request", async () => {
    const coordinator = env.REVISION_COORDINATOR.getByName("failure-test");
    await coordinator.enqueue(request("request-3001", "Update the offer."));
    await coordinator.enqueue(request("request-3002", "Add an FAQ."));
    await coordinator.claim("request-3001");
    await coordinator.fail("request-3001", "Build failed.");

    await expect(coordinator.approvalState()).resolves.toEqual({
      allowed: false,
      code: "revision_queue_halted",
    });
    await expect(
      coordinator.enqueue(request("request-3003", "Change the CTA.")),
    ).resolves.toMatchObject({
      ok: false,
      code: "revision_queue_halted",
    });
    await runInDurableObject(coordinator, async (_instance, state) => {
      const queued = state.storage.sql
        .exec<{ status: string }>(
          "SELECT status FROM revision_requests WHERE request_id = ?",
          "request-3002",
        )
        .one();
      expect(queued.status).toBe("queued");
    });

    await expect(coordinator.resume("request-3001")).resolves.toEqual({
      ok: true,
      requestId: "request-3001",
    });
    await expect(coordinator.claim("request-3001")).resolves.toEqual({
      run: true,
      status: "running",
    });
    expect(dispatchCount).toBe(2);
  });
});
