import { env } from "cloudflare:workers";
import { SELF, runInDurableObject } from "cloudflare:test";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { network } from "./network";
import type { RevisionCoordinator } from "../src/revision-coordinator";

const reviewOrigin = "https://launchloom.wrazyos.com";
const previewOrigin = "https://creative-diagnostic.example-client.pages.dev";
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
        allowedOrigins: [reviewOrigin, previewOrigin],
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

async function registerSession(
  previewUrl: string | null = "https://review-initial.example-client.pages.dev",
  registeredSessionId = sessionId,
  registeredHeadSha = reviewedSha,
) {
  return SELF.fetch(`${api}/api/internal/creative-repairs`, {
    method: "POST",
    headers: {
      Authorization: "Bearer test-coordinator-secret",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "register",
      repo,
      sessionId: registeredSessionId,
      session: {
        sessionId: registeredSessionId,
        repo,
        pr: 7,
        siteId: "example-client",
        headSha: registeredHeadSha,
        candidateId: "candidate-a",
        repairAvailable: true,
        previewUrl,
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

function userRequest(
  token: string,
  action: "status" | "retry" | "feedback" | "send-anyway",
  email = "developer@example.com",
  overrides: Record<string, unknown> = {},
) {
  return SELF.fetch(`${api}/api/creative-repair`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: String(overrides.origin || reviewOrigin),
    },
    body: JSON.stringify({
      token,
      action,
      email,
      comment:
        "The site is good enough to keep as the baseline; shorten the opening copy.",
      pageUrl: String(
        overrides.pageUrl || `${reviewOrigin}/review?token=${token}`,
      ),
      ...overrides,
    }),
  });
}

describe("developer-triggered creative repair", () => {
  it("requires an explicit confirmation and queues one exact-head client override", async () => {
    let mergeAttempts = 0;
    const dispatches: Array<Record<string, any>> = [];
    const overrideSessionId = "22222222222222222222222222222222";
    network.use(
      http.get(`https://api.github.com/repos/${repo}/pulls/7`, () =>
        HttpResponse.json({
          head: { sha: reviewedSha },
          state: "open",
          draft: false,
          merged: false,
          merge_commit_sha: null,
        }),
      ),
      http.get(
        `https://api.github.com/repos/${repo}/contents/src/site.config.json`,
        () =>
          HttpResponse.json({
            encoding: "base64",
            content: btoa(
              JSON.stringify({
                business: { name: "Example Client" },
                seoResearch: { mode: "researched", publishReady: true },
              }),
            ),
          }),
      ),
      http.put(`https://api.github.com/repos/${repo}/pulls/7/merge`, () => {
        mergeAttempts += 1;
        return HttpResponse.json({ merged: true, sha: "f".repeat(40) });
      }),
      http.post(
        "https://api.github.com/repos/WrazyAI/launchloom/dispatches",
        async ({ request }) => {
          dispatches.push((await request.json()) as Record<string, any>);
          return new HttpResponse(null, { status: 204 });
        },
      ),
    );

    expect(
      (await registerSession(previewOrigin, overrideSessionId)).status,
    ).toBe(200);
    const token = await signedToken({
      creativeRepairSessionId: overrideSessionId,
    });
    expect(
      (
        await userRequest(token, "send-anyway", "developer@example.com", {
          confirmed: true,
        })
      ).status,
    ).toBe(409);
    expect(mergeAttempts).toBe(0);

    const base = {
      origin: previewOrigin,
      pageUrl: `${previewOrigin}/?review=${token}`,
    };
    expect(
      (await userRequest(token, "send-anyway", "developer@example.com", base))
        .status,
    ).toBe(400);

    const release = () =>
      userRequest(token, "send-anyway", "developer@example.com", {
        ...base,
        confirmed: true,
      });
    const responses = await Promise.all([release(), release()]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      202, 409,
    ]);
    expect(mergeAttempts).toBe(1);
    expect(dispatches).toHaveLength(1);
    expect(dispatches[0]).toMatchObject({
      event_type: "publish-site",
      client_payload: {
        approvedSha: "f".repeat(40),
        developerOverride: {
          sessionId: overrideSessionId,
          reviewedHeadSha: reviewedSha,
          candidateId: "candidate-a",
          disposition: "override-publish",
        },
      },
    });
    expect(await (await userRequest(token, "status")).json()).toMatchObject({
      humanDisposition: "override-publish",
      status: "completed",
      repairAvailable: false,
    });
  });

  it("keeps incomplete SEO research as a hard release stop without recording promotion", async () => {
    let mergeAttempts = 0;
    let dispatchAttempts = 0;
    const seoSessionId = "33333333333333333333333333333333";
    network.use(
      http.get(`https://api.github.com/repos/${repo}/pulls/7`, () =>
        HttpResponse.json({
          head: { sha: reviewedSha },
          state: "open",
          draft: false,
          merged: false,
          merge_commit_sha: null,
        }),
      ),
      http.get(
        `https://api.github.com/repos/${repo}/contents/src/site.config.json`,
        () =>
          HttpResponse.json({
            encoding: "base64",
            content: btoa(
              JSON.stringify({
                seoResearch: { mode: "context-only", publishReady: false },
              }),
            ),
          }),
      ),
      http.put(`https://api.github.com/repos/${repo}/pulls/7/merge`, () => {
        mergeAttempts += 1;
        return HttpResponse.json({ merged: true, sha: "f".repeat(40) });
      }),
      http.post(
        "https://api.github.com/repos/WrazyAI/launchloom/dispatches",
        () => {
          dispatchAttempts += 1;
          return new HttpResponse(null, { status: 204 });
        },
      ),
    );
    expect((await registerSession(previewOrigin, seoSessionId)).status).toBe(
      200,
    );
    const token = await signedToken({ creativeRepairSessionId: seoSessionId });

    const response = await userRequest(
      token,
      "send-anyway",
      "developer@example.com",
      {
        origin: previewOrigin,
        pageUrl: `${previewOrigin}/?review=${token}`,
        confirmed: true,
      },
    );

    expect(response.status).toBe(409);
    expect(mergeAttempts).toBe(0);
    expect(dispatchAttempts).toBe(0);
    expect(await (await userRequest(token, "status")).json()).toMatchObject({
      humanDisposition: null,
    });
  });

  it("accepts diagnostic feedback as a baseline and queues revision without publishing", async () => {
    const dispatches: Array<Record<string, any>> = [];
    let mergeAttempts = 0;
    network.use(
      http.get(`https://api.github.com/repos/${repo}/pulls/7`, () =>
        HttpResponse.json({
          head: { sha: reviewedSha },
          state: "open",
          draft: false,
        }),
      ),
      http.get(`https://api.github.com/repos/${repo}/issues/7/comments`, () =>
        HttpResponse.json([]),
      ),
      http.post(`https://api.github.com/repos/${repo}/issues/7/comments`, () =>
        HttpResponse.json({ id: 701 }, { status: 201 }),
      ),
      http.get(
        `https://api.github.com/repos/${repo}/contents/src/site.config.json`,
        () =>
          HttpResponse.json({
            encoding: "base64",
            content: btoa(
              JSON.stringify({
                seoResearch: { mode: "researched", publishReady: true },
              }),
            ),
          }),
      ),
      http.put(`https://api.github.com/repos/${repo}/pulls/7/merge`, () => {
        mergeAttempts += 1;
        return HttpResponse.json({ merged: true, sha: "f".repeat(40) });
      }),
      http.post(
        "https://api.github.com/repos/WrazyAI/launchloom/dispatches",
        async ({ request }) => {
          dispatches.push((await request.json()) as Record<string, any>);
          return new HttpResponse(null, { status: 204 });
        },
      ),
    );

    const feedbackSessionId = "11111111111111111111111111111111";
    expect(
      (await registerSession(previewOrigin, feedbackSessionId)).status,
    ).toBe(200);
    const token = await signedToken({
      creativeRepairSessionId: feedbackSessionId,
    });
    const response = await userRequest(
      token,
      "feedback",
      "developer@example.com",
      {
        origin: previewOrigin,
        pageUrl: `${previewOrigin}/?review=${token}`,
        submissionId: "feedback-session-0001",
      },
    );

    expect(response.status).toBe(202);
    const feedbackResult = (await response.json()) as Record<string, any>;
    expect(feedbackResult).toMatchObject({
      ok: true,
      disposition: "accepted-with-feedback",
      queueStatus: "started",
    });
    expect(dispatches).toHaveLength(1);
    expect(dispatches[0]).toMatchObject({
      event_type: "process-developer-feedback",
    });
    expect(dispatches.some((item) => item.event_type === "publish-site")).toBe(
      false,
    );
    expect(await (await userRequest(token, "status")).json()).toMatchObject({
      humanDisposition: "accepted-with-feedback",
      status: "completed",
      repairAvailable: false,
    });
    expect(
      (
        await userRequest(token, "send-anyway", "developer@example.com", {
          origin: previewOrigin,
          pageUrl: `${previewOrigin}/?review=${token}`,
          confirmed: true,
        })
      ).status,
    ).toBe(409);
    await env.REVISION_COORDINATOR.getByName(repo.toLowerCase()).complete(
      feedbackResult.requestId,
    );
    expect(
      (
        await userRequest(token, "send-anyway", "developer@example.com", {
          origin: previewOrigin,
          pageUrl: `${previewOrigin}/?review=${token}`,
          confirmed: true,
        })
      ).status,
    ).toBe(409);
    expect(mergeAttempts).toBe(0);
    expect(dispatches.some((item) => item.event_type === "publish-site")).toBe(
      false,
    );
  });

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
      http.get(`https://api.github.com/repos/${repo}/pulls/7`, () =>
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
          const response = await SELF.fetch(
            `${api}/api/internal/creative-repairs`,
            {
              method: "POST",
              headers: {
                Authorization: "Bearer test-coordinator-secret",
                "Content-Type": "application/json",
              },
              body: claimPayload,
            },
          );
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
      202, 409,
    ]);
    expect(dispatchCount).toBe(1);
    expect(dispatches[0]).toMatchObject({
      event_type: "repair-creative-candidate",
      client_payload: {
        repo,
        sessionId,
        pr: 7,
        headSha: reviewedSha,
        clientEmail: "client@example.com",
        feedbackIssue: 8,
      },
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
            evidence:
              "The final repair still diverges from its reference composition.",
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
          evidence:
            "The final repair still diverges from its reference composition.",
        },
      ],
    });
  });

  it("does not consume the one attempt for a stale preview or wrong reviewer", async () => {
    network.use(
      http.get(`https://api.github.com/repos/${repo}/pulls/7`, () =>
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

  it("allows the one final repair when no diagnostic preview was available", async () => {
    let dispatchCount = 0;
    const noPreviewSessionId = "44444444444444444444444444444444";
    network.use(
      http.get(`https://api.github.com/repos/${repo}/pulls/7`, () =>
        HttpResponse.json({
          head: { sha: reviewedSha },
          state: "open",
          draft: false,
        }),
      ),
      http.post(
        "https://api.github.com/repos/WrazyAI/launchloom/dispatches",
        () => {
          dispatchCount += 1;
          return new HttpResponse(null, { status: 204 });
        },
      ),
    );

    expect((await registerSession(null, noPreviewSessionId)).status).toBe(200);
    const token = await signedToken({
      creativeRepairSessionId: noPreviewSessionId,
    });
    const response = await userRequest(token, "retry");

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      ok: true,
      status: "queued",
      attemptConsumed: true,
    });
    expect(dispatchCount).toBe(1);
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


let completedScenarioIndex = 0;

async function completedFeedbackScenario(
  options: {
    linkClaims?: Record<string, unknown>;
    currentHead?: string;
    pagePath?: string;
    missingRegistration?: boolean;
    tamperedSignature?: boolean;
    regenerated?: boolean;
  lastPage?: boolean;
  } = {},
) {
  const suffix = (++completedScenarioIndex).toString(16).padStart(31, "0");
  const oldSession = `a${suffix}`;
  const newSession = `b${suffix}`;
  const latestSha = "b".repeat(40);
  const latestToken = await signedToken({
    headSha: latestSha,
    creativeRepairSessionId: newSession,
    ...options.linkClaims,
  });
  const oldToken = await signedToken({ creativeRepairSessionId: oldSession });
  await registerSession(previewOrigin, oldSession);
  if (!options.missingRegistration)
    await registerSession(previewOrigin, newSession, latestSha);
  const coordinator = env.REVISION_COORDINATOR.getByName(repo.toLowerCase());
  await runInDurableObject(coordinator, async (untypedInstance) => {
    const instance = untypedInstance as RevisionCoordinator;
    if (options.regenerated) return;
    await instance.beginCreativeRepair(oldSession, repo, 7, reviewedSha);
    await instance.creativeRepairDispatched(oldSession);
    await instance.claimCreativeRepair(oldSession);
    await instance.completeCreativeRepair(oldSession, {
      outcome: "needs-attention",
      previewUrl: previewOrigin,
      reviewUrl: `${reviewOrigin}/review?token=${options.tamperedSignature ? latestToken + "x" : latestToken}`,
    });
  });
  const comments: Array<{ body: string }> = [];
  const dispatches: Array<Record<string, any>> = [];
  network.use(
    http.get(`https://api.github.com/repos/${repo}/pulls/7`, () =>
      HttpResponse.json({
        head: { sha: options.currentHead || latestSha },
        state: "open",
        draft: false,
      }),
    ),
    http.get(`https://api.github.com/repos/${repo}/issues/7/comments`, () =>
      HttpResponse.json(
        options.regenerated
          ? [
              {
                body: `<!-- launchloom-creative-recovery -->\n${reviewOrigin}/review?token=${latestToken}`,
              },
              ...comments,
            ]
          : comments,
      ),
    ),
    http.post(
      `https://api.github.com/repos/${repo}/issues/7/comments`,
      async ({ request }) => {
        const comment = (await request.json()) as { body: string };
        comments.push(comment);
        return HttpResponse.json({ id: 9901 }, { status: 201 });
      },
    ),
    http.post(
      "https://api.github.com/repos/WrazyAI/launchloom/dispatches",
      async ({ request }) => {
        dispatches.push((await request.json()) as Record<string, any>);
        return new HttpResponse(null, { status: 204 });
      },
    ),
  );
  if (options.lastPage) {
    network.use(http.get(`https://api.github.com/repos/${repo}/issues/7/comments`, ({ request }) => {
      const page = new URL(request.url).searchParams.get("page");
      return page === "2"
        ? HttpResponse.json([{ body: `<!-- launchloom-creative-recovery -->\n${reviewOrigin}/review?token=${latestToken}` }])
        : HttpResponse.json([], { headers: { Link: '<https://api.github.com/repositories/123/issues/7/comments?per_page=100&page=2>; rel="last"' } });
    }));
  }
  const details = {
    attachments: [
      {
        target: "hero",
        kind: "upload",
        url: "https://assets.launchloom.wrazyos.com/feedback/test-client/hero.webp",
      },
    ],
    colors: [{ role: "surface", hex: "#e8d391" }],
  };
  const response = await userRequest(
    oldToken,
    "feedback",
    "developer@example.com",
    {
      origin: previewOrigin,
      pageUrl: `${previewOrigin}${options.pagePath || "/"}?review=${oldToken}`,
      comment: "keep overall direction",
      details,
      submissionId: `version-refresh-feedback-${suffix}`,
    },
  );
  return { response, dispatches, comments, details, oldToken, latestToken };
}

it("accepts feedback from the completed repair alias with the authoritative current token and preserves the draft", async () => {
  const { response, dispatches, comments, details, latestToken } =
    await completedFeedbackScenario();
  expect(response.status).toBe(202);
  expect(dispatches).toHaveLength(1);
  expect(dispatches[0].event_type).toBe("process-developer-feedback");
  expect(comments[0].body).toContain("keep overall direction");
  const encoded = comments[0].body.match(
    /launchloom-feedback-structure:([A-Za-z0-9_-]+)/,
  )?.[1];
  expect(
    JSON.parse(atob(encoded!.replace(/-/g, "+").replace(/_/g, "/"))),
  ).toEqual(details);
  expect(await (await userRequest(latestToken, "status")).json()).toMatchObject(
    { humanDisposition: "accepted-with-feedback" },
  );
  const result = (await response.clone().json()) as { requestId: string };
  await env.REVISION_COORDINATOR.getByName(repo.toLowerCase()).complete(
    result.requestId,
  );
});

it.each([
  { linkClaims: { reviewerEmail: "other@example.com" } },
  { linkClaims: { repo: "WrazyAI/launchloom-999-other-client" } },
  { linkClaims: { pr: 99 } },
  { linkClaims: { expiresAt: Date.now() - 1000 } },
  { currentHead: "c".repeat(40) },
  { pagePath: "/previous-version/" },
  { missingRegistration: true },
  { tamperedSignature: true },
])("rejects a stale result without queuing feedback: %j", async (options) => {
  const { response, dispatches, comments } =
    await completedFeedbackScenario(options);
  expect(response.status).toBe(409);
  expect(dispatches).toHaveLength(0);
  expect(comments).toHaveLength(0);
});

it("never refreshes a stale publication request through a completed feedback receipt", async () => {
  const { oldToken } = await completedFeedbackScenario({
    currentHead: "c".repeat(40),
  });
  let merges = 0;
  network.use(
    http.put(`https://api.github.com/repos/${repo}/pulls/7/merge`, () => {
      merges++;
      return HttpResponse.json({ merged: true });
    }),
  );
  const response = await userRequest(
    oldToken,
    "send-anyway",
    "developer@example.com",
    {
      origin: previewOrigin,
      pageUrl: `${previewOrigin}/?review=${oldToken}`,
      confirmed: true,
    },
  );
  expect(response.status).toBe(409);
  expect(merges).toBe(0);
});

it("accepts feedback on a regenerated live alias only when a signed current review is registered", async () => {
  const { response, dispatches } = await completedFeedbackScenario({
    regenerated: true,
  });
  expect(response.status).toBe(202);
  expect(dispatches).toHaveLength(1);
});


it("resolves the last handoff page from GitHub's canonical repository pagination URL", async () => {
  const { response } = await completedFeedbackScenario({ regenerated: true, lastPage: true });
  expect(response.status).toBe(202);
});
