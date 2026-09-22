import crypto from "node:crypto";
import {
  DEFAULT_TYPESAFE_MODEL,
  TypeSafeSystemOneError,
  requestSystemOne,
} from "./typesafe-system-one.mjs";

export const REASONING_POLICY_VERSION = "adaptive-reasoning-v1";
export const JUDGMENT_SCHEMA_VERSION = "design-complexity-v1";
export const DEFAULT_PREFLIGHT_MODE = "shadow";

const SCORE_IDS = [
  "referenceTranslation",
  "compositionNovelty",
  "responsiveRecomposition",
  "interactionCoupling",
  "constraintCoupling",
];

const POLICY = Object.freeze({
  hardMaxProbability: 0.58,
  confidenceFloor: 0.58,
  compositeThreshold: 0.67,
  borderlineBand: 0.05,
  weights: Object.freeze({
    referenceTranslation: 0.28,
    compositionNovelty: 0.24,
    responsiveRecomposition: 0.2,
    interactionCoupling: 0.14,
    constraintCoupling: 0.14,
  }),
  hardMaxDimensions: Object.freeze([
    "referenceTranslation",
    "compositionNovelty",
    "responsiveRecomposition",
    "interactionCoupling",
  ]),
});

export const REASONING_PREFLIGHT_QUESTIONS = Object.freeze({
  referenceTranslation: {
    type: "score",
    instructions:
      "Assess how difficult it is to translate the supplied reference mechanics into an independent production implementation while preserving their visual behavior.",
    criteria: [
      "Straightforward: common web mechanics; the route can preserve the reference with ordinary layout reasoning and limited cross-coupling.",
      "Moderate: several distinctive mechanics require deliberate mapping, but most layout, typography, imagery, and interaction decisions remain locally separable.",
      "Demanding: multiple atypical mechanics must be translated together, with meaningful coupling across layout, imagery, typography, interaction, and reference signatures.",
      "Extreme: the design depends on unusual geometry, sequencing, or interaction where preserving one mechanic strongly constrains several others and generic implementation patterns are likely to fail.",
    ],
  },
  compositionNovelty: {
    type: "score",
    instructions:
      "Assess how far the combined reference routes depart from ordinary website composition and familiar reusable layout patterns.",
    criteria: [
      "Conventional: familiar stacked, split, grid, or editorial structures can express the references without substantial invention.",
      "Distinctive: the references have a recognizable authored composition, but still rely on familiar web layout primitives.",
      "Highly unusual: asymmetric, layered, object-led, cinematic, collage, or strongly sequence-driven composition materially departs from common templates.",
      "Experimental: the visual narrative depends on uncommon spatial relationships, overlapping systems, unusual rhythm, or bespoke composition that is easy to flatten into generic web grammar.",
    ],
  },
  responsiveRecomposition: {
    type: "score",
    instructions:
      "Assess how much reasoning is required to preserve the reference mechanics across desktop, compact desktop, and mobile rather than merely stacking the desktop layout.",
    criteria: [
      "Simple: normal resizing, wrapping, and stacking preserves the reference intent.",
      "Moderate: some order, spacing, crop, or navigation changes are needed, but the same composition mostly survives.",
      "Substantial: mobile requires a clearly re-authored arrangement, interaction substitute, or image/typography relationship while preserving the same design identity.",
      "Structural: the reference requires materially different desktop and mobile compositions or interaction models, and naive stacking would destroy the intended mechanics.",
    ],
  },
  interactionCoupling: {
    type: "score",
    instructions:
      "Assess how tightly interaction or motion participates in the design mechanics rather than serving as optional decoration.",
    criteria: [
      "Minimal: static composition carries the design; motion is absent or decorative.",
      "Supportive: interaction improves emphasis or navigation but the design remains intact without it.",
      "Integrated: motion, reveal, scrub, hover, masking, or focus transitions materially shape how the composition is understood.",
      "Structural: the reference's narrative or spatial model depends on coordinated interaction or motion and requires a carefully designed reduced-motion equivalent.",
    ],
  },
  constraintCoupling: {
    type: "score",
    instructions:
      "Assess how difficult it is to satisfy the supplied reference, responsive, safety, content-binding, accessibility, viewport, signature, and conversion constraints simultaneously.",
    criteria: [
      "Low: constraints are mostly independent and changes in one area rarely threaten another.",
      "Moderate: several constraints interact, but most failures can be repaired locally.",
      "High: many constraints are coupled; changing geometry, typography, imagery, CTA placement, or motion can violate multiple contracts.",
      "Very high: the route has dense cross-dependent constraints where a locally reasonable change can break reference fidelity, viewport safety, sealed content, signatures, accessibility, or conversion behavior elsewhere.",
    ],
  },
});

function clean(value, limit = 180) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(/[—–]/gu, "-")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, limit);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

function digest(value, length = 40) {
  return crypto
    .createHash("sha256")
    .update(stableJson(value))
    .digest("hex")
    .slice(0, length);
}

function list(value, limit = 16) {
  return (Array.isArray(value) ? value : [])
    .map((item) => clean(item, 140))
    .filter(Boolean)
    .slice(0, limit);
}

function routeState(route) {
  const dna = route?.referenceDna || {};
  return {
    routeId: clean(route?.id || ""),
    familyId: clean(dna.familyId || route?.familyId || ""),
    referenceName: clean(dna.referenceName || route?.label || ""),
    heroGeometry: clean(dna.heroGeometry?.mode || route?.heroGeometry || ""),
    navigationGeometry: clean(
      dna.navigationGeometry?.mode || route?.navigation || "",
    ),
    servicePresentation: clean(
      dna.servicePresentation?.pattern || route?.servicePresentation || "",
    ),
    sectionSequence: list(dna.sectionSequence || route?.sectionRhythm),
    typography: {
      display: clean(dna.typography?.display || route?.typographyCategory || ""),
      scale: clean(dna.typography?.scale || ""),
    },
    imageTreatment: clean(
      dna.imageTreatment?.mode || route?.imageStrategy || "",
    ),
    mobileRecomposition: clean(
      dna.mobileRecomposition?.strategy || route?.mobileBehavior || "",
    ),
    motionPrimitive: clean(
      dna.motion?.primitive || route?.motionOpportunity || "",
    ),
    signatureCount: Array.isArray(dna.requiredSignatureElements)
      ? dna.requiredSignatureElements.length
      : 0,
    acceptanceCheckCount: Array.isArray(dna.acceptanceChecks)
      ? dna.acceptanceChecks.length
      : 0,
    prohibitedPatternCount: Array.isArray(dna.prohibitedPatterns)
      ? dna.prohibitedPatterns.length
      : Array.isArray(route?.prohibitedPatterns)
        ? route.prohibitedPatterns.length
        : 0,
  };
}

/**
 * Build a compact, non-PII state for Jev from the evidence-derived reference
 * contracts. Screenshots, business contact data, local paths, and model prompts
 * are deliberately excluded.
 */
export function buildReasoningPreflightState(inspirationPack) {
  const routes = (Array.isArray(inspirationPack?.routes)
    ? inspirationPack.routes
    : []
  ).map(routeState);
  if (!routes.length)
    throw new Error("Reasoning preflight requires analyzed inspiration routes.");
  return {
    routeCount: routes.length,
    routes,
    constraints: {
      responsiveModes: 3,
      sealedContentBinding: true,
      referenceFidelityRequired: true,
      renderedDiversityRequired: routes.length > 1,
      failClosedCreativePath: true,
    },
  };
}

function numeric(value, label, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum)
    throw new Error(
      `TypeSafe returned invalid ${label}: ${JSON.stringify(value)}.`,
    );
  return parsed;
}

function normalizedProbabilities(value, questionId) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(
      `TypeSafe returned no probability distribution for ${questionId}.`,
    );
  const probabilities = {};
  for (let level = 0; level < 4; level += 1) {
    const raw = value[String(level)] ?? value[level];
    probabilities[String(level)] =
      raw === undefined
        ? 0
        : numeric(
            raw,
            `${questionId}.probabilities.${level}`,
            0,
            1,
          );
  }
  const total = Object.values(probabilities).reduce(
    (sum, probability) => sum + probability,
    0,
  );
  if (total < 0.98 || total > 1.02)
    throw new Error(
      `TypeSafe probability distribution for ${questionId} does not sum to 1.`,
    );
  return probabilities;
}

export function normalizeReasoningJudgments(answers) {
  if (!answers || typeof answers !== "object" || Array.isArray(answers))
    throw new Error("TypeSafe returned no reasoning judgments.");
  return Object.fromEntries(
    SCORE_IDS.map((questionId) => {
      const answer = answers[questionId];
      if (!answer || answer.type !== "score")
        throw new Error(
          `TypeSafe returned no Score answer for ${questionId}.`,
        );
      return [
        questionId,
        {
          type: "score",
          score: numeric(answer.score, `${questionId}.score`, 0, 3),
          confidence: numeric(
            answer.confidence,
            `${questionId}.confidence`,
            0,
            1,
          ),
          probabilities: normalizedProbabilities(
            answer.probabilities,
            questionId,
          ),
          legend:
            answer.legend && typeof answer.legend === "object"
              ? answer.legend
              : null,
        },
      ];
    }),
  );
}

function rounded(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

export function decideReasoningEffort(judgments) {
  const normalizedScores = Object.fromEntries(
    SCORE_IDS.map((id) => [id, judgments[id].score / 3]),
  );
  const compositeScore = SCORE_IDS.reduce(
    (sum, id) => sum + normalizedScores[id] * POLICY.weights[id],
    0,
  );
  const minimumConfidence = Math.min(
    ...SCORE_IDS.map((id) => judgments[id].confidence),
  );
  const hardMax = POLICY.hardMaxDimensions
    .map((id) => ({
      id,
      probability: judgments[id].probabilities["3"],
    }))
    .filter((item) => item.probability >= POLICY.hardMaxProbability);
  const borderline =
    Math.abs(compositeScore - POLICY.compositeThreshold) <=
    POLICY.borderlineBand;
  const lowConfidence = minimumConfidence < POLICY.confidenceFloor;
  const max =
    hardMax.length > 0 ||
    compositeScore >= POLICY.compositeThreshold ||
    borderline ||
    lowConfidence;

  const reasonCodes = [];
  for (const item of hardMax)
    reasonCodes.push(
      `hard-max:${item.id}:p3=${rounded(item.probability, 3)}`,
    );
  if (compositeScore >= POLICY.compositeThreshold)
    reasonCodes.push(`composite-max:${rounded(compositeScore, 3)}`);
  else if (borderline)
    reasonCodes.push(`borderline-max:${rounded(compositeScore, 3)}`);
  if (lowConfidence)
    reasonCodes.push(
      `uncertain-max:min-confidence=${rounded(minimumConfidence, 3)}`,
    );
  if (!reasonCodes.length)
    reasonCodes.push(`xhigh-composite:${rounded(compositeScore, 3)}`);

  return {
    recommendedEffort: max ? "max" : "xhigh",
    reasonCodes,
    compositeScore: rounded(compositeScore),
    minimumConfidence: rounded(minimumConfidence),
    normalizedScores: Object.fromEntries(
      Object.entries(normalizedScores).map(([id, value]) => [
        id,
        rounded(value),
      ]),
    ),
    policy: {
      hardMaxProbability: POLICY.hardMaxProbability,
      confidenceFloor: POLICY.confidenceFloor,
      compositeThreshold: POLICY.compositeThreshold,
      borderlineBand: POLICY.borderlineBand,
      weights: POLICY.weights,
    },
  };
}

function safeSelectorError(error) {
  if (error instanceof TypeSafeSystemOneError)
    return {
      name: error.name,
      code: error.code || "typesafe-error",
      status: Number(error.status || 0),
      message: clean(error.message, 500),
    };
  return {
    name: error?.name || "Error",
    code: "selector-error",
    status: 0,
    message: clean(error?.message || error, 500),
  };
}

function normalizedMode(value) {
  const mode = String(value || DEFAULT_PREFLIGHT_MODE)
    .trim()
    .toLowerCase();
  if (!["shadow", "enforce"].includes(mode))
    throw new Error(
      `Reasoning preflight mode must be shadow or enforce, received ${mode}.`,
    );
  return mode;
}

function usageSummary(usage) {
  const inputTokens = Number(
    usage?.input_tokens ?? usage?.inputTokens ?? 0,
  );
  const outputTokens = Number(
    usage?.output_tokens ?? usage?.outputTokens ?? 0,
  );
  const actualCostUsd = Number(
    usage?.cost_usd ?? usage?.costUsd ?? usage?.cost,
  );
  const pricePerMillion = Number(
    process.env.TYPESAFE_INPUT_USD_PER_MILLION || 0.042,
  );
  const estimatedCostUsd =
    Number.isFinite(inputTokens) &&
    Number.isFinite(pricePerMillion) &&
    inputTokens >= 0 &&
    pricePerMillion >= 0
      ? rounded((inputTokens / 1_000_000) * pricePerMillion, 8)
      : null;
  return {
    inputTokens: Number.isFinite(inputTokens) ? inputTokens : 0,
    outputTokens: Number.isFinite(outputTokens) ? outputTokens : 0,
    costUsd:
      Number.isFinite(actualCostUsd) && actualCostUsd >= 0
        ? rounded(actualCostUsd, 8)
        : estimatedCostUsd,
    estimatedCostUsd,
    pricePerMillionInputUsd:
      Number.isFinite(pricePerMillion) && pricePerMillion >= 0
        ? pricePerMillion
        : null,
  };
}

/**
 * Run one Jev preflight and freeze the reasoning effort for the creative
 * session. Shadow mode records the Jev recommendation while executing xhigh;
 * enforce mode executes the recommendation. Any selector failure recommends
 * max and enforce mode therefore fails safe to max.
 */
export async function createReasoningPreflight({
  inspirationPack,
  mode = DEFAULT_PREFLIGHT_MODE,
  model = process.env.REASONING_PREFLIGHT_MODEL || DEFAULT_TYPESAFE_MODEL,
  creativeModel =
    process.env.CREATIVE_EXPERIENCE_MODEL || "openai/gpt-5.6-luna",
  sessionKey = "",
  apiKey = process.env.TYPESAFE_API_KEY,
  fetchImpl = fetch,
  timeoutMs,
} = {}) {
  const preflightMode = normalizedMode(mode);
  if (creativeModel !== "openai/gpt-5.6-luna")
    throw new Error(
      `Adaptive reasoning preflight currently supports openai/gpt-5.6-luna only, received ${creativeModel}.`,
    );
  const state = buildReasoningPreflightState(inspirationPack);
  const stateDigest = digest(state);
  const startedAt = Date.now();
  let judgments = {};
  let selector;
  let decision;

  try {
    const response = await requestSystemOne({
      apiKey,
      model,
      state,
      questions: REASONING_PREFLIGHT_QUESTIONS,
      timeoutMs,
      fetchImpl,
    });
    judgments = normalizeReasoningJudgments(response.answers);
    const routed = decideReasoningEffort(judgments);
    decision = {
      ...routed,
      fallbackUsed: false,
    };
    selector = {
      provider: "typesafe",
      model: response.model || model,
      latencyMs: Number(response.latencyMs || Date.now() - startedAt),
      fallbackUsed: false,
      requestId: response.request_id || response.requestId || null,
      usage: usageSummary(response.usage),
    };
  } catch (error) {
    decision = {
      recommendedEffort: "max",
      reasonCodes: ["selector-fallback:max"],
      compositeScore: null,
      minimumConfidence: null,
      normalizedScores: {},
      policy: {
        hardMaxProbability: POLICY.hardMaxProbability,
        confidenceFloor: POLICY.confidenceFloor,
        compositeThreshold: POLICY.compositeThreshold,
        borderlineBand: POLICY.borderlineBand,
        weights: POLICY.weights,
      },
      fallbackUsed: true,
    };
    selector = {
      provider: "typesafe",
      model,
      latencyMs: Date.now() - startedAt,
      fallbackUsed: true,
      requestId: null,
      usage: usageSummary(null),
      error: safeSelectorError(error),
    };
  }

  const reasoningEffort =
    preflightMode === "shadow" ? "xhigh" : decision.recommendedEffort;
  const sessionId = `launchloom:creative:${digest(
    {
      sessionKey: digest(String(sessionKey || "local"), 24),
      stateDigest,
      creativeModel,
      reasoningEffort,
      policyVersion: REASONING_POLICY_VERSION,
      judgmentSchemaVersion: JUDGMENT_SCHEMA_VERSION,
    },
    40,
  )}`;

  return {
    version: 1,
    mode: preflightMode,
    reasoningPolicyVersion: REASONING_POLICY_VERSION,
    judgmentSchemaVersion: JUDGMENT_SCHEMA_VERSION,
    selectorModelVersion: selector.model || model,
    creativeModel,
    stateDigest,
    sessionId,
    reasoningEffort,
    recommendedEffort: decision.recommendedEffort,
    selector,
    judgments,
    decision: {
      recommendedEffort: decision.recommendedEffort,
      reasoningEffort,
      reasonCodes: decision.reasonCodes,
      compositeScore: decision.compositeScore,
      minimumConfidence: decision.minimumConfidence,
      normalizedScores: decision.normalizedScores,
      policy: decision.policy,
      fallbackUsed: decision.fallbackUsed,
      shadowOverride:
        preflightMode === "shadow" &&
        reasoningEffort !== decision.recommendedEffort,
    },
  };
}

export function validateCreativeSessionConfig(
  value,
  { creativeModel = "" } = {},
) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Creative session configuration is missing.");
  if (!["shadow", "enforce"].includes(value.mode))
    throw new Error(
      `Creative session mode must be shadow or enforce, received ${value.mode}.`,
    );
  if (!["xhigh", "max"].includes(value.reasoningEffort))
    throw new Error(
      `Creative session reasoning effort must be xhigh or max, received ${value.reasoningEffort}.`,
    );
  if (!["xhigh", "max"].includes(value.recommendedEffort))
    throw new Error(
      `Creative session recommended effort must be xhigh or max, received ${value.recommendedEffort}.`,
    );
  if (value.creativeModel !== "openai/gpt-5.6-luna")
    throw new Error(
      `Creative session model must be openai/gpt-5.6-luna, received ${value.creativeModel}.`,
    );
  if (creativeModel && value.creativeModel !== creativeModel)
    throw new Error(
      `Creative session model ${value.creativeModel} does not match requested model ${creativeModel}.`,
    );
  if (!String(value.sessionId || "").startsWith("launchloom:creative:"))
    throw new Error("Creative session configuration has an invalid sessionId.");
  if (
    value.reasoningPolicyVersion !== REASONING_POLICY_VERSION ||
    value.judgmentSchemaVersion !== JUDGMENT_SCHEMA_VERSION
  )
    throw new Error(
      "Creative session configuration uses an unsupported reasoning policy version.",
    );
  return value;
}
