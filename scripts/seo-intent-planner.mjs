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
const MAX_SERVICES = 5;
const MAX_PHRASES_PER_SERVICE = 2;
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
      "For every supplied service, propose at most two short phrases customers commonly use when seeking that same service.",
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
        max_tokens: 384,
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
    const apiError = openRouterApiError(envelope.payload, response.status);
    if (!response.ok || apiError)
      throw (
        apiError ||
        new Error(`OpenRouter query planning returned HTTP ${response.status}.`)
      );
    const content = envelope.payload.choices?.[0]?.message?.content;
    if (!content)
      throw new Error("OpenRouter query planning returned no content.");
    const plan = parseModelJson(content);
    const usage = envelope.payload.usage || {};
    const cache = logOpenRouterCacheUsage("seo-query-planner", usage);
    const responseCache = openRouterResponseCacheMetrics(response);
    return {
      plan,
      provider: "openrouter",
      model,
      usage: {
        costUsd: Number.isFinite(Number(usage.cost))
          ? Number(usage.cost)
          : null,
        promptTokens: cache.promptTokens,
        completionTokens: Number(
          usage.completion_tokens ?? usage.output_tokens ?? 0,
        ),
        cachedTokens: cache.cachedTokens,
        cacheStatus: responseCache.status,
        cacheDiscount: cache.cacheDiscount ?? null,
      },
    };
  };
}
