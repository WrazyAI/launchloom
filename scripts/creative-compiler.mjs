import crypto from "node:crypto";
import { buildReferenceDna } from "./reference-dna.mjs";

/**
 * The creative compiler is the narrow seam between verified site data and a
 * model-authored experience.  It intentionally owns normalization, identity,
 * diversity, and promotion decisions while leaving rendering to the host.
 */

export const CREATIVE_CONTRACT_VERSION = 2;
export const CREATIVE_FINGERPRINT_FIELDS = [
  "familyId",
  "navigation",
  "heroGeometry",
  "servicePresentation",
  "sectionRhythm",
  "typographyCategory",
  "motionOpportunity",
  "mobileBehavior",
];

export const CREATIVE_FAMILIES = Object.freeze({
  "editorial-monument": {
    label: "Editorial monument",
    defaultMotion: "masked-image-reveal",
    prohibitedPatterns: ["generic-card-wall", "numbered-service-cards"],
  },
  "cinematic-stage": {
    label: "Full-bleed cinematic stage",
    defaultMotion: "pinned-narrative",
    prohibitedPatterns: ["white-pill-navbar", "bento-grid"],
  },
  "utility-diagnostic": {
    label: "Utility diagnostic flow",
    defaultMotion: "state-transition",
    prohibitedPatterns: ["decorative-numbering", "hero-copy-wall"],
  },
  "typographic-poster": {
    label: "Typographic poster",
    defaultMotion: "velocity-type",
    prohibitedPatterns: ["generic-split-hero", "glassmorphism"],
  },
  "archive-rail": {
    label: "Archive collection rail",
    defaultMotion: "horizontal-archive-scrub",
    prohibitedPatterns: ["stacked-service-cards", "hero-carousel"],
  },
  "guided-conversation": {
    label: "Guided conversation",
    defaultMotion: "staged-question-reveal",
    prohibitedPatterns: ["long-why-us-copy", "late-contact-section"],
  },
  "spatial-object": {
    label: "Spatial object stage",
    defaultMotion: "object-focus-transition",
    prohibitedPatterns: ["unrelated-3d-decoration", "autoplay-scroll-lock"],
  },
  "market-collage": {
    label: "Neighborhood product collage",
    defaultMotion: "collage-depth-parallax",
    prohibitedPatterns: ["generic-split-hero", "uniform-card-grid", "white-pill-navbar"],
  },
  "a1-collage-composition": {
    label: "A1 collage composition",
    defaultMotion: "layered-pointer-drift",
    prohibitedPatterns: ["generic-split-hero", "uniform-card-grid", "heavy-pill-navigation"],
  },
  "a1-kinetic-command": {
    label: "A1 kinetic command",
    defaultMotion: "velocity-linked-type",
    prohibitedPatterns: ["generic-split-hero", "soft-editorial-card-grid", "decorative-numbering"],
  },
  "a1-object-stage": {
    label: "A1 object stage",
    defaultMotion: "object-focus-transition",
    prohibitedPatterns: ["unrelated-3d-decoration", "generic-bento-grid", "autoplay-scroll-lock"],
  },
  "a1-kinetic-founder": {
    label: "A1 kinetic founder atlas",
    defaultMotion: "scroll-linked-type-reveal",
    prohibitedPatterns: ["generic-split-hero", "generic-card-wall", "repeated-accordion"],
  },
  "a1-cinematic-3d": {
    label: "A1 cinematic 3D studio",
    defaultMotion: "slow-3d-camera-drift",
    prohibitedPatterns: ["generic-split-hero", "flat-card-grid", "unbounded-autoplay-video"],
  },
});

const DEFAULT_PROHIBITED = [
  "generic-card-wall",
  "decorative-numbering",
  "hero-copy-wall",
  "white-pill-navbar",
  "bento-grid",
  "late-contact-section",
];

function clean(value, limit = 180) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(/[—–]/gu, "-")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, limit);
}

function list(value, limit = 12) {
  return [
    ...new Set(
      (Array.isArray(value) ? value : [])
        .map((item) => clean(item, 120))
        .filter(Boolean),
    ),
  ].slice(0, limit);
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

export function digest(value) {
  return crypto.createHash("sha256").update(stableJson(value)).digest("hex");
}

function inferFamily(route) {
  const value = [
    route?.familyId,
    route?.heroGeometry,
    route?.servicePresentation,
    route?.sectionRhythm,
    route?.motionOpportunity,
  ]
    .map((part) => clean(part, 120).toLowerCase())
    .join(" ");
  if (/monument|magazine|column|narrow-authored|central-portrait/u.test(value)) return "editorial-monument";
  if (/collage|market|shelf|seasonal|product-collage/u.test(value)) return "market-collage";
  if (/object|museum|spatial|product|artifact/u.test(value)) return "spatial-object";
  if (/archive|rail|collection|marquee/u.test(value)) return "archive-rail";
  if (/diagnostic|utility|problem|command|scoreboard/u.test(value)) return "utility-diagnostic";
  if (/poster|athletic|kinetic|velocity|full-viewport/u.test(value)) return "typographic-poster";
  if (/conversation|guided|question|qualifier/u.test(value)) return "guided-conversation";
  if (/full-bleed|cinematic|motion|atmospheric|video/u.test(value)) return "cinematic-stage";
  return "editorial-monument";
}

export function familyForRoute(route) {
  const familyId = clean(route?.familyId, 60);
  const canonical =
    route?.canonicalReferenceDna?.canonical === true ||
    route?.referenceDna?.canonical === true ||
    route?.evidence?.some(
      (item) => item?.canonicalReferenceDna?.canonical === true,
    );
  if (canonical && familyId) return familyId;
  const resolved = familyId || inferFamily(route);
  return CREATIVE_FAMILIES[resolved] ? resolved : inferFamily(route);
}

export function fingerprintForRoute(route) {
  const familyId = familyForRoute(route);
  return digest(
    CREATIVE_FINGERPRINT_FIELDS.map((field) =>
      field === "familyId"
        ? familyId
        : clean(route?.[field], 140).toLowerCase(),
    ).join("|"),
  ).slice(0, 24);
}

export function buildRouteContract(route, index = 0) {
  if (!route || typeof route !== "object")
    throw new Error(`Creative route ${index + 1} is not an object.`);
  const familyId = familyForRoute(route);
  const referenceDna = route.referenceDna || buildReferenceDna(route);
  const family = CREATIVE_FAMILIES[familyId] || {
    label: clean(route.label, 140) || clean(referenceDna.referenceName, 140),
    defaultMotion:
      clean(referenceDna.motion?.primitive, 120) || "restrained-native-motion",
    prohibitedPatterns: [],
  };
  const motionOpportunity =
    clean(route.motionOpportunity, 120) || family.defaultMotion;
  const prohibitedPatterns = [
    ...new Set([
      ...DEFAULT_PROHIBITED,
      ...family.prohibitedPatterns,
      ...list(referenceDna.prohibitedPatterns, 30),
      ...list(route.prohibitedPatterns),
    ]),
  ];
  return Object.freeze({
    version: CREATIVE_CONTRACT_VERSION,
    id: clean(route.id, 80) || `route-${String(index + 1).padStart(2, "0")}`,
    label: clean(route.label, 140),
    intent: clean(route.intent, 500),
    familyId,
    familyLabel: family.label,
    referenceFamilyId: clean(route.referenceFamilyId, 100) || clean(referenceDna.familyId, 100),
    navigation: clean(route.navigation, 120),
    heroGeometry: clean(route.heroGeometry, 120),
    servicePresentation: clean(route.servicePresentation, 120),
    sectionRhythm: clean(route.sectionRhythm, 120),
    typographyCategory: clean(route.typographyCategory, 120),
    imageStrategy: clean(route.imageStrategy, 120),
    motionOpportunity,
    mobileBehavior:
      clean(route.mobileBehavior, 160) ||
      "recompose into a content-driven single column without horizontal overflow",
    prohibitedPatterns,
    tags: list(route.tags, 24),
    designTemplate:
      route.designTemplate && typeof route.designTemplate === "object"
        ? route.designTemplate
        : referenceDna.evidence?.designTemplate,
    calibrationProfile:
      clean(
        route.calibrationProfile ||
          referenceDna.evidence?.calibrationProfile,
        80,
      ) || undefined,
    referenceCalibration:
      route.referenceCalibration ||
      referenceDna.evidence?.referenceCalibration ||
      undefined,
    sourceCategory: clean(route.sourceCategory, 80) || undefined,
    evidenceTier: clean(route.evidenceTier, 40) || undefined,
    provenance:
      route.provenance || referenceDna.evidence?.provenance || undefined,
    canonicalReferenceDna:
      route.canonicalReferenceDna ||
      route.evidence?.find((item) => item.canonicalReferenceDna)
        ?.canonicalReferenceDna ||
      undefined,
    referenceDna,
    referenceEvidenceComplete: Boolean(referenceDna.complete),
    referenceIds: list(route.referenceIds, 8),
    intakeFitScore: Number.isFinite(Number(route.intakeFitScore))
      ? Number(route.intakeFitScore)
      : 0,
    explicitReferenceMatch: route.explicitReferenceMatch === true,
    evidence: Array.isArray(route.evidence)
      ? route.evidence.map((item) => ({
          id: clean(item.id, 80),
          name: clean(item.name, 140),
          source: clean(item.source, 100),
          rights: clean(item.rights, 30),
          screenshotPath: clean(item.screenshotPath, 300),
          mobileScreenshotPath: clean(item.mobileScreenshotPath, 300),
          measuredDesignTokens: item.measuredDesignTokens || undefined,
          sourceStyles: list(item.sourceStyles, 20),
          sourceFonts: list(item.sourceFonts, 12),
          tags: list(item.tags, 24),
          designTemplate: item.designTemplate || undefined,
          canonicalReferenceDna: item.canonicalReferenceDna || undefined,
          provenance: item.provenance || undefined,
          calibrationProfile: clean(item.calibrationProfile, 80) || undefined,
          notes: clean(item.notes, 320),
        }))
      : [],
    signature: clean(route.signature, 300) || fingerprintForRoute(route),
    fingerprint: fingerprintForRoute({ ...route, familyId }),
  });
}

export function assertIndependentRoutes(routes, expected = 3) {
  if (!Array.isArray(routes) || routes.length !== expected)
    throw new Error(`Creative compilation requires exactly ${expected} routes.`);
  const contracts = routes.map(buildRouteContract);
  for (const field of [
    "familyId",
    "navigation",
    "heroGeometry",
    "servicePresentation",
    "typographyCategory",
  ]) {
    if (new Set(contracts.map((route) => route[field])).size !== contracts.length)
      throw new Error(`Creative routes are not independent in ${field}.`);
  }
  if (new Set(contracts.map((route) => route.fingerprint)).size !== contracts.length)
    throw new Error("Creative routes contain duplicate structural fingerprints.");
  return contracts;
}

export function fingerprintForCandidate(candidate) {
  const contract = candidate?.contract || candidate?.route || candidate || {};
  return digest(
    CREATIVE_FINGERPRINT_FIELDS.map((field) =>
      field === "familyId"
        ? familyForRoute(contract)
        : clean(contract[field], 140).toLowerCase(),
    ).join("|"),
  ).slice(0, 24);
}

export function fingerprintDistance(left, right) {
  const a = left?.fingerprintFields || left?.contract || left?.route || left || {};
  const b = right?.fingerprintFields || right?.contract || right?.route || right || {};
  return CREATIVE_FINGERPRINT_FIELDS.reduce((distance, field) => {
    const leftValue = field === "familyId" ? familyForRoute(a) : clean(a[field], 140).toLowerCase();
    const rightValue = field === "familyId" ? familyForRoute(b) : clean(b[field], 140).toLowerCase();
    return distance + (leftValue !== rightValue ? 1 : 0);
  }, 0);
}

export function diversityReport(candidates, { minimumDistance = 4 } = {}) {
  const pairs = [];
  let pass = true;
  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const distance = fingerprintDistance(candidates[i], candidates[j]);
      const pair = {
        left: candidates[i]?.id || candidates[i]?.candidateId || `candidate-${i + 1}`,
        right: candidates[j]?.id || candidates[j]?.candidateId || `candidate-${j + 1}`,
        distance,
        pass: distance >= minimumDistance,
      };
      pairs.push(pair);
      if (!pair.pass) pass = false;
    }
  }
  const dimensions = Object.fromEntries(
    CREATIVE_FINGERPRINT_FIELDS.map((field) => [
      field,
      new Set(
        candidates.map((candidate) => {
          const value = candidate?.contract || candidate?.route || candidate || {};
          return field === "familyId" ? familyForRoute(value) : clean(value[field], 140).toLowerCase();
        }),
      ).size,
    ]),
  );
  const uniqueDimensionCount = Object.values(dimensions).filter((value) => value > 1).length;
  return {
    version: CREATIVE_CONTRACT_VERSION,
    pass: pass && uniqueDimensionCount >= 4,
    minimumDistance,
    dimensions,
    uniqueDimensionCount,
    pairs,
  };
}

/**
 * @param {{candidate?: object, route: object, model?: string, contentManifestDigest?: string, assets?: string[]}} input
 */
export function buildCandidateManifest(input) {
  const { candidate, route, model, contentManifestDigest, assets = [] } = input;
  const contract = buildRouteContract(route);
  const fingerprint = fingerprintForCandidate({ contract });
  const referenceReady = Boolean(contract.referenceDna.complete);
  return {
    version: referenceReady ? CREATIVE_CONTRACT_VERSION : 1,
    candidateId: candidate?.candidateId || candidate?.id || "candidate",
    routeId: contract.id,
    familyId: contract.familyId,
    model: clean(model, 160),
    routeFingerprint: contract.fingerprint,
    fingerprint,
    contentManifestDigest: clean(contentManifestDigest, 128),
    assetTokens: list(assets, 12),
    ...(referenceReady
      ? {
          referenceDna: contract.referenceDna,
          referenceEvidence: {
            desktop: contract.referenceDna.evidence?.desktopScreenshot?.path || "",
            mobile: contract.referenceDna.evidence?.mobileScreenshot?.path || "",
            complete: true,
          },
        }
      : {}),
    requiredSections: ["hero", "services", "faqs", "contact", "early-conversion"],
    motion: {
      opportunity: contract.motionOpportunity,
      reducedMotionRequired: true,
      maxPinnedScenes: 1,
    },
    status: "authored",
  };
}

export function validateCandidateManifest(manifest) {
  if (!manifest || typeof manifest !== "object") throw new Error("Creative candidate manifest is missing.");
  for (const field of ["candidateId", "routeId", "familyId", "routeFingerprint", "fingerprint", "contentManifestDigest"])
    if (!clean(manifest[field])) throw new Error(`Creative candidate manifest is missing ${field}.`);
  if (!CREATIVE_FAMILIES[manifest.familyId])
    throw new Error(`Creative candidate manifest uses unknown family ${manifest.familyId}.`);
  if (!Array.isArray(manifest.requiredSections) || !["hero", "services", "faqs", "contact", "early-conversion"].every((section) => manifest.requiredSections.includes(section)))
    throw new Error("Creative candidate manifest is missing a required page section, including early-conversion.");
  if (manifest.motion?.reducedMotionRequired !== true)
    throw new Error("Creative candidate manifest must require a reduced-motion path.");
  if (manifest.motion?.maxPinnedScenes > 1)
    throw new Error("Creative candidate may declare at most one pinned scene.");
  if (manifest.version >= 2 && (!manifest.referenceDna || manifest.referenceEvidence?.complete !== true))
    throw new Error("Creative candidate manifest must include complete Reference DNA evidence.");
  return manifest;
}

export function scoreCreativeCandidate({ hardPass, visual = {}, technical = {}, distinctiveness = 0 }) {
  if (!hardPass) return -1000;
  const value =
    Number(visual.hierarchy || 0) * 0.2 +
    Number(visual.composition || 0) * 0.15 +
    Number(visual.responsive || 0) * 0.15 +
    Number(visual.industryFit || 0) * 0.15 +
    Number(visual.conversion || 0) * 0.1 +
    Number(technical.accessibility || 0) * 0.1 +
    Number(distinctiveness || 0) * 0.15;
  return Math.round(value * 100) / 100;
}

export const CREATIVE_PROMOTION_THRESHOLDS = Object.freeze({
  visualScore: 78,
  distinctivenessScore: 70,
  minimumFingerprintDistance: 4,
  minimumUniqueDimensions: 4,
  referenceFidelityScore: 80,
  minimumPairwiseVisualDistance: 72,
});
