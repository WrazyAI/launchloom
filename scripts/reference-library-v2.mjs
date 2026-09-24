import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { validateReferenceDna } from "./reference-dna.mjs";

function clean(value, limit = 500) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(/[—–]/gu, "-")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, limit);
}

function assertFile(repositoryRoot, relativePath, label) {
  const value = clean(relativePath, 400);
  if (!value) throw new Error(`${label} is missing.`);
  if (/^https?:/iu.test(value))
    throw new Error(`${label} must be repository-local evidence, not a remote URL.`);
  const absolute = path.resolve(repositoryRoot, value);
  if (!fs.existsSync(absolute))
    throw new Error(`${label} is missing its local evidence: ${value}.`);
  return value;
}

export function normalizeReferenceLibraryV2(
  raw,
  { repositoryRoot = process.cwd(), minimumCount = 30 } = {},
) {
  if (!raw || !Array.isArray(raw.records))
    throw new Error("Reference Library v2 must contain a records array.");
  if (minimumCount && raw.records.length < minimumCount)
    throw new Error(
      `Reference Library v2 must contain at least ${minimumCount} production references; found ${raw.records.length}.`,
    );

  const ids = new Set();
  const evidencePaths = new Set();
  const evidenceDigests = new Set();
  const structuralSignatures = new Set();
  const records = raw.records.map((record, index) => {
    const id = clean(record?.id, 100);
    if (!id) throw new Error(`Reference Library v2 record ${index + 1} has no id.`);
    if (ids.has(id)) throw new Error(`Reference Library v2 contains duplicate id '${id}'.`);
    ids.add(id);

    if (clean(record?.rights, 40) !== "owned")
      throw new Error(`Reference Library v2 '${id}' must use owned normalized evidence.`);
    if (clean(record?.evidenceTier, 40) !== "production")
      throw new Error(`Reference Library v2 '${id}' must be production evidence.`);
    if (clean(record?.sourceCategory, 80) !== "owned-normalized-reference")
      throw new Error(`Reference Library v2 '${id}' must use owned-normalized-reference sourceCategory.`);

    const screenshotPath = assertFile(
      repositoryRoot,
      record.screenshotPath,
      `Reference Library v2 '${id}' desktop screenshot`,
    );
    const mobileScreenshotPath = assertFile(
      repositoryRoot,
      record.mobileScreenshotPath,
      `Reference Library v2 '${id}' mobile screenshot`,
    );
    for (const evidencePath of [screenshotPath, mobileScreenshotPath]) {
      if (evidencePaths.has(evidencePath))
        throw new Error(
          `Reference Library v2 reuses visual evidence across references: ${evidencePath}.`,
        );
      evidencePaths.add(evidencePath);
      const digest = crypto
        .createHash("sha256")
        .update(fs.readFileSync(path.resolve(repositoryRoot, evidencePath)))
        .digest("hex");
      if (evidenceDigests.has(digest))
        throw new Error(
          `Reference Library v2 contains byte-identical visual evidence: ${evidencePath}.`,
        );
      evidenceDigests.add(digest);
    }

    if (!Array.isArray(record.industries) || !record.industries.length)
      throw new Error(`Reference Library v2 '${id}' needs target industries.`);
    if (!Array.isArray(record.tags) || record.tags.length < 4)
      throw new Error(`Reference Library v2 '${id}' needs at least four design tags.`);
    if (!record.designTemplate || typeof record.designTemplate !== "object")
      throw new Error(`Reference Library v2 '${id}' needs a structured designTemplate.`);
    for (const key of [
      "layoutArchetype",
      "navigationPattern",
      "servicePattern",
      "surfaceSystem",
      "typeSystem",
      "imageSystem",
      "spacingSystem",
      "conversionSystem",
      "responsiveSystem",
      "compositionSystem",
      "desktopBlueprint",
      "mobileBlueprint",
      "sectionBlueprint",
      "interactionSystem",
      "signatureRequirements",
      "acceptanceChecks",
      "adaptationRules",
    ])
      if (!record.designTemplate[key])
        throw new Error(
          `Reference Library v2 '${id}' is missing designTemplate.${key}.`,
        );
    if (!Array.isArray(record.designTemplate.sectionBlueprint) ||
        record.designTemplate.sectionBlueprint.length < 4)
      throw new Error(
        `Reference Library v2 '${id}' needs a detailed sectionBlueprint.`,
      );
    if (!Array.isArray(record.designTemplate.acceptanceChecks) ||
        record.designTemplate.acceptanceChecks.length < 3)
      throw new Error(
        `Reference Library v2 '${id}' needs template acceptance checks.`,
      );
    if (!record.provenance || typeof record.provenance !== "object")
      throw new Error(`Reference Library v2 '${id}' needs provenance metadata.`);
    if (
      !Array.isArray(record.provenance.externalInfluences) ||
      !record.provenance.externalInfluences.length
    )
      throw new Error(
        `Reference Library v2 '${id}' needs at least one curated research influence.`,
      );
    for (const sourceUrl of record.provenance.externalInfluences)
      if (!/^https:\/\//u.test(String(sourceUrl || "")))
        throw new Error(
          `Reference Library v2 '${id}' has an invalid research influence URL.`,
        );

    const structuralSignature = [
      clean(record.navigation, 100),
      clean(record.heroGeometry, 100),
      clean(record.servicePresentation, 100),
      clean(record.typographyCategory, 100),
      clean(record.sectionRhythm, 180),
      clean(record.imageStrategy, 100),
    ].join("|");
    if (structuralSignatures.has(structuralSignature))
      throw new Error(
        `Reference Library v2 '${id}' duplicates another reference's structural signature.`,
      );
    structuralSignatures.add(structuralSignature);

    const canonical = structuredClone(record.canonicalReferenceDna || {});
    if (canonical.canonical !== true)
      throw new Error(
        `Reference Library v2 '${id}' canonicalReferenceDna must set canonical: true.`,
      );
    if (clean(canonical.familyId, 80) !== clean(record.familyId, 80))
      throw new Error(
        `Reference Library v2 '${id}' canonical familyId must match the record familyId.`,
      );
    canonical.source = clean(record.source, 120);
    canonical.sourceUrl = clean(record.sourceUrl, 500);
    canonical.rights = "owned";
    canonical.complete = true;
    canonical.incompleteReasons = [];
    canonical.analyzedFromEvidence = true;
    validateReferenceDna(canonical, { requireEvidence: false });
    if (!canonical.measurements || typeof canonical.measurements !== "object")
      throw new Error(
        `Reference Library v2 '${id}' needs canonical measurements.`,
      );
    for (const key of [
      "headlineWidthRatio",
      "headlineHeightRatio",
      "heroImageOccupancyRatio",
      "contentColumnWidthRatio",
      "navTopRatio",
      "navSideInsetRatio",
      "ctaTopRatio",
    ]) {
      const value = canonical.measurements[key];
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < 0 ||
        value > 1
      )
        throw new Error(
          `Reference Library v2 '${id}' has an invalid canonical measurement ${key}.`,
        );
    }

    return {
      ...record,
      id,
      screenshotPath,
      mobileScreenshotPath,
      canonicalReferenceDna: record.canonicalReferenceDna,
    };
  });

  const homeServiceCoverage = records.filter((record) =>
    record.industries.includes("home-services"),
  );
  if (homeServiceCoverage.length < 8)
    throw new Error(
      `Reference Library v2 needs at least eight home-services references; found ${homeServiceCoverage.length}.`,
    );

  return {
    version: Number(raw.version || 2),
    updatedAt: clean(raw.updatedAt, 40),
    source: clean(raw.source, 120) || "LaunchLoom Reference Library v2",
    policy: raw.policy && typeof raw.policy === "object" ? raw.policy : {},
    calibration:
      raw.calibration && typeof raw.calibration === "object"
        ? raw.calibration
        : {},
    researchSources:
      raw.researchSources && typeof raw.researchSources === "object"
        ? raw.researchSources
        : {},
    records,
  };
}

export async function loadReferenceLibraryV2(filePath, options = {}) {
  const raw = JSON.parse(await fs.promises.readFile(filePath, "utf8"));
  return normalizeReferenceLibraryV2(raw, options);
}
