import {
  completeGeneration,
  parseGenerationOutput,
} from "./generation-inference.mjs";
import {
  opencodeGoResponsesProfile,
  opencodeGoUsageMetrics,
  opencodeGoWireModel,
  responsesImagePart,
} from "./opencode-go.mjs";

/**
 * Shared creative-lane transport.
 *
 * The authoring lane already runs the OpenCode Go Responses transport behind
 * CREATIVE_EXPERIENCE_PROVIDER. The reference analyzer, rendered judge, visual
 * quality gate, and repair loop historically imported the OpenRouter client
 * directly, so a drained OpenRouter balance stopped every creative run even
 * though generation ran on Go. This module gives those components the same
 * provider switch and the same Go request/usage handling, keeping OpenRouter
 * as the default fallback.
 */

export const CREATIVE_LANE_PROVIDERS = Object.freeze([
  "openrouter",
  "opencode-go",
]);

/** Default logical model per transport. The Go slice serves DeepSeek V4.1
 * Flash (verified live 2026-10-17: structured output, vision, and every
 * effort level); the OpenRouter fallback keeps GPT-6 Luna. */
export function creativeLaneDefaultModel(provider = creativeLaneProvider()) {
  return provider === "opencode-go"
    ? "opencode-go/deepseek-v4.1-flash"
    : "openai/gpt-6-luna";
}

/** Default reasoning effort for the creative lane. DeepSeek V4.1 Flash runs
 * at `max` unless an explicit environment override selects otherwise. */
export function creativeLaneDefaultEffort(provider = creativeLaneProvider()) {
  return provider === "opencode-go" ? "max" : "xhigh";
}

/** Resolve one lane's reasoning effort: lane env, then the shared creative
 * env, then the provider default. On OpenRouter each lane keeps its historical
 * default (`openrouterDefault`); the Go transport always defaults to `max`. */
export function creativeLaneEffort(
  env = process.env,
  { lane = null, openrouterDefault = "xhigh" } = {},
) {
  const laneValue = lane ? String(env[lane] || "").trim() : "";
  if (laneValue) return laneValue;
  const shared = String(env.CREATIVE_EXPERIENCE_REASONING_EFFORT || "").trim();
  if (shared) return shared;
  return creativeLaneProvider(env) === "opencode-go" ? "max" : openrouterDefault;
}

/**
 * Resolve the creative-lane provider from the environment. Unknown values fail
 * loudly instead of silently picking a provider.
 * @param {Record<string, string | undefined>} [env]
 */
export function creativeLaneProvider(env = process.env) {
  const provider = String(env.CREATIVE_EXPERIENCE_PROVIDER || "openrouter")
    .trim();
  if (!CREATIVE_LANE_PROVIDERS.includes(provider))
    throw new Error(`Unsupported CREATIVE_EXPERIENCE_PROVIDER: ${provider}`);
  return provider;
}

/**
 * Resolve the logical model for the Go transport. OpenRouter-only models
 * (for example the visual gate's `z-ai/glm-5.3-flash`) are substituted with
 * the reviewed Go model, explicitly and with a log line, so a provider
 * cutover never silently routes a model the Go slice does not serve.
 * @param {string} requestedModel
 * @param {Record<string, string | undefined>} [env]
 */
export function resolveGoLogicalModel(requestedModel, env = process.env) {
  const requested = String(requestedModel || "").trim();
  const preferred = String(
    env.CREATIVE_EXPERIENCE_GO_MODEL || "opencode-go/deepseek-v4.1-flash",
  ).trim();
  if (requested) {
    try {
      opencodeGoWireModel(requested);
      return requested;
    } catch {
      // Falls through to the reviewed Go model below.
    }
  }
  opencodeGoWireModel(preferred);
  if (requested && requested !== preferred)
    console.warn(
      `creative_lane_model_substitution provider=opencode-go requested=${requested} using=${preferred}`,
    );
  return preferred;
}

/**
 * Build one Go Responses request from chat-style content parts. Text parts
 * pass through; `image_url` parts (from promptImagePart) convert to neutral
 * Responses image parts; unknown parts fail closed.
 *
 * @param {{
 *   systemPrompt: string,
 *   userContent: Array<Record<string, any>>,
 *   schemaName?: string | null,
 *   schema?: Record<string, any> | null,
 *   maxOutputTokens: number,
 *   effort?: string | null,
 *   sessionId?: string | null,
 * }} input
 */
export function buildGoCreativeRequest({
  systemPrompt,
  userContent,
  schemaName = null,
  schema = null,
  maxOutputTokens,
  effort = null,
  sessionId = null,
}) {
  const parts =
    typeof userContent === "string"
      ? [{ type: "text", text: userContent }]
      : userContent || [];
  const content = [];
  for (const part of parts) {
    if (part?.type === "text") {
      content.push({ type: "text", text: String(part.text ?? "") });
      continue;
    }
    if (part?.type === "image_url") {
      content.push(
        responsesImagePart(part, part.image_url?.detail || "high"),
      );
      continue;
    }
    if (part?.type === "image" && typeof part.url === "string") {
      content.push(part);
      continue;
    }
    throw new Error(
      `Unsupported creative-lane content part for OpenCode Go: ${String(part?.type || "unknown")}.`,
    );
  }
  return {
    messages: [
      { role: "system", content: String(systemPrompt ?? "") },
      { role: "user", content },
    ],
    maxOutputTokens: Number(maxOutputTokens),
    ...(effort ? { reasoning: { effort } } : {}),
    outputFormat:
      schema && schemaName
        ? { type: "json-schema", name: schemaName, schema }
        : { type: "json" },
    ...(sessionId ? { sessionId } : {}),
  };
}

const TRANSIENT_GO_ERROR_CODES = new Set([
  "transport",
  "rate-limit",
  "timeout",
  "upstream",
  "provider-error",
]);

/**
 * One creative-lane Go completion. Throws before any request when the
 * credential is missing, and throws a typed error when the provider reports
 * anything other than a completed response.
 *
 * @param {{
 *   logicalModel: string,
 *   request: Record<string, any>,
 *   signal?: AbortSignal,
 *   fetchImpl?: typeof fetch,
 *   env?: Record<string, string | undefined>,
 *   maxAttempts?: number,
 *   retryDelayMs?: number,
 *   sleep?: (ms: number) => Promise<void>,
 * }} input
 * @returns {Promise<Record<string, any>>}
 */
export async function completeGoCreative({
  logicalModel,
  request,
  signal,
  fetchImpl,
  env = process.env,
  maxAttempts = 3,
  retryDelayMs = 1500,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  if (!env.OPENCODE_GO_API_KEY)
    throw new Error(
      "OPENCODE_GO_API_KEY is required for the creative lane with OpenCode Go.",
    );
  const profile = opencodeGoResponsesProfile({
    logicalModel: resolveGoLogicalModel(logicalModel, env),
  });
  let result = {};
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const completion = await completeGeneration({
      inference: {
        profile,
        apiKey: env.OPENCODE_GO_API_KEY,
        signal,
        request,
        ...(fetchImpl ? { fetchImpl } : {}),
      },
    });
    result = completion?.result || {};
    if (result.status === "completed") return result;
    // A transient provider error (transport, rate limit, timeout, upstream)
    // is retried with backoff; incomplete/refused/requires-action responses
    // are caller-managed outcomes and are not retried here.
    const transient =
      result.status === "error" &&
      TRANSIENT_GO_ERROR_CODES.has(String(result?.error?.code || ""));
    if (!transient || attempt === maxAttempts) break;
    await sleep(retryDelayMs * attempt);
  }
  const error = new Error(
    `OpenCode Go ${result.status || "error"} for the creative lane: ${result?.error?.code || "request failed"}.`,
  );
  error.code = "CREATIVE_GO_INCOMPLETE";
  error.providerStatus = result.status || "error";
  throw error;
}

/**
 * Parse a completed Go result into JSON. The caller names the failure code so
 * component-specific retry paths keep their existing transport-independent
 * semantics.
 * @param {Record<string, any>} result
 * @param {{invalidJsonCode?: string, label?: string}} [options]
 */
export function parseGoCreativeOutput(
  result,
  { invalidJsonCode = "CREATIVE_GO_INVALID_JSON", label = "creative-lane" } = {},
) {
  try {
    return parseGenerationOutput({ result });
  } catch (error) {
    const wrapped = new Error(
      `${label} returned invalid JSON from OpenCode Go.`,
      { cause: error },
    );
    wrapped.code = invalidJsonCode;
    throw wrapped;
  }
}

/**
 * Cache/usage ledger entry for one Go creative-lane completion, shaped like
 * the OpenRouter metrics rows so aggregation keeps working.
 * @param {Record<string, any>} result
 * @param {{label?: string, logger?: ((line: string) => void) | null}} [options]
 */
export function goCreativeUsageMetrics(result, options = {}) {
  return opencodeGoUsageMetrics(result?.usage || null, options);
}
