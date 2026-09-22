import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { validateReferenceDna } from "./reference-dna.mjs";
import {
  logOpenRouterCacheUsage,
  logOpenRouterResponseCacheUsage,
  openRouterChatCompletion,
  openRouterPromptCacheKey,
  openRouterSessionId,
  promptCachedText,
  promptCacheRequestFields,
} from "./openrouter-client.mjs";
import { promptImagePart } from "./prompt-evidence.mjs";

export const RENDERED_REFERENCE_MODEL =
  process.env.CREATIVE_REFERENCE_JUDGE_MODEL || "openai/gpt-5.6-luna";

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
          "interactionEvidence"
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
          interactionEvidence: { type: "integer", minimum: 0, maximum: 100 }
        }
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
                "generic-grammar"
              ]
            },
            viewport: { type: "string", enum: ["desktop", "compact", "mobile", "all"] },
            evidence: { type: "string", maxLength: 360 },
            repair: { type: "string", maxLength: 420 }
          }
        }
      },
      summary: { type: "string", maxLength: 700 }
    }
  }
};

const diversitySchema = {
  name: "launchloom_rendered_candidate_diversity",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["overallDistinctiveness", "pairs", "genericFallbackDetected", "summary"],
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
            reason: { type: "string", maxLength: 320 }
          }
        }
      },
      summary: { type: "string", maxLength: 500 }
    }
  }
};

function parseChoice(payload, label) {
  const choice = payload?.choices?.[0];
  const content = String(choice?.message?.content || "").trim();
  if (!content) throw new Error(`${label} returned no content.`);
  if (["length", "max_tokens"].includes(choice?.finish_reason))
    throw new Error(`${label} was truncated.`);
  try {
    return JSON.parse(content.replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, ""));
  } catch (error) {
    throw new Error(`${label} returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function cacheableReferenceDna(referenceDna) {
  if (!referenceDna || typeof referenceDna !== "object")
    return referenceDna;
  const {
    analyzedAt: _analyzedAt,
    generatedAt: _generatedAt,
    updatedAt: _updatedAt,
    ...stable
  } = referenceDna;
  return stable;
}

async function imagePart(file) {
  return promptImagePart(file);
}

async function requestJson({
  model,
  schema,
  content,
  label,
  sessionId,
  promptCacheKey,
  fetchImpl = fetch,
}) {
  if (!process.env.OPENROUTER_API_KEY)
    throw new Error("OPENROUTER_API_KEY is required for rendered reference evaluation.");
  const maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180_000);
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
          reasoning: { effort: "medium", exclude: true },
          max_tokens: 7000,
          response_format: { type: "json_schema", json_schema: schema },
          messages: [
            {
              role: "system",
              content:
                "You are a strict visual design critic. Judge rendered pixels, not DOM labels or model claims. Compare design mechanics and visual language only. Treat images labeled opening viewport as matched first-screen evidence: compare the candidate viewport screenshot to the reference opening crop, never to a full-page reference. Use full-page overviews only to judge section sequence and pacing, not raw page height or viewport fit. Do not require copied branding, copy, assets, logos, proprietary fonts, or trade dress. Penalize generic split heroes, card walls, generic SaaS/editorial grammar, weak type scale, weak image choreography, incorrect section pacing, and mobile layouts that merely stack desktop. Return JSON only."
            },
            { role: "user", content }
          ]
        },
      });
      const responseCache = logOpenRouterResponseCacheUsage(label, response);
      const payload = await response.json().catch((error) => {
        if (response.ok || !(error instanceof SyntaxError)) throw error;
        return {};
      });
      if (response.ok) {
        const cache = logOpenRouterCacheUsage(label, payload.usage);
        return {
          audit: parseChoice(payload, label),
          usage: payload.usage || null,
          cache,
          responseCache,
          provider: payload.provider || null,
        };
      }
      const retryable = response.status === 408 || response.status === 429 ||
        (response.status >= 500 && response.status < 600);
      if (!retryable || attempt === maxAttempts - 1)
        throw new Error(`${label} failed (${response.status}): ${payload?.error?.message || "unknown error"}`);
    } finally {
      clearTimeout(timeout);
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
}

async function resolveEvidencePath(record) {
  for (const candidate of [record?.path, record?.absolutePath].filter(Boolean)) {
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

async function cropOpeningViewport(file, viewport, destination) {
  const metadata = await sharp(file).metadata();
  if (!metadata.width || !metadata.height)
    throw new Error(`Reference screenshot has invalid dimensions: ${file}`);
  const targetAspect = viewport.width / viewport.height;
  const sourceAspect = metadata.width / metadata.height;
  const width = sourceAspect > targetAspect
    ? Math.max(1, Math.floor(metadata.height * targetAspect))
    : metadata.width;
  const height = sourceAspect > targetAspect
    ? metadata.height
    : Math.max(1, Math.floor(width / targetAspect));
  const left = Math.floor((metadata.width - width) / 2);

  await sharp(file)
    .extract({ left, top: 0, width, height })
    .resize({ width: Math.min(width, 1200), withoutEnlargement: true })
    .png()
    .toFile(destination);
  return destination;
}

/**
 * Prepare full-page references and first-viewport crops at the actual browser
 * aspect ratios. The crop always starts at the top of the reference page.
 * @param {any} referenceDna
 * @param {string} outputDir
 */
export async function createReferenceViewportEvidence(referenceDna, outputDir) {
  const desktopFullPage = await resolveEvidencePath(referenceDna.evidence.desktopScreenshot);
  const mobileFullPage = referenceDna.evidence.mobileScreenshot?.available
    ? await resolveEvidencePath(referenceDna.evidence.mobileScreenshot)
    : "";
  if (!desktopFullPage) throw new Error("Rendered reference evaluation is missing desktop reference.");
  if (referenceDna.evidence.mobileScreenshot?.available && !mobileFullPage)
    throw new Error("Rendered reference evaluation is missing mobile reference.");

  await fs.mkdir(outputDir, { recursive: true });
  const desktopOpening = await cropOpeningViewport(
    desktopFullPage,
    { width: 1536, height: 864 },
    path.join(outputDir, "reference-desktop-opening.png"),
  );
  const mobileOpening = mobileFullPage
    ? await cropOpeningViewport(
        mobileFullPage,
        { width: 390, height: 844 },
        path.join(outputDir, "reference-mobile-opening.png"),
      )
    : "";
  return { desktopFullPage, desktopOpening, mobileFullPage, mobileOpening };
}

function scorePass(audit, thresholds = RENDERED_REFERENCE_THRESHOLDS) {
  const scores = audit?.scores || {};
  const major = (audit?.findings || []).filter((item) => item.severity === "critical" || item.severity === "major");
  const required = [
    ["heroGeometry", thresholds.heroGeometry],
    ["typography", thresholds.typography],
    ["spatialRhythm", thresholds.spatialRhythm],
    ["imagery", thresholds.imagery],
    ["servicePresentation", thresholds.servicePresentation],
    ["navigation", thresholds.navigation],
    ["ctaPlacement", thresholds.ctaPlacement],
    ["mobileRecomposition", thresholds.mobileRecomposition],
    ["interactionEvidence", thresholds.interactionEvidence]
  ];
  return (
    audit?.verdict === "pass" &&
    Number(audit?.overallScore || 0) >= thresholds.overall &&
    required.every(([key, minimum]) => Number(scores[key] || 0) >= minimum) &&
    major.length === 0
  );
}

/**
 * @param {{referenceDna: any, candidateScreenshots?: {desktop?: string, compact?: string, mobile?: string, desktopFullPage?: string}, model?: string, fetchImpl?: typeof fetch, prepareReferenceViewportEvidence?: typeof createReferenceViewportEvidence, imagePartImpl?: (file: string) => Promise<any>}} options
 * @returns {Promise<Record<string, any>>}
 */
export async function evaluateRenderedReferenceFidelity({
  referenceDna,
  candidateScreenshots,
  model = RENDERED_REFERENCE_MODEL,
  fetchImpl = fetch,
  prepareReferenceViewportEvidence = createReferenceViewportEvidence,
  imagePartImpl = imagePart,
} = {}) {
  validateReferenceDna(referenceDna, { requireEvidence: true });
  const candidateDesktop = candidateScreenshots?.desktop;
  const candidateCompact = candidateScreenshots?.compact;
  const candidateMobile = candidateScreenshots?.mobile;
  for (const [label, file] of [["candidate desktop", candidateDesktop], ["candidate compact", candidateCompact], ["candidate mobile", candidateMobile]])
    if (!file) throw new Error(`Rendered reference evaluation is missing ${label}.`);
  const evidenceDir = prepareReferenceViewportEvidence === createReferenceViewportEvidence
    ? await fs.mkdtemp(path.join(os.tmpdir(), "launchloom-reference-fidelity-"))
    : "";
  try {
  const referenceEvidence = await prepareReferenceViewportEvidence(referenceDna, evidenceDir);
  const stableReferenceDna = cacheableReferenceDna(referenceDna);
  const reusableReferencePrefix = `REFERENCE DNA
${JSON.stringify(stableReferenceDna, null, 2)}

Compare the candidate to the reference as an independent implementation of the same design mechanics. Evaluate geometry, typography scale and role, spacing rhythm, image occupancy and crops, service presentation, navigation, CTA location, mobile recomposition, and visible interaction evidence. Acceptance checks are binding. A technically clean but visually generic page must not pass.`;
  const content = [
    { type: "text", text: reusableReferencePrefix },
    { type: "text", text: "Reference desktop opening viewport:" },
    await imagePartImpl(referenceEvidence.desktopOpening),
    { type: "text", text: "Reference desktop full-page overview:" },
    await imagePartImpl(referenceEvidence.desktopFullPage),
    ...(referenceEvidence.mobileOpening ? [
      { type: "text", text: "Reference mobile opening viewport:" },
      await imagePartImpl(referenceEvidence.mobileOpening),
      { type: "text", text: "Reference mobile full-page overview:" },
      await imagePartImpl(referenceEvidence.mobileFullPage),
    ] : []),
    promptCachedText(
      model,
      "End assigned reference evidence. Candidate render evidence follows.",
    ),
    { type: "text", text: "Candidate desktop viewport 1536x864:" },
    await imagePartImpl(candidateDesktop),
    { type: "text", text: "Candidate compact desktop viewport 1366x768:" },
    await imagePartImpl(candidateCompact),
    { type: "text", text: "Candidate mobile viewport 390x844:" },
    await imagePartImpl(candidateMobile),
    ...(candidateScreenshots?.desktopFullPage ? [
      { type: "text", text: "Candidate desktop full-page overview:" },
      await imagePartImpl(candidateScreenshots.desktopFullPage),
    ] : []),
    { type: "text", text: "Compare opening-viewport crops against candidate viewport captures. Use full-page overviews only to judge section order and pacing, not raw page height or viewport fit." },
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
    ...result
  };
  } finally {
    if (evidenceDir)
      await fs.rm(evidenceDir, { recursive: true, force: true });
  }
}

/**
 * @param {{candidates?: Array<{candidateId: string, desktop: string, mobile: string}>, model?: string, fetchImpl?: typeof fetch, imagePartImpl?: (file: string) => Promise<any>}} options
 * @returns {Promise<{version: number, model: string, pass: boolean, score: number, minimumPairDistance?: number, audit: any, [key: string]: any}>}
 */
export async function evaluateRenderedDiversity({
  candidates,
  model = RENDERED_REFERENCE_MODEL,
  fetchImpl = fetch,
  imagePartImpl = imagePart,
} = {}) {
  if (!Array.isArray(candidates) || candidates.length < 2)
    return { version: 1, model, pass: true, score: 100, audit: { overallDistinctiveness: 100, genericFallbackDetected: false, pairs: [], summary: "Single candidate." } };
  const content = [{
    type: "text",
    text:
      "Compare these candidate screenshots to each other, not to their business copy. Judge visual grammar: hero geometry, typography, image choreography, navigation, service presentation, section rhythm, spatial composition, and mobile recomposition. Different colors or words do not count as meaningful visual distance. Flag generic fallback grammar when candidates converge on familiar split heroes, card walls, repeated centered editorial sections, or near-identical page skeletons."
  }];
  for (const candidate of candidates) {
    content.push({ type: "text", text: `${candidate.candidateId} desktop:` });
    content.push(await imagePartImpl(candidate.desktop));
    content.push({ type: "text", text: `${candidate.candidateId} mobile:` });
    content.push(await imagePartImpl(candidate.mobile));
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
    fetchImpl,
  });
  const minimumPair = result.audit.pairs.length ? Math.min(...result.audit.pairs.map((pair) => Number(pair.distance || 0))) : 100;
  const score = Math.min(Number(result.audit.overallDistinctiveness || 0), minimumPair);
  return {
    version: 1,
    model,
    pass:
      !result.audit.genericFallbackDetected &&
      Number(result.audit.overallDistinctiveness || 0) >= RENDERED_REFERENCE_THRESHOLDS.pairwiseDistinctiveness &&
      minimumPair >= RENDERED_REFERENCE_THRESHOLDS.pairwiseDistinctiveness,
    score,
    minimumPairDistance: minimumPair,
    ...result
  };
}
