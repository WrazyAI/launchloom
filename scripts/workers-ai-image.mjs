import { createHash } from "node:crypto";

export const WORKERS_AI_DEFAULT_MODEL =
  "@cf/black-forest-labs/flux-1-schnell";

/**
 * Generate one image with Cloudflare Workers AI.
 *
 * FLUX.1 schnell accepts a prompt and a step count (1-8) and returns a
 * base64 PNG in `result.image`. It does not accept width or height, so the
 * output is square and the site crops it. A 4xx is a permanent input error;
 * a 5xx or transport failure is retryable by the caller.
 *
 * @param {{prompt: string, accountId?: string, token?: string, model?: string,
 *   steps?: number, fetchImpl?: typeof fetch, timeoutMs?: number}} input
 */
export async function generateWorkersAiImage({
  prompt,
  accountId = process.env.CLOUDFLARE_ACCOUNT_ID,
  token =
    process.env.CLOUDFLARE_WORKERS_AI_TOKEN ||
    process.env.CLOUDFLARE_API_TOKEN,
  model = process.env.WORKERS_AI_IMAGE_MODEL || WORKERS_AI_DEFAULT_MODEL,
  steps = 8,
  fetchImpl = fetch,
  timeoutMs = 120_000,
} = {}) {
  const account = String(accountId || "").trim();
  const bearer = String(token || "").trim();
  if (!account || !bearer)
    throw new Error(
      "Workers AI requires CLOUDFLARE_ACCOUNT_ID and a Workers AI token.",
    );
  const text = String(prompt || "").trim();
  if (!text) throw new Error("Workers AI requires a prompt.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(
      `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${bearer}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          prompt: text,
          steps: Math.min(8, Math.max(1, Math.round(Number(steps) || 8))),
        }),
      },
    );
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.success === false) {
      const message =
        payload?.errors?.map((error) => error?.message).filter(Boolean).join(" | ") ||
        `Workers AI returned HTTP ${response.status}.`;
      const error = new Error(message.slice(0, 300));
      error.providerStatus = response.status;
      throw error;
    }
    const encoded = payload?.result?.image;
    if (typeof encoded !== "string" || !encoded.trim())
      throw new Error("Workers AI returned no image.");
    const data = Buffer.from(encoded, "base64");
    if (!data.byteLength) throw new Error("Workers AI returned an empty image.");
    return {
      data,
      provider: "workers-ai",
      model,
      requestId: createHash("sha256").update(data).digest("hex").slice(0, 16),
    };
  } finally {
    clearTimeout(timer);
  }
}
