import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker, { type Env } from "../src/index";
import type { OnboardingInvites } from "../src/onboarding-invites";

const onboardingOrigin = "https://onboard.example.test";
const signingSecret = "test-onboarding-invite-secret";
const inviteNamespace = (
  env as unknown as {
    ONBOARDING_INVITES: DurableObjectNamespace<OnboardingInvites>;
  }
).ONBOARDING_INVITES;

function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
}

async function createInvite(inviteId: string) {
  const expiresAt = Date.now() + 60_000;
  const claims = { inviteId, expiresAt, allowedOrigins: [onboardingOrigin] };
  const encoded = base64url(new TextEncoder().encode(JSON.stringify(claims)));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encoded)),
  );
  const token = `${encoded}.${base64url(signature)}`;
  const hash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
  );
  await inviteNamespace.getByName("launchloom-onboarding-invites").register({
    inviteId,
    clientEmail: null,
    expiresAt,
    allowedOrigin: onboardingOrigin,
    tokenHash: [...hash]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join(""),
    now: Date.now(),
  });
  return token;
}

function uploadRequest(inviteToken: string) {
  const form = new FormData();
  form.set("submissionId", "submission-upload-retry-001");
  form.set("inviteToken", inviteToken);
  form.set("slot", "logo");
  form.set(
    "file",
    new File([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])], "logo.png", {
      type: "image/png",
    }),
  );
  return new Request("https://api.launchloom.test/api/upload", {
    method: "POST",
    headers: { Origin: onboardingOrigin },
    body: form,
  });
}

describe("private onboarding uploads", () => {
  it("retries a transient R2 write failure with the same key and bytes", async () => {
    const token = await createInvite("invite-upload-transient-001");
    const writes: Array<{ key: string; bytes: number[] }> = [];
    const stored = new Map<string, number[]>();
    const assets: Env["ASSETS"] = {
      async put(key, value) {
        const bytes =
          value instanceof ArrayBuffer
            ? new Uint8Array(value)
            : new Uint8Array(await new Response(value).arrayBuffer());
        const captured = Array.from(bytes);
        writes.push({ key, bytes: captured });

        // Model a connection loss after R2 committed the write. Repeating this
        // content-addressed put is safe because it replaces identical bytes.
        stored.set(key, captured);
        if (writes.length === 1)
          throw new Error("simulated R2 response loss after commit");
        return { key };
      },
    };
    const request = uploadRequest(token);
    const response = await worker.fetch(
      request,
      { ...(env as unknown as Env), ASSETS: assets },
      {} as ExecutionContext,
    );

    expect(response.status).toBe(201);
    const result = (await response.json()) as {
      key: string;
      url: string;
      slot: string;
    };
    expect(result).toMatchObject({ slot: "logo" });
    expect(writes).toHaveLength(2);
    expect(writes[0]?.key).toMatch(
      /^intakes\/submission-upload-retry-001\/logo-[a-f0-9]{32}\.png$/u,
    );
    expect(writes[1]?.key).toBe(writes[0]?.key);
    expect(writes[1]?.bytes).toEqual(writes[0]?.bytes);
    expect(stored.get(result.key)).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);

    const clientRetry = await worker.fetch(
      uploadRequest(token),
      { ...(env as unknown as Env), ASSETS: assets },
      {} as ExecutionContext,
    );
    expect(clientRetry.status).toBe(201);
    const retryResult = (await clientRetry.json()) as { key: string };
    expect(retryResult.key).toBe(result.key);
    expect(stored.size).toBe(1);
  });

  it("fails explicitly when R2 returns null without storing the image", async () => {
    const token = await createInvite("invite-upload-null-result-001");
    let writes = 0;
    const assets: Env["ASSETS"] = {
      async put() {
        writes += 1;
        return null;
      },
    };
    const response = await worker.fetch(
      uploadRequest(token),
      { ...(env as unknown as Env), ASSETS: assets },
      {} as ExecutionContext,
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: "Image upload failed. Please try again.",
    });
    expect(writes).toBe(1);
  });
});
