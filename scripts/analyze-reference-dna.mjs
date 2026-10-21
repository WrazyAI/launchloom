import fs from "node:fs/promises";
import path from "node:path";
import {
  assertReferenceDossierPack,
  referenceDossierPromptBlock,
} from "./reference-dossier.mjs";
import {
  logOpenRouterCacheUsage,
  logOpenRouterResponseCacheUsage,
  openRouterChatCompletion,
  openRouterSessionId,
} from "./openrouter-client.mjs";
import { promptImageDimensions, promptImagePart } from "./prompt-evidence.mjs";
import {
  buildGoCreativeRequest,
  completeGoCreative,
  creativeLaneDefaultModel,
  creativeLaneEffort,
  creativeLaneProvider,
  goCreativeUsageMetrics,
  parseGoCreativeOutput,
} from "./creative-lane-inference.mjs";

const creativeProvider = creativeLaneProvider();
const model =
  process.env.CREATIVE_REFERENCE_ANALYZER_MODEL ||
  creativeLaneDefaultModel(creativeProvider);
const analyzerEffort = creativeLaneEffort(process.env, {
  lane: "CREATIVE_REFERENCE_ANALYZER_EFFORT",
  openrouterDefault: "medium",
});

const ANALYZER_SYSTEM_PROMPT =
  "Return one syntactically valid JSON object only, matching the provided strict schema. Escape quotes and backslashes inside strings. Do not use markdown or surrounding prose. You are a senior visual systems designer extracting measurable, transferable design mechanics from screenshots.";

// Bounded per-process usage evidence for the generation cost ledger. The
// enriched inspiration pack output is unchanged.
const modelUsageRecords = [];

function recordModelUsage(label, usage, attemptModel = model) {
  if (!usage || typeof usage !== "object") return;
  modelUsageRecords.push({
    label,
    model: attemptModel,
    usage,
    provider: creativeProvider,
  });
}

export function getReferenceDnaUsageRecords() {
  return modelUsageRecords.slice();
}

const schema = {
  name: "launchloom_reference_dna_analysis",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "annotatedDescription",
      "heroGeometry",
      "navigationGeometry",
      "typography",
      "palette",
      "imageTreatment",
      "sectionSequence",
      "servicePresentation",
      "ctaPlacement",
      "motion",
      "mobileRecomposition",
      "prohibitedPatterns",
      "requiredSignatureElements",
      "acceptanceChecks",
      "measurements",
    ],
    properties: {
      annotatedDescription: { type: "string", maxLength: 1400 },
      heroGeometry: {
        type: "object",
        additionalProperties: false,
        required: ["mode", "alignment", "viewport"],
        properties: {
          mode: { type: "string" },
          alignment: { type: "string" },
          viewport: { type: "string" },
        },
      },
      navigationGeometry: {
        type: "object",
        additionalProperties: false,
        required: ["mode", "placement", "mobile"],
        properties: {
          mode: { type: "string" },
          placement: { type: "string" },
          mobile: { type: "string" },
        },
      },
      typography: {
        type: "object",
        additionalProperties: false,
        required: ["display", "body", "scale"],
        properties: {
          display: { type: "string" },
          body: { type: "string" },
          scale: { type: "string" },
        },
      },
      palette: {
        type: "object",
        additionalProperties: false,
        required: ["surfaces", "ink", "accents", "contrastIntent"],
        properties: {
          surfaces: { type: "array", maxItems: 6, items: { type: "string" } },
          ink: { type: "string" },
          accents: { type: "array", maxItems: 5, items: { type: "string" } },
          contrastIntent: { type: "string" },
        },
      },
      imageTreatment: {
        type: "object",
        additionalProperties: false,
        required: ["mode", "crop", "focalPoint"],
        properties: {
          mode: { type: "string" },
          crop: { type: "string" },
          focalPoint: { type: "string" },
        },
      },
      sectionSequence: {
        type: "array",
        minItems: 4,
        maxItems: 16,
        items: { type: "string" },
      },
      servicePresentation: {
        type: "object",
        additionalProperties: false,
        required: ["pattern", "interaction"],
        properties: {
          pattern: { type: "string" },
          interaction: { type: "string" },
        },
      },
      ctaPlacement: {
        type: "object",
        additionalProperties: false,
        required: ["primary", "secondary", "early"],
        properties: {
          primary: { type: "string" },
          secondary: { type: "string" },
          early: { type: "string" },
        },
      },
      motion: {
        type: "object",
        additionalProperties: false,
        required: ["primitive", "library", "reducedMotion"],
        properties: {
          primitive: { type: "string" },
          library: { type: "string" },
          reducedMotion: { type: "string" },
        },
      },
      mobileRecomposition: {
        type: "object",
        additionalProperties: false,
        required: ["strategy", "rules"],
        properties: {
          strategy: { type: "string" },
          rules: {
            type: "array",
            minItems: 2,
            maxItems: 8,
            items: { type: "string" },
          },
        },
      },
      prohibitedPatterns: {
        type: "array",
        minItems: 3,
        maxItems: 12,
        items: { type: "string" },
      },
      requiredSignatureElements: {
        type: "array",
        minItems: 2,
        maxItems: 8,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "selector", "description"],
          properties: {
            id: { type: "string" },
            selector: { type: "string" },
            description: { type: "string" },
          },
        },
      },
      acceptanceChecks: {
        type: "array",
        minItems: 4,
        maxItems: 12,
        items: { type: "string" },
      },
      measurements: {
        type: "object",
        additionalProperties: false,
        required: [
          "headlineWidthRatio",
          "headlineHeightRatio",
          "heroImageOccupancyRatio",
          "contentColumnWidthRatio",
          "navTopRatio",
          "navSideInsetRatio",
          "ctaTopRatio",
          "dominantSectionHeightRatios",
          "imageAspectRatios",
          "overlapRelationships",
          "surfaceTransitions",
          "mobile",
        ],
        properties: {
          headlineWidthRatio: { type: "number", minimum: 0, maximum: 1 },
          headlineHeightRatio: { type: "number", minimum: 0, maximum: 1 },
          heroImageOccupancyRatio: { type: "number", minimum: 0, maximum: 1 },
          contentColumnWidthRatio: { type: "number", minimum: 0, maximum: 1 },
          navTopRatio: { type: "number", minimum: 0, maximum: 1 },
          navSideInsetRatio: { type: "number", minimum: 0, maximum: 0.5 },
          ctaTopRatio: { type: "number", minimum: 0, maximum: 4 },
          dominantSectionHeightRatios: {
            type: "array",
            minItems: 3,
            maxItems: 12,
            items: { type: "number", minimum: 0.1, maximum: 4 },
          },
          imageAspectRatios: {
            type: "array",
            minItems: 1,
            maxItems: 8,
            items: { type: "number", minimum: 0.2, maximum: 5 },
          },
          overlapRelationships: {
            type: "array",
            maxItems: 8,
            items: { type: "string" },
          },
          surfaceTransitions: {
            type: "array",
            maxItems: 10,
            items: { type: "string" },
          },
          mobile: {
            type: "object",
            additionalProperties: false,
            required: [
              "headlineWidthRatio",
              "imageOccupancyRatio",
              "ctaTopRatio",
              "contentInsetRatio",
            ],
            properties: {
              headlineWidthRatio: { type: "number", minimum: 0, maximum: 1 },
              imageOccupancyRatio: { type: "number", minimum: 0, maximum: 1 },
              ctaTopRatio: { type: "number", minimum: 0, maximum: 4 },
              contentInsetRatio: { type: "number", minimum: 0, maximum: 0.5 },
            },
          },
        },
      },
    },
  },
};

function argsFrom(argv) {
  return Object.fromEntries(
    argv
      .slice(2)
      .reduce(
        (pairs, value, index, all) =>
          index % 2 === 0
            ? [...pairs, [value.replace(/^--/u, ""), all[index + 1]]]
            : pairs,
        [],
      ),
  );
}

function parseChoice(payload) {
  const raw = String(payload?.choices?.[0]?.message?.content || "").trim();
  if (!raw) throw new Error("Reference analyzer returned no content.");
  try {
    return JSON.parse(
      raw.replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, ""),
    );
  } catch (error) {
    const parseError = new Error(
      `Reference analyzer returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
    parseError.code = "REFERENCE_ANALYZER_INVALID_JSON";
    parseError.finishReason = payload?.choices?.[0]?.finish_reason || "unknown";
    throw parseError;
  }
}

// The analyzer is a long-running structured-vision request. A provider error
// on this lane is usually transient (rate limit or upstream) and the answer is
// expensive to recompute, so it gets one more bounded attempt than the shared
// creative-lane default. Non-transient provider codes (quota, authentication,
// invalid request) still fail after the first response and never loop.
const ANALYZER_GO_MAX_ATTEMPTS = 4;
const ANALYZER_GO_RETRY_DELAY_MS = 4_000;
const ANALYZER_TIMEOUT_MS = 300_000;

async function analyzeRoute(route, { fetchImpl = fetch, sleep } = {}) {
  const dna = route.referenceDna || {};
  const desktop = dna.evidence?.desktopScreenshot?.path;
  const mobile = dna.evidence?.mobileScreenshot?.available
    ? dna.evidence.mobileScreenshot.path
    : "";
  if (!desktop)
    throw new Error(`Reference route ${route.id} has no desktop screenshot.`);
  const captureDimensions = {
    desktop: await promptImageDimensions(desktop),
    mobile: mobile ? await promptImageDimensions(mobile) : null,
  };
  if (dna.canonical === true && dna.measurements) {
    return {
      annotatedDescription:
        dna.evidence?.annotatedDescription ||
        route.referenceNotes ||
        route.evidence?.[0]?.referenceNotes ||
        `Canonical LaunchLoom reference for ${dna.referenceName || route.label || route.id}.`,
      measurements: dna.measurements,
      canonicalVerification: true,
      captureDimensions,
    };
  }
  const buildContent = async ({ mobileDetail = "high" } = {}) => [
    {
      type: "text",
      text: `Analyze this design reference as implementation mechanics, not as brand identity. Measure Reference DNA from the screenshots for an independent implementation.

ROUTE HINTS
${JSON.stringify(
  {
    familyId: dna.familyId,
    referenceName: dna.referenceName,
    heroGeometry: route.heroGeometry,
    navigation: route.navigation,
    servicePresentation: route.servicePresentation,
    sectionRhythm: route.sectionRhythm,
    typographyCategory: route.typographyCategory,
    imageStrategy: route.imageStrategy,
    motionOpportunity: route.motionOpportunity,
  },
  null,
  2,
)}

CURATED REFERENCE DOSSIER
${referenceDossierPromptBlock(route.referenceDossier) || "No dossier was attached. Do not infer missing evidence from prose."}

IMMUTABLE CURATED DESIGN CONTRACT
${JSON.stringify(
  {
    heroGeometry: dna.heroGeometry,
    navigationGeometry: dna.navigationGeometry,
    typography: dna.typography,
    palette: dna.palette,
    imageTreatment: dna.imageTreatment,
    sectionSequence: dna.sectionSequence,
    servicePresentation: dna.servicePresentation,
    ctaPlacement: dna.ctaPlacement,
    motion: dna.motion,
    mobileRecomposition: dna.mobileRecomposition,
    prohibitedPatterns: dna.prohibitedPatterns,
    requiredSignatureElements: dna.requiredSignatureElements,
    acceptanceChecks: dna.acceptanceChecks,
  },
  null,
  2,
)}
These curated qualitative mechanics were reviewed against the paired captures and dossier prompt. Repeat them exactly in your structured response. Do not replace or reorder the section sequence, service presentation, CTA position, motion concept, signatures, or mobile strategy. Use screenshots to measure visual ratios, crop and overlap behavior, section-height fractions, and desktop/mobile geometry only.

SOURCE CAPTURE DIMENSIONS
${JSON.stringify(captureDimensions, null, 2)}
The desktop image may be a full-page capture or page excerpt. Its total image height is not a browser viewport height. The production desktop viewport is 1536x864 and the complete header plus hero must fit inside it at 100% zoom. Preserve the reference's hierarchy, crop, overlap, and spacing when adapting it to that viewport.

Rules:
- infer measurements from the screenshots, not from familiar templates
- preserve every field in IMMUTABLE CURATED DESIGN CONTRACT exactly
- distinguish source-image width ratios, source-image height ratios, and actual browser viewport ratios explicitly
- dominantSectionHeightRatios describe fractions of the captured page image, never CSS vh; do not call a full-page image a single viewport
- describe heroGeometry.viewport as the adapted 1536x864 browser composition, not the source screenshot's full height
- identify image occupancy, crop strategy, whitespace rhythm, overlap, section-height rhythm, and surface transitions
- infer only motion that is visually supported by the screenshots or the route's documented motion opportunity
- required signatures must be design mechanics that can be independently implemented
- prohibited patterns should name generic fallbacks that would visibly break this reference family
- do not copy branding, copy, proprietary fonts, logos, or trade dress`,
    },
    { type: "text", text: "Desktop reference:" },
    await promptImagePart(desktop, { detail: "high" }),
    ...(mobile
      ? [
          { type: "text", text: "Mobile reference:" },
          await promptImagePart(mobile, { detail: mobileDetail }),
        ]
      : []),
  ];
  const content = await buildContent();
  // prettier-ignore
  const sessionId = openRouterSessionId(
    "reference-dna",
    model,
    {
      familyId: dna.familyId || route.familyId || "",
      referenceName: dna.referenceName || route.label || "",
    },
  );
  // Each attempt owns its timeout so an evidence/model fallback is not
  // aborted by time the failed attempts already consumed.
  const requestAnalysis = async (
    responseCache,
    { content: attemptContent = content, model: attemptModel = model } = {},
  ) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ANALYZER_TIMEOUT_MS);
    try {
      if (creativeProvider === "opencode-go") {
        let result;
        try {
          result = await completeGoCreative({
            logicalModel: attemptModel,
            signal: controller.signal,
            fetchImpl,
            sleep,
            maxAttempts: ANALYZER_GO_MAX_ATTEMPTS,
            retryDelayMs: ANALYZER_GO_RETRY_DELAY_MS,
            logger: (line) => console.warn(`reference_dna_${line}`),
            request: buildGoCreativeRequest({
              systemPrompt: ANALYZER_SYSTEM_PROMPT,
              userContent: attemptContent,
              schemaName: schema.name,
              schema: schema.schema,
              // DeepSeek at max effort spends a large reasoning budget before
              // the answer; the analyzer answer itself is a few thousand tokens.
              maxOutputTokens: 48_000,
              effort: analyzerEffort,
              sessionId,
            }),
          });
        } catch (error) {
          if (error?.code !== "CREATIVE_GO_INCOMPLETE") throw error;
          // Preserve the transport-independent retry contract: an incomplete
          // response is retried once, exactly like invalid JSON. Carry the
          // provider status and machine-readable code into the retry log and the
          // terminal error instead of collapsing both to a bare `error`.
          const providerStatus = error.providerStatus || "error";
          const providerErrorCode = error.providerErrorCode || "unknown";
          const incomplete = new Error(
            `Reference analyzer did not complete for ${route.id} (${providerStatus}/${providerErrorCode}${error.providerHttpStatus == null ? "" : `, http ${error.providerHttpStatus}`}).`,
          );
          incomplete.code = "REFERENCE_ANALYZER_INVALID_JSON";
          incomplete.finishReason = `${providerStatus}/${providerErrorCode}`;
          incomplete.providerStatus = providerStatus;
          incomplete.providerErrorCode = providerErrorCode;
          incomplete.providerHttpStatus = error.providerHttpStatus ?? null;
          incomplete.providerType = error.providerType ?? null;
          incomplete.providerParam = error.providerParam ?? null;
          incomplete.providerHints = error.providerHints || [];
          incomplete.providerMessageLength =
            error.providerMessageLength ?? null;
          incomplete.attempts = error.attempts ?? null;
          throw incomplete;
        }
        const usage = result.usage || null;
        recordModelUsage("reference-dna", usage, attemptModel);
        goCreativeUsageMetrics(result, {
          label: "reference-dna",
          logger: (line) => console.warn(line),
        });
        try {
          return assertAnalyzerAnalysis(
            parseGoCreativeOutput(result, {
              invalidJsonCode: "REFERENCE_ANALYZER_INVALID_JSON",
              label: `Reference analyzer for ${route.id}`,
            }),
          );
        } catch (error) {
          error.finishReason = error.finishReason || "go-parse";
          throw error;
        }
      }
      const response = await openRouterChatCompletion({
        title: "LaunchLoom Reference DNA Analyzer",
        signal: controller.signal,
        sessionId,
        responseCache,
        responseCacheTtlSeconds: 86_400,
        fetchImpl,
        body: {
          model: attemptModel,
          temperature: 0,
          reasoning: { effort: "medium", exclude: true },
          max_tokens: 9000,
          response_format: { type: "json_schema", json_schema: schema },
          messages: [
            { role: "system", content: ANALYZER_SYSTEM_PROMPT },
            { role: "user", content: attemptContent },
          ],
        },
      });
      logOpenRouterResponseCacheUsage("reference-dna", response);
      const payload = await response.json().catch((error) => {
        if (response.ok || !(error instanceof SyntaxError)) throw error;
        return {};
      });
      if (!response.ok)
        throw new Error(
          `Reference analyzer failed for ${route.id} (${response.status}): ${payload?.error?.message || "unknown error"}`,
        );
      logOpenRouterCacheUsage("reference-dna", payload.usage);
      recordModelUsage("reference-dna", payload.usage, attemptModel);
      return assertAnalyzerAnalysis(parseChoice(payload));
    } finally {
      clearTimeout(timeout);
    }
  };
  const diagnostics = (error) => {
    const parts = [];
    if (error?.finishReason) parts.push(`finish_reason=${error.finishReason}`);
    if (error?.providerHttpStatus != null)
      parts.push(`http_status=${error.providerHttpStatus}`);
    if (error?.providerErrorCode)
      parts.push(`provider_code=${error.providerErrorCode}`);
    if (error?.providerType) parts.push(`provider_type=${error.providerType}`);
    if (error?.providerParam) parts.push(`param=${error.providerParam}`);
    if (Array.isArray(error?.providerHints) && error.providerHints.length)
      parts.push(`hints=${error.providerHints.join("+")}`);
    if (error?.providerMessageLength != null)
      parts.push(`message_length=${error.providerMessageLength}`);
    if (Array.isArray(error?.missingFields) && error.missingFields.length)
      parts.push(`missing=${error.missingFields.join("+")}`);
    return parts.join(" ");
  };
  try {
    return { ...(await requestAnalysis(true)), captureDimensions };
  } catch (error) {
    if (error?.code !== "REFERENCE_ANALYZER_INVALID_JSON") throw error;
    console.warn(
      `reference_dna_retry route=${route.id} ${diagnostics(error)} cache=bypassed`,
    );
    try {
      return { ...(await requestAnalysis(false)), captureDimensions };
    } catch (retryError) {
      if (retryError?.code !== "REFERENCE_ANALYZER_INVALID_JSON")
        throw retryError;
      const httpSuffix = (failure) =>
        failure.providerHttpStatus == null
          ? ""
          : `, http ${failure.providerHttpStatus}`;
      const nonTransient = new Set(["quota", "authentication"]);
      if (
        creativeProvider !== "opencode-go" ||
        nonTransient.has(String(retryError.providerErrorCode || ""))
      )
        throw new Error(
          `Reference analyzer returned invalid JSON after one uncached retry (finish_reason=${retryError.finishReason}${httpSuffix(retryError)}).`,
        );
      // A persistent provider fault must not kill an otherwise valid run. Try
      // the configured fallback analyst model with the full evidence first:
      // the schema requires mobile measurements, so a desktop-only attempt can
      // never produce a complete analysis. If the media itself is the trigger,
      // retry once with low-detail mobile evidence.
      const fallbackModel =
        process.env.CREATIVE_REFERENCE_ANALYZER_FALLBACK_MODEL ||
        (creativeProvider === "opencode-go" ? "z-ai/glm-5.3-flash" : "");
      if (fallbackModel && fallbackModel !== model) {
        console.warn(
          `reference_dna_fallback route=${route.id} model=${fallbackModel} evidence=full ${diagnostics(retryError)}`,
        );
        try {
          return {
            ...(await requestAnalysis(false, { model: fallbackModel })),
            captureDimensions,
          };
        } catch (fallbackError) {
          if (fallbackError?.code !== "REFERENCE_ANALYZER_INVALID_JSON")
            throw fallbackError;
          if (mobile) {
            console.warn(
              `reference_dna_fallback route=${route.id} model=${fallbackModel} evidence=mobile-low ${diagnostics(fallbackError)}`,
            );
            try {
              return {
                ...(await requestAnalysis(false, {
                  model: fallbackModel,
                  content: await buildContent({ mobileDetail: "low" }),
                })),
                captureDimensions,
              };
            } catch (lowDetailError) {
              if (lowDetailError?.code !== "REFERENCE_ANALYZER_INVALID_JSON")
                throw lowDetailError;
              throw new Error(
                `Reference analyzer did not produce a complete analysis after model and evidence fallbacks (${diagnostics(lowDetailError)}).`,
              );
            }
          }
          throw new Error(
            `Reference analyzer did not produce a complete analysis after the fallback model (${diagnostics(fallbackError)}).`,
          );
        }
      }
      throw new Error(
        `Reference analyzer did not produce valid JSON after one uncached retry (${diagnostics(retryError)}).`,
      );
    }
  }
}

/**
 * @param {Record<string, any>} pack
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   sleep?: (ms: number) => Promise<void>,
 * }} [options]
 */
export async function enrichInspirationPack(
  pack,
  { fetchImpl = fetch, sleep } = {},
) {
  if (!Array.isArray(pack?.routes) || !pack.routes.length)
    throw new Error("Reference DNA analysis requires inspiration routes.");
  assertReferenceDossierPack(pack);
  const requiresModelAnalysis = pack.routes.some(
    (route) =>
      route.referenceDna?.canonical !== true ||
      !route.referenceDna?.measurements,
  );
  if (requiresModelAnalysis) {
    if (creativeProvider === "opencode-go") {
      if (!process.env.OPENCODE_GO_API_KEY)
        throw new Error(
          "OPENCODE_GO_API_KEY is required to derive Reference DNA from screenshots.",
        );
    } else if (!process.env.OPENROUTER_API_KEY) {
      throw new Error(
        "OPENROUTER_API_KEY is required to derive Reference DNA from screenshots.",
      );
    }
  }
  const routes = [];
  for (const route of pack.routes) {
    const analyzed = await analyzeRoute(route, { fetchImpl, sleep });
    routes.push(applyMeasuredReferenceAnalysis(route, analyzed));
  }
  return {
    ...pack,
    referenceDnaAnalyzed: true,
    referenceDnaAnalyzerModel: routes.every(
      (route) => route.referenceDna?.analyzerModel === "canonical-dossier",
    )
      ? "canonical-dossier"
      : model,
    routes,
  };
}

/** Add screenshot-derived measurements without replacing the curated design contract. */
/**
 * The provider's strict schema is not enough: a fallback model can return a
 * syntactically valid object that omits required evidence. Treat that as a
 * retryable analysis failure so the fallback ladder advances instead of
 * failing later with a less actionable error.
 */
function assertAnalyzerAnalysis(analysis) {
  const required = Array.isArray(schema.schema?.required)
    ? schema.schema.required
    : [];
  const missing = required.filter((key) => !(key in (analysis || {})));
  if (
    !missing.length &&
    analysis?.measurements &&
    typeof analysis.measurements === "object"
  )
    return analysis;
  const error = new Error(
    `Reference analyzer returned an incomplete analysis (missing ${missing.join(", ") || "measurements"}).`,
  );
  error.code = "REFERENCE_ANALYZER_INVALID_JSON";
  error.finishReason = "incomplete-analysis";
  error.missingFields = missing.length ? missing : ["measurements"];
  throw error;
}

export function applyMeasuredReferenceAnalysis(route, analysis) {
  const {
    captureDimensions,
    canonicalVerification,
    annotatedDescription,
    measurements,
  } = analysis;
  if (!measurements || typeof measurements !== "object")
    throw new Error(
      `Reference analysis for ${route?.id || "route"} is missing measurements.`,
    );
  return {
    ...route,
    referenceDna: {
      ...route.referenceDna,
      measurements,
      evidence: {
        ...route.referenceDna.evidence,
        captureDimensions,
        ...(annotatedDescription
          ? { pixelAnalysisSummary: annotatedDescription }
          : {}),
      },
      analyzedFromEvidence: true,
      analyzerModel:
        canonicalVerification === true ? "canonical-dossier" : model,
      analyzedAt: new Date().toISOString(),
    },
  };
}

async function main() {
  const args = argsFrom(process.argv);
  if (!args.inspiration) throw new Error("--inspiration is required.");
  const input = path.resolve(args.inspiration);
  const output = path.resolve(args.out || args.inspiration);
  const pack = JSON.parse(await fs.readFile(input, "utf8"));
  const enriched = await enrichInspirationPack(pack);
  await fs.writeFile(output, `${JSON.stringify(enriched, null, 2)}\n`);
  if (args["usage-out"])
    await fs.writeFile(
      path.resolve(args["usage-out"]),
      `${JSON.stringify({ version: 1, records: getReferenceDnaUsageRecords() }, null, 2)}\n`,
    );
  console.log(
    JSON.stringify({ routes: enriched.routes.length, model, output }),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
