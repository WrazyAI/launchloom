import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import worker, { type Env } from "../src/index";

const bindings = env as unknown as Env;
const origin = "https://api.launchloom.test";
const secret = "test-coordinator-secret";
const context = {} as ExecutionContext;

async function postPreview(body: unknown, authorization = secret) {
  return worker.fetch(
    new Request(`${origin}/api/internal/agent-follow-ups/preview-deliveries`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authorization}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }),
    bindings,
    context,
  );
}

const delivery = {
  repository: "WrazyAI/example-client",
  attemptId: "attempt-0001",
  project: "example",
  pr: 9,
  sha: "a".repeat(40),
  deploymentId: "4c1e9a2b",
  previewUrl: "https://4c1e9a2b.example.pages.dev",
};

describe("agent follow-up preview deliveries", () => {
  it("rejects unauthorized and alias previews", async () => {
    const unauthorized = await postPreview(delivery, "wrong");
    expect(unauthorized.status).toBe(401);

    const alias = await postPreview({
      ...delivery,
      deploymentId: "review-initial",
      previewUrl: "https://review-initial.example.pages.dev",
    });
    expect(alias.status).toBe(400);

    const mismatched = await postPreview({
      ...delivery,
      previewUrl: "https://other.example.pages.dev",
    });
    expect(mismatched.status).toBe(400);
  });

  it("stores the immutable receipt for the repository", async () => {
    const response = await postPreview(delivery);
    expect(response.status).toBe(200);
    const latest = await env.REVISION_COORDINATOR.getByName(
      "wrazyai/example-client",
    ).latestPreviewDelivery("WrazyAI/example-client");
    expect(latest).toEqual(delivery);
  });

  it("stores bounded run evidence for the exact repository", async () => {
    const response = await worker.fetch(
      new Request(`${origin}/api/internal/agent-follow-ups/run-evidence`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          attemptId: "attempt-0001",
          repository: "WrazyAI/example-client",
          siteId: "example-client",
          issueNumber: 9,
          profile: "full-preview",
          renderer: "creative",
          verdict: "failed",
          selectedCandidateId: "candidate-b",
          candidates: [{ id: "candidate-b", score: 58, selected: true }],
          gates: [{ name: "technical", status: "failed", summary: "Contrast failed." }],
          failures: [{ stage: "technical", code: null, summary: "Contrast failed." }],
          routeChecks: [],
          assets: { requested: 3, placed: 2, skipped: 1, providerFailure: null },
          preview: delivery,
          recordedAt: 1_700_000_000_000,
        }),
      }),
      bindings,
      context,
    );
    expect(response.status).toBe(200);
    const stored = await env.REVISION_COORDINATOR.getByName(
      "wrazyai/example-client",
    ).latestAgentRunEvidence("WrazyAI/example-client");
    expect(stored?.selectedCandidateId).toBe("candidate-b");
    expect(stored?.preview?.deploymentId).toBe("4c1e9a2b");
  });
});
