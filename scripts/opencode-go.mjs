// OpenCode Go production slice: reviewed Responses profile, pure request
// builders and cash accounting for the author and site-copy lanes.
//
// Wire facts verified against the live service on 2026-10-14 (ledger
// UPDATE-2026-10-14): the documented endpoint
// `https://opencode.ai/inference/go/v1/responses` works, gpt-6-luna accepts
// reasoning efforts low..max and rejects `temperature`, and responses report
// usage with cached/cache-write/reasoning details. Base64 images with high
// detail, strict JSON schema and stateless store:false were proven in the
// 2026-10-12 supervised runs. The provider does not return a per-request cash
// cost, so cost is computed from the published Go price table.

export const OPENCODE_GO_RESPONSES_ENDPOINT =
  "https://opencode.ai/inference/go/v1/responses";
export const OPENCODE_GO_SESSION_HEADER = "x-opencode-session";
export const OPENCODE_GO_USER_AGENT = "launchloom-production/0.1";
export const AUTHOR_RESPONSES_SCHEMA_NAME =
  "launchloom_production_author_stage";
export const AUTHOR_CACHE_BOUNDARY_TEXT =
  "End reusable route and reference context. Stage-specific work follows.";

// Published per-1M-token prices for GPT 6 Luna on the Go plan
// (https://opencode.ai/v2/docs/console/go, read 2026-10-14). The same figures
// determine how usage counts toward the plan's monthly limit.
const GPT6_LUNA_PRICING = {
  within272k: { input: 0.1, output: 0.5, cachedRead: 0.01, cachedWrite: 0.125 },
  beyond272k: { input: 0.2, output: 0.75, cachedRead: 0.02, cachedWrite: 0.25 },
};

const WIRE_MODELS = {
  "gpt-6-luna": "gpt-6-luna",
  "openai/gpt-6-luna": "gpt-6-luna",
};

/**
 * Translate the frozen logical session model to the Go wire id. Unknown
 * logical models fail explicitly instead of silently substituting a model.
 */
export function opencodeGoWireModel(logicalModel) {
  const wire = WIRE_MODELS[String(logicalModel || "").trim()];
  if (!wire)
    throw new Error(
      `Unsupported OpenCode Go logical model: ${logicalModel} (this slice supports gpt-6-luna).`,
    );
  return wire;
}

/**
 * Reviewed production profile for the Go Responses endpoint. Temperature is
 * deliberately false: gpt-6-luna rejects it, so the neutral builder must not
 * send it. Reasoning efforts are the verified set used by the author ladder
 * and the site-copy efforts.
 */
export function opencodeGoResponsesProfile({
  logicalModel = "openai/gpt-6-luna",
  maxOutputTokens = 48_000,
} = {}) {
  return {
    provider: "opencode-go",
    model: opencodeGoWireModel(logicalModel),
    protocol: "responses",
    endpoint: OPENCODE_GO_RESPONSES_ENDPOINT,
    auth: "bearer",
    userAgent: OPENCODE_GO_USER_AGENT,
    sessionHeader: OPENCODE_GO_SESSION_HEADER,
    capabilities: {
      images: true,
      imageDetail: true,
      temperature: false,
      outputFormats: ["text", "json", "json-schema"],
      maxOutputTokens,
      reasoning: {
        mode: "effort",
        efforts: ["low", "medium", "high", "xhigh", "max"],
      },
    },
  };
}

/**
 * Compute the cash-equivalent cost from normalized inference usage. Go bills
 * stated-price tokens against the plan limit, so this is also the quota spend.
 * `inputTokens` includes cached reads and cache writes (verified against the
 * 2026-10-12 usage totals); the fresh portion is billed at the input price.
 */
export function opencodeGoCashCostUsd(usage) {
  if (!usage || typeof usage !== "object") return null;
  const input = Number(usage.inputTokens || 0);
  const output = Number(usage.outputTokens || 0);
  const cachedRead = Number(usage.cachedInputTokens || 0);
  const cacheWrite = Number(usage.cacheWriteTokens || 0);
  const prices =
    input > 272_000
      ? GPT6_LUNA_PRICING.beyond272k
      : GPT6_LUNA_PRICING.within272k;
  const fresh = Math.max(0, input - cachedRead - cacheWrite);
  const cost =
    (fresh * prices.input +
      cachedRead * prices.cachedRead +
      cacheWrite * prices.cachedWrite +
      output * prices.output) /
    1_000_000;
  return Math.round(cost * 1_000_000_000) / 1_000_000_000;
}

/**
 * Cache/usage ledger row for Go completions, mirroring the OpenRouter cache
 * metrics shape so existing aggregation and console logging keep working.
 */
export function opencodeGoUsageMetrics(
  usage,
  { label = "request", logger = null } = {},
) {
  const promptTokens = Number(usage?.inputTokens || 0);
  const cachedTokens = Number(usage?.cachedInputTokens || 0);
  const cacheWriteTokens = Number(usage?.cacheWriteTokens || 0);
  const cacheHitRate =
    promptTokens > 0 ? Math.min(1, cachedTokens / promptTokens) : 0;
  const metrics = {
    promptTokens,
    cachedTokens,
    cacheWriteTokens,
    cacheHitRate,
    cacheHitPercent: Math.round(cacheHitRate * 1000) / 10,
    cost: opencodeGoCashCostUsd(usage),
    costSource: "computed-from-published-prices",
  };
  if (logger)
    logger(
      [
        "opencode_go_cache",
        `label=${label}`,
        `prompt_tokens=${metrics.promptTokens}`,
        `cached_tokens=${metrics.cachedTokens}`,
        `cache_write_tokens=${metrics.cacheWriteTokens}`,
        `hit_percent=${metrics.cacheHitPercent}`,
        `cost=${metrics.cost}`,
      ].join(" "),
    );
  return metrics;
}

/**
 * Convert a chat-style image part from promptImagePart() into the neutral
 * Responses image part. Only base64 data URLs are accepted (remote URLs are
 * rejected by the neutral contract).
 */
export function responsesImagePart(chatImagePart, detail = "high") {
  const url = chatImagePart?.image_url?.url;
  if (
    typeof url !== "string" ||
    !/^data:image\/(?:png|jpeg|webp|gif);base64,/u.test(url)
  )
    throw new Error(
      "Responses image parts require a base64 image data URL from promptImagePart().",
    );
  return { type: "image", url, detail };
}

/**
 * Pure builder for one author-stage Responses request. Mirrors the prompt
 * order of the OpenRouter lane (route context, paired screenshots, cache
 * boundary text, stage work) without OpenRouter-only cache fields,
 * temperature or reasoning exclude.
 */
export function buildAuthorResponsesRequest({
  systemPrompt,
  routePrompt,
  stagePrompt,
  imageParts = [],
  stageMaxTokens,
  effort,
  schema,
  sessionId,
}) {
  return {
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: routePrompt },
          ...imageParts,
          { type: "text", text: AUTHOR_CACHE_BOUNDARY_TEXT },
          { type: "text", text: stagePrompt },
        ],
      },
    ],
    maxOutputTokens: stageMaxTokens,
    reasoning: { effort },
    outputFormat: {
      type: "json-schema",
      name: AUTHOR_RESPONSES_SCHEMA_NAME,
      schema,
    },
    sessionId,
  };
}

/** Pure builder for one site-copy Responses request (schema-free JSON mode). */
export function buildSiteCopyResponsesRequest({
  systemPrompt,
  userPrompt,
  maxOutputTokens,
  effort,
  sessionId,
}) {
  return {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    maxOutputTokens,
    reasoning: { effort },
    outputFormat: { type: "json" },
    sessionId,
  };
}
