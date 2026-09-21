import crypto from "node:crypto";

export const OPENROUTER_CHAT_COMPLETIONS_URL =
  "https://openrouter.ai/api/v1/chat/completions";

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

function slug(value, fallback = "session") {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 56);
  return normalized || fallback;
}

function digest(parts, length = 32) {
  return crypto
    .createHash("sha256")
    .update(parts.map((part) => stableJson(part)).join("\u0000"))
    .digest("hex")
    .slice(0, length);
}

/**
 * Stable, non-PII session identifier for OpenRouter provider stickiness.
 * Keep the identity inputs stable across related requests but exclude timestamps,
 * retry counters, screenshot paths, and other per-attempt values.
 */
export function openRouterSessionId(scope, ...identity) {
  return `launchloom:${slug(scope)}:${digest(identity)}`.slice(0, 256);
}

/**
 * Stable cache key used for explicit GPT-5.6+ prompt caching.
 */
export function openRouterPromptCacheKey(scope, ...identity) {
  return `ll:${slug(scope)}:${digest(identity, 40)}`;
}

export function supportsExplicitOpenAiPromptCaching(model) {
  const match = String(model || "").match(/^openai\/gpt-(\d+)(?:\.(\d+))?/u);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2] || 0);
  return major > 5 || (major === 5 && minor >= 6);
}

/**
 * Mark the end of a reusable text prefix for OpenAI GPT-5.6+.
 * Other providers keep the same text block and can use their implicit caching.
 */
export function promptCachedText(model, text) {
  const block = { type: "text", text: String(text || "") };
  if (supportsExplicitOpenAiPromptCaching(model))
    block.prompt_cache_breakpoint = { mode: "explicit" };
  return block;
}

/**
 * Request-level controls for explicit OpenAI prompt caching.
 */
export function promptCacheRequestFields(
  model,
  cacheKey,
  { ttl = "30m" } = {},
) {
  if (!supportsExplicitOpenAiPromptCaching(model) || !cacheKey) return {};
  return {
    prompt_cache_key: String(cacheKey).slice(0, 256),
    prompt_cache_options: {
      mode: "explicit",
      ttl,
    },
  };
}

/**
 * Normalize cache accounting across Chat Completions and Responses-style usage.
 */
export function openRouterCacheMetrics(usage) {
  const source = usage || {};
  const details =
    source.prompt_tokens_details || source.input_tokens_details || {};
  const promptTokens = Number(
    source.prompt_tokens ?? source.input_tokens ?? 0,
  );
  const cachedTokens = Number(details.cached_tokens || 0);
  const cacheWriteTokens = Number(details.cache_write_tokens || 0);
  const cacheHitRate =
    promptTokens > 0 ? Math.min(1, cachedTokens / promptTokens) : 0;
  return {
    promptTokens,
    cachedTokens,
    cacheWriteTokens,
    cacheHitRate,
    cacheHitPercent: Math.round(cacheHitRate * 1000) / 10,
  };
}

export function logOpenRouterCacheUsage(label, usage, logger = console.log) {
  const metrics = openRouterCacheMetrics(usage);
  logger(
    [
      "openrouter_cache",
      `label=${slug(label, "request")}`,
      `prompt_tokens=${metrics.promptTokens}`,
      `cached_tokens=${metrics.cachedTokens}`,
      `cache_write_tokens=${metrics.cacheWriteTokens}`,
      `hit_percent=${metrics.cacheHitPercent}`,
    ].join(" "),
  );
  return metrics;
}

/**
 * Shared OpenRouter Chat Completions transport.
 *
 * - sessionId enables sticky provider routing from the first successful request.
 * - responseCache is intentionally opt-in and should only be used for
 *   deterministic/idempotent inference such as judges and analyzers.
 */
export async function openRouterChatCompletion({
  apiKey = process.env.OPENROUTER_API_KEY,
  title = "LaunchLoom",
  body,
  sessionId,
  responseCache = false,
  responseCacheTtlSeconds = 900,
  signal,
  fetchImpl = fetch,
} = {}) {
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is required.");
  if (!body || typeof body !== "object")
    throw new Error("OpenRouter request body is required.");

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "X-OpenRouter-Title": title,
  };
  if (responseCache) {
    headers["X-OpenRouter-Cache"] = "true";
    headers["X-OpenRouter-Cache-TTL"] = String(
      Math.max(
        1,
        Math.min(
          86_400,
          Number.isFinite(Number(responseCacheTtlSeconds))
            ? Math.trunc(Number(responseCacheTtlSeconds))
            : 900,
        ),
      ),
    );
  }

  const requestBody = {
    ...body,
    ...(sessionId ? { session_id: String(sessionId).slice(0, 256) } : {}),
  };

  return fetchImpl(OPENROUTER_CHAT_COMPLETIONS_URL, {
    method: "POST",
    ...(signal ? { signal } : {}),
    headers,
    body: JSON.stringify(requestBody),
  });
}
