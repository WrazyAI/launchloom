import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { buildRouteContract } from "./creative-compiler.mjs";
import {
  buildReferenceDna,
  validateReferenceDna,
} from "./reference-dna.mjs";
import {
  assertReferenceDossierMatchesRecord,
  loadReferenceDossier,
} from "./reference-dossier.mjs";

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
const RIGHTS = new Set(["reference-only", "licensed", "owned", "permission-cleared"]);
const GENERIC_BUSINESS_KINDS = new Set([
  "all",
  "general",
  "local-business",
  "local-service",
  "local-services",
  "small-business",
]);
const STRUCTURAL_FIELDS = [
  "navigation",
  "heroGeometry",
  "servicePresentation",
  "typographyCategory",
];
const BUSINESS_KIND_GROUPS = [
  ["home-services", "local-trades", "home-repair", "handyman", "roofing", "plumbing", "electrical", "landscaping", "garage-door", "garage-door-repair", "construction", "civil-engineering", "groundworks", "storm-repair", "contractor"],
  ["dental", "dentist", "dentistry", "dental-clinic", "dental-practice", "oral-health", "preventive-and-restorative-care"],
  ["home-care", "homecare", "home-care-provider", "care-at-home", "home-support", "care", "caregiving", "elder-care", "senior-care", "elder-companionship", "companionship", "non-medical-home-support", "family-support", "specialized-homecare", "private-duty-care", "home-health-services", "nursing-and-care-coordination", "aging-in-place"],
  ["fitness", "gym", "strength-training", "personal-training", "sports-performance", "fitness-studio", "sports-club", "pilates", "yoga"],
  ["restaurant", "dining", "food", "food-and-drink", "indian-restaurant", "greek-restaurant", "mediterranean-restaurant", "fine-dining", "multi-location-dining", "catering", "cafe", "bakery"],
  ["hospitality", "hotel", "boutique-hotel", "resort", "motel", "lodging", "inn", "guesthouse", "destination-stay"],
  ["architecture", "architectural-design", "architect", "interior-design", "residential-architecture", "luxury-home-design", "design-studio", "hospitality-design", "restaurant-interiors"],
  ["legal-services", "legal", "law", "law-firm", "lawyer", "attorney", "solicitor", "legal-practice"],
  ["accounting", "accountant", "accountancy", "tax-accounting", "bookkeeping"],
  ["jewelry", "jewellery", "jewelery", "jeweler", "jeweller", "fine-jewelry", "fine-jewellery", "independent-jewelry", "designer-jewelry", "luxury-retail", "sculptural-accessories", "wearable-product"],
  ["beauty", "beauty-salon", "salon", "hair-salon", "hair-stylist", "hair-colorist", "cosmetology", "independent-beauty", "barber", "barbershop", "mens-grooming", "medical-spa", "med-spa", "clinical-beauty", "cosmetic-treatment", "spa", "skincare", "aesthetics", "aesthetic-clinic", "cosmetics"],
  ["automotive", "auto", "auto-services", "auto-dealership", "used-car-dealer", "vehicle-sales", "auto-repair", "local-auto-repair", "independent-auto-service", "mechanic-shop", "vehicle-diagnostics", "brake-service", "car-repair", "mechanic"],
  ["events", "event-venue", "wedding-venue", "wedding", "event-services"],
  ["real-estate", "realtor", "real-estate-agent", "property", "home-sales", "property-management"],
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

function normalizeBusinessKind(value) {
  return cleanText(value, 120)
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
}

export function businessKindMatches(record, industry) {
  const target = normalizeBusinessKind(industry);
  if (!target || GENERIC_BUSINESS_KINDS.has(target)) return false;
  const compatibleKinds = BUSINESS_KIND_GROUPS.find((group) => group.includes(target)) || [target];
  const recordKinds = [
    ...(Array.isArray(record?.industries) ? record.industries : []),
    ...Object.values(record?.referenceTags || {}).flat(),
  ].map(normalizeBusinessKind);
  return recordKinds.some((kind) => compatibleKinds.includes(kind));
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
    tags: cleanList(record.tags, 24),
    sourceCategory: cleanText(record.sourceCategory, 80),
    evidenceTier: cleanText(record.evidenceTier, 40),
    navigation: cleanText(record.navigation, 80),
    heroGeometry: cleanText(record.heroGeometry, 80),
    servicePresentation: cleanText(record.servicePresentation, 80),
    sectionRhythm: cleanText(record.sectionRhythm, 80),
    typographyCategory: cleanText(record.typographyCategory, 80),
    imageStrategy: cleanText(record.imageStrategy, 80),
    motionOpportunities: cleanList(record.motionOpportunities, 8),
    familyId: cleanText(record.familyId, 60),
    referenceFamilyId: cleanText(record.referenceFamilyId, 80),
    aliases: cleanList(record.aliases, 12),
    dossierPath: cleanText(record.dossierPath, 400),
    mobileBehavior: cleanText(record.mobileBehavior, 180),
    prohibitedPatterns: cleanList(record.prohibitedPatterns, 12),
    screenshotPath: cleanText(record.screenshotPath, 300),
    mobileScreenshotPath: cleanText(record.mobileScreenshotPath, 300),
    referenceName: cleanText(record.referenceName, 180),
    referenceNotes: cleanText(record.referenceNotes, 900),
    sourceUrl: cleanText(record.sourceUrl, 500),
    notes: cleanText(record.notes, 320),
    evidenceKind: cleanText(record.evidenceKind, 40) || (rights === "owned" ? "owned-prototype" : "primary-reference"),
    measuredDesignTokens:
      record.measuredDesignTokens && typeof record.measuredDesignTokens === "object"
        ? record.measuredDesignTokens
        : undefined,
    sourceStyles: cleanList(record.sourceStyles, 20),
    sourceFonts: cleanList(record.sourceFonts, 12),
    referenceTags:
      record.referenceTags && typeof record.referenceTags === "object"
        ? structuredClone(record.referenceTags)
        : undefined,
    designTemplate:
      record.designTemplate && typeof record.designTemplate === "object"
        ? structuredClone(record.designTemplate)
        : undefined,
    canonicalReferenceDna:
      record.canonicalReferenceDna &&
      typeof record.canonicalReferenceDna === "object"
        ? structuredClone(record.canonicalReferenceDna)
        : undefined,
    provenance:
      record.provenance && typeof record.provenance === "object"
        ? structuredClone(record.provenance)
        : undefined,
    calibrationProfile: cleanText(record.calibrationProfile, 40),
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

function referenceIdsForBusinessKind(repositoryRoot, industry) {
  const collectionPath = path.join(
    repositoryRoot,
    "data/reference-library/core-collection.json",
  );
  let collection;
  try {
    collection = JSON.parse(fs.readFileSync(collectionPath, "utf8"));
  } catch (error) {
    throw new Error(
      `Could not load the canonical reference collection at ${collectionPath}: ${error.message}`,
    );
  }
  if (!Array.isArray(collection?.niches) || !collection.niches.length)
    throw new Error("The canonical reference collection must define at least one niche.");

  const target = normalizeBusinessKind(industry);
  if (GENERIC_BUSINESS_KINDS.has(target))
    throw new Error(
      `A specific business kind is required to select production references; '${industry}' is too broad.`,
    );
  const exactNiches = collection.niches.filter((niche) =>
    [niche.id, niche.businessKind].map(normalizeBusinessKind).includes(target),
  );
  const matchingNiches = exactNiches.length
    ? exactNiches
    : collection.niches.filter((niche) =>
        businessKindMatches({ industries: [niche.businessKind] }, industry),
      );
  const referenceIds = matchingNiches.flatMap((niche) => {
    if (!Array.isArray(niche.referenceIds) || niche.referenceIds.length < 3)
      throw new Error(
        `Canonical niche '${niche.id}' must list at least three reference dossiers.`,
      );
    return niche.referenceIds;
  });
  if (new Set(referenceIds).size !== referenceIds.length)
    throw new Error("The canonical reference collection contains duplicate dossier IDs.");
  return new Set(referenceIds);
}

function signatureFor(record) {
  return STRUCTURAL_FIELDS.map((field) => record[field])
    .concat(record.sectionRhythm, record.imageStrategy)
    .join("|");
}

function normalizedPhrase(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc]/gu, "'")
    .replace(/\b(?:don't|dont)\b/gu, "do not")
    .replace(/\b(?:doesn't|doesnt)\b/gu, "does not")
    .replace(/\b(?:shouldn't|shouldnt)\b/gu, "should not")
    .replace(/[^a-z0-9]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function normalizedRequestClause(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc]/gu, "'")
    .replace(/\b(?:don't|dont)\b/gu, "do not")
    .replace(/\b(?:doesn't|doesnt)\b/gu, "does not")
    .replace(/\b(?:shouldn't|shouldnt)\b/gu, "should not")
    .replace(/[^a-z0-9,]+/gu, " ")
    .replace(/\s*,\s*/gu, ", ")
    .replace(/\s+/gu, " ")
    .trim();
}

function affirmativeAliasMention(source, alias) {
  let offset = 0;
  while (offset < source.length) {
    const index = source.indexOf(alias, offset);
    if (index < 0) return false;
    let before = source.slice(Math.max(0, index - 128), index).trim();
    const lastComma = before.lastIndexOf(",");
    if (lastComma >= 0) {
      const commaTail = before.slice(lastComma + 1).trim();
      if (
        /^(?:(?:and|but)\s+)?(?:use|apply|follow|choose|adopt|keep|pick|select|try|prefer|build|create|make)\b/u.test(
          commaTail,
        )
      )
        before = commaTail;
    }
    const contrastMatches = [
      ...before.matchAll(
        /\b(?:but|however|yet|instead(?!\s+of\b)|rather(?!\s+than\b)|and(?=\s+(?:use|apply|follow|choose|adopt|keep|pick|select|try|prefer|build|create|make)\b))\b/gu,
      ),
    ];
    const lastContrast = contrastMatches.at(-1);
    if (lastContrast)
      before = before.slice(
        Number(lastContrast.index || 0) + lastContrast[0].length,
      ).trim();
    const negationContext = before.replace(/,/gu, " ");
    const negated =
      /(?:\bdo not|\bdoes not|\bshould not|\bnever|\bavoid|\bexclude|\bwithout|\breject|\bskip|\bnot|\bno|\brather than|\binstead of)(?:\s+\w+){0,6}\s*$/u.test(
        negationContext,
      );
    if (!negated) return true;
    offset = index + alias.length;
  }
  return false;
}

function explicitlyRequested(record, request) {
  const clauses = String(request.styleText || "")
    .split(/[.;!?\n]+/u)
    .map(normalizedRequestClause)
    .filter(Boolean);
  if (!clauses.length) return false;
  const aliases = [
    ...new Set(
      [
        record.id,
        record.name,
        record.referenceName,
        record.familyId,
      ]
        .map(normalizedPhrase)
        .filter((value) => value.length >= 5),
    ),
  ];
  return aliases.some((alias) =>
    clauses.some((clause) => affirmativeAliasMention(clause, alias)),
  );
}

function scoreRecord(record, request) {
  const industry = cleanText(request.industry, 80).toLowerCase();
  const terms = [
    ...new Set(
      cleanList(request.styleTerms, 20)
        .flatMap((term) => normalizedPhrase(term).split(" "))
        .filter(Boolean),
    ),
  ];
  const searchable = [
    record.id,
    record.name,
    record.referenceName,
    record.familyId,
    ...record.industries,
    ...record.moods,
    ...record.tags,
    ...record.sourceStyles,
    record.navigation,
    record.heroGeometry,
    record.servicePresentation,
    record.sectionRhythm,
    record.typographyCategory,
    record.imageStrategy,
    ...record.motionOpportunities,
  ]
    .map(normalizedPhrase)
    .filter(Boolean);
  let score = record.industries.includes(industry) ? 40 : 0;
  if (record.industries.includes("all")) score += 6;
  if (explicitlyRequested(record, request)) score += 120;
  for (const term of terms)
    if (
      searchable.some((value) => {
        const tokens = value.split(" ");
        return tokens.includes(term) || (term.length >= 5 && value.includes(term));
      })
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
    referenceFamilyId: record.referenceFamilyId || record.familyId || undefined,
    mobileBehavior: record.mobileBehavior || undefined,
    prohibitedPatterns: record.prohibitedPatterns?.length
      ? record.prohibitedPatterns
      : undefined,
    measuredDesignTokens: record.measuredDesignTokens,
    sourceStyles: record.sourceStyles?.length ? record.sourceStyles : undefined,
    sourceFonts: record.sourceFonts?.length ? record.sourceFonts : undefined,
    tags: record.tags?.length ? record.tags : undefined,
    sourceCategory: record.sourceCategory || undefined,
    evidenceTier: record.evidenceTier || undefined,
    designTemplate: record.designTemplate,
    canonicalReferenceDna: record.canonicalReferenceDna,
    provenance: record.provenance,
    calibrationProfile: record.calibrationProfile || undefined,
    notes: record.notes || undefined,
    evidenceKind: record.evidenceKind || undefined,
  };
}

function rankedRecords(
  registry,
  request,
  recentReferenceIds,
  recentFamilyIds,
  recentRouteSignatures,
  mode,
) {
  return registry.records
    .filter((record) => {
      const explicit = explicitlyRequested(record, request);
      const familyId = cleanText(
        record.familyId || buildRouteContract(record).familyId,
        80,
      ).toLowerCase();
      return (
        (!mode.excludeReferences ||
          !recentReferenceIds.has(record.id.toLowerCase()) ||
          explicit) &&
        (!mode.excludeFamilies ||
          !recentFamilyIds.has(familyId) ||
          explicit) &&
        (!mode.excludeRouteSignatures ||
          !recentRouteSignatures.has(signatureFor(record)) ||
          explicit)
      );
    })
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

export function buildInspirationPack(
  request,
  rawRegistry,
  { repositoryRoot = process.cwd(), requireDossiers = true } = {},
) {
  let registry = normalizeRegistry(rawRegistry);
  const seed = cleanText(request?.seed, 180);
  const industry = cleanText(request?.industry, 80).toLowerCase();
  if (!seed || !industry)
    throw new Error("Inspiration selection requires a seed and industry.");
  const canonicalReferenceIds = referenceIdsForBusinessKind(repositoryRoot, industry);
  registry = {
    ...registry,
    records: registry.records.filter((record) => canonicalReferenceIds.has(record.id)),
  };
  const dossiersById = new Map();
  if (requireDossiers) {
    for (const record of registry.records.filter((item) => item.dossierPath)) {
      const dossier = loadReferenceDossier(record.dossierPath, { repositoryRoot });
      if (dossier.id !== record.id)
        throw new Error(`Inspiration record '${record.id}' points to dossier '${dossier.id}'.`);
      if (dossier.familyId !== (record.referenceFamilyId || record.familyId))
        throw new Error(`Inspiration record '${record.id}' and its dossier disagree on familyId.`);
      if (dossier.source.rights !== record.rights)
        throw new Error(`Inspiration record '${record.id}' and its dossier disagree on rights.`);
      assertReferenceDossierMatchesRecord(dossier, record, { repositoryRoot });
      dossiersById.set(record.id, dossier);
    }
    const eligibleRecords = registry.records
      .filter((record) => dossiersById.get(record.id)?.productionEligible === true)
      .map((record) => {
        const tags = dossiersById.get(record.id).tags;
        return {
          ...record,
          industries: [...new Set([...record.industries, ...tags.business])],
          moods: [...new Set([...record.moods, ...tags.style])],
          referenceTags: tags,
        };
      });
    const businessMatchedRecords = eligibleRecords.filter((record) =>
      businessKindMatches(record, industry),
    );
    if (businessMatchedRecords.length < 3)
      throw new Error(
        `The production library has ${businessMatchedRecords.length} eligible dossier(s) matched to '${industry}' out of ${eligibleRecords.length} eligible references; three structurally independent business-matched dossiers are required. Unrelated industries are not used as filler.`,
      );
    registry = { ...registry, records: businessMatchedRecords };
  }
  const recentReferenceIds = new Set(
    cleanList(request.recentReferenceIds, 200),
  );
  const recentFamilyIds = new Set(
    cleanList(request.recentFamilyIds, 200),
  );
  const recentRouteSignatures = new Set(
    (Array.isArray(request.recentRouteSignatures)
      ? request.recentRouteSignatures
      : []
    ).map((value) => cleanText(value, 600)),
  );
  const selectionModes = [
    {
      id: "fresh",
      excludeReferences: true,
      excludeFamilies: true,
      excludeRouteSignatures: true,
    },
    {
      id: "route-signatures-relaxed",
      excludeReferences: true,
      excludeFamilies: true,
      excludeRouteSignatures: false,
    },
    {
      id: "families-relaxed",
      excludeReferences: true,
      excludeFamilies: false,
      excludeRouteSignatures: false,
    },
    {
      id: "history-relaxed",
      excludeReferences: false,
      excludeFamilies: false,
      excludeRouteSignatures: false,
    },
  ];
  let selection;
  for (const mode of selectionModes) {
    const ranked = rankedRecords(
      registry,
      { ...request, seed, industry },
      recentReferenceIds,
      recentFamilyIds,
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

  const routes = anchors.map((anchor, index) => {
    // One route gets one authoritative visual capsule. Supporting references
    // must never be mixed into the authoring evidence where they can be
    // averaged into a generic composition.
    const evidence = [evidenceFor(anchor)];
    const dossier = dossiersById.get(anchor.id);
    const rankedAnchor = ranked.find((candidate) => candidate.record.id === anchor.id);
    const route = {
      id: `route-${String(index + 1).padStart(2, "0")}`,
      label: anchor.name,
      referenceName: anchor.referenceName || anchor.name,
      referenceNotes: anchor.referenceNotes || anchor.notes,
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
      referenceFamilyId: anchor.referenceFamilyId || anchor.familyId || undefined,
      mobileBehavior: anchor.mobileBehavior || undefined,
      prohibitedPatterns: anchor.prohibitedPatterns || [],
      tags: anchor.tags || [],
      designTemplate: anchor.designTemplate,
      canonicalReferenceDna: anchor.canonicalReferenceDna,
      referenceCalibration: request.referenceCalibration || undefined,
      calibrationProfile: anchor.calibrationProfile || undefined,
      sourceCategory: anchor.sourceCategory || undefined,
      evidenceTier: anchor.evidenceTier || undefined,
      provenance: anchor.provenance,
      referenceIds: evidence.map((item) => item.id),
      intakeFitScore: Number(rankedAnchor?.score || 0),
      explicitReferenceMatch: explicitlyRequested(anchor, request),
      evidence,
      signature: signatureFor(anchor),
    };
    const referenceDna = validateReferenceDna(dossier?.referenceDna || buildReferenceDna(route), {
      requireEvidence: true,
    });
    const contract = buildRouteContract({ ...route, referenceDna }, index);
    return {
      ...route,
      familyId: contract.familyId,
      mobileBehavior: contract.mobileBehavior,
      prohibitedPatterns: contract.prohibitedPatterns,
      referenceDna,
      referenceDossier: dossier
        ? {
            id: dossier.id,
            referenceName: dossier.referenceName,
            familyId: dossier.familyId,
            source: dossier.source,
            path: dossier.path,
            digest: dossier.digest,
            tags: dossier.tags,
            designPrompt: dossier.designPrompt,
          }
        : undefined,
      fingerprint: contract.fingerprint,
    };
  });

  const requestSummary = {
    seed,
    industry,
    styleTerms: cleanList(request.styleTerms, 20),
    styleText: cleanText(request.styleText, 1200),
    explicitReferenceIds: registry.records
      .filter((record) => explicitlyRequested(record, request))
      .map((record) => record.id)
      .sort(),
    recentReferenceIds: [...recentReferenceIds].sort(),
    recentFamilyIds: [...recentFamilyIds].sort(),
    recentRouteSignatures: [...recentRouteSignatures].sort(),
    freshnessFallback: selection.mode.id,
  };
  return {
    version: 2,
    referenceEvidenceRequired: true,
    referenceDossiersRequired: Boolean(requireDossiers),
    registryVersion: registry.version,
    registryUpdatedAt: registry.updatedAt || undefined,
    registryDigest: digest(JSON.stringify({
      registry,
      dossierDigests: [...dossiersById.entries()]
        .map(([id, dossier]) => [id, dossier.digest])
        .sort(([left], [right]) => String(left).localeCompare(String(right))),
    })),
    selectionKey: digest(JSON.stringify(requestSummary)),
    request: requestSummary,
    routes,
  };
}
