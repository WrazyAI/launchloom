import fs from "node:fs";
import path from "node:path";

const RIGHTS = new Set(["reference-only", "licensed", "owned"]);

function clean(value, limit = 500) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(/[—–]/gu, "-")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, limit);
}

function cleanList(value, limit = 16) {
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

function normalizeRecord(record, index, repositoryRoot) {
  for (const field of [
    "id",
    "name",
    "source",
    "sourceUrl",
    "rights",
    "industries",
    "moods",
    "navigation",
    "heroGeometry",
    "servicePresentation",
    "sectionRhythm",
    "typographyCategory",
    "imageStrategy",
    "motionOpportunities",
    "screenshotPath",
  ]) {
    if (record?.[field] === undefined)
      throw new Error(`A1 reference ${index + 1} is missing ${field}.`);
  }
  const rights = clean(record.rights, 30);
  if (!RIGHTS.has(rights))
    throw new Error(`A1 reference '${record.id}' has invalid rights.`);
  const screenshotPath = clean(record.screenshotPath, 400);
  const absoluteScreenshotPath = path.resolve(repositoryRoot, screenshotPath);
  if (!fs.existsSync(absoluteScreenshotPath))
    throw new Error(`A1 reference '${record.id}' is missing its local screenshot: ${screenshotPath}.`);
  return {
    id: clean(record.id, 100),
    name: clean(record.name, 160),
    source: clean(record.source, 100),
    sourceUrl: clean(record.sourceUrl, 500),
    rights,
    industries: cleanList(record.industries),
    moods: cleanList(record.moods),
    navigation: clean(record.navigation, 120),
    heroGeometry: clean(record.heroGeometry, 120),
    servicePresentation: clean(record.servicePresentation, 120),
    sectionRhythm: clean(record.sectionRhythm, 120),
    typographyCategory: clean(record.typographyCategory, 120),
    imageStrategy: clean(record.imageStrategy, 120),
    motionOpportunities: cleanList(record.motionOpportunities, 8),
    familyId: clean(record.familyId, 100),
    mobileBehavior: clean(record.mobileBehavior, 260),
    prohibitedPatterns: cleanList(record.prohibitedPatterns, 16),
    screenshotPath,
    referenceName: clean(record.referenceName, 180),
    referenceNotes: clean(record.referenceNotes, 1400),
    notes: clean(record.notes, 500),
    evidenceKind: clean(record.evidenceKind, 50) || "primary-reference",
    measuredDesignTokens: clone(record.measuredDesignTokens),
    sourceStyles: cleanList(record.sourceStyles, 20),
    sourceFonts: cleanList(record.sourceFonts, 12),
  };
}

export function normalizeA1ReferenceLibrary(raw, { repositoryRoot = process.cwd() } = {}) {
  if (!raw || !Array.isArray(raw.records))
    throw new Error("A1 reference library must contain a records array.");
  const records = raw.records.map((record, index) =>
    normalizeRecord(record, index, repositoryRoot),
  );
  if (new Set(records.map((record) => record.id)).size !== records.length)
    throw new Error("A1 reference library contains duplicate IDs.");
  return {
    version: Number(raw.version || 1),
    source: clean(raw.source, 100) || "A1 Gallery",
    capturedAt: clean(raw.capturedAt, 40),
    calibration: clone(raw.calibration),
    records,
  };
}

export function mergeInspirationRegistries(base, supplemental) {
  if (!base || !Array.isArray(base.records))
    throw new Error("Base inspiration registry must contain records.");
  const existing = new Set(base.records.map((record) => record.id));
  const records = [...base.records];
  for (const record of supplemental.records) {
    if (!existing.has(record.id)) {
      records.push(record);
      existing.add(record.id);
    }
  }
  return {
    ...base,
    version: Math.max(Number(base.version || 1), Number(supplemental.version || 1)),
    updatedAt: [base.updatedAt, supplemental.updatedAt, supplemental.capturedAt]
      .filter(Boolean)
      .sort()
      .at(-1),
    records,
  };
}

export async function loadA1ReferenceLibrary(filePath, options = {}) {
  const raw = JSON.parse(await fs.promises.readFile(filePath, "utf8"));
  return normalizeA1ReferenceLibrary(raw, options);
}
