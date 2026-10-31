import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fal as defaultFal } from "@fal-ai/client";
import sharp from "sharp";
import { buildRouteContract } from "./creative-compiler.mjs";
import {
  openRouterApiError,
  openRouterChatCompletion,
  openRouterResponseCacheMetrics,
  openRouterSessionId,
  readOpenRouterResponseEnvelope,
} from "./openrouter-client.mjs";
import { opencodeGoUsageMetrics } from "./opencode-go.mjs";
import {
  buildGoCreativeRequest,
  completeGoCreative,
  creativeLaneProvider,
  parseGoCreativeOutput,
} from "./creative-lane-inference.mjs";

export const DEFAULT_FAL_MODEL = "fal-ai/minimax/image-01";
export const DEFAULT_MAX_IMAGES = 3;
export const DEFAULT_MAX_REQUESTS = 15;
export const DEFAULT_MAX_PROMPT_LENGTH = 1500;
export const GENERATED_ASSET_REVIEW_POLICY_VERSION = "visual-review-v1";

// Production asset review uses the same approved model as the rest of the
// pipeline. GLM-5.3 is not approved for production use.
const GENERATED_ASSET_REVIEW_MODEL =
  process.env.FAL_IMAGE_REVIEW_MODEL || "deepseek/deepseek-v4.1-flash";
const GENERATED_ASSET_REVIEW_REASONS = new Set([
  "not_standalone_image",
  "website_or_interface",
  "visible_text",
  "logo_or_watermark",
  "irrelevant_subject",
  "review_unavailable",
  "review_rejected",
]);
const GENERATED_ASSET_REVIEW_FAILURE_CODES = new Set([
  "not_configured",
  "timeout",
  "http_error",
  "provider_error",
  "invalid_envelope",
  "missing_checks",
  "invalid_checks",
  "transport_error",
  "review_callback_error",
]);
const FAL_VALIDATION_FIELDS = new Set([
  "prompt",
  "aspect_ratio",
  "num_images",
  "image_size",
  "output_format",
]);
const IMAGE_RETRY_DIRECTIVE =
  "Do not create a webpage, interface, readable words, signage, labels, packaging lettering, or logos. Regenerate only a single standalone photographic image asset with no readable text.";
const GENERATED_ASSET_REVIEW_SCHEMA = {
  name: "launchloom_generated_asset_review",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "isStandaloneImage",
      "containsWebsiteOrInterface",
      "containsVisibleTextOrTextLikeMarks",
      "containsLogoOrWatermark",
      "containsPeople",
      "isRelevantToBusiness",
    ],
    properties: {
      isStandaloneImage: { type: "boolean" },
      containsWebsiteOrInterface: { type: "boolean" },
      containsVisibleTextOrTextLikeMarks: { type: "boolean" },
      containsLogoOrWatermark: { type: "boolean" },
      containsPeople: { type: "boolean" },
      isRelevantToBusiness: { type: "boolean" },
    },
  },
};

const GENERATED_ASSET_REVIEW_REQUIRED_CHECKS = [
  "isStandaloneImage",
  "containsWebsiteOrInterface",
  "containsVisibleTextOrTextLikeMarks",
  "containsLogoOrWatermark",
  "containsPeople",
  "isRelevantToBusiness",
];

const GENERATED_ASSET_REVIEW_SYSTEM_PROMPT =
  "You are a strict visual asset integrity reviewer. Evaluate only what is visible in the supplied pixels. Reject fake website screenshots, browser or app interfaces, readable words, fake interface copy, prominent signage, logos, watermarks, and any person, face, human figure, hands, or body parts. Do not reject incidental unreadable texture, blurry background marks, photographic grain, or a photographic still life containing several physical objects; those are normal editorial photography. A collage of interface panels is not a standalone image, but a still-life arrangement of physical objects is. Return only the required structured fields.";

function configuredNumber(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const PLACEMENTS = [
  {
    id: "hero",
    clientSlots: ["photoOne"],
    aspectRatio: "16:9",
    maxWidth: 1600,
    alt: "featured service context",
    focal:
      "Keep the main subject in the central safe crop with negative space for copy.",
  },
  {
    id: "secondary",
    clientSlots: ["photoTwo", "photoThree", "teamPhoto"],
    aspectRatio: "4:3",
    maxWidth: 1200,
    alt: "supporting service context",
    focal:
      "Keep the subject legible in a 4:3 crop and preserve a calm edge for overlays.",
  },
  {
    id: "tertiary",
    clientSlots: ["photoThree"],
    aspectRatio: "3:2",
    maxWidth: 1200,
    alt: "detail of the service experience",
    focal: "Use a tactile close crop with a clear subject at mobile width.",
  },
];

const PRIVATE_FIELD =
  /(?:phone|email|address|street|contact|password|token|secret|url|https?:\/\/)/iu;

function argsFrom(argv) {
  return Object.fromEntries(
    argv
      .slice(2)
      .reduce(
        (pairs, value, index, all) =>
          index % 2 === 0
            ? [...pairs, [value.replace(/^--/, ""), all[index + 1]]]
            : pairs,
        [],
      ),
  );
}

function text(value, limit = 240) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(/[—–]/gu, "-")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, limit);
}

function safePromptPart(value, limit = 180) {
  const candidate = text(value, limit);
  if (!candidate || PRIVATE_FIELD.test(candidate)) return "";
  return candidate.replace(/[{}<>]/gu, "");
}

function imageOnlyDirection(value, limit = 180) {
  return safePromptPart(value, limit)
    .replace(
      /\b(?:websites?|webpages?|page layout|layout|typography|typographic|fonts?|headlines?|headings?|copy|text|letters?|glyphs?|posters?|mockups?|interfaces?|screenshots?|banners?)\b/giu,
      " ",
    )
    .replace(/[,:;\s]+/gu, " ")
    .trim();
}

function sceneOnlyDirection(value, limit = 280) {
  const safeReferenceText = String(value || "").replace(
    /\b(?:phone|email|address|street|contact|url|estimate|form|button|navigation|nav|hero|layout|column|paired|alongside|carries|carry|overlay|stacked|statement|floating|upper|lower|left|right|centered|headline|promise|action|cta|section|slider|before-and-after|homeowners?|technicians?|workers?|people|persons?|customers?|clients?|staff|employees?|faces?)\b/giu,
    " ",
  );
  return imageOnlyDirection(safeReferenceText, limit)
    .replace(
      /\b(?:full[- ]width|wide[- ]screen|desktop|mobile|viewport)\b/giu,
      " ",
    )
    .replace(/[,:;\s]+/gu, " ")
    .trim();
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function reviewUsageSummary(usage) {
  if (!usage || typeof usage !== "object") return null;
  const summary = {};
  for (const key of [
    "prompt_tokens",
    "completion_tokens",
    "total_tokens",
    "cost",
    "cache_discount",
  ]) {
    const number = Number(usage[key]);
    if (usage[key] !== undefined && Number.isFinite(number))
      summary[key] = number;
  }
  const details = usage.prompt_tokens_details;
  if (details && typeof details === "object") {
    for (const key of ["cached_tokens", "cache_write_tokens"]) {
      const number = Number(details[key]);
      if (details[key] !== undefined && Number.isFinite(number))
        summary[key] = number;
    }
  }
  return Object.keys(summary).length ? summary : null;
}

/** Normalize Go token usage into the OpenRouter-shaped summary the asset
 * review ledger already records. */
function goReviewUsage(usage) {
  if (!usage || typeof usage !== "object") return null;
  const promptTokens = Number(usage.inputTokens || 0);
  const completionTokens = Number(usage.outputTokens || 0);
  const cachedTokens = Number(usage.cachedInputTokens || 0);
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
    cost: opencodeGoUsageMetrics(usage).cost,
    prompt_tokens_details: { cached_tokens: cachedTokens },
  };
}

function safeRequestId(value) {
  const candidate = String(value || "").trim();
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/u.test(candidate)
    ? candidate
    : "";
}

function unavailableAssetReview(failureCode, diagnostics = {}) {
  return {
    available: false,
    approved: false,
    reasonCodes: ["review_unavailable"],
    failureCode,
    model: diagnostics.model || GENERATED_ASSET_REVIEW_MODEL,
    usage: diagnostics.usage || null,
    ...(Number.isInteger(diagnostics.httpStatus)
      ? { httpStatus: diagnostics.httpStatus }
      : {}),
    ...(diagnostics.requestId ? { requestId: diagnostics.requestId } : {}),
    ...(Number.isInteger(diagnostics.imageBytes)
      ? { imageBytes: diagnostics.imageBytes }
      : {}),
  };
}

function falRequestFailure(error) {
  const statusCandidate = Number(error?.status ?? error?.statusCode);
  const status =
    Number.isInteger(statusCandidate) &&
    statusCandidate >= 100 &&
    statusCandidate <= 599
      ? statusCandidate
      : undefined;
  const validation = error?.name === "ValidationError" || status === 422;
  const fields = Array.isArray(error?.fieldErrors)
    ? [
        ...new Set(
          error.fieldErrors
            .map((entry) => (Array.isArray(entry?.loc) ? entry.loc.at(-1) : ""))
            .filter((field) => FAL_VALIDATION_FIELDS.has(field)),
        ),
      ]
    : [];
  const requestId = safeRequestId(error?.requestId);
  return {
    reason: validation ? "fal-validation-error-422" : "fal-request-failed",
    retryable: !validation,
    details: {
      provider: "fal.ai",
      category: validation ? "validation" : "request",
      ...(status ? { status } : {}),
      ...(requestId ? { requestId } : {}),
      ...(fields.length ? { fields } : {}),
    },
  };
}

function retryPromptFor(prompt) {
  const availablePrefixLength = Math.max(
    0,
    DEFAULT_MAX_PROMPT_LENGTH - IMAGE_RETRY_DIRECTIVE.length - 1,
  );
  const prefix = String(prompt || "")
    .slice(0, availablePrefixLength)
    .trimEnd();
  return `${prefix} ${IMAGE_RETRY_DIRECTIVE}`
    .trim()
    .slice(0, DEFAULT_MAX_PROMPT_LENGTH);
}

function normalizeReviewChecks(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const checks = {};
  for (const key of GENERATED_ASSET_REVIEW_REQUIRED_CHECKS) {
    const raw = value[key];
    if (typeof raw === "boolean") checks[key] = raw;
    else if (raw === "true" || raw === 1) checks[key] = true;
    else if (raw === "false" || raw === 0) checks[key] = false;
    else return null;
  }
  return checks;
}

function normalizeImageReview(
  review,
  fallbackModel = GENERATED_ASSET_REVIEW_MODEL,
) {
  const available = review?.available !== false;
  const approved = available && review?.approved === true;
  const reasons = Array.isArray(review?.reasonCodes)
    ? review.reasonCodes.filter((reason) =>
        GENERATED_ASSET_REVIEW_REASONS.has(reason),
      )
    : [];
  return {
    status: !available ? "unavailable" : approved ? "approved" : "rejected",
    model: text(review?.model || fallbackModel, 100),
    reasonCodes: approved
      ? []
      : reasons.length
        ? [...new Set(reasons)].slice(0, 6)
        : [available ? "review_rejected" : "review_unavailable"],
    usage: reviewUsageSummary(review?.usage),
    ...(GENERATED_ASSET_REVIEW_FAILURE_CODES.has(review?.failureCode)
      ? { failureCode: review.failureCode }
      : {}),
    ...(Number.isInteger(review?.httpStatus) &&
    review.httpStatus >= 100 &&
    review.httpStatus <= 599
      ? { httpStatus: review.httpStatus }
      : {}),
    ...(safeRequestId(review?.requestId)
      ? { requestId: safeRequestId(review.requestId) }
      : {}),
    ...(Number.isInteger(review?.imageBytes) && review.imageBytes >= 0
      ? { imageBytes: review.imageBytes }
      : {}),
    ...(review?.cache?.status
      ? { cacheStatus: text(review.cache.status, 20).toLowerCase() }
      : {}),
  };
}

function assetReviewReasonCodes(checks) {
  const reasons = [];
  if (checks.isStandaloneImage !== true) reasons.push("not_standalone_image");
  if (checks.containsWebsiteOrInterface === true)
    reasons.push("website_or_interface");
  if (checks.containsVisibleTextOrTextLikeMarks === true)
    reasons.push("visible_text");
  if (checks.containsLogoOrWatermark === true)
    reasons.push("logo_or_watermark");
  if (checks.containsPeople === true) reasons.push("people_or_faces");
  if (checks.isRelevantToBusiness !== true) reasons.push("irrelevant_subject");
  return reasons;
}

/**
 * Inspect a newly generated image as pixels before it is persisted or bound to
 * the client config. Provider/model errors are represented as an unavailable
 * review so callers can fall back without leaking unsafe assets.
 *
 * @param {{ imageData: Buffer, placement: string, businessKind?: string, services?: string[], familyId?: string, model?: string, apiKey?: string, timeoutMs?: number }} input
 */
export async function reviewGeneratedAsset({
  imageData,
  placement,
  businessKind = "local business",
  services = [],
  familyId = "",
  model = GENERATED_ASSET_REVIEW_MODEL,
  apiKey = process.env.OPENROUTER_API_KEY,
  timeoutMs = 45_000,
} = {}) {
  const creativeProvider = creativeLaneProvider();
  const goApiKey = String(process.env.OPENCODE_GO_API_KEY || "").trim();
  if (creativeProvider === "opencode-go" ? !goApiKey : !apiKey)
    return unavailableAssetReview("not_configured", {
      model,
      imageBytes: imageData?.byteLength,
    });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const content = [
      {
        type: "text",
        text: [
          `Review this generated ${text(placement, 30)} image asset for a ${safePromptPart(businessKind, 90) || "local business"}.`,
          `Relevant service context: ${
            services
              .map((service) => safePromptPart(service, 80))
              .filter(Boolean)
              .slice(0, 4)
              .join(", ") || "general business context"
          }.`,
          `Reference family: ${safePromptPart(familyId || "unspecified", 80) || "unspecified"}.`,
          "Judge visible pixels, not the prompt or filename. Reject a fake website/page screenshot, browser or UI layout, a collage of interface panels, readable words or fake interface copy, prominent signage, logos, watermarks, or an unrelated subject.",
          "Allow incidental unreadable texture, blurry background marks, photographic grain, and a photographic still life with several physical objects. Do not treat those as text or as a UI collage.",
          "Reject any image containing people, faces, hands, or body parts; generated imagery must never imply staff or customers.",
          "Approve only one standalone image asset with a relevant subject, no readable text or fake interface copy, no interface, no branding, and no people.",
        ].join(" "),
      },
      {
        type: "image_url",
        image_url: {
          url: `data:image/webp;base64,${imageData.toString("base64")}`,
          detail: "high",
        },
      },
    ];
    if (creativeProvider === "opencode-go") {
      // A review model can occasionally return malformed checks; re-review the
      // same pixels once before reporting the review as unavailable. This
      // costs no FAL request and keeps a good image from being skipped by a
      // single bad structured response.
      let diagnostics = { model, imageBytes: imageData?.byteLength };
      for (let reviewAttempt = 1; reviewAttempt <= 2; reviewAttempt += 1) {
        const result = await completeGoCreative({
          logicalModel: model,
          signal: controller.signal,
          env: process.env,
          maxAttempts: 2,
          request: buildGoCreativeRequest({
            systemPrompt: GENERATED_ASSET_REVIEW_SYSTEM_PROMPT,
            userContent: content,
            schemaName: GENERATED_ASSET_REVIEW_SCHEMA.name,
            schema: GENERATED_ASSET_REVIEW_SCHEMA.schema,
            maxOutputTokens: 1000,
            sessionId: openRouterSessionId(
              "generated-asset-review",
              model,
              sha256(imageData),
            ),
          }),
        });
        diagnostics = {
          model,
          usage: reviewUsageSummary(goReviewUsage(result.usage)),
          imageBytes: imageData?.byteLength,
        };
        let checks;
        try {
          checks = parseGoCreativeOutput(result, {
            invalidJsonCode: "GENERATED_ASSET_REVIEW_INVALID_JSON",
            label: "Generated asset review",
          });
        } catch {
          checks = null;
        }
        checks = normalizeReviewChecks(checks);
        if (!checks) continue;
        const reasonCodes = assetReviewReasonCodes(checks);
        return {
          available: true,
          approved: reasonCodes.length === 0,
          reasonCodes,
          model,
          usage: reviewUsageSummary(goReviewUsage(result.usage)),
          cache: {
            provider: "opencode-go",
            ...opencodeGoUsageMetrics(result.usage),
          },
        };
      }
      return unavailableAssetReview("invalid_checks", diagnostics);
    }
    const response = await openRouterChatCompletion({
      title: "LaunchLoom generated asset review",
      signal: controller.signal,
      sessionId: openRouterSessionId(
        "generated-asset-review",
        model,
        sha256(imageData),
      ),
      responseCache: true,
      responseCacheTtlSeconds: 86_400,
      body: {
        model,
        temperature: 0,
        max_completion_tokens: 180,
        provider: { require_parameters: true },
        response_format: {
          type: "json_schema",
          json_schema: GENERATED_ASSET_REVIEW_SCHEMA,
        },
        messages: [
          { role: "system", content: GENERATED_ASSET_REVIEW_SYSTEM_PROMPT },
          { role: "user", content },
        ],
      },
    });
    const envelope = await readOpenRouterResponseEnvelope(response);
    const apiError = openRouterApiError(envelope.payload, response.status);
    const diagnostics = {
      model,
      httpStatus: Number(response.status),
      requestId: safeRequestId(
        response.headers?.get?.("x-request-id") ||
          response.headers?.get?.("x-openrouter-request-id"),
      ),
      usage: reviewUsageSummary(envelope.payload?.usage),
      imageBytes: imageData?.byteLength,
    };
    if (!response.ok) return unavailableAssetReview("http_error", diagnostics);
    if (apiError) return unavailableAssetReview("provider_error", diagnostics);
    if (envelope.parseError)
      return unavailableAssetReview("invalid_envelope", diagnostics);
    const raw = envelope.payload.choices?.[0]?.message?.content;
    if (typeof raw !== "string" || !raw.trim())
      return unavailableAssetReview("missing_checks", diagnostics);
    let checks;
    try {
      checks = JSON.parse(raw);
    } catch {
      return unavailableAssetReview("invalid_checks", diagnostics);
    }
    checks = normalizeReviewChecks(checks);
    if (!checks) return unavailableAssetReview("invalid_checks", diagnostics);
    const reasonCodes = assetReviewReasonCodes(checks);
    return {
      available: true,
      approved: reasonCodes.length === 0,
      reasonCodes,
      model,
      usage: reviewUsageSummary(envelope.payload.usage),
      cache: openRouterResponseCacheMetrics(response),
    };
  } catch (error) {
    const failureCode =
      controller.signal.aborted || error?.name === "AbortError"
        ? "timeout"
        : /OPENROUTER_API_KEY is required/iu.test(String(error?.message || ""))
          ? "not_configured"
          : "transport_error";
    return unavailableAssetReview(failureCode, {
      model,
      imageBytes: imageData?.byteLength,
    });
  } finally {
    clearTimeout(timer);
  }
}

function list(value, limit = 6) {
  return (Array.isArray(value) ? value : [])
    .map((item) => safePromptPart(item, 140))
    .filter(Boolean)
    .slice(0, limit);
}

function clientAssetFor(site, placement) {
  const assets = site.assets || {};
  return placement.clientSlots.find(
    (slot) => typeof assets[slot] === "string" && assets[slot].trim(),
  );
}

function clientAssetPath(site, placement) {
  const slot = clientAssetFor(site, placement);
  return slot ? site.assets?.[slot] || "" : "";
}

function visualDirection(site) {
  const style = site.style || {};
  return [style.visualDirection, style.preference, style.tone]
    .map((value) => imageOnlyDirection(value, 180))
    .filter(Boolean)
    .join(", ");
}

export function promptFor(site, route, placement) {
  const business = site.business || {};
  const seo = site.seoResearch || {};
  const services = list((site.services || []).map((service) => service?.name));
  const areas = list(business.serviceAreas, 3);
  const vocabulary = list(seo.copyVocabulary, 5);
  const problems = list(seo.customerQuestions, 3);
  const direction = visualDirection(site);
  const dna = route?.referenceDna || {};
  const familyImageDirection = {
    "editorial-monument":
      "restrained editorial environments, oversized negative space, tactile paper and stone materials, and quiet ink-blue shadows",
    "cinematic-stage":
      "wide cinematic environments, one legible horizon or service anchor, directional light, and premium restraint",
    "utility-diagnostic":
      "clear documentary service details, precise tools and materials, uncluttered work surfaces, and practical light",
    "typographic-poster":
      "one bold physical subject, high-contrast shape, a limited palette, and broad clean negative space for typography",
    "archive-rail":
      "archive-like service specimens, varied tactile materials, isolated objects, and editorial catalog lighting without text",
    "guided-conversation":
      "calm confidential consultation atmosphere, welcoming rooms or desk details, soft daylight, and warm neutral restraint",
    "spatial-object":
      "one sculptural service-relevant object, credible material physics, controlled studio lighting, and visible spatial depth",
    "market-collage":
      "warm neighborhood product still life, tactile ingredients or tools, asymmetrical groupings, and playful color blocks",
    "a1-collage-composition":
      "layered editorial still life, separated physical objects, tactile surfaces, deliberate overlaps, and off-center balance",
    "a1-kinetic-command":
      "directional action-documentary framing, motion cues from tools or equipment, a clear silhouette, and open copy space",
    "a1-object-stage":
      "monumental studio object staging, sculptural form, grounded materials, deep controlled shadows, and clear negative space",
    "a1-kinetic-founder":
      "authored workspace still life, process tools and personal studio artifacts, directional light, and no identifiable people",
    "a1-cinematic-3d":
      "cinematic spatial 3D environment, believable scale and material depth, controlled perspective, and restrained atmosphere",
    "kokoro-editorial-architecture":
      "warm architectural interiors, editorial still life, restrained dark palette, tactile natural materials",
    "skyelite-cinematic-luxury":
      "luxury transport atmosphere, wide cinematic framing, soft horizon light, premium restraint",
    "health-portal-masked-mosaic":
      "modular clinical imagery, calm human-safe materials, mask-friendly windows, clean neutral surfaces",
    "3d-portfolio-object-led":
      "object-led renders, spatial compositions, sculptural materials, controlled studio lighting",
    "veyra-kinetic-typography":
      "high-energy action documentary framing with clear subject silhouettes and bold negative space",
    "digital-experiences-liquid-glass":
      "abstract atmospheric fields, liquid light, depth and translucent surfaces without readable text",
    "vortex-editorial-studio":
      "editorial project stills, expressive but credible studio materials, wide moving-strip crops",
    "neighborhood-table-collage":
      "warm neighborhood food market still life, playful flat color blocks, tactile ingredients, local table energy, and crop-safe product compositions",
  };
  const familyAssetBriefs = {
    "editorial-monument": {
      medium: "restrained editorial service photography",
      hero: "Create a quiet editorial environment or material tableau for the service, with tactile paper or stone detail and broad negative space for oversized type.",
      secondary:
        "Create a vertical architectural or material chapter with one distinct focal detail, warm natural light, and calm editorial framing.",
      tertiary:
        "Create an isolated service-relevant archive object or material close-up, suitable for a magazine-like section and free of readable text.",
    },
    "cinematic-stage": {
      medium: "wide cinematic environmental photography",
      hero: "Create a panoramic service environment with one strong horizon or physical anchor, directional natural light, motion in the setting, and copy-safe negative space.",
      secondary:
        "Create a different wide service environment with a clear diagonal light path and a distinct crop, without people or faces.",
      tertiary:
        "Create a close material or equipment detail that reads as a cinematic cutaway rather than a catalog product card.",
    },
    "utility-diagnostic": {
      medium: "clear documentary service photography",
      hero: "Create a practical, uncluttered view of one service-relevant tool or work surface, with accurate materials and room for a diagnostic headline.",
      secondary:
        "Create a separate preparation or process detail using objects and materials only, with a clear focal point and ordinary work light.",
      tertiary:
        "Create a precise close-up of a service material, tool, or mechanism with an unbranded surface and legible shape.",
    },
    "typographic-poster": {
      medium: "high-contrast editorial object photography",
      hero: "Create one bold service-relevant physical subject or silhouette against a limited-color field, leaving a large clean area for oversized type.",
      secondary:
        "Create an asymmetric graphic detail with one clear material subject, a restrained palette, and a crop different from the hero.",
      tertiary:
        "Create a tightly cropped service object or tactile material texture that works as a visual punctuation mark.",
    },
    "archive-rail": {
      medium: "editorial archive still-life photography",
      hero: "Create a horizontal archive specimen of service-relevant objects or materials, arranged as one tactile collection with catalog-like light and no readable text.",
      secondary:
        "Create a distinct second specimen grouping with another crop and clearly separated object silhouettes.",
      tertiary:
        "Create a close archival texture or service-material detail that adds variety without repeating the hero arrangement.",
    },
    "guided-conversation": {
      medium: "calm consultation-environment photography",
      hero: "Create a private, welcoming consultation setting through an empty room, arranged chairs, soft daylight, or thoughtful desk objects. Do not depict people, faces, or readable documents.",
      secondary:
        "Create a separate calm environmental detail that suggests a thoughtful first conversation through light, materials, and space, without staged customers.",
      tertiary:
        "Create a tactile close detail from the consultation setting, such as a natural material or neutral object arrangement, without text or people.",
    },
    "spatial-object": {
      medium: "spatial service-object photography or render",
      hero: "Create one service-relevant sculptural object on a grounded spatial stage, with believable materials, controlled depth, and generous negative space. Avoid unrelated decoration.",
      secondary:
        "Create a different camera angle or spatial arrangement for a service-relevant object class, with crop-safe focus and realistic materials.",
      tertiary:
        "Create a close material and form study with credible reflections, clear scale, and restrained studio light.",
    },
    "market-collage": {
      medium: "warm editorial neighborhood product still life",
      hero: "Create a tactile asymmetrical grouping of business-relevant products, ingredients, tools, or materials on a warm local surface, with clear layers and crop-safe focus.",
      secondary:
        "Create a separate counter, shelf, or product grouping with repeated tactile rhythm and a clearly different crop.",
      tertiary:
        "Create a close still life of a service material or product detail with natural texture and intentional mobile cropping.",
    },
    "a1-collage-composition": {
      medium: "layered editorial still-life photography",
      hero: "Create one layered still life of business-relevant service objects with visibly separated planes, tactile surfaces, deliberate overlap, and off-center balance.",
      secondary:
        "Create a distinct second object grouping with readable silhouettes, a different crop, and depth between foreground and background.",
      tertiary:
        "Create a close crop of one service material or process detail, not another hero-scale tableau.",
    },
    "a1-kinetic-command": {
      medium: "directional action-documentary photography",
      hero: "Create a motion-led service scene using tools, equipment, or materials to imply action without identifiable people, with a strong silhouette and one large open copy area.",
      secondary:
        "Create a separate directional service detail with diagonal movement cues, one strong focal object, and practical lighting.",
      tertiary:
        "Create a crisp close action detail of equipment or material that stays legible at a small crop and contains no text.",
    },
    "a1-object-stage": {
      medium: "grounded sculptural service-object render",
      hero: "Create one monumental service-relevant object on a grounded spatial stage, with physically credible material, controlled light, and deep negative space.",
      secondary:
        "Create a secondary object study from a new camera angle, preserving scale and realistic contact with its environment.",
      tertiary:
        "Create a close study of an object material or mechanism with believable reflections and no decorative unrelated forms.",
    },
    "a1-kinetic-founder": {
      medium: "authored workspace and process still-life photography",
      hero: "Create an authored workspace still life of tools, materials, and process artifacts arranged with directional energy. Do not depict a founder, employee, customer, face, or readable text.",
      secondary:
        "Create a different process arrangement of business-relevant tools and materials with a new light direction and tactile surfaces.",
      tertiary:
        "Create a macro study of one process material or tool detail, cropped for clarity on mobile.",
    },
    "a1-cinematic-3d": {
      medium: "cinematic spatial 3D environment",
      hero: "Create a cinematic spatial environment for one business-relevant object or material, with credible scale, dramatic but restrained light, and controlled camera perspective.",
      secondary:
        "Create a separate spatial render with layered depth and a clearly different camera angle, using physically believable materials.",
      tertiary:
        "Create a close material study with realistic surface response, controlled reflections, and restrained cinematic light.",
    },
    "kokoro-editorial-architecture": {
      medium: "photorealistic architectural editorial photography",
      hero: "Create an architectural tableau with strong negative space, warm material depth, and a crop that can support monumental type without becoming a split hero.",
      secondary:
        "Create a vertical or offset interior chapter with tactile material detail and quiet editorial framing.",
      tertiary:
        "Create an architectural still life or material study suited to a magazine/archive rhythm.",
    },
    "skyelite-cinematic-luxury": {
      medium: "cinematic premium transport photography",
      hero: "Create a wide atmospheric horizon scene with motion energy, restrained luxury, and centered copy-safe space.",
      secondary:
        "Create a cinematic destination or transport detail with directional movement and broad tonal gradients.",
      tertiary:
        "Create a premium material or travel detail that reads as a film still rather than a catalog card.",
    },
    "health-portal-masked-mosaic": {
      medium: "clean modular clinical photography",
      hero: "Create one coherent clinical or wellness scene that can be cropped into multiple coordinated mask windows while keeping the subject relationship intact.",
      secondary:
        "Create a second calm clinical scene with strong crop-safe zones for modular windows.",
      tertiary:
        "Create a precise material, tool, or environment detail suitable for a masked mosaic.",
    },
    "3d-portfolio-object-led": {
      medium: "studio object render with realistic materials",
      hero: "Create a single sculptural service-relevant object on a spatial stage with dramatic negative space and deep-focus lighting.",
      secondary:
        "Create a second object-led composition that can anchor a stacked project chapter.",
      tertiary:
        "Create a close object/material study with controlled studio depth, not lifestyle photography.",
    },
    "veyra-kinetic-typography": {
      medium: "high-energy documentary action photography",
      hero: "Create a full-frame action scene with a clear silhouette, directional energy, and large negative zones for oversized condensed type.",
      secondary:
        "Create a directional performance scene suitable for horizontal program bands.",
      tertiary:
        "Create a tight action or equipment detail with graphic contrast and motion cues.",
    },
    "digital-experiences-liquid-glass": {
      medium: "abstract spatial light composition",
      hero: "Create an abstract atmospheric field with liquid light, depth, refraction, and quiet negative space for floating interface instruments.",
      secondary:
        "Create a layered translucent spatial scene with controlled blur and depth, without literal UI text.",
      tertiary:
        "Create a close abstract material/light study that can sit behind structural glass cells.",
    },
    "vortex-editorial-studio": {
      medium: "editorial project photography",
      hero: "Create a restrained authored image with broad horizontal crop potential for a narrow-column studio composition.",
      secondary:
        "Create a wide project still designed for a moving marquee strip.",
      tertiary:
        "Create a project/material detail with strong editorial cropping and calm contrast.",
    },
    "neighborhood-table-collage": {
      medium: "warm editorial food and market still-life photography",
      hero: "Create a loose tabletop collage of bread, pastry, seasonal produce, and a welcoming neighborhood table. Use varied crop-safe product groupings and warm cream, sage, butter, and tomato color relationships rather than a symmetric split hero.",
      secondary:
        "Create a tactile pastry shelf or market-counter scene with repeated product rhythm and generous negative space for a seasonal menu row.",
      tertiary:
        "Create a close still life of bread, herbs, paper, or serving details with a tactile handmade feeling and an intentional crop for a graphic visit or order band.",
    },
  };
  const homeServices = /plumb|drain|water heater|repip|pipe|leak repair/iu.test(
    `${site.industry || ""} ${site.businessKind || ""} ${(site.services || [])
      .map((service) => service?.name)
      .join(" ")}`,
  );
  const homeServicesBrief = {
    medium: "tactile trade still-life photography",
    hero: "Create a close, tactile still life of copper and brass pipe fittings, a well-used wrench, and a clean workbench surface in soft daylight. Leave a calm negative-space field for type. No people, vans, uniforms, clothing, signage, labels, or readable text.",
    secondary:
      "Create a supporting service detail such as a water-heater valve, drain cleanout, or pipe assembly on a clean work surface, without people, vans, labels, or readable text.",
    tertiary:
      "Create a tight material detail of copper pipe, brass fittings, or a work glove with no person, labels, or readable text.",
  };
  const familyBrief = homeServices
    ? homeServicesBrief
    : familyAssetBriefs[dna.familyId] || {
        medium: "commercial editorial photography",
        hero: "Create a distinctive, service-relevant scene using the assigned reference's physical subject cues.",
        secondary:
          "Create a distinct supporting service scene using the assigned reference's physical subject cues.",
        tertiary:
          "Create a tactile material or service detail using the assigned reference's physical subject cues.",
      };
  const subject = services.length
    ? services.join(", ")
    : safePromptPart(
        site.businessKind || site.industry || "local service",
        100,
      ) || "local service";
  const areaContext = areas.length
    ? `Broad setting: ${areas.join(", ")}.`
    : "Do not imply a specific storefront or address.";
  const vocabularyContext = vocabulary.length
    ? `Natural customer language for context only: ${vocabulary.join(", ")}.`
    : "";
  const problemContext = problems.length
    ? `Customer concerns to understand visually, without adding claims: ${problems.join("; ")}.`
    : "";
  const referenceScene = homeServices
    ? ""
    : sceneOnlyDirection(
        `${dna.heroGeometry?.mode || ""}. ${dna.imageTreatment?.mode || ""}`,
      );
  const referenceSceneContext = referenceScene
    ? `Reference-specific physical scene cues: ${referenceScene}. Use only subject and material cues; do not reproduce its layout, interface, or exact source image.`
    : "";
  const dnaContext = homeServices
    ? "Reference family: home-services trade still life. Preserve the reference's practical materials and palette only. Do not depict people, technicians, service vans, uniforms, livery, signage, or readable text."
    : dna.familyId
      ? `Reference family: ${dna.familyId}. Image art direction: ${familyImageDirection[dna.familyId] || "Follow the assigned reference's visual mood and materials without copying a brand."} Image treatment: ${sceneOnlyDirection(dna.imageTreatment?.mode, 120)}. Crop strategy: ${imageOnlyDirection(dna.imageTreatment?.crop, 140)}. Palette intent: ${imageOnlyDirection(dna.palette?.contrastIntent, 140)}.`
      : "";
  const directionContext = direction ? `Visual direction: ${direction}.` : "";
  const placementBrief =
    placement.id === "hero"
      ? familyBrief.hero
      : placement.id === "secondary"
        ? familyBrief.secondary
        : familyBrief.tertiary;
  const prompt = [
    `Visual medium: ${familyBrief.medium}.`,
    `Asset type: one standalone visual image asset, specifically a ${placement.id} photo or illustration.`,
    "Hard rule: output only a single image, never a website or webpage screenshot, browser frame, UI, interface, wireframe, mockup, poster, brochure, menu, book cover, sign, or text collage. The scene must be empty of people: no workers, faces, hands, body parts, or silhouettes of people. No clothing, uniforms, patches, embroidery, name tags, labels, signage, or writing of any kind. No readable text or text-like marks, words, letters, glyphs, logos, watermarks, branded products, credentials, medical claims, or copied campaign. Prefer clean equipment, materials, tools, or interiors shown without any labels. Reference is visual mood only, not image content.",
    `Primary request: ${placementBrief}.`,
    `Business context: ${subject}.`,
    referenceSceneContext,
    areaContext,
    dnaContext,
    directionContext,
    vocabularyContext,
    problemContext,
    `Style: follow the assigned family mechanics and crop strategy. Preserve believable materials and production polish appropriate to ${familyBrief.medium}; do not normalize every family into the same editorial photograph.`,
    "Keep the image useful at the requested crop and avoid tiny details that disappear on mobile.",
    placement.focal,
    "Do not include storefront signage, menus, labels, packaging lettering, logos, watermarks, or readable words.",
  ]
    .filter(Boolean)
    .join(" ");
  return text(prompt, DEFAULT_MAX_PROMPT_LENGTH);
}

function fallbackImage(site, placement) {
  const candidate =
    placement.id === "hero"
      ? site.images?.hero || ""
      : placement.id === "secondary"
        ? site.images?.secondary || ""
        : site.images?.tertiary || "";
  const wasGenerated = (site.assetReport?.used || []).some(
    (entry) =>
      entry?.source === "fal-generated" &&
      entry?.placement === placement.id &&
      entry?.asset === candidate,
  );
  return wasGenerated ? "" : candidate;
}

function applyFallbackImage(site, placement) {
  const fallback = fallbackImage(site, placement);
  if (fallback) {
    setImage(site, placement, fallback);
    return fallback;
  }
  const current =
    placement.id === "hero"
      ? site.images?.hero
      : placement.id === "secondary"
        ? site.images?.secondary
        : site.images?.tertiary;
  const wasGenerated = (site.assetReport?.used || []).some(
    (entry) =>
      entry?.source === "fal-generated" &&
      entry?.placement === placement.id &&
      entry?.asset === current,
  );
  if (wasGenerated) {
    const images = { ...(site.images || {}) };
    delete images[placement.id];
    site.images = images;
  }
  return "";
}

function pathFor(placement, promptHash) {
  return `/images/generated/${placement.id}-${promptHash.slice(0, 12)}.webp`;
}

async function normalizeImage(buffer, placement) {
  const sourceMetadata = await sharp(buffer).metadata();
  if (!sourceMetadata.width || !sourceMetadata.height)
    throw new Error("Generated image has no readable dimensions.");
  if (sourceMetadata.width < 640 || sourceMetadata.height < 360)
    throw new Error("Generated image is too small for a website placement.");
  const { data, info } = await sharp(buffer)
    .resize({ width: placement.maxWidth, withoutEnlargement: true })
    .webp({ quality: 84, effort: 4 })
    .toBuffer({ resolveWithObject: true });
  if (data.byteLength > 2_500_000)
    throw new Error("Generated image exceeds the 2.5 MB optimized limit.");
  return {
    data,
    width: info.width,
    height: info.height,
    bytes: data.byteLength,
    sourceFormat: sourceMetadata.format || "unknown",
  };
}

async function downloadImage(url, fetchImpl = fetch, timeoutMs = 30_000) {
  if (!/^https:\/\//iu.test(String(url || "")))
    throw new Error("FAL returned a non-HTTPS image URL.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    if (!response.ok)
      throw new Error(`FAL image download failed (${response.status}).`);
    const contentType = response.headers.get("content-type") || "";
    if (!/^image\//iu.test(contentType))
      throw new Error("FAL returned a non-image response.");
    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > 8_000_000)
      throw new Error("FAL returned an oversized image.");
    if (!response.body?.getReader)
      throw new Error("FAL image response has no readable body.");
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        total += value.byteLength;
        if (total > 8_000_000) {
          await reader.cancel("FAL returned an oversized image.");
          throw new Error("FAL returned an oversized image.");
        }
        chunks.push(Buffer.from(value));
      }
    } finally {
      reader.releaseLock();
    }
    const data = Buffer.concat(chunks, total);
    if (!data.length) throw new Error("FAL returned an empty image.");
    return { data, contentType };
  } catch (error) {
    if (controller.signal.aborted)
      throw new Error("FAL image download timed out.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function requestImage({ client, model, prompt, aspectRatio, timeoutMs }) {
  const result = await client.subscribe(model, {
    input: {
      prompt,
      aspect_ratio: aspectRatio,
      num_images: 1,
      prompt_optimizer: false,
    },
    logs: false,
    // The SDK cancels the queue request when this subscription timeout fires.
    timeout: timeoutMs,
  });
  const image = result?.data?.images?.[0] || result?.images?.[0];
  if (!image?.url) throw new Error("FAL returned no image URL.");
  return { url: image.url, requestId: result?.requestId || "" };
}

function existingEntry(manifest, placement, promptHash, outputDir) {
  const entry = manifest?.placements?.find(
    (candidate) =>
      candidate.placement === placement.id &&
      candidate.promptHash === promptHash &&
      candidate.reviewPolicyVersion === GENERATED_ASSET_REVIEW_POLICY_VERSION &&
      candidate.imageReview?.status === "approved",
  );
  if (!entry?.path || !entry.path.startsWith("/images/generated/")) return null;
  const filename = path.basename(entry.path);
  return { ...entry, filePath: path.join(outputDir, filename) };
}

function setImage(site, placement, value) {
  site.images = { ...(site.images || {}), [placement.id]: value };
}

async function generateContextualAssetsForRoute({
  site,
  inspiration,
  outputDir,
  manifestPath,
  reuseManifest,
  key = process.env.FAL_KEY,
  model = process.env.FAL_IMAGE_MODEL || DEFAULT_FAL_MODEL,
  maxImages = Number(process.env.FAL_IMAGE_MAX_IMAGES) || DEFAULT_MAX_IMAGES,
  maxRequests = configuredNumber(
    process.env.FAL_IMAGE_MAX_REQUESTS,
    DEFAULT_MAX_REQUESTS,
  ),
  timeoutMs = Number(process.env.FAL_IMAGE_TIMEOUT_MS) || 120_000,
  falClient = /** @type {any} */ (defaultFal),
  fetchImpl = fetch,
  imageReviewer = reviewGeneratedAsset,
  force = false,
} = {}) {
  if (!site || typeof site !== "object")
    throw new Error("A site config is required.");
  await fs.mkdir(outputDir, { recursive: true });
  const existingManifest =
    reuseManifest ||
    (manifestPath
      ? await fs
          .readFile(manifestPath, "utf8")
          .then((value) => JSON.parse(value))
          .catch(() => ({}))
      : {});
  const routes = Array.isArray(inspiration?.routes) ? inspiration.routes : [];
  const route = routes[0] || {};
  const routeContract = buildRouteContract(route);
  const imageBudget = Math.min(
    DEFAULT_MAX_IMAGES,
    Math.max(0, Number(maxImages) || 0),
  );
  const placements = PLACEMENTS.filter(
    (placement) => !clientAssetFor(site, placement),
  );
  const manifest = {
    version: 3,
    provider: "fal.ai",
    model,
    reviewPolicyVersion: GENERATED_ASSET_REVIEW_POLICY_VERSION,
    strategy: "client-first-fill-missing-route-directed",
    routeId: routeContract.id,
    familyId: routeContract.familyId,
    routeFingerprint: routeContract.fingerprint,
    generatedAt: new Date().toISOString(),
    placements: [],
    skipped: [],
  };
  let requests = 0;
  let filled = 0;
  let generationBlockedByFailure = null;
  const hasReviewProvider =
    imageReviewer !== reviewGeneratedAsset ||
    Boolean(process.env.OPENROUTER_API_KEY);
  const canGenerate = Boolean(key && !force && hasReviewProvider);
  if (canGenerate) falClient.config({ credentials: key });

  for (const [placementIndex, placement] of placements.entries()) {
    // Coverage-first allocation: every placement gets a fair share of the
    // request budget (cumulative share by position), so a stubborn hero or its
    // retry cannot consume the whole budget and starve secondary/tertiary. The
    // per-placement attempt cap still bounds retries.
    const placementRequestLimit = Math.min(
      maxRequests,
      Math.max(
        1,
        Math.ceil(
          ((placementIndex + 1) * maxRequests) / Math.max(1, placements.length),
        ),
      ),
    );
    const prompt = promptFor(site, route, placement);
    // Bump this contract whenever image acceptance policy changes so a stale
    // unreviewed (or rejected) bitmap cannot be reused by its old prompt hash.
    const promptHash = sha256(
      `${GENERATED_ASSET_REVIEW_POLICY_VERSION}\n${prompt}`,
    );

    if (filled >= imageBudget) {
      const fallback = applyFallbackImage(site, placement);
      manifest.skipped.push({
        placement: placement.id,
        reason: "image-budget-exhausted",
        fallback,
      });
      continue;
    }

    if (generationBlockedByFailure) {
      const fallback = applyFallbackImage(site, placement);
      manifest.skipped.push({
        placement: placement.id,
        reason: generationBlockedByFailure.reason,
        fallback,
        providerFailure: generationBlockedByFailure.providerFailure,
      });
      continue;
    }

    const existing = existingEntry(
      existingManifest,
      placement,
      promptHash,
      outputDir,
    );
    if (existing) {
      try {
        await fs.access(existing.filePath);
        setImage(site, placement, existing.path);
        const { filePath: _filePath, ...reusedEntry } = existing;
        manifest.placements.push({ ...reusedEntry, reused: true });
        filled += 1;
        continue;
      } catch {
        // The manifest may outlive its asset directory. Generate or fall back below.
      }
    }

    if (!canGenerate || requests >= placementRequestLimit) {
      const fallback = applyFallbackImage(site, placement);
      manifest.skipped.push({
        placement: placement.id,
        reason: !canGenerate
          ? !key
            ? "FAL_KEY-not-configured"
            : !hasReviewProvider
              ? "OPENROUTER_API_KEY-not-configured"
              : "image-generation-disabled"
          : "request-budget-exhausted",
        fallback,
      });
      continue;
    }

    let outcome;
    let failure = "";
    let finalReview;
    let providerFailure;
    const imageReviews = [];
    for (
      let attempt = 0;
      attempt < 2 && requests < placementRequestLimit;
      attempt += 1
    ) {
      requests += 1;
      let requested;
      try {
        requested = await requestImage({
          client: falClient,
          model,
          prompt: attempt === 0 ? prompt : retryPromptFor(prompt),
          aspectRatio: placement.aspectRatio,
          timeoutMs,
        });
      } catch (error) {
        const classified = falRequestFailure(error);
        failure = classified.reason;
        providerFailure = classified.details;
        if (!classified.retryable) {
          generationBlockedByFailure = {
            reason: classified.reason,
            providerFailure: classified.details,
          };
          break;
        }
        continue;
      }
      try {
        const downloaded = await downloadImage(
          requested.url,
          fetchImpl,
          timeoutMs,
        );
        const normalized = await normalizeImage(downloaded.data, placement);
        let review;
        let reviewSummary;
        // A reviewer outage is not a content rejection. Retry the same
        // normalized image once before failing closed; reserve generation
        // retries for images the reviewer actually rejected.
        for (let reviewAttempt = 0; reviewAttempt < 2; reviewAttempt += 1) {
          try {
            review = await imageReviewer({
              imageData: normalized.data,
              placement: placement.id,
              businessKind:
                site.businessKind || site.industry || "local business",
              services: (site.services || [])
                .map((service) => service?.name)
                .filter(Boolean)
                .slice(0, 4),
              familyId: routeContract.familyId,
              attempt: attempt + 1,
            });
          } catch {
            review = {
              available: false,
              approved: false,
              reasonCodes: ["review_unavailable"],
              failureCode: "review_callback_error",
              imageBytes: normalized.bytes,
            };
          }
          reviewSummary = normalizeImageReview(review);
          if (reviewSummary.status !== "unavailable") break;
        }
        imageReviews.push(reviewSummary);
        finalReview = reviewSummary;
        if (reviewSummary.status === "unavailable") {
          failure = "image-review-unavailable";
          break;
        }
        if (reviewSummary.status !== "approved") {
          failure = "image-review-rejected";
          if (attempt === 0 && requests < placementRequestLimit) continue;
          break;
        }
        const fileName = `${placement.id}-${promptHash.slice(0, 12)}.webp`;
        const filePath = path.join(outputDir, fileName);
        await fs.writeFile(filePath, normalized.data);
        outcome = {
          placement: placement.id,
          path: pathFor(placement, promptHash),
          promptHash,
          reviewPolicyVersion: GENERATED_ASSET_REVIEW_POLICY_VERSION,
          imageReview: reviewSummary,
          requestId: requested.requestId,
          providerSourceUrl: requested.url,
          sha256: sha256(normalized.data),
          width: normalized.width,
          height: normalized.height,
          bytes: normalized.bytes,
          alt: placement.alt,
          sourceFormat: normalized.sourceFormat,
          focal: placement.focal,
          familyId: routeContract.familyId,
        };
        break;
      } catch (error) {
        failure =
          error instanceof Error
            ? error.message
            : "FAL image generation failed.";
      }
    }
    if (outcome) {
      filled += 1;
      setImage(site, placement, outcome.path);
      manifest.placements.push(outcome);
    } else {
      const fallback = applyFallbackImage(site, placement);
      manifest.skipped.push({
        placement: placement.id,
        reason: failure || "FAL image generation failed.",
        fallback,
        ...(providerFailure ? { providerFailure } : {}),
        ...(finalReview ? { imageReviews } : {}),
      });
    }
  }

  const used = Array.isArray(site.assetReport?.used)
    ? site.assetReport.used
    : [];
  const generatedPlacements = new Set(
    manifest.placements.map((entry) => entry.placement),
  );
  const resolvedPlacements = new Set([
    ...generatedPlacements,
    ...manifest.skipped.map((entry) => entry.placement),
  ]);
  site.assetReport = {
    used: used.filter(
      (entry) =>
        !(
          entry.source === "fal-generated" &&
          resolvedPlacements.has(entry.placement)
        ),
    ),
    skipped: Array.isArray(site.assetReport?.skipped)
      ? [...site.assetReport.skipped]
      : [],
  };
  for (const entry of manifest.placements) {
    site.assetReport.used.push({
      asset: entry.path,
      placement: entry.placement,
      source: "fal-generated",
      provider: "fal.ai",
      model,
      license: "fal.ai provider terms; verify current terms before production",
      subject: entry.alt,
      promptHash: entry.promptHash,
      requestId: entry.requestId,
      sha256: entry.sha256,
      generatedAt: manifest.generatedAt,
      width: entry.width,
      height: entry.height,
    });
  }
  for (const skipped of manifest.skipped) {
    site.assetReport.skipped.push({
      asset: skipped.placement,
      reason: skipped.fallback
        ? `${skipped.reason}; fallback selected`
        : skipped.reason,
    });
  }
  manifest.generationRequests = requests;
  if (manifestPath) {
    await fs.mkdir(path.dirname(manifestPath), { recursive: true });
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  return { site, manifest, requests };
}

export async function generateContextualAssets(options = {}) {
  const site = options.site;
  if (!site || typeof site !== "object")
    throw new Error("A site config is required.");
  const routes = Array.isArray(options.inspiration?.routes)
    ? options.inspiration.routes
    : [];
  if (routes.length <= 1) return generateContextualAssetsForRoute(options);

  const requestBudget = configuredNumber(
    options.maxRequests ?? process.env.FAL_IMAGE_MAX_REQUESTS,
    DEFAULT_MAX_REQUESTS,
  );
  const imageBudget = Math.min(
    DEFAULT_MAX_IMAGES,
    Math.max(
      0,
      Number(
        options.maxImages ??
          process.env.FAL_IMAGE_MAX_IMAGES ??
          DEFAULT_MAX_IMAGES,
      ) || 0,
    ),
  );
  const existingManifest = options.manifestPath
    ? await fs
        .readFile(options.manifestPath, "utf8")
        .then((value) => JSON.parse(value))
        .catch(() => ({}))
    : {};
  let remainingRequests = Math.max(0, requestBudget);
  let remainingImages = imageBudget;
  let totalRequests = 0;
  const routeManifests = [];
  const creativeAssets = {};
  let firstRouteSite;

  for (const [index, route] of routes.entries()) {
    const remainingRoutes = routes.length - index;
    const routeRequestBudget = Math.max(
      0,
      Math.ceil(remainingRequests / remainingRoutes),
    );
    const routeImageBudget = Math.max(
      0,
      Math.ceil(remainingImages / remainingRoutes),
    );
    const routeSite = structuredClone(site);
    const result = await generateContextualAssetsForRoute({
      ...options,
      site: routeSite,
      inspiration: { ...(options.inspiration || {}), routes: [route] },
      manifestPath: undefined,
      reuseManifest: existingManifest.routes?.find(
        (manifest) => manifest.routeId === route.id,
      ),
      maxImages: routeImageBudget,
      maxRequests: routeRequestBudget,
    });
    const retainedRouteImages = result.manifest.placements.length;
    totalRequests += result.requests;
    remainingRequests = Math.max(0, remainingRequests - result.requests);
    remainingImages = Math.max(0, remainingImages - retainedRouteImages);
    routeManifests.push(result.manifest);
    if (!firstRouteSite) firstRouteSite = result.site;
    creativeAssets[route.id] = {
      hero:
        clientAssetPath(site, PLACEMENTS[0]) || result.site.images?.hero || "",
      secondary:
        clientAssetPath(site, PLACEMENTS[1]) ||
        result.site.images?.secondary ||
        "",
      tertiary:
        clientAssetPath(site, PLACEMENTS[2]) ||
        result.site.images?.tertiary ||
        "",
      familyId: result.manifest.familyId,
      routeFingerprint: result.manifest.routeFingerprint,
    };
  }

  site.images = { ...(firstRouteSite?.images || {}) };
  site.creativeAssets = creativeAssets;

  const existingUsed = Array.isArray(site.assetReport?.used)
    ? site.assetReport.used.filter((entry) => entry.source !== "fal-generated")
    : [];
  const existingSkipped = Array.isArray(site.assetReport?.skipped)
    ? [...site.assetReport.skipped]
    : [];
  site.assetReport = { used: existingUsed, skipped: existingSkipped };

  const placements = [];
  const skipped = [];
  for (const manifest of routeManifests) {
    for (const entry of manifest.placements || []) {
      placements.push({ ...entry, routeId: manifest.routeId });
      site.assetReport.used.push({
        asset: entry.path,
        placement: entry.placement,
        routeId: manifest.routeId,
        familyId: manifest.familyId,
        source: "fal-generated",
        provider: "fal.ai",
        model: manifest.model,
        license:
          "fal.ai provider terms; verify current terms before production",
        subject: entry.alt,
        promptHash: entry.promptHash,
        requestId: entry.requestId,
        sha256: entry.sha256,
        generatedAt: manifest.generatedAt,
        width: entry.width,
        height: entry.height,
      });
    }
    for (const entry of manifest.skipped || []) {
      skipped.push({ ...entry, routeId: manifest.routeId });
      site.assetReport.skipped.push({
        asset: entry.placement,
        routeId: manifest.routeId,
        reason: entry.fallback
          ? `${entry.reason}; fallback selected`
          : entry.reason,
      });
    }
  }

  const manifest = {
    version: 4,
    provider: "fal.ai",
    model: options.model || process.env.FAL_IMAGE_MODEL || DEFAULT_FAL_MODEL,
    reviewPolicyVersion: GENERATED_ASSET_REVIEW_POLICY_VERSION,
    strategy: "client-first-per-route-reference-directed",
    generatedAt: new Date().toISOString(),
    generationRequests: totalRequests,
    routes: routeManifests,
    placements,
    skipped,
  };
  if (options.manifestPath) {
    await fs.mkdir(path.dirname(options.manifestPath), { recursive: true });
    await fs.writeFile(
      options.manifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
  }
  return { site, manifest, requests: totalRequests };
}

async function main() {
  const args = argsFrom(process.argv);
  if (!args.config || !args.output)
    throw new Error("--config and --output are required.");
  const site = JSON.parse(await fs.readFile(args.config, "utf8"));
  const inspiration = args.inspiration
    ? JSON.parse(await fs.readFile(args.inspiration, "utf8"))
    : undefined;
  const result = await generateContextualAssets({
    site,
    inspiration,
    outputDir: args.output,
    manifestPath:
      args.manifest || path.join(args.output, "generated-assets.json"),
    force: args["dry-run"] === "true",
  });
  await fs.writeFile(args.config, `${JSON.stringify(result.site, null, 2)}\n`);
  console.log(
    JSON.stringify({
      generated: result.manifest.placements.length,
      skipped: result.manifest.skipped.length,
      requests: result.requests,
      placements: result.manifest.placements.map((entry) => entry.placement),
    }),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
