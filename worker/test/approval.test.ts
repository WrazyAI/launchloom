import { SELF } from "cloudflare:test";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { network } from "./network";

const origin = "https://review-initial.example-client.pages.dev";

function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
}

async function reviewToken() {
  const encoded = base64url(
    new TextEncoder().encode(
      JSON.stringify({
        stage: "developer",
        repo: "WrazyAI/example-client",
        siteId: "example-client",
        reviewerEmail: "developer@example.com",
        clientEmail: "client@example.com",
        pr: 7,
        headSha: "review-head-sha",
        feedbackIssue: 8,
        expiresAt: Date.now() + 60_000,
        allowedOrigins: [origin],
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
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(encoded),
    ),
  );
  return `${encoded}.${base64url(signature)}`;
}

describe("developer approval", () => {
  it("retries publication after merge succeeds but the first dispatch fails", async () => {
    let merged = false;
    let mergeAttempts = 0;
    let dispatchAttempts = 0;
    const dispatchBodies: Array<Record<string, any>> = [];

    network.use(
      http.get(
        "https://api.github.com/repos/WrazyAI/example-client/pulls/7",
        () =>
          HttpResponse.json(
            merged
              ? {
                  head: { sha: "review-head-sha" },
                  state: "closed",
                  draft: false,
                  merged: true,
                  merge_commit_sha: "approved-merge-sha",
                }
              : {
                  head: { sha: "review-head-sha" },
                  state: "open",
                  draft: false,
                  merged: false,
                  merge_commit_sha: null,
                },
          ),
      ),
      http.get(
        "https://api.github.com/repos/WrazyAI/example-client/contents/src/site.config.json",
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
      http.put(
        "https://api.github.com/repos/WrazyAI/example-client/pulls/7/merge",
        () => {
          mergeAttempts += 1;
          merged = true;
          return HttpResponse.json({
            merged: true,
            sha: "approved-merge-sha",
            message: "Pull Request successfully merged",
          });
        },
      ),
      http.post(
        "https://api.github.com/repos/WrazyAI/launchloom/dispatches",
        async ({ request }) => {
          dispatchAttempts += 1;
          dispatchBodies.push(
            (await request.json()) as Record<string, any>,
          );
          if (dispatchAttempts === 1)
            return HttpResponse.json(
              { message: "temporary dispatch failure" },
              { status: 503 },
            );
          return new HttpResponse(null, { status: 204 });
        },
      ),
    );

    const token = await reviewToken();
    const request = () =>
      SELF.fetch("https://api.launchloom.test/api/approval", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: origin,
        },
        body: JSON.stringify({
          token,
          email: "developer@example.com",
          pageUrl: `${origin}/?review=${token}`,
        }),
      });

    expect((await request()).status).toBe(403);
    expect((await request()).status).toBe(200);
    expect(mergeAttempts).toBe(1);
    expect(dispatchAttempts).toBe(2);
    expect(dispatchBodies).toHaveLength(2);
    for (const body of dispatchBodies)
      expect(body).toMatchObject({
        event_type: "publish-site",
        client_payload: { approvedSha: "approved-merge-sha" },
      });
  });

  it("publishes the exact merge commit returned for the reviewed PR head", async () => {
    let mergeRequest: Record<string, unknown> = {};
    let dispatchRequest: Record<string, any> = {};

    network.use(
      http.get(
        "https://api.github.com/repos/WrazyAI/example-client/pulls/7",
        () =>
          HttpResponse.json({
            head: { sha: "review-head-sha" },
            state: "open",
            draft: false,
          }),
      ),
      http.get(
        "https://api.github.com/repos/WrazyAI/example-client/contents/src/site.config.json",
        ({ request }) => {
          expect(new URL(request.url).searchParams.get("ref")).toBe(
            "review-head-sha",
          );
          const content = btoa(
            JSON.stringify({
              business: { name: "Example Client" },
              seoResearch: { mode: "researched", publishReady: true },
            }),
          );
          return HttpResponse.json({ encoding: "base64", content });
        },
      ),
      http.put(
        "https://api.github.com/repos/WrazyAI/example-client/pulls/7/merge",
        async ({ request }) => {
          mergeRequest = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({
            merged: true,
            sha: "approved-merge-sha",
            message: "Pull Request successfully merged",
          });
        },
      ),
      http.post(
        "https://api.github.com/repos/WrazyAI/launchloom/dispatches",
        async ({ request }) => {
          dispatchRequest = (await request.json()) as Record<string, any>;
          return new HttpResponse(null, { status: 204 });
        },
      ),
    );

    const token = await reviewToken();
    const response = await SELF.fetch(
      "https://api.launchloom.test/api/approval",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: origin,
        },
        body: JSON.stringify({
          token,
          email: "developer@example.com",
          pageUrl: `${origin}/?review=${token}`,
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(mergeRequest).toMatchObject({
      sha: "review-head-sha",
      merge_method: "squash",
    });
    expect(dispatchRequest).toMatchObject({
      event_type: "publish-site",
      client_payload: {
        repo: "WrazyAI/example-client",
        siteId: "example-client",
        clientEmail: "client@example.com",
        feedbackIssue: 8,
        approvedSha: "approved-merge-sha",
      },
    });
  });
});
