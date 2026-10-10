import {
  logOpenRouterCacheUsage,
  openRouterApiError,
  openRouterChatCompletion,
  openRouterResponseCacheMetrics,
  openRouterSessionId,
  readOpenRouterResponseEnvelope,
} from "./openrouter-client.mjs";
import { parseModelJson } from "./model-json.mjs";

const DEFAULT_MODEL = "z-ai/glm-5.3-flash";
const MAX_OUTPUT_TOKENS = 768;
const MAX_SERVICES = 5;
const MAX_PHRASES_PER_SERVICE = 5;
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "at",
  "for",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

function cleanText(value, limit = 160) {
  return String(value ?? "")
    .replace(/\u0000/gu, "")
    .replace(/—/gu, "-")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, limit);
}

function normalizedTokens(value) {
  return cleanText(value, 240)
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .map((token) => {
      if (token.endsWith("ies") && token.length > 4)
        return `${token.slice(0, -3)}y`;
      if (token.endsWith("s") && token.length > 4) return token.slice(0, -1);
      return token;
    });
}

function isServiceBoundPhrase(phrase, service) {
  const serviceTerms = new Set(
    normalizedTokens(service).filter((term) => !STOP_WORDS.has(term)),
  );
  const phraseTerms = normalizedTokens(phrase).filter(
    (term) => !STOP_WORDS.has(term),
  );
  return phraseTerms.some((term) => serviceTerms.has(term));
}

function sanitizePlannerContext(context = {}) {
  const services = Array.isArray(context.services)
    ? [
        ...new Set(
          context.services.map((item) => cleanText(item, 120)).filter(Boolean),
        ),
      ].slice(0, MAX_SERVICES)
    : [];
  return {
    businessName: cleanText(context.businessName, 120),
    businessKind: cleanText(context.businessKind, 100),
    industry: cleanText(context.industry, 100),
    services,
    languageCode: cleanText(context.languageCode, 12) || "en",
  };
}

function outputType(value) {
  if (value === null) return "null";
  if (value === undefined) return "missing";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function safeResponseSummary(payload, response) {
  const choice = payload?.choices?.[0];
  const finishReason = /^[\w-]{1,40}$/u.test(
    String(choice?.finish_reason || ""),
  )
    ? choice.finish_reason
    : "unknown";
  return `http_status=${response.status}; finish_reason=${finishReason}; content_type=${outputType(choice?.message?.content)}; refusal=${Boolean(choice?.message?.refusal)}; usage_reported=${Boolean(payload?.usage)}`;
}

function plannerUsage(payload, response, model) {
  const usage = payload?.usage;
  if (!usage || typeof usage !== "object") return null;
  const cache = logOpenRouterCacheUsage("seo-query-planner", usage);
  const responseCache = openRouterResponseCacheMetrics(response);
  return {
    costUsd: Number.isFinite(Number(usage.cost)) ? Number(usage.cost) : null,
    model: String(payload?.model || model),
    promptTokens: cache.promptTokens,
    completionTokens: Number(
      usage.completion_tokens ?? usage.output_tokens ?? 0,
    ),
    reasoningTokens: Number(
      usage.completion_tokens_details?.reasoning_tokens ?? 0,
    ),
    cachedTokens: cache.cachedTokens,
    cacheStatus: responseCache.status,
    cacheDiscount: cache.cacheDiscount ?? null,
  };
}

function attachPlannerTelemetry(error, usage, model) {
  if (usage) error.usage = usage;
  error.model = model;
  return error;
}

export function validateIntentQueryPlan(candidate, confirmedServices = []) {
  const services = Array.isArray(confirmedServices)
    ? confirmedServices
        .map((service) => cleanText(service, 120))
        .filter(Boolean)
        .slice(0, MAX_SERVICES)
    : [];
  const proposed = Array.isArray(candidate?.services) ? candidate.services : [];
  const rejectedServices = [];
  let rejectedPhraseCount = 0;
  const accepted = services.map((service) => {
    const match = proposed.find(
      (item) =>
        cleanText(item?.service, 120).toLocaleLowerCase() ===
        service.toLocaleLowerCase(),
    );
    if (!match) return { service, phrases: [] };
    const seen = new Set();
    const phrases = [];
    for (const rawPhrase of Array.isArray(match.phrases) ? match.phrases : []) {
      const phrase = cleanText(rawPhrase, 120);
      const wordCount = normalizedTokens(phrase).length;
      const validCharacters = /^[\p{L}\p{M}\s'-]+$/u.test(phrase);
      if (
        !phrase ||
        !validCharacters ||
        wordCount < 1 ||
        wordCount > 7 ||
        !isServiceBoundPhrase(phrase, service)
      ) {
        rejectedPhraseCount += 1;
        continue;
      }
      const key = phrase.toLocaleLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      phrases.push(phrase);
      if (phrases.length >= MAX_PHRASES_PER_SERVICE) break;
    }
    return { service, phrases };
  });
  for (const item of proposed)
    if (
      !services.some(
        (service) =>
          service.toLocaleLowerCase() ===
          cleanText(item?.service, 120).toLocaleLowerCase(),
      )
    )
      rejectedServices.push(
        cleanText(item?.service, 120) || "unidentified service",
      );

  const acceptedPhraseCount = accepted.reduce(
    (sum, item) => sum + item.phrases.length,
    0,
  );
  const coveredServiceCount = accepted.filter(
    (item) => item.phrases.length > 0,
  ).length;
  return {
    services: accepted,
    acceptedPhraseCount,
    rejectedPhraseCount,
    rejectedServices,
    coveredServiceCount,
    complete: services.length > 0 && coveredServiceCount === services.length,
  };
}

export function createOpenRouterIntentQueryPlanner({
  apiKey = process.env.OPENROUTER_API_KEY,
  fetchImpl = fetch,
  model = process.env.SEO_QUERY_PLANNER_MODEL || DEFAULT_MODEL,
} = {}) {
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is required.");
  return async (input = {}) => {
    const context = sanitizePlannerContext(input);
    if (!context.services.length)
      return {
        plan: { services: [] },
        usage: null,
        provider: "openrouter",
        model,
      };
    const systemPrompt = [
      "You are a local-search language planner for small businesses.",
      'Return only a JSON object with this shape: {"services":[{"service":"exact confirmed service name","phrases":["customer query phrase"]}]}.',
      "For every supplied service, propose up to five distinct short customer phrases: direct service wording, natural equivalent wording, a customer need/problem wording, and cost/quote or booking wording when relevant to that same confirmed service. Do not force a category when it is not natural.",
      "Keep a meaningful word from the confirmed service in each phrase. Use a direct everyday synonym only when it clearly means the same offering.",
      "Do not invent or broaden services, products, ingredients, attributes, delivery, urgency, prices, availability, guarantees, outcomes, or business policies.",
      "Do not add a city, business name, or near-me wording; the research system adds location variants separately.",
      "Avoid mechanically prefixing the business category to the service. If uncertain, use the exact service wording.",
      "Use the exact confirmed service string in each service field. Never return prose, evidence claims, or keyword metrics.",
    ].join(" ");
    const response = await openRouterChatCompletion({
      apiKey,
      title: "LaunchLoom SEO query planning",
      sessionId: openRouterSessionId("seo-query-planner", model, context),
      responseCache: true,
      responseCacheTtlSeconds: 86_400,
      fetchImpl,
      signal: AbortSignal.timeout(20_000),
      body: {
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        reasoning: { max_tokens: 96, exclude: true },
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(context) },
        ],
      },
    });
    const envelope = await readOpenRouterResponseEnvelope(response);
    if (envelope.parseError)
      throw new Error(
        "OpenRouter query planning returned an unreadable response.",
      );
    const usage = plannerUsage(envelope.payload, response, model);
    const responseModel = String(envelope.payload.model || model);
    const apiError = openRouterApiError(envelope.payload, response.status);
    if (!response.ok || apiError)
      throw attachPlannerTelemetry(
        apiError ||
          new Error(
            `OpenRouter query planning returned HTTP ${response.status}.`,
          ),
        usage,
        responseModel,
      );
    const content = envelope.payload.choices?.[0]?.message?.content;
    if (!content)
      throw attachPlannerTelemetry(
        new Error(
          `OpenRouter query planning returned no content. ${safeResponseSummary(envelope.payload, response)}`,
        ),
        usage,
        responseModel,
      );
    let plan;
    try {
      plan = parseModelJson(content);
    } catch {
      throw attachPlannerTelemetry(
        new Error(
          `OpenRouter query planning returned invalid JSON. ${safeResponseSummary(envelope.payload, response)}`,
        ),
        usage,
        responseModel,
      );
    }
    const responseCache = openRouterResponseCacheMetrics(response);
    return {
      plan,
      provider: "openrouter",
      model: responseModel,
      usage: {
        costUsd: usage?.costUsd ?? null,
        promptTokens: usage?.promptTokens ?? 0,
        completionTokens: usage?.completionTokens ?? 0,
        reasoningTokens: usage?.reasoningTokens ?? 0,
        cachedTokens: usage?.cachedTokens ?? 0,
        cacheStatus: responseCache.status,
        cacheDiscount: usage?.cacheDiscount ?? null,
      },
    };
  };
}
