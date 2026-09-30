import { env } from "cloudflare:workers";
import { SELF } from "cloudflare:test";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { network } from "./network";

const origin = "https://review-initial.example-client.pages.dev";
const pngBytes = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  ),
  (character) => character.charCodeAt(0),
);

function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
}

async function reviewToken(
  overrides: Record<string, unknown> = {},
  secret = "test-review-secret",
) {
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
        ...overrides,
      }),
    ),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
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

function uploadRequest({
  token,
  target = "hero",
  email = "developer@example.com",
  file = new File([pngBytes], "hero.png", { type: "image/png" }),
}: {
  token: string;
  target?: string;
  email?: string;
  file?: File;
}) {
  const form = new FormData();
  form.set("token", token);
  form.set("email", email);
  form.set("pageUrl", `${origin}/?review=signed`);
  form.set("target", target);
  form.set("file", file);
  return new Request("https://api.example.test/api/feedback-image", {
    method: "POST",
    headers: { Origin: origin },
    body: form,
  });
}

async function r2Object(key: string) {
  const bucket = env.ASSETS as unknown as {
    get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
  };
  return bucket.get(key);
}

describe("feedback images", () => {
  it("stores an uploaded replacement under the feedback prefix", async () => {
    const token = await reviewToken();
    const response = await SELF.fetch(uploadRequest({ token }));
    expect(response.status).toBe(201);
    const payload = (await response.json()) as {
      ok: boolean;
      target: string;
      url: string;
    };
    expect(payload.ok).toBe(true);
    expect(payload.target).toBe("hero");
    expect(payload.url).toMatch(
      /^https:\/\/assets\.launchloom\.wrazyos\.com\/feedback\/example-client\/[a-f0-9-]+-hero\.png$/u,
    );
    const key = new URL(payload.url).pathname.replace(/^\//u, "");
    const object = await r2Object(key);
    expect(object).not.toBeNull();
    expect((await object!.arrayBuffer()).byteLength).toBe(pngBytes.byteLength);
  });

  it("rejects a mismatched reviewer email", async () => {
    const token = await reviewToken();
    const response = await SELF.fetch(
      uploadRequest({ token, email: "someone-else@example.com" }),
    );
    expect(response.status).toBe(403);
    expect((await response.json()) as { error: string }).toMatchObject({
      error: expect.stringContaining("email address"),
    });
  });

  it("rejects unsupported targets and file types", async () => {
    const token = await reviewToken();
    const badTarget = await SELF.fetch(
      uploadRequest({ token, target: "banner" }),
    );
    expect(badTarget.status).toBe(400);
    const badFile = await SELF.fetch(
      uploadRequest({
        token,
        file: new File([new Uint8Array([1, 2, 3])], "notes.txt", {
          type: "text/plain",
        }),
      }),
    );
    expect(badFile.status).toBe(400);
  });

  it("generates a constrained candidate and stores only our draft URL", async () => {
    const prompts: string[] = [];
    let falModel = "";
    network.use(
      http.get(
        "https://api.github.com/repos/WrazyAI/example-client/contents/src/site.config.json",
        () =>
          HttpResponse.json({
            encoding: "base64",
            content: btoa(
              JSON.stringify({
                business: {
                  name: "Daley Hope",
                  serviceAreas: ["Bala Cynwyd"],
                },
                businessKind: "home-care",
                services: [{ name: "Home care" }],
                style: { tone: "calm" },
              }),
            ),
          }),
      ),
      http.post("https://fal.run/*", async ({ request }) => {
        falModel = new URL(request.url).pathname.replace(/^\//u, "");
        const body = (await request.json()) as { prompt?: string };
        prompts.push(String(body.prompt || ""));
        return HttpResponse.json({
          images: [{ url: "https://fal.example.test/generated.png" }],
          request_id: "fal-request-1",
        });
      }),
      http.get("https://fal.example.test/generated.png", () =>
        new HttpResponse(pngBytes, {
          headers: { "content-type": "image/png" },
        }),
      ),
    );
    const token = await reviewToken();
    const response = await SELF.fetch(
      new Request("https://api.example.test/api/feedback-image", {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          email: "developer@example.com",
          pageUrl: `${origin}/?review=signed`,
          target: "logo",
          prompt: "A minimal lighthouse mark in navy",
        }),
      }),
    );
    expect(response.status).toBe(201);
    const payload = (await response.json()) as {
      images: Array<{ url: string }>;
      model: string;
    };
    expect(falModel).toBe("fal-ai/minimax/image-01");
    expect(payload.model).toBe("fal-ai/minimax/image-01");
    expect(payload.images[0].url).toMatch(
      /^https:\/\/assets\.launchloom\.wrazyos\.com\/feedback-drafts\/example-client\/[a-f0-9-]+\.png$/u,
    );
    expect(payload.images[0].url).not.toContain("fal.example.test");
    const built = prompts[0] || "";
    expect(built).toContain("Daley Hope");
    expect(built).toContain("A minimal lighthouse mark in navy");
    expect(built).toContain("No readable text");
    const key = new URL(payload.images[0].url).pathname.replace(/^\//u, "");
    expect(await r2Object(key)).not.toBeNull();
  });

  it("enforces the daily generation allowance per client site", async () => {
    const coordinator = env.REVISION_COORDINATOR.getByName(
      "wrazyai/quota-client",
    );
    for (let attempt = 0; attempt < 12; attempt += 1) {
      expect((await coordinator.allowFeedbackImage(1)).allowed).toBe(true);
    }
    const blocked = await coordinator.allowFeedbackImage(1);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("rejects malformed structured feedback before queueing", async () => {
    const token = await reviewToken();
    const response = await SELF.fetch(
      new Request("https://api.example.test/api/feedback", {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          email: "developer@example.com",
          pageUrl: `${origin}/?review=signed`,
          comment: "Swap the hero image.",
          details: {
            attachments: [
              {
                target: "hero",
                kind: "upload",
                url: "https://evil.example.test/hero.png",
              },
            ],
          },
        }),
      }),
    );
    expect(response.status).toBe(400);
  });

  it("renders the structured marker and summary into the feedback comment", async () => {
    let commentBody = "";
    network.use(
      http.get(
        "https://api.github.com/repos/WrazyAI/example-client/pulls/7",
        () =>
          HttpResponse.json({
            head: { sha: "review-head-sha" },
            state: "open",
            draft: false,
            merged: false,
            merge_commit_sha: null,
          }),
      ),
      http.get(
        "https://api.github.com/repos/WrazyAI/example-client/issues/7/comments",
        () => HttpResponse.json([]),
      ),
      http.post(
        "https://api.github.com/repos/WrazyAI/example-client/issues/7/comments",
        async ({ request }) => {
          const body = (await request.json()) as { body?: string };
          commentBody = String(body.body || "");
          return HttpResponse.json({ id: 501 }, { status: 201 });
        },
      ),
      http.post(
        "https://api.github.com/repos/WrazyAI/launchloom/dispatches",
        () => new HttpResponse(null, { status: 204 }),
      ),
    );
    const token = await reviewToken();
    const response = await SELF.fetch(
      new Request("https://api.example.test/api/feedback", {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          email: "developer@example.com",
          pageUrl: `${origin}/?review=signed`,
          comment: "Here is the requested change.",
          category: "Hero image, Colors",
          details: {
            attachments: [
              {
                target: "hero",
                kind: "upload",
                url: "https://assets.launchloom.wrazyos.com/feedback/example-client/a-hero.webp",
              },
            ],
            colors: [{ role: "primary", hex: "#123456" }],
          },
        }),
      }),
    );
    expect(response.status).toBe(202);
    expect(commentBody).toContain("<!-- launchloom-feedback-structure:");
    expect(commentBody).toContain("_Requested changes:_");
    expect(commentBody).toContain(
      "Replace the main image with the uploaded image.",
    );
    expect(commentBody).toContain(
      "Set main brand color #123456.",
    );
  });
});

function decodeStructure(marker: string) {
  const padded = marker.replace(/-/gu, "+").replace(/_/gu, "/");
  const binary = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), "="));
  return JSON.parse(
    new TextDecoder().decode(
      Uint8Array.from(binary, (character) => character.charCodeAt(0)),
    ),
  ) as {
    attachments: Array<{ target: string; kind: string; url: string }>;
    colors: Array<{ role: string; hex: string }>;
  };
}

function clientToken(overrides: Record<string, unknown> = {}) {
  return reviewToken({
    stage: "client",
    pr: undefined,
    headSha: undefined,
    feedbackIssue: 44,
    reviewerEmail: "client@example.com",
    ...overrides,
  });
}

function clientMocks(
  commentSink: { body: string },
  repo = "WrazyAI/example-client",
) {
  network.use(
    http.get(
      `https://api.github.com/repos/${repo}/issues/44/comments`,
      () => HttpResponse.json([]),
    ),
    http.post(
      `https://api.github.com/repos/${repo}/issues/44/comments`,
      async ({ request }) => {
        const payload = (await request.json()) as { body?: string };
        commentSink.body = String(payload.body || "");
        return HttpResponse.json({ id: 601 }, { status: 201 });
      },
    ),
    http.post(
      "https://api.github.com/repos/WrazyAI/launchloom/dispatches",
      () => new HttpResponse(null, { status: 204 }),
    ),
  );
}

describe("bounded client image feedback", () => {
  it("records an explicit client replacement target as structure", async () => {
    const comment = { body: "" };
    clientMocks(comment);
    const token = await clientToken();
    const form = new FormData();
    form.set("token", token);
    form.set("comment", "Use this photo.");
    form.set("category", "photos");
    form.set("email", "client@example.com");
    form.set("pageUrl", `${origin}/`);
    form.set("submissionId", "client-target-0001");
    form.set("replacementTarget", "secondary");
    form.set(
      "replacementAsset",
      new File([pngBytes], "photo.png", { type: "image/png" }),
    );
    const response = await SELF.fetch(
      new Request("https://api.example.test/api/feedback", {
        method: "POST",
        headers: { Origin: origin },
        body: form,
      }),
    );
    expect(response.status).toBe(202);
    expect(comment.body).toContain("_Requested changes:_");
    expect(comment.body).toContain(
      "Replace the about image with the uploaded image.",
    );
    expect(comment.body).not.toContain("Replacement asset: ");
    const marker = comment.body.match(
      /launchloom-feedback-structure:([A-Za-z0-9_-]+)/u,
    )?.[1];
    expect(marker).toBeTruthy();
    const structure = decodeStructure(marker!);
    expect(structure.attachments[0]).toMatchObject({
      target: "secondary",
      kind: "upload",
    });
    expect(structure.attachments[0].url).toContain("/client-replacements/");
    const key = new URL(structure.attachments[0].url).pathname.replace(
      /^\//u,
      "",
    );
    expect(await r2Object(key)).not.toBeNull();
  });

  it("copies a selected generated draft into client replacements", async () => {
    const comment = { body: "" };
    clientMocks(comment, "WrazyAI/example-client-generated");
    const draftKey = "feedback-drafts/example-client/draft-1.png";
    await env.ASSETS.put(draftKey, pngBytes.buffer, {
      httpMetadata: {
        contentType: "image/png",
        cacheControl: "public, max-age=86400",
      },
    });
    const token = await clientToken({
      repo: "WrazyAI/example-client-generated",
    });
    const response = await SELF.fetch(
      new Request("https://api.example.test/api/feedback", {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          email: "client@example.com",
          pageUrl: `${origin}/`,
          submissionId: "client-generated-0001",
          category: "photos",
          comment: "",
          details: {
            attachments: [
              {
                target: "hero",
                kind: "generated",
                url: `https://assets.launchloom.wrazyos.com/${draftKey}`,
                prompt: "A warm workshop scene",
                model: "fal-ai/minimax/image-01",
              },
            ],
            colors: [],
          },
        }),
      }),
    );
    expect(response.status).toBe(202);
    const marker = comment.body.match(
      /launchloom-feedback-structure:([A-Za-z0-9_-]+)/u,
    )?.[1];
    expect(marker).toBeTruthy();
    const structure = decodeStructure(marker!);
    expect(structure.attachments[0].url).toContain(
      `/client-replacements/example-client/review/client-generated-0001/`,
    );
    expect(structure.attachments[0].kind).toBe("generated");
    const key = new URL(structure.attachments[0].url).pathname.replace(
      /^\//u,
      "",
    );
    expect(await r2Object(key)).not.toBeNull();
  });

  it("rejects a client replacement target outside the chosen category", async () => {
    const comment = { body: "" };
    clientMocks(comment);
    const token = await clientToken();
    const form = new FormData();
    form.set("token", token);
    form.set("comment", "Use this photo.");
    form.set("category", "photos");
    form.set("email", "client@example.com");
    form.set("pageUrl", `${origin}/`);
    form.set("submissionId", "client-target-0002");
    form.set("replacementTarget", "logo");
    form.set(
      "replacementAsset",
      new File([pngBytes], "photo.png", { type: "image/png" }),
    );
    const response = await SELF.fetch(
      new Request("https://api.example.test/api/feedback", {
        method: "POST",
        headers: { Origin: origin },
        body: form,
      }),
    );
    expect(response.status).toBe(400);
  });
});
