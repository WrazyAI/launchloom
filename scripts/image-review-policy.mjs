import { createHash } from "node:crypto";
import { canonicalBusinessKind } from "./business-kind.mjs";

/**
 * Generated-image acceptance policy.
 *
 * The reviewer's job stays narrow: catch the failure modes an image model
 * actually produces (fake websites, interface panels, headlines, logos,
 * watermarks, invented people) while judging relevance against the specific
 * scene that was requested, not just the business category. Relevance without
 * the prompt approved a generic craft still life as architecture, and a
 * blanket lettering ban threw away images with a small incidental label.
 */
export const IMAGE_REVIEW_POLICY_VERSION = "visual-review-v3";

/**
 * Business kinds where ambient, unidentifiable people are normal editorial
 * photography. Everything else forbids people outright, because a stock person
 * must never read as this client's staff, patient, guest, or customer.
 */
const INCIDENTAL_PEOPLE_KINDS = new Set([
  "restaurant",
  "cafe",
  "hospitality",
  "fitness",
  "beauty",
  "architecture",
  "interior-design",
  "real-estate",
]);

export const REVIEW_REASON_CODES = new Set([
  "not_standalone_image",
  "website_or_interface",
  "visible_text",
  "logo_or_watermark",
  "people_or_faces",
  "irrelevant_subject",
  "illustrative_treatment_missing",
  "review_unavailable",
  "review_rejected",
]);

export const REVIEW_SCHEMA_NAME = "launchloom_generated_asset_review";

const REVIEW_FIELDS = [
  "isStandaloneImage",
  "containsWebsiteOrInterface",
  "containsProminentText",
  "containsLogoOrWatermark",
  "containsPeople",
  "peopleAreIncidental",
  "matchesIntendedScene",
  "illustrativeTreatmentVisible",
];

/** Client art direction that asks for concept work rather than a photograph. */
export function requiresIllustrativeTreatment(artDirection = "") {
  const text = String(artDirection || "");
  if (!/illustrat|abstract plan|concept imagery|diagram|drawing/iu.test(text))
    return false;
  // A prohibition such as "no illustrations" is not a requirement.
  if (
    /\b(?:no|not|avoid|without|never)\b[^.;]{0,40}\b(?:illustrat|drawing|diagram)/iu.test(
      text,
    )
  )
    return false;
  return true;
}

/** Version-one field names remain readable when a cached verdict is loaded. */
const LEGACY_FIELD_ALIASES = {
  containsVisibleTextOrTextLikeMarks: "containsProminentText",
  isRelevantToBusiness: "matchesIntendedScene",
};

/**
 * @param {{businessKind?: string, placement?: string, familyId?: string,
 *   artDirection?: string}} [input]
 */
export function reviewPolicyFor({
  businessKind = "",
  placement = "",
  familyId = "",
  artDirection = "",
} = {}) {
  const kind = canonicalBusinessKind(businessKind) || String(businessKind || "").toLowerCase();
  return {
    version: IMAGE_REVIEW_POLICY_VERSION,
    businessKind: kind,
    placement,
    familyId,
    artDirection: String(artDirection || ""),
    illustrativeRequired: requiresIllustrativeTreatment(artDirection),
    peopleMode: INCIDENTAL_PEOPLE_KINDS.has(kind) ? "incidental" : "forbid",
    textMode: "prominent-only",
    sceneRequired: true,
  };
}

export function reviewSchema() {
  return {
    name: REVIEW_SCHEMA_NAME,
    schema: {
      type: "object",
      additionalProperties: false,
      required: [...REVIEW_FIELDS],
      properties: {
        isStandaloneImage: { type: "boolean" },
        containsWebsiteOrInterface: { type: "boolean" },
        containsProminentText: { type: "boolean" },
        containsLogoOrWatermark: { type: "boolean" },
        containsPeople: { type: "boolean" },
        peopleAreIncidental: { type: "boolean" },
        matchesIntendedScene: { type: "boolean" },
        illustrativeTreatmentVisible: { type: "boolean" },
      },
    },
  };
}

function booleanValue(value) {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === 1) return true;
  if (value === "false" || value === 0) return false;
  return undefined;
}

/**
 * Accepts the current shape and the version-one field names.
 * @returns {Record<string, boolean> | null}
 */
export function normalizeReviewChecks(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = { ...value };
  for (const [legacy, current] of Object.entries(LEGACY_FIELD_ALIASES))
    if (source[current] === undefined && source[legacy] !== undefined)
      source[current] = source[legacy];
  if (source.peopleAreIncidental === undefined)
    source.peopleAreIncidental = false;
  if (source.illustrativeTreatmentVisible === undefined)
    source.illustrativeTreatmentVisible = false;
  const checks = {};
  for (const field of REVIEW_FIELDS) {
    const parsed = booleanValue(source[field]);
    if (parsed === undefined) return null;
    checks[field] = parsed;
  }
  return checks;
}

/**
 * @param {Record<string, boolean>} checks
 * @param {ReturnType<typeof reviewPolicyFor>} policy
 */
export function assetReviewReasonCodes(checks, policy = reviewPolicyFor({})) {
  const reasons = [];
  if (checks.isStandaloneImage !== true) reasons.push("not_standalone_image");
  if (checks.containsWebsiteOrInterface === true)
    reasons.push("website_or_interface");
  if (checks.containsProminentText === true) reasons.push("visible_text");
  if (checks.containsLogoOrWatermark === true)
    reasons.push("logo_or_watermark");
  if (
    checks.containsPeople === true &&
    (policy.peopleMode === "forbid" || checks.peopleAreIncidental !== true)
  )
    reasons.push("people_or_faces");
  if (checks.matchesIntendedScene !== true) reasons.push("irrelevant_subject");
  if (
    policy.illustrativeRequired &&
    checks.illustrativeTreatmentVisible !== true
  )
    reasons.push("illustrative_treatment_missing");
  return reasons;
}

function peopleInstruction(policy) {
  return policy.peopleMode === "incidental"
    ? "People may appear only as small, distant, unidentifiable ambient figures. Reject any recognizable face, close or posed person, identifiable hands, or any arrangement that reads as this client's staff, patients, guests, or customers; mark peopleAreIncidental true only for ambient figures."
    : "Reject any person, face, identifiable hands, or body part. Generated imagery must never imply this client's staff, patients, guests, or customers.";
}

/**
 * @param {{placement?: string, businessKind?: string, services?: string[],
 *   familyId?: string, scene?: string, policy: ReturnType<typeof reviewPolicyFor>}} input
 */
export function buildReviewInstructions({
  placement = "",
  businessKind = "",
  services = [],
  familyId = "",
  scene = "",
  policy = reviewPolicyFor({}),
} = {}) {
  const serviceList =
    services.map((service) => String(service || "").trim()).filter(Boolean).slice(0, 4).join(", ") ||
    "general business context";
  const illustrativeInstruction = policy.illustrativeRequired
    ? "Client imagery policy requires illustrative concept imagery. Mark illustrativeTreatmentVisible true only when the pixels are visibly illustrative: linework, an abstract plan, a diagram, a drawing, or a material study. Reject a photorealistic finished interior or a scene that reads as a built project."
    : "No illustrative treatment is required. Mark illustrativeTreatmentVisible true.";
  return [
    `Review this generated ${placement || "image"} asset for a ${businessKind || "local business"} (${serviceList}; reference family ${familyId || "unspecified"}).`,
    `Intended scene: ${scene || "not supplied"}.`,
    policy.artDirection
      ? `Client art direction: ${policy.artDirection}`
      : "Client art direction: not supplied.",
    "Judge only visible pixels against that intended scene, not the filename.",
    "Reject fake website or app screenshots, browser or interface chrome, collage panels, logos, watermarks, and any interface copy.",
    "Text: reject only prominent lettering. Prominent means a headline, interface copy, signage used as a focal element, or lettering covering a meaningful part of the frame. Allow small incidental labels, packaging type, distant unreadable signage, grain, and motion blur.",
    peopleInstruction(policy),
    illustrativeInstruction,
    "Approve only a single standalone image that plausibly depicts the intended scene with no interface, no fake copy, no branding, and no policy-violating people.",
  ].join(" ");
}

const RETRY_INSTRUCTIONS = {
  not_standalone_image:
    "Create one standalone photograph, not a collage, poster, or panel arrangement.",
  website_or_interface:
    "Do not create a webpage, interface, browser or app chrome, panels, cards, or framed layouts.",
  visible_text:
    "Remove prominent lettering: no headline, no interface copy, and no signage used as a focal point. Tiny incidental marks are acceptable.",
  logo_or_watermark:
    "Remove all logos, brand marks, watermarks, and packaging branding.",
  irrelevant_subject:
    "Depict the specific intended scene and its physical subject rather than a generic still life that could belong to any unrelated business.",
  illustrative_treatment_missing:
    "Render an explicitly illustrative concept with visible linework, an abstract plan, a diagram, or a material study. Do not render a photorealistic finished interior or a built-project scene.",
};

function peopleRetry(policy) {
  return policy.peopleMode === "incidental"
    ? "Keep any people tiny, distant, and unidentifiable; no posed staff, guests, or customers."
    : "No people, faces, hands, or body parts.";
}

/**
 * @param {string[]} reasonCodes
 * @param {ReturnType<typeof reviewPolicyFor>} policy
 */
export function retryDirectiveFor(reasonCodes = [], policy = reviewPolicyFor({})) {
  const directives = [];
  for (const reason of [...new Set(reasonCodes)]) {
    if (reason === "people_or_faces") directives.push(peopleRetry(policy));
    else if (RETRY_INSTRUCTIONS[reason]) directives.push(RETRY_INSTRUCTIONS[reason]);
  }
  if (!directives.length)
    directives.push(
      policy.illustrativeRequired
        ? "Regenerate a single standalone illustrative concept with visible drawing or diagram qualities that matches the intended scene, with no interface, no readable copy, no branding, and no people."
        : "Regenerate a single standalone photographic asset that matches the intended scene, with no interface, no readable copy, no branding, and no people.",
    );
  return directives.join(" ");
}

/**
 * @param {string} prompt
 * @param {string[]} reasonCodes
 * @param {ReturnType<typeof reviewPolicyFor>} policy
 * @param {number} maxLength
 */
export function imageRetryPrompt(prompt, reasonCodes, policy, maxLength = 1500) {
  const directive = retryDirectiveFor(reasonCodes, policy);
  const available = Math.max(0, maxLength - directive.length - 1);
  const prefix = String(prompt || "")
    .slice(0, available)
    .trimEnd();
  return `${prefix} ${directive}`.trim().slice(0, maxLength);
}

/**
 * Review sessions must not collide across policy versions or scenes: the
 * session id keys the provider cache, so a stale approved verdict must never
 * be replayed for a changed policy or a different requested scene.
 */
export function reviewSessionKey({
  model = "",
  policyVersion = IMAGE_REVIEW_POLICY_VERSION,
  scene = "",
} = {}) {
  return createHash("sha256")
    .update(`${policyVersion}\n${model}\n${scene}`)
    .digest("hex")
    .slice(0, 40);
}
