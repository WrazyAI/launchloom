import fs from "node:fs/promises";
import path from "node:path";

const STATUS = new Set(["candidate", "captured", "analyzed", "reviewed", "approved", "rejected"]);
const RIGHTS = new Set(["reference-only", "licensed", "owned"]);
const ASSET_DEMAND = new Set(["low", "medium", "high"]);
const MOTION_DEPENDENCY = new Set(["low", "medium", "high"]);

function clean(value, limit = 500) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(/[—–]/gu, "-")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, limit);
}

function cleanList(value, limit = 20) {
  return [
    ...new Set(
      (Array.isArray(value) ? value : [])
        .map((item) => clean(item, 120).toLowerCase())
        .filter(Boolean),
    ),
  ].slice(0, limit);
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function normalizeAssetRecipe(value = {}) {
  const placements = (Array.isArray(value.placements) ? value.placements : [])
    .slice(0, 8)
    .map((item, index) => ({
      id: clean(item.id, 80) || `asset-${index + 1}`,
      type: clean(item.type, 80) || "editorial-photography",
      role: clean(item.role, 220),
      aspectRatio: clean(item.aspectRatio, 40) || "3:2",
      composition: clean(item.composition, 360),
      mobile: clean(item.mobile, 260),
      optional: item.optional === true,
    }));
  return {
    minimumAssets: Math.max(0, Number(value.minimumAssets || 0)),
    preferredAssets: Math.max(
      0,
      Number(value.preferredAssets || placements.length || 0),
    ),
    cohesionRule: clean(value.cohesionRule, 500),
    placements,
  };
}

function normalizeCompatibility(value = {}) {
  return {
    businessKinds: cleanList(value.businessKinds, 16),
    conversionModes: cleanList(value.conversionModes, 16),
    contentDensity: cleanList(value.contentDensity, 5),
    locality: cleanList(value.locality, 8),
    assetAvailability: cleanList(value.assetAvailability, 5),
  };
}

function normalizeFeasibility(value = {}) {
  const assetDemand = clean(value.assetDemand, 20).toLowerCase() || "medium";
  const motionDependency =
    clean(value.motionDependency, 20).toLowerCase() || "low";
  if (!ASSET_DEMAND.has(assetDemand))
    throw new Error(`Invalid asset demand '${assetDemand}'.`);
  if (!MOTION_DEPENDENCY.has(motionDependency))
    throw new Error(`Invalid motion dependency '${motionDependency}'.`);
  return {
    assetDemand,
    motionDependency,
    generatedAssetsSupported: value.generatedAssetsSupported !== false,
    peopleRequired: value.peopleRequired === true,
    productCutoutsUseful: value.productCutoutsUseful === true,
    minimumDistinctImages: Math.max(
      0,
      Number(value.minimumDistinctImages || 0),
    ),
  };
}

function normalizeCandidate(record, index) {
  for (const field of [
    "id",
    "name",
    "sourceUrl",
    "rights",
    "status",
    "industries",
    "moods",
    "tags",
    "designHypothesis",
    "compatibility",
    "feasibility",
    "assetRecipe",
  ])
    if (record?.[field] === undefined)
      throw new Error(`Gold reference ${index + 1} is missing ${field}.`);
  const status = clean(record.status, 30).toLowerCase();
  const rights = clean(record.rights, 30).toLowerCase();
  if (!STATUS.has(status))
    throw new Error(
      `Gold reference '${record.id}' has invalid status '${status}'.`,
    );
  if (!RIGHTS.has(rights))
    throw new Error(
      `Gold reference '${record.id}' has invalid rights '${rights}'.`,
    );
  return {
    id: clean(record.id, 100),
    name: clean(record.name, 160),
    sourceUrl: clean(record.sourceUrl, 500),
    discoveryUrl: clean(record.discoveryUrl, 500),
    source: clean(record.source, 120) || "External reference",
    rights,
    status,
    industries: cleanList(record.industries, 20),
    moods: cleanList(record.moods, 20),
    tags: cleanList(record.tags, 30),
    proposedFamilyId: clean(record.proposedFamilyId, 100),
    designHypothesis: clone(record.designHypothesis || {}),
    compatibility: normalizeCompatibility(record.compatibility),
    feasibility: normalizeFeasibility(record.feasibility),
    assetRecipe: normalizeAssetRecipe(record.assetRecipe),
    capture: clone(record.capture || {}),
    admission: clone(record.admission || {}),
    ownedTranslationId: clean(record.ownedTranslationId, 120),
    notes: clean(record.notes, 1000),
  };
}

export function normalizeGoldReferenceLibrary(raw) {
  if (!raw || !Array.isArray(raw.records))
    throw new Error("Gold reference library must contain a records array.");
  const records = raw.records.map(normalizeCandidate);
  if (new Set(records.map((record) => record.id)).size !== records.length)
    throw new Error("Gold reference library contains duplicate IDs.");
  return {
    version: Number(raw.version || 1),
    updatedAt: clean(raw.updatedAt, 40),
    admissionPolicy: clone(raw.admissionPolicy || {}),
    records,
  };
}

function evidencePath(record, repositoryRoot, key) {
  const relative = clean(record.admission?.[key], 400);
  if (!relative) return "";
  return path.resolve(repositoryRoot, relative);
}

/**
 * @param {any} record
 * @param {{ repositoryRoot?: string, fsImpl?: { access: (filePath: string) => Promise<unknown> } }} [options]
 */
export async function goldReferenceEligibility(
  record,
  { repositoryRoot = process.cwd(), fsImpl = fs } = {},
) {
  const reasons = [];
  if (record.status !== "approved") reasons.push("status is not approved");
  if (record.admission?.designReviewed !== true)
    reasons.push("design review is incomplete");
  if (record.admission?.mobileReviewed !== true)
    reasons.push("mobile review is incomplete");
  if (record.admission?.assetRecipeReviewed !== true)
    reasons.push("asset recipe review is incomplete");
  if (record.admission?.validationPass !== true)
    reasons.push("external-to-owned validation has not passed");
  if (!record.ownedTranslationId) reasons.push("owned translation is missing");
  for (const [key, label] of [
    ["desktopScreenshotPath", "desktop evidence"],
    ["compactScreenshotPath", "compact evidence"],
    ["mobileScreenshotPath", "mobile evidence"],
    ["referenceDnaPath", "Reference DNA"],
  ]) {
    const absolute = evidencePath(record, repositoryRoot, key);
    if (!absolute) {
      reasons.push(`${label} path is missing`);
      continue;
    }
    try {
      await fsImpl.access(absolute);
    } catch {
      reasons.push(`${label} file is missing`);
    }
  }
  return { eligible: reasons.length === 0, reasons };
}

/**
 * @param {any} raw
 * @param {{ repositoryRoot?: string, fsImpl?: { access: (filePath: string) => Promise<unknown> } }} [options]
 */
export async function productionGoldRegistry(
  raw,
  { repositoryRoot = process.cwd(), fsImpl = fs } = {},
) {
  const library = normalizeGoldReferenceLibrary(raw);
  const records = [];
  const excluded = [];
  for (const record of library.records) {
    const eligibility = await goldReferenceEligibility(record, {
      repositoryRoot,
      fsImpl,
    });
    if (!eligibility.eligible) {
      excluded.push({ id: record.id, reasons: eligibility.reasons });
      continue;
    }
    const hypothesis = record.designHypothesis || {};
    records.push({
      id: record.id,
      name: record.name,
      source: record.source,
      sourceUrl: record.sourceUrl,
      rights: record.rights,
      industries: record.industries,
      moods: record.moods,
      navigation: clean(hypothesis.navigation, 120),
      heroGeometry: clean(hypothesis.heroGeometry, 120),
      servicePresentation: clean(hypothesis.servicePresentation, 120),
      sectionRhythm: clean(hypothesis.sectionRhythm, 120),
      typographyCategory: clean(hypothesis.typographyCategory, 120),
      imageStrategy: clean(hypothesis.imageStrategy, 120),
      motionOpportunities: cleanList(hypothesis.motionOpportunities, 8),
      familyId: clean(record.proposedFamilyId, 100),
      mobileBehavior: clean(hypothesis.mobileBehavior, 320),
      prohibitedPatterns: cleanList(hypothesis.prohibitedPatterns, 16),
      screenshotPath: clean(record.admission.desktopScreenshotPath, 400),
      mobileScreenshotPath: clean(record.admission.mobileScreenshotPath, 400),
      referenceName: record.name,
      referenceNotes: clean(record.notes, 1000),
      evidenceKind: "gold-primary-reference",
      sourceStyles: record.tags,
      compatibility: record.compatibility,
      feasibility: record.feasibility,
      assetRecipe: record.assetRecipe,
      goldReference: {
        status: record.status,
        ownedTranslationId: record.ownedTranslationId,
        compactScreenshotPath: clean(
          record.admission.compactScreenshotPath,
          400,
        ),
        referenceDnaPath: clean(record.admission.referenceDnaPath, 400),
      },
    });
  }
  return {
    version: Math.max(2, library.version),
    updatedAt: library.updatedAt,
    records,
    excluded,
  };
}

export async function loadGoldReferenceLibrary(filePath) {
  return normalizeGoldReferenceLibrary(
    JSON.parse(await fs.readFile(filePath, "utf8")),
  );
}

export function compatibilityScore(record, request = {}) {
  const compatibility = record.compatibility || {};
  const target = request.compatibility || {};
  let score = 0;
  const exact = (values, value, points) =>
    value &&
    Array.isArray(values) &&
    values.includes(String(value).toLowerCase())
      ? points
      : 0;
  score += exact(compatibility.businessKinds, target.businessKind, 18);
  score += exact(compatibility.conversionModes, target.conversionMode, 16);
  score += exact(compatibility.contentDensity, target.contentDensity, 8);
  score += exact(compatibility.locality, target.locality, 8);
  score += exact(compatibility.assetAvailability, target.assetAvailability, 12);
  const available = String(target.assetAvailability || "").toLowerCase();
  if (record.feasibility?.assetDemand === "high" && available === "low")
    score -= 24;
  if (
    record.feasibility?.motionDependency === "high" &&
    target.reducedMotionFirst === true
  )
    score -= 8;
  return score;
}


export function inferReferenceCompatibility(config = {}, intake = {}) {
  const cta = String(
    config.business?.primaryCta ||
      intake.primaryCta ||
      intake.callToAction ||
      "",
  ).toLowerCase();
  const conversionMode =
    /quote|estimate/u.test(cta)
      ? "quote-request"
      : /book|appointment|schedule/u.test(cta)
        ? "booking"
        : /consult/u.test(cta)
          ? "consultation"
          : /call|phone/u.test(cta)
            ? "call"
            : /order/u.test(cta)
              ? "order"
              : /trial/u.test(cta)
                ? "trial"
                : /sign up|signup/u.test(cta)
                  ? "signup"
                  : /buy|shop|purchase/u.test(cta)
                    ? "purchase"
                    : "contact";
  const imageCount = Object.values(config.images || {}).filter(Boolean).length;
  const serviceCount = Array.isArray(config.services)
    ? config.services.length
    : 0;
  const serviceAreas = Array.isArray(config.business?.serviceAreas)
    ? config.business.serviceAreas.filter(Boolean)
    : [];
  return {
    businessKind: String(
      intake.businessKind ||
        intake.serviceModel ||
        config.businessKind ||
        config.preset ||
        config.industry ||
        "",
    ).toLowerCase(),
    conversionMode,
    contentDensity:
      serviceCount >= 6 ? "high" : serviceCount <= 2 ? "low" : "medium",
    locality:
      serviceAreas.length > 0
        ? "service-area"
        : config.business?.address
          ? "single-location"
          : "remote",
    assetAvailability:
      imageCount >= 4 ? "high" : imageCount >= 1 ? "medium" : "low",
    reducedMotionFirst: false,
  };
}
