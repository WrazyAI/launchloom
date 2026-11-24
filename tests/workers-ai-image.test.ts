import { describe, expect, it } from "vitest";
import { generateWorkersAiImage } from "../scripts/workers-ai-image.mjs";

const png = Buffer.from("89504e470d0a1a0a", "hex");

function response(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Workers AI image provider", () => {
  it("posts the prompt and decodes the base64 image", async () => {
    const calls: Array<{ url: string; body: any }> = [];
    const result = await generateWorkersAiImage({
      prompt: "A quiet architectural interior.",
      accountId: "account-1",
      token: "token-1",
      steps: 8,
      fetchImpl: async (url: URL | RequestInfo, init?: RequestInit) => {
        calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
        return response({ success: true, result: { image: png.toString("base64") } });
      },
    });
    expect(result.data.equals(png)).toBe(true);
    expect(result.provider).toBe("workers-ai");
    expect(calls[0].url).toContain("/accounts/account-1/ai/run/@cf/black-forest-labs/flux-1-schnell");
    expect(calls[0].body).toEqual({ prompt: "A quiet architectural interior.", steps: 8 });
  });

  it("surfaces the provider error for a rejected prompt", async () => {
    await expect(
      generateWorkersAiImage({
        prompt: "Anything",
        accountId: "account-1",
        token: "token-1",
        fetchImpl: async () =>
          response({ success: false, errors: [{ message: "Bad input" }] }, 400),
      }),
    ).rejects.toThrow(/Bad input/u);
  });

  it("requires account and token credentials", async () => {
    await expect(
      generateWorkersAiImage({ prompt: "Anything", accountId: "", token: "" }),
    ).rejects.toThrow(/CLOUDFLARE_ACCOUNT_ID/u);
  });
});
