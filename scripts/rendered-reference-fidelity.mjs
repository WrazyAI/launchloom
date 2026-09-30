import fs from "node:fs/promises";
import path from "node:path";
import { validateReferenceDna } from "./reference-dna.mjs";
import {
  cacheableReferenceDna,
  logOpenRouterCacheUsage,
  logOpenRouterResponseCacheUsage,
  openRouterChatCompletion,
  openRouterPromptCacheKey,
  openRouterSessionId,
  promptCachedText,
  promptCacheRequestFields,
} from "./openrouter-client.mjs";
import { promptImageDimensions, promptImagePart } from "./prompt-evidence.mjs";

export const RENDERED_REFERENCE_MODEL =
  process.env.CREATIVE_REFERENCE_JUDGE_MODEL || "openai/gpt-6-luna";

export const RENDERED_REFERENCE_THRESHOLDS = Object.freeze({
  overall: 82,
  heroGeometry: 80,
  typography: 78,
  spatialRhythm: 78,
  imagery: 72,
  servicePresentation: 80,
  navigation: 75,
  ctaPlacement: 75,
  mobileRecomposition: 78,
  interactionEvidence: 65,
  paletteAdherence: 80,
  artDirection: 80,
  pairwiseDistinctiveness: 72,
});

const auditSchema = {
  name: "launchloom_rendered_reference_fidelity",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["verdict", "overallScore", "scores", "findings", "summary"],
    properties: {
      verdict: { type: "string", enum: ["pass", "revise", "block"] },
      overallScore: { type: "integer", minimum: 0, maximum: 100 },
      scores: {
        type: "object",
        additionalProperties: false,
        required: [
          "heroGeometry",
          "typography",
          "spatialRhythm",
          "imagery",
          "servicePresentation",
          "navigation",
          "ctaPlacement",
          "mobileRecomposition",
          "interactionEvidence",
          "paletteAdherence",
          "artDirection",
        ],
        properties: {
          heroGeometry: { type: "integer", minimum: 0, maximum: 100 },
          typography: { type: "integer", minimum: 0, maximum: 100 },
          spatialRhythm: { type: "integer", minimum: 0, maximum: 100 },
          imagery: { type: "integer", minimum: 0, maximum: 100 },
          servicePresentation: { type: "integer", minimum: 0, maximum: 100 },
          navigation: { type: "integer", minimum: 0, maximum: 100 },
          ctaPlacement: { type: "integer", minimum: 0, maximum: 100 },
          mobileRecomposition: { type: "integer", minimum: 0, maximum: 100 },
          interactionEvidence: { type: "integer", minimum: 0, maximum: 100 },
          paletteAdherence: { type: "integer", minimum: 0, maximum: 100 },
          artDirection: { type: "integer", minimum: 0, maximum: 100 },
        },
      },
      findings: {
        type: "array",
        maxItems: 10,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["severity", "category", "viewport", "evidence", "repair"],
          properties: {
            severity: { type: "string", enum: ["critical", "major", "minor"] },
            category: {
              type: "string",
              enum: [
                "hero-geometry",
                "typography",
                "spatial-rhythm",
                "imagery",
                "service-presentation",
                "navigation",
                "cta-placement",
                "mobile-recomposition",
                "interaction-evidence",
                "palette-adherence",
                "client-art-direction",
                "generic-grammar",
              ],
            },
            viewport: {
              type: "string",
              enum: ["desktop", "compact", "mobile", "all"],
            },
            evidence: { type: "string", maxLength: 360 },
            repair: { type: "string", maxLength: 420 },
          },
        },
      },
      summary: { type: "string", maxLength: 700 },
    },
  },
};

const diversitySchema = {
  name: "launchloom_rendered_candidate_diversity",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "overallDistinctiveness",
      "pairs",
      "genericFallbackDetected",
      "summary",
    ],
    properties: {
      overallDistinctiveness: { type: "integer", minimum: 0, maximum: 100 },
      genericFallbackDetected: { type: "boolean" },
      pairs: {
        type: "array",
        minItems: 1,
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["left", "right", "distance", "reason"],
          properties: {
            left: { type: "string" },
            right: { type: "string" },
            distance: { type: "integer", minimum: 0, maximum: 100 },
            reason: { type: "string", maxLength: 320 },
          },
        },
      },
      summary: { type: "string", maxLength: 500 },
    },
  },
};

function parseChoice(payload, label) {
  const choice = payload?.choices?.[0];
  const content = String(choice?.message?.content || "").trim();
  if (!content) throw new Error(`${label} returned no content.`);
  if (["length", "max_tokens"].includes(choice?.finish_reason))
    throw new Error(`${label} was truncated.`);
  try {
    return JSON.parse(
      content.replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, ""),
    );
  } catch (error) {
    throw new Error(
      `${label} returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function isTruncated(payload) {
  return ["length", "max_tokens"].includes(
    payload?.choices?.[0]?.finish_reason,
  );
}

function truncatedDiagnostics(payload, label, maxTokens) {
  const choice = payload?.choices?.[0];
  const usage = payload?.usage || {};
  const reasoningTokens =
    usage.completion_tokens_details?.reasoning_tokens ?? "unknown";
  const completionTokens = usage.completion_tokens ?? "unknown";
  const contentChars = String(choice?.message?.content || "").length;
  return `${label} was truncated (finish_reason=${choice?.finish_reason || "unknown"} max_tokens=${maxTokens} completion_tokens=${completionTokens} reasoning_tokens=${reasoningTokens} content_chars=${contentChars}).`;
}

const JUDGE_AFFORDABILITY_RETRY_MIN_TOKENS = 2_048;
const JUDGE_AFFORDABILITY_RETRY_HEADROOM_TOKENS = 1_024;

function affordableJudgeRetryLimit(status, payload, requestedTokens) {
  if (status !== 402) return null;
  const message = String(payload?.error?.message || "");
  const match = message.match(/can only afford\s+([\d,]+)\b/iu);
  if (!match) return null;
  const affordableTokens = Number(match[1].replace(/,/gu, ""));
  if (
    !Number.isSafeInteger(affordableTokens) ||
    affordableTokens >= requestedTokens
  )
    return null;
  const retryTokens = Math.min(
    requestedTokens - 1,
    affordableTokens - JUDGE_AFFORDABILITY_RETRY_HEADROOM_TOKENS,
  );
  return retryTokens >= JUDGE_AFFORDABILITY_RETRY_MIN_TOKENS
    ? retryTokens
    : null;
}

function isTransientCreditConflict(status, payload) {
  if (status !== 402) return false;
  const message = String(payload?.error?.message || "");
  return (
    /current in-flight requests/iu.test(message) &&
    /retry after in-flight requests settle/iu.test(message)
  );
}

async function imagePart(file) {
  return promptImagePart(file);
}

async function imageSize(file) {
  if (!file) return "unknown size";
  try {
    const { width, height } = await promptImageDimensions(file);
    return `${width}x${height} source pixels`;
  } catch {
    // Tiny non-image test fixtures still exercise the request contract.
    return "unknown size";
  }
}

async function requestJson({
  model,
  schema,
  content,
  label,
  sessionId,
  promptCacheKey,
  maxTokens = 7000,
  reasoningEffort = "medium",
  fetchImpl = fetch,
}) {
  if (!process.env.OPENROUTER_API_KEY)
    throw new Error(
      "OPENROUTER_API_KEY is required for rendered reference evaluation.",
    );
  const maxAttempts = 3;
  const maxTransientCreditRetries = 2;
  const maxTotalAttempts = maxAttempts + maxTransientCreditRetries;
  let activeReasoningEffort = reasoningEffort;
  let truncatedRetryUsed = false;
  let affordabilityRetryUsed = false;
  let ordinaryRetryCount = 0;
  let transientCreditRetryCount = 0;
  for (let attempt = 0; attempt < maxTotalAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180_000);
    let retryDelayMs = 500 * (attempt + 1);
    try {
      const response = await openRouterChatCompletion({
        title: "LaunchLoom Rendered Reference Judge",
        signal: controller.signal,
        sessionId,
        responseCache: true,
        responseCacheTtlSeconds: 900,
        fetchImpl,
        body: {
          model,
          ...promptCacheRequestFields(model, promptCacheKey),
          temperature: 0,
          reasoning: { effort: activeReasoningEffort, exclude: true },
          max_tokens: maxTokens,
          response_format: { type: "json_schema", json_schema: schema },
          messages: [
            {
              role: "system",
              content:
                "You are a strict visual design critic. Judge rendered pixels, not DOM labels or model claims. Compare design mechanics and visual language only. Do not require copied branding, copy, assets, logos, proprietary fonts, or trade dress. Penalize generic split heroes, card walls, generic SaaS/editorial grammar, weak type scale, weak image choreography, incorrect section pacing, and mobile layouts that merely stack desktop. overallScore must measure assigned-reference mechanics only; do not lower it for client-only palette or art-direction misses. Score paletteAdherence and artDirection separately, and still return blocking findings for client-brief failures. Return JSON only.",
            },
            { role: "user", content },
          ],
        },
      });
      const responseCache = logOpenRouterResponseCacheUsage(label, response);
      const payload = await response.json().catch((error) => {
        if (response.ok || !(error instanceof SyntaxError)) throw error;
        return {};
      });
      if (response.ok) {
        const cache = logOpenRouterCacheUsage(label, payload.usage);
        if (isTruncated(payload)) {
          if (!truncatedRetryUsed && activeReasoningEffort !== "low") {
            console.info(
              `rendered_judge_retry reason=truncated label=${label} reasoning_effort=${activeReasoningEffort}->low max_tokens=${maxTokens} completion_tokens=${payload?.usage?.completion_tokens ?? "unknown"} reasoning_tokens=${payload?.usage?.completion_tokens_details?.reasoning_tokens ?? "unknown"}`,
            );
            activeReasoningEffort = "low";
            truncatedRetryUsed = true;
            continue;
          }
          throw new Error(truncatedDiagnostics(payload, label, maxTokens));
        }
        return {
          audit: parseChoice(payload, label),
          usage: payload.usage || null,
          cache,
          responseCache,
          provider: payload.provider || null,
        };
      }
      if (response.status === 402 && !affordabilityRetryUsed) {
        const retryLimit = affordableJudgeRetryLimit(
          response.status,
          payload,
          maxTokens,
        );
        if (retryLimit) {
          console.info(
            `rendered_judge_retry reason=provider-affordability label=${label} requested_max_tokens=${maxTokens} retry_max_tokens=${retryLimit}`,
          );
          maxTokens = retryLimit;
          affordabilityRetryUsed = true;
          continue;
        }
      }
      const transientCreditConflict = isTransientCreditConflict(
        response.status,
        payload,
      );
      const retryable =
        response.status === 408 ||
        response.status === 429 ||
        (response.status >= 500 && response.status < 600);
      if (transientCreditConflict) {
        if (
          transientCreditRetryCount >= maxTransientCreditRetries ||
          attempt === maxTotalAttempts - 1
        )
          throw new Error(
            `${label} failed (${response.status}): ${payload?.error?.message || "unknown error"}`,
          );
        transientCreditRetryCount += 1;
        retryDelayMs = 2_000 * transientCreditRetryCount;
        console.info(
          `rendered_judge_retry reason=transient-inflight-credit label=${label} retry_in_ms=${retryDelayMs} retry=${transientCreditRetryCount}/${maxTransientCreditRetries}`,
        );
      } else if (
        !retryable ||
        ordinaryRetryCount >= maxAttempts - 1 ||
        attempt === maxTotalAttempts - 1
      )
        throw new Error(
          `${label} failed (${response.status}): ${payload?.error?.message || "unknown error"}`,
        );
      else {
        ordinaryRetryCount += 1;
        retryDelayMs = 500 * ordinaryRetryCount;
      }
    } finally {
      clearTimeout(timeout);
    }
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  }
}

async function resolveEvidencePath(record) {
  for (const candidate of [record?.path, record?.absolutePath].filter(
    Boolean,
  )) {
    const resolved = path.resolve(candidate);
    try {
      await fs.access(resolved);
      return resolved;
    } catch {
      // Try the next representation.
    }
  }
  return "";
}

function scorePass(audit, thresholds = RENDERED_REFERENCE_THRESHOLDS) {
  const scores = audit?.scores || {};
  const major = (audit?.findings || []).filter(
    (item) => item.severity === "critical" || item.severity === "major",
  );
  const required = [
    ["heroGeometry", thresholds.heroGeometry],
    ["typography", thresholds.typography],
    ["spatialRhythm", thresholds.spatialRhythm],
    ["imagery", thresholds.imagery],
    ["servicePresentation", thresholds.servicePresentation],
    ["navigation", thresholds.navigation],
    ["ctaPlacement", thresholds.ctaPlacement],
    ["mobileRecomposition", thresholds.mobileRecomposition],
    ["interactionEvidence", thresholds.interactionEvidence],
    ["paletteAdherence", thresholds.paletteAdherence],
    ["artDirection", thresholds.artDirection],
  ];
  return (
    audit?.verdict === "pass" &&
    Number(audit?.overallScore || 0) >= thresholds.overall &&
    required.every(([key, minimum]) => Number(scores[key] || 0) >= minimum) &&
    major.length === 0
  );
}

/**
 * @param {{referenceDna: any, visualBrief?: Record<string, any>, candidateScreenshots?: {desktop?: string, compact?: string, mobile?: string, fullDesktop?: string}, renderedGeometry?: Record<string, any>, model?: string, fetchImpl?: typeof fetch}} options
 * @returns {Promise<Record<string, any>>}
 */
export async function evaluateRenderedReferenceFidelity({
  referenceDna,
  visualBrief = {},
  candidateScreenshots,
  renderedGeometry = {},
  model = RENDERED_REFERENCE_MODEL,
  fetchImpl = fetch,
} = {}) {
  validateReferenceDna(referenceDna, { requireEvidence: true });
  const desktopReference = await resolveEvidencePath(
    referenceDna.evidence.desktopScreenshot,
  );
  const mobileReference = referenceDna.evidence.mobileScreenshot?.available
    ? await resolveEvidencePath(referenceDna.evidence.mobileScreenshot)
    : "";
  const candidateDesktop = candidateScreenshots?.desktop;
  const candidateCompact = candidateScreenshots?.compact;
  const candidateMobile = candidateScreenshots?.mobile;
  const candidateOverview = candidateScreenshots?.fullDesktop;
  for (const [label, file] of [
    ["desktop reference", desktopReference],
    ["candidate desktop", candidateDesktop],
    ["candidate compact", candidateCompact],
    ["candidate mobile", candidateMobile],
  ])
    if (!file)
      throw new Error(`Rendered reference evaluation is missing ${label}.`);
  const stableReferenceDna = cacheableReferenceDna(referenceDna);
  const [referenceSize, overviewSize] = await Promise.all([
    imageSize(desktopReference),
    imageSize(candidateOverview),
  ]);
  const reusableReferencePrefix = `REFERENCE DNA
${JSON.stringify(stableReferenceDna, null, 2)}

EVIDENCE COORDINATES
The desktop reference is a ${referenceSize} capture. It may cover multiple page sections; its capture height is not the browser viewport height. Do not convert fractions of its full image height into CSS vh, or infer candidate hero size from a scaled full-page overview.
Compare corresponding design mechanics and visual language rather than total page length. A client site must include real services, FAQs, and contact sections even when the reference capture ends earlier. Do not penalize their existence; judge how they are composed and paced. If no mobile reference exists, judge mobile recomposition against Reference DNA and the candidate mobile viewport without inventing a reference mobile layout.
Evaluate geometry, typography scale and role, spacing rhythm, image occupancy and crops, service presentation, navigation, CTA location, mobile recomposition, and visible interaction evidence. Acceptance checks are binding. A technically clean but visually generic page must not pass.`;
  const content = [
    { type: "text", text: reusableReferencePrefix },
    { type: "text", text: `Reference desktop capture (${referenceSize}):` },
    await imagePart(desktopReference),
    ...(mobileReference
      ? [
          { type: "text", text: "Reference mobile:" },
          await imagePart(mobileReference),
        ]
      : []),
    promptCachedText(
      model,
      "End assigned reference evidence. Candidate render evidence follows.",
    ),
    {
      type: "text",
      text: `CANDIDATE GEOMETRY
The candidate desktop, compact, and mobile images below are actual first-viewport captures. Browser-measured geometry: ${JSON.stringify(renderedGeometry)}. Use those measurements for viewport fit and hero occupancy, then inspect the viewport pixels for composition quality.
${candidateOverview ? `The candidate desktop page overview is ${overviewSize}. Use it only for section order and spatial rhythm; long-page scaling is not evidence of small typography or a shallow hero.` : ""}`,
    },
    {
      type: "text",
      text: `CLIENT VISUAL BRIEF
${JSON.stringify(visualBrief || {}, null, 2)}
Treat this as binding client art direction layered onto the reference mechanics. Score paletteAdherence and artDirection independently and strictly. Keep overallScore limited to the assigned reference mechanics so it remains interpretable as reference fidelity; client-only palette and art-direction misses belong in their dedicated scores and findings. They still block pass through the existing per-dimension thresholds and major-finding rule. A candidate that substitutes an unrelated house palette, reverses an explicit light/dark surface direction, ignores a named composition request, or visibly collapses into a generic LaunchLoom treatment must score below the corresponding hard threshold and receive a palette-adherence or client-art-direction finding. Do not hide client-intent failures inside otherwise strong reference-mechanics scores.`,
    },
    { type: "text", text: "Candidate desktop first viewport 1536x864:" },
    await imagePart(candidateDesktop),
    {
      type: "text",
      text: "Candidate compact desktop first viewport 1366x768:",
    },
    await imagePart(candidateCompact),
    { type: "text", text: "Candidate mobile first viewport 390x844:" },
    await imagePart(candidateMobile),
    ...(candidateOverview
      ? [
          {
            type: "text",
            text: `Candidate desktop page overview (${overviewSize}):`,
          },
          await imagePart(candidateOverview),
        ]
      : []),
  ];
  const sessionId = openRouterSessionId(
    "rendered-reference",
    model,
    referenceDna.familyId,
    referenceDna.referenceName,
  );
  const promptCacheKey = openRouterPromptCacheKey(
    "rendered-reference",
    model,
    stableReferenceDna,
  );
  const result = await requestJson({
    model,
    schema: auditSchema,
    content,
    label: "Rendered reference judge",
    sessionId,
    promptCacheKey,
    fetchImpl,
  });
  return {
    version: 1,
    model,
    pass: scorePass(result.audit),
    score: Number(result.audit.overallScore || 0),
    ...result,
  };
}

/**
 * @param {{candidates?: Array<{candidateId: string, desktop: string, mobile: string}>, model?: string, fetchImpl?: typeof fetch}} options
 * @returns {Promise<{version: number, model: string, pass: boolean, score: number, minimumPairDistance?: number, audit: any, [key: string]: any}>}
 */
export async function evaluateRenderedDiversity({
  candidates,
  model = RENDERED_REFERENCE_MODEL,
  fetchImpl = fetch,
} = {}) {
  if (!Array.isArray(candidates) || candidates.length < 2)
    return {
      version: 1,
      model,
      pass: true,
      score: 100,
      audit: {
        overallDistinctiveness: 100,
        genericFallbackDetected: false,
        pairs: [],
        summary: "Single candidate.",
      },
    };
  const content = [
    {
      type: "text",
      text: "Compare these first-viewport desktop and mobile candidate screenshots to each other, not to their business copy. Judge hero composition first: image/text relationship, hierarchy, focal balance, CTA placement, image choreography, and mobile recomposition. Then consider navigation and the visible continuation into the next section. Metadata labels, different colors, or different words do not count as meaningful visual distance. Flag generic fallback grammar when candidates converge on familiar split heroes, card walls, repeated centered editorial openings, or near-identical first-view skeletons.",
    },
  ];
  for (const candidate of candidates) {
    content.push({ type: "text", text: `${candidate.candidateId} desktop:` });
    content.push(await imagePart(candidate.desktop));
    content.push({ type: "text", text: `${candidate.candidateId} mobile:` });
    content.push(await imagePart(candidate.mobile));
  }
  const result = await requestJson({
    model,
    schema: diversitySchema,
    content,
    label: "Rendered diversity judge",
    sessionId: openRouterSessionId(
      "rendered-diversity",
      model,
      candidates.map((candidate) => candidate.candidateId).sort(),
    ),
    // Comparing three responsive candidate families can consume substantially
    // more hidden visual-reasoning tokens than a single-reference fidelity score.
    maxTokens: 12_000,
    fetchImpl,
  });
  const pairs = result.audit.pairs.map((pair) => ({
    ...pair,
    pass:
      Number(pair.distance || 0) >=
      RENDERED_REFERENCE_THRESHOLDS.pairwiseDistinctiveness,
  }));
  const minimumPair = pairs.length
    ? Math.min(...pairs.map((pair) => Number(pair.distance || 0)))
    : 100;
  const score = Math.min(
    Number(result.audit.overallDistinctiveness || 0),
    minimumPair,
  );
  return {
    version: 1,
    model,
    pass:
      !result.audit.genericFallbackDetected &&
      Number(result.audit.overallDistinctiveness || 0) >=
        RENDERED_REFERENCE_THRESHOLDS.pairwiseDistinctiveness &&
      minimumPair >= RENDERED_REFERENCE_THRESHOLDS.pairwiseDistinctiveness,
    score,
    minimumPairDistance: minimumPair,
    ...result,
    audit: {
      ...result.audit,
      pairs,
    },
  };
}
