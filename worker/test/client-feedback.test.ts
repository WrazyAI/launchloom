import { env, SELF } from "cloudflare:test";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { network } from "./network";

const origin = "https://review-initial.example-client.pages.dev";

function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

async function reviewToken() {
  const encoded = base64url(new TextEncoder().encode(JSON.stringify({
    stage: "client",
    repo: "WrazyAI/example-client",
    siteId: "example-client",
    reviewerEmail: "client@example.com",
    clientEmail: "client@example.com",
    pr: 12,
    feedbackIssue: 44,
    expiresAt: Date.now() + 60_000,
    allowedOrigins: [origin],
  })));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("test-review-secret"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encoded)));
  return `${encoded}.${base64url(signature)}`;
}

describe("bounded client review uploads", () => {
  it("accepts a signed PNG replacement, stores a generated asset URL, and excludes the review token from GitHub", async () => {
    const token = await reviewToken();
    const comments: Array<{ body: string }> = [];
    let dispatches = 0;
    network.use(
      http.get("https://api.github.com/repos/WrazyAI/example-client/issues/44/comments", () => HttpResponse.json(comments)),
      http.post("https://api.github.com/repos/WrazyAI/example-client/issues/44/comments", async ({ request }) => {
        const comment = await request.json() as { body: string };
        comments.push(comment);
        return HttpResponse.json({ id: 445 }, { status: 201 });
      }),
      http.post("https://api.github.com/repos/WrazyAI/launchloom/dispatches", () => {
        dispatches += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const form = new FormData();
    form.set("token", token);
    form.set("comment", "Please use this updated logo.");
    form.set("pageUrl", `${origin}/?review=${token}`);
    form.set("email", "client@example.com");
    form.set("category", "logo");
    form.set("submissionId", "client-feedback-upload-001");
    form.set("replacementAsset", new File([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])], "logo.png", { type: "image/png" }));

    const response = await SELF.fetch("https://api.launchloom.test/api/feedback", {
      method: "POST",
      headers: { Origin: origin },
      body: form,
    });

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ ok: true, stage: "client" });
    expect(comments).toHaveLength(1);
    expect(comments[0].body).toContain("Replacement asset: https://assets.launchloom.wrazyos.com/client-replacements/example-client/12/client-feedback-upload-001/");
    expect(comments[0].body).not.toContain(token);
    expect(comments[0].body).not.toContain(`?review=${token}`);
    expect(dispatches).toBe(1);
    const uploadedUrl = comments[0].body.match(/Replacement asset: (https:\/\/\S+)/u)?.[1];
    const key = uploadedUrl ? new URL(uploadedUrl).pathname.slice(1) : "";
    const asset = key ? await env.ASSETS.get(key) : null;
    expect(asset?.httpMetadata?.contentType).toBe("image/png");
    expect(asset ? Array.from(new Uint8Array(await asset.arrayBuffer())) : []).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });

  it("rejects unsupported client categories and malformed image bytes", async () => {
    const token = await reviewToken();
    const badCategory = await SELF.fetch("https://api.launchloom.test/api/feedback", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ token, comment: "Move the form", category: "layout", email: "client@example.com", pageUrl: `${origin}/`, submissionId: "client-feedback-invalid-001" }),
    });
    expect(badCategory.status).toBe(400);

    const form = new FormData();
    form.set("token", token);
    form.set("comment", "Use this logo.");
    form.set("pageUrl", `${origin}/`);
    form.set("email", "client@example.com");
    form.set("category", "logo");
    form.set("submissionId", "client-feedback-invalid-image-001");
    form.set("replacementAsset", new File(["not an image"], "logo.png", { type: "image/png" }));
    const badImage = await SELF.fetch("https://api.launchloom.test/api/feedback", { method: "POST", headers: { Origin: origin }, body: form });
    expect(badImage.status).toBe(415);
  });
});
