import crypto from "node:crypto";
import { buildRouteContract } from "./creative-compiler.mjs";
import {
  buildReferenceDna,
  validateReferenceDna,
} from "./reference-dna.mjs";

const REQUIRED_FIELDS = [
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
];
const RIGHTS = new Set(["reference-only", "licensed", "owned"]);
const STRUCTURAL_FIELDS = [
  "navigation",
  "heroGeometry",
  "servicePresentation",
  "typographyCategory",
];

function cleanText(value, limit = 180) {
  return String(value || "")
    .replace(/—/gu, "-")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, limit);
}

function cleanList(value, limit = 12) {
  return [
    ...new Set(
      (Array.isArray(value) ? value : [])
        .map((item) => cleanText(item, 80).toLowerCase())
        .filter(Boolean),
    ),
  ].slice(0, limit);
}

function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stableFraction(value) {
  return Number.parseInt(digest(value).slice(0, 8), 16) / 0xffffffff;
}

function normalizeRecord(record, index) {
  for (const field of REQUIRED_FIELDS)
    if (record?.[field] === undefined)
      throw new Error(`Inspiration record ${index + 1} is missing ${field}.`);
  const rights = cleanText(record.rights, 30);
  if (!RIGHTS.has(rights))
    throw new Error(`Inspiration record '${record.id}' has invalid rights.`);
  const normalized = {
    id: cleanText(record.id, 80),
    name: cleanText(record.name, 120),
    source: cleanText(record.source, 80),
    sourceUrl: cleanText(record.sourceUrl, 500),
    rights,
    industries: cleanList(record.industries),
    moods: cleanList(record.moods),
    navigation: cleanText(record.navigation, 80),
    heroGeometry: cleanText(record.heroGeometry, 80),
    servicePresentation: cleanText(record.servicePresentation, 80),
    sectionRhythm: cleanText(record.sectionRhythm, 80),
    typographyCategory: cleanText(record.typographyCategory, 80),
    imageStrategy: cleanText(record.imageStrategy, 80),
    motionOpportunities: cleanList(record.motionOpportunities, 8),
    familyId: cleanText(record.familyId, 60),
    mobileBehavior: cleanText(record.mobileBehavior, 180),
    prohibitedPatterns: cleanList(record.prohibitedPatterns, 12),
    screenshotPath: cleanText(record.screenshotPath, 300),
    mobileScreenshotPath: cleanText(record.mobileScreenshotPath, 300),
    referenceName: cleanText(record.referenceName, 180),
    referenceNotes: cleanText(record.referenceNotes, 900),
    sourceUrl: cleanText(record.sourceUrl, 500),
    notes: cleanText(record.notes, 320),
  };
  if (!normalized.id || !normalized.sourceUrl || !normalized.industries.length)
    throw new Error(`Inspiration record ${index + 1} is incomplete.`);
  return normalized;
}

function normalizeRegistry(registry) {
  if (!registry || !Array.isArray(registry.records))
    throw new Error("Inspiration registry must contain a records array.");
  const records = registry.records.map(normalizeRecord);
  if (new Set(records.map((record) => record.id)).size !== records.length)
    throw new Error("Inspiration registry contains duplicate record IDs.");
  return {
    version: Number(registry.version || 1),
    updatedAt: cleanText(registry.updatedAt, 40),
    records,
  };
}

function signatureFor(record) {
  return STRUCTURAL_FIELDS.map((field) => record[field])
    .concat(record.sectionRhythm, record.imageStrategy)
    .join("|");
}

function scoreRecord(record, request) {
  const industry = cleanText(request.industry, 80).toLowerCase();
  const terms = cleanList(request.styleTerms, 20);
  const searchable = new Set([
    ...record.industries,
    ...record.moods,
    record.navigation.toLowerCase(),
    record.heroGeometry.toLowerCase(),
    record.servicePresentation.toLowerCase(),
    record.sectionRhythm.toLowerCase(),
    record.typographyCategory.toLowerCase(),
    record.imageStrategy.toLowerCase(),
    ...record.motionOpportunities,
  ]);
  let score = record.industries.includes(industry) ? 40 : 0;
  if (record.industries.includes("all")) score += 6;
  for (const term of terms)
    if (
      [...searchable].some(
        (value) => value.includes(term) || term.includes(value),
      )
    )
      score += 8;
  return score + stableFraction(`${request.seed}|${record.id}`);
}

function structurallyIndependent(record, selected) {
  const candidateFamily = buildRouteContract(record).familyId;
  return (
    !selected.some((item) => buildRouteContract(item).familyId === candidateFamily) &&
    STRUCTURAL_FIELDS.every(
      (field) => !selected.some((item) => item[field] === record[field]),
    )
  );
}

function evidenceFor(record) {
  return {
    id: record.id,
    name: record.name,
    source: record.source,
    sourceUrl: record.sourceUrl,
    rights: record.rights,
    screenshotPath: record.screenshotPath || undefined,
    mobileScreenshotPath: record.mobileScreenshotPath || undefined,
    referenceName: record.referenceName || record.name,
    referenceNotes: record.referenceNotes || record.notes,
    familyId: record.familyId || undefined,
    mobileBehavior: record.mobileBehavior || undefined,
    prohibitedPatterns: record.prohibitedPatterns?.length
      ? record.prohibitedPatterns
      : undefined,
    notes: record.notes || undefined,
  };
}

function rankedRecords(registry, request, recentReferenceIds, recentRouteSignatures, mode) {
  return registry.records
    .filter(
      (record) =>
        (!mode.excludeReferences ||
          !recentReferenceIds.has(record.id.toLowerCase())) &&
        (!mode.excludeRouteSignatures ||
          !recentRouteSignatures.has(signatureFor(record))),
    )
    .map((record) => ({
      record,
      score: scoreRecord(record, request),
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.record.id.localeCompare(right.record.id),
    );
}

function independentAnchors(ranked) {
  const anchors = [];
  for (const candidate of ranked) {
    if (!structurallyIndependent(candidate.record, anchors)) continue;
    anchors.push(candidate.record);
    if (anchors.length === 3) break;
  }
  return anchors;
}

export function buildInspirationPack(request, rawRegistry) {
  const registry = normalizeRegistry(rawRegistry);
  const seed = cleanText(request?.seed, 180);
  const industry = cleanText(request?.industry, 80).toLowerCase();
  if (!seed || !industry)
    throw new Error("Inspiration selection requires a seed and industry.");
  const recentReferenceIds = new Set(
    cleanList(request.recentReferenceIds, 200),
  );
  const recentRouteSignatures = new Set(
    (Array.isArray(request.recentRouteSignatures)
      ? request.recentRouteSignatures
      : []
    ).map((value) => cleanText(value, 600)),
  );
  const selectionModes = [
    { id: "fresh", excludeReferences: true, excludeRouteSignatures: true },
    {
      id: "route-signatures-relaxed",
      excludeReferences: true,
      excludeRouteSignatures: false,
    },
    { id: "history-relaxed", excludeReferences: false, excludeRouteSignatures: false },
  ];
  let selection;
  for (const mode of selectionModes) {
    const ranked = rankedRecords(
      registry,
      { ...request, seed, industry },
      recentReferenceIds,
      recentRouteSignatures,
      mode,
    );
    const anchors = independentAnchors(ranked);
    if (anchors.length === 3) {
      selection = { mode, ranked, anchors };
      break;
    }
  }
  if (!selection)
    throw new Error(
      "The inspiration registry cannot supply three structurally independent creative routes, even after relaxing recent-history exclusions.",
    );
  const { anchors, ranked } = selection;

  const used = new Set(anchors.map((record) => record.id));
  const routes = anchors.map((anchor, index) => {
    const supporting = ranked.find(
      ({ record }) =>
        !used.has(record.id) &&
        record.source !== anchor.source &&
        record.id !== anchor.id,
    )?.record;
    if (supporting) used.add(supporting.id);
    const evidence = [anchor, supporting].filter(Boolean).map(evidenceFor);
    const route = {
      id: `route-${String(index + 1).padStart(2, "0")}`,
      label: anchor.name,
      intent: `Use ${anchor.heroGeometry} with ${anchor.servicePresentation}, guided by ${anchor.sectionRhythm}.`,
      navigation: anchor.navigation,
      heroGeometry: anchor.heroGeometry,
      servicePresentation: anchor.servicePresentation,
      sectionRhythm: anchor.sectionRhythm,
      typographyCategory: anchor.typographyCategory,
      imageStrategy: anchor.imageStrategy,
      motionOpportunity:
        anchor.motionOpportunities[0] || "restrained-native-motion",
      familyId: anchor.familyId || undefined,
      mobileBehavior: anchor.mobileBehavior || undefined,
      prohibitedPatterns: anchor.prohibitedPatterns || [],
      referenceIds: evidence.map((item) => item.id),
      evidence,
      signature: signatureFor(anchor),
    };
    const referenceDna = validateReferenceDna(buildReferenceDna(route), {
      requireEvidence: true,
    });
    const contract = buildRouteContract({ ...route, referenceDna }, index);
    return {
      ...route,
      familyId: contract.familyId,
      mobileBehavior: contract.mobileBehavior,
      prohibitedPatterns: contract.prohibitedPatterns,
      referenceDna,
      fingerprint: contract.fingerprint,
    };
  });

  const requestSummary = {
    seed,
    industry,
    styleTerms: cleanList(request.styleTerms, 20),
    recentReferenceIds: [...recentReferenceIds].sort(),
    recentRouteSignatures: [...recentRouteSignatures].sort(),
    freshnessFallback: selection.mode.id,
  };
  return {
    version: 2,
    referenceEvidenceRequired: true,
    registryVersion: registry.version,
    registryUpdatedAt: registry.updatedAt || undefined,
    registryDigest: digest(JSON.stringify(registry)),
    selectionKey: digest(JSON.stringify(requestSummary)),
    request: requestSummary,
    routes,
  };
}
