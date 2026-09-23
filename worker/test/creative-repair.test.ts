import { SELF } from "cloudflare:test";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { network } from "./network";

const reviewOrigin = "https://launchloom.wrazyos.com";
const api = "https://api.launchloom.test";
const repo = "WrazyAI/launchloom-123-example-client";
const sessionId = "0123456789abcdef0123456789abcdef";
const reviewedSha = "a".repeat(40);

function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
}

async function signedToken(overrides: Record<string, unknown> = {}) {
  const encoded = base64url(
    new TextEncoder().encode(
      JSON.stringify({
        stage: "developer",
        repo,
        siteId: "example-client",
        reviewerEmail: "developer@example.com",
        clientEmail: "client@example.com",
        pr: 7,
        headSha: reviewedSha,
        feedbackIssue: 8,
        creativeRepairSessionId: sessionId,
        expiresAt: Date.now() + 60_000,
        allowedOrigins: [reviewOrigin],
        ...overrides,
      }),
    ),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("test-review-secret"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encoded)),
  );
  return `${encoded}.${base64url(signature)}`;
}

async function registerSession() {
  return SELF.fetch(`${api}/api/internal/creative-repairs`, {
    method: "POST",
    headers: {
      Authorization: "Bearer test-coordinator-secret",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "register",
      repo,
      sessionId,
      session: {
        sessionId,
        repo,
        pr: 7,
        siteId: "example-client",
        headSha: reviewedSha,
        candidateId: "candidate-a",
        repairAvailable: true,
        previewUrl: "https://review-initial.example-client.pages.dev",
        findings: [
          {
            category: "hero-fit",
            severity: "major",
            evidence: "The headline and opening image compete for attention.",
          },
        ],
      },
    }),
  });
}

function userRequest(token: string, action: "status" | "retry", email = "developer@example.com") {
  return SELF.fetch(`${api}/api/creative-repair`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: reviewOrigin,
    },
    body: JSON.stringify({
      token,
      action,
      email,
      pageUrl: `${reviewOrigin}/review?token=${token}`,
    }),
  });
}

describe("developer-triggered creative repair", () => {
  it("exposes the private report and dispatches at most one repair despite concurrent clicks", async () => {
    let dispatchCount = 0;
    let immediateClaim: Record<string, any> | undefined;
    const dispatches: Array<Record<string, any>> = [];
    const claimPayload = JSON.stringify({
      action: "claim",
      repo,
      sessionId,
      pr: 7,
      headSha: reviewedSha,
    });
    network.use(
      http.get(
        `https://api.github.com/repos/${repo}/pulls/7`,
        () =>
          HttpResponse.json({
            head: { sha: reviewedSha },
            state: "open",
            draft: false,
          }),
      ),
      http.post(
        "https://api.github.com/repos/WrazyAI/launchloom/dispatches",
        async ({ request }) => {
          dispatchCount += 1;
          dispatches.push((await request.json()) as Record<string, any>);
          // Simulate GitHub starting the workflow before the dispatch HTTP
          // request returns and the API marks the session as queued.
          const response = await SELF.fetch(`${api}/api/internal/creative-repairs`, {
            method: "POST",
            headers: {
              Authorization: "Bearer test-coordinator-secret",
              "Content-Type": "application/json",
            },
            body: claimPayload,
          });
          immediateClaim = (await response.json()) as Record<string, any>;
          return new HttpResponse(null, { status: 204 });
        },
      ),
    );

    expect((await registerSession()).status).toBe(200);
    const token = await signedToken();
    const status = await userRequest(token, "status");
    expect(status.status).toBe(200);
    expect(await status.json()).toMatchObject({
      status: "available",
      repairAvailable: true,
      previewUrl: "https://review-initial.example-client.pages.dev",
      findings: [
        {
          category: "hero-fit",
          severity: "major",
        },
      ],
    });
    expect(dispatchCount).toBe(0);

    const responses = await Promise.all([
      userRequest(token, "retry"),
      userRequest(token, "retry"),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      202,
      409,
    ]);
    expect(dispatchCount).toBe(1);
    expect(dispatches[0]).toMatchObject({
      event_type: "repair-creative-candidate",
      client_payload: { repo, sessionId, pr: 7, headSha: reviewedSha },
    });
    const claim = () =>
      SELF.fetch(`${api}/api/internal/creative-repairs`, {
        method: "POST",
        headers: {
          Authorization: "Bearer test-coordinator-secret",
          "Content-Type": "application/json",
        },
        body: claimPayload,
      });
    expect(immediateClaim).toMatchObject({
      run: true,
      status: "running",
      session: { candidateId: "candidate-a", headSha: reviewedSha },
    });
    expect(await (await claim()).json()).toMatchObject({
      run: false,
      status: "running",
    });

    expect((await userRequest(token, "retry")).status).toBe(409);
    expect(dispatchCount).toBe(1);

    const completed = await SELF.fetch(`${api}/api/internal/creative-repairs`, {
      method: "POST",
      headers: {
        Authorization: "Bearer test-coordinator-secret",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "complete",
        repo,
        sessionId,
        outcome: "needs-attention",
        previewUrl: "https://creative-diagnostic.example-client.pages.dev",
        findings: [
          {
            category: "reference-fidelity",
            severity: "major",
            evidence: "The final repair still diverges from its reference composition.",
          },
        ],
      }),
    });
    expect(completed.status).toBe(200);
    expect(await (await userRequest(token, "status")).json()).toMatchObject({
      status: "completed",
      outcome: "needs-attention",
      previewUrl: "https://review-initial.example-client.pages.dev",
      resultPreviewUrl: "https://creative-diagnostic.example-client.pages.dev",
      findings: [
        {
          category: "reference-fidelity",
          evidence: "The final repair still diverges from its reference composition.",
        },
      ],
    });
  });

  it("does not consume the one attempt for a stale preview or wrong reviewer", async () => {
    network.use(
      http.get(
        `https://api.github.com/repos/${repo}/pulls/7`,
        () =>
          HttpResponse.json({
            head: { sha: "b".repeat(40) },
            state: "open",
            draft: false,
          }),
      ),
    );
    expect((await registerSession()).status).toBe(200);
    const token = await signedToken();
    expect((await userRequest(token, "retry")).status).toBe(409);
    expect(
      (
        await userRequest(
          await signedToken({ headSha: "b".repeat(40) }),
          "retry",
          "someone-else@example.com",
        )
      ).status,
    ).toBe(403);
  });

  it("requires the internal secret to register or update a session", async () => {
    const response = await SELF.fetch(`${api}/api/internal/creative-repairs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "register", repo, session: {} }),
    });
    expect(response.status).toBe(401);
  });
});
