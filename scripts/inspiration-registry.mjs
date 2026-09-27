import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { buildRouteContract, familyForRoute } from "./creative-compiler.mjs";
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
  ["auto-repair", "auto-repair-shop", "auto-mechanic", "mechanic", "mechanic-shop", "garage", "independent-garage", "local-auto-repair", "independent-auto-service", "vehicle-diagnostics", "vehicle-servicing", "vehicle-maintenance", "brake-service", "car-repair", "automotive-repair"],
  ["hvac", "hvac-contractor", "heating-and-cooling", "heating-cooling", "heating-and-cooling-contractor", "air-conditioning", "air-conditioning-and-heating", "heating-contractor", "cooling-contractor", "furnace-repair", "ac-repair"],
  ["roofing", "roofer", "roofers", "roofing-contractor", "roofing-contractors", "commercial-roofing", "residential-roofing", "roof-repair", "roof-replacement"],
  ["painting", "painter", "painters", "painting-contractor", "painting-contractors", "residential-painting", "commercial-painting", "residential-painter", "commercial-painter", "house-painter", "house-painting"],
  ["home-services", "local-trades", "home-repair", "handyman", "plumbing", "electrical", "landscaping", "garage-door", "garage-door-repair", "construction", "civil-engineering", "groundworks", "storm-repair", "contractor"],
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
  ["automotive", "auto", "auto-services", "auto-dealership", "used-car-dealer", "vehicle-sales"],
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
    ...(Array.isArray(record?.referenceTags?.business)
      ? record.referenceTags.business
      : []),
  ].map(normalizeBusinessKind);
  return recordKinds.some((kind) => compatibleKinds.includes(kind));
}

function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
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
        ? record.referenceTags
        : undefined,
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
  if (!matchingNiches.length)
    throw new Error(
      `The production library has 0 eligible dossier(s) matched to '${industry}'. The requested business kind is not configured in the canonical library.`,
    );
  const allNicheIds = collection.niches.flatMap((niche) => {
    if (!Array.isArray(niche.referenceIds) || niche.referenceIds.length !== 6)
      throw new Error(
        `Canonical niche '${niche.id}' must list exactly six reference dossiers.`,
      );
    return niche.referenceIds;
  });
  if (new Set(allNicheIds).size !== allNicheIds.length)
    throw new Error("The canonical reference collection contains duplicate dossier IDs.");
  const referenceIds = matchingNiches.flatMap((niche) => niche.referenceIds);
  return new Set(referenceIds);
}

function signatureFor(record) {
  return STRUCTURAL_FIELDS.map((field) => record[field])
    .concat(record.sectionRhythm, record.imageStrategy)
    .join("|");
}

function scoreRecord(record, request) {
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
    ...Object.values(record.referenceTags || {}).flat(),
  ]);
  let score = businessKindMatches(record, request.industry) ? 40 : 0;
  if (record.industries.includes("all")) score += 6;
  for (const term of terms)
    if (
      [...searchable].some(
        (value) => value.includes(term) || term.includes(value),
      )
    )
      score += 8;
  return score;
}

function structurallyIndependent(record, selected) {
  return STRUCTURAL_FIELDS.every(
    (field) => !selected.some((item) => item[field] === record[field]),
  );
}

function independentCombinations(ranked, count = 3) {
  const combinations = [];
  function addFrom(start, selected) {
    if (selected.length === count) {
      combinations.push(selected);
      return;
    }
    for (let index = start; index < ranked.length; index += 1) {
      const candidate = ranked[index];
      if (
        structurallyIndependent(
          candidate.record,
          selected.map((item) => item.record),
        )
      )
        addFrom(index + 1, [...selected, candidate]);
    }
  }
  addFrom(0, []);
  return combinations;
}

function exposureFor(record, referenceExposure) {
  const value = Number(referenceExposure?.[record.id] || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function rendererFamilyForRecord(record) {
  return familyForRoute({
    ...record,
    motionOpportunity: record.motionOpportunities[0] || "restrained-native-motion",
  });
}

function rendererFamilyCount(items) {
  return new Set(items.map((item) => item.rendererFamilyId)).size;
}

function diversityWeightedRing(scored) {
  const count = scored.length;
  if (count < 2 || count > 20) return scored;
  const extraSlots = count < 13 ? 1 : 24 - count;
  const preferred = [...scored]
    .sort((left, right) =>
      right.rendererFamilyCount - left.rendererFamilyCount ||
      right.styleScore - left.styleScore ||
      left.key.localeCompare(right.key),
    )
    .slice(0, extraSlots);
  const averageFamilyCount = scored.reduce(
    (total, item) => total + item.rendererFamilyCount, 0,
  ) / count;
  const preferredAverage = preferred.reduce(
    (total, item) => total + item.rendererFamilyCount, 0,
  ) / preferred.length;
  if (preferredAverage <= averageFamilyCount) return scored;

  // With a smaller exposure-minimal pool, freshness history prevents a
  // repeated exact trio; one extra slot provides a bounded family nudge.
  if (count < 13) return [...scored, preferred[0]];

  const preferredKeys = new Set(preferred.map((item) => item.key));
  const remaining = scored.filter((item) => !preferredKeys.has(item.key));
  // Each preferred trio appears twice, exactly 12 slots apart on the
  // 24-slot ring. Fixed-history windows of 12 attempts stay distinct.
  return [
    ...preferred,
    ...remaining.slice(0, 12 - extraSlots),
    ...preferred,
    ...remaining.slice(12 - extraSlots),
  ];
}

function referenceSetKey(ids) {
  return cleanList(ids, 6).sort().join("|");
}

function rotationOrdinal(request) {
  const attemptId = cleanText(request.generationId || request.seed, 180);
  // GitHub run IDs advance across launches; the attempt suffix advances on a rerun.
  const workflowAttempt = attemptId.match(/^(\d+)-attempt-(\d+)$/u);
  if (workflowAttempt)
    return BigInt(workflowAttempt[1]) + BigInt(workflowAttempt[2]);
  const numberedAttempt = attemptId.match(/(?:^|[-_])(\d+)$/u);
  if (numberedAttempt) return BigInt(numberedAttempt[1]);
  return BigInt(`0x${digest(attemptId).slice(0, 16)}`);
}

function chooseCombination(combinations, request) {
  const exposure = request.referenceExposure || {};
  const recentReferenceSets = new Set(
    (Array.isArray(request.recentReferenceSets) ? request.recentReferenceSets : [])
      .map(referenceSetKey)
      .filter(Boolean),
  );
  const freshCombinations = combinations.filter(
    (items) => !recentReferenceSets.has(referenceSetKey(items.map((item) => item.record.id))),
  );
  const eligibleCombinations = freshCombinations.length
    ? freshCombinations
    : combinations;
  const scored = eligibleCombinations.map((items) => ({
      items,
      exposureScore: items.reduce(
        (total, item) => total + exposureFor(item.record, exposure),
        0,
      ),
      styleScore: items.reduce((total, item) => total + item.score, 0),
      rendererFamilyCount: rendererFamilyCount(items),
      key: referenceSetKey(items.map((item) => item.record.id)),
    }));
  const minimumExposure = Math.min(...scored.map((item) => item.exposureScore));
  const exposureBalanced = scored.filter((item) => item.exposureScore === minimumExposure);
  // Style orders equally exposed options; the weighted ring gives varied
  // renderer trios more turns while retaining every feasible combination.
  exposureBalanced.sort(
    (left, right) =>
      right.styleScore - left.styleScore ||
      left.key.localeCompare(right.key),
  );
  const ring = diversityWeightedRing(exposureBalanced);
  return ring[
    Number(rotationOrdinal(request) % BigInt(ring.length))
  ];
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
    notes: record.notes || undefined,
    evidenceKind: record.evidenceKind || undefined,
  };
}

function rankedRecords(registry, request, recentReferenceIds, recentRouteSignatures, mode) {
  return registry.records
    .filter(
      (record) =>
        (!mode.excludeReferences ||
          ![record.id, ...record.aliases].some((id) =>
            recentReferenceIds.has(id.toLowerCase()),
          )) &&
        (!mode.excludeRouteSignatures ||
          !recentRouteSignatures.has(signatureFor(record))),
    )
    .map((record) => ({
      record,
      score: scoreRecord(record, request),
      rendererFamilyId: rendererFamilyForRecord(record),
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.record.id.localeCompare(right.record.id),
    );
}

export function buildInspirationPack(
  request,
  rawRegistry,
  { repositoryRoot = process.cwd(), requireDossiers = false } = {},
) {
  let registry = normalizeRegistry(rawRegistry);
  const seed = cleanText(request?.seed, 180);
  const industry = cleanText(request?.industry, 80).toLowerCase();
  if (!seed || !industry)
    throw new Error("Inspiration selection requires a seed and industry.");
  const canonicalReferenceIds = referenceIdsForBusinessKind(repositoryRoot, industry);
  registry = {
    ...registry,
    records: registry.records.filter((record) =>
      canonicalReferenceIds.has(record.id),
    ),
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
    const productionRecords = registry.records
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
    const businessMatchedRecords = productionRecords.filter((record) =>
      businessKindMatches(record, industry),
    );
    if (businessMatchedRecords.length !== canonicalReferenceIds.size)
      throw new Error(
        `The production library has ${businessMatchedRecords.length} eligible dossier(s) matched to '${industry}', but exactly ${canonicalReferenceIds.size} production-eligible dossiers are required for this niche. Unrelated industries are not used as filler.`,
      );
    registry = { ...registry, records: businessMatchedRecords };
  }
  const recentReferenceIds = new Set(
    cleanList(request.recentReferenceIds, 200),
  );
  const recentRouteSignatures = new Set(
    (Array.isArray(request.recentRouteSignatures)
      ? request.recentRouteSignatures
      : []
    ).map((value) => cleanText(value, 600)),
  );
  const recentReferenceSets = (Array.isArray(request.recentReferenceSets)
    ? request.recentReferenceSets
    : []).map((set) => cleanList(set, 6)).filter((set) => set.length === 3);
  const selectionModes = [
    { id: "fresh", excludeReferences: false, excludeRouteSignatures: false, excludeReferenceSets: true },
    { id: "history-relaxed", excludeReferences: false, excludeRouteSignatures: false, excludeReferenceSets: false },
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
    const allCombinations = independentCombinations(ranked);
    const recentSetKeys = new Set(recentReferenceSets.map(referenceSetKey));
    const freshCombinations = mode.excludeReferenceSets
      ? allCombinations.filter((combination) =>
          !recentSetKeys.has(referenceSetKey(combination.map((item) => item.record.id))),
        )
      : allCombinations;
    const combinations = freshCombinations.length ? freshCombinations : allCombinations;
    if (combinations.length) {
      const maximumFeasibleRendererFamilyCount = Math.max(
        ...combinations.map(rendererFamilyCount),
      );
      const chosen = chooseCombination(combinations, {
        ...request,
        recentReferenceSets: [],
        seed,
        industry,
      });
      selection = {
        mode: freshCombinations.length ? mode : selectionModes.at(-1),
        ranked,
        anchors: chosen.items.map((item) => item.record),
        feasibleCombinationCount: combinations.length,
        maximumFeasibleRendererFamilyCount,
        exposureScore: chosen.exposureScore,
      };
      break;
    }
  }
  if (!selection)
    throw new Error(
      "The inspiration registry cannot supply three structurally independent creative routes, even after relaxing recent-history exclusions.",
    );
  const { anchors } = selection;

  const routes = anchors.map((anchor, index) => {
    // One route gets one authoritative visual capsule. Supporting references
    // must never be mixed into the authoring evidence where they can be
    // averaged into a generic composition.
    const evidence = [evidenceFor(anchor)];
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
      referenceFamilyId:
        anchor.referenceFamilyId || anchor.familyId || undefined,
      referenceName: anchor.referenceName || anchor.name,
      referenceNotes: anchor.referenceNotes || anchor.notes,
      mobileBehavior: anchor.mobileBehavior || undefined,
      prohibitedPatterns: anchor.prohibitedPatterns || [],
      referenceIds: evidence.map((item) => item.id),
      evidence,
      signature: signatureFor(anchor),
    };
    const dossier = dossiersById.get(anchor.id);
    const referenceDna = validateReferenceDna(
      dossier?.referenceDna || buildReferenceDna(route),
      {
      requireEvidence: true,
      },
    );
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
    generationId: cleanText(request.generationId, 180) || undefined,
    industry,
    styleTerms: cleanList(request.styleTerms, 20),
    recentReferenceIds: [...recentReferenceIds].sort(),
    recentRouteSignatures: [...recentRouteSignatures].sort(),
    recentReferenceSets: recentReferenceSets.map((set) => set.slice().sort()),
    referenceExposure: Object.fromEntries(
      Object.entries(request.referenceExposure || {})
        .map(([id]) => [id, exposureFor({ id }, request.referenceExposure)])
        .filter(([, value]) => value > 0)
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
    freshnessFallback: selection.mode.id,
  };
  const eligibleDossierIds = new Set(registry.records.map((record) => record.id));
  return {
    version: 2,
    referenceEvidenceRequired: true,
    referenceDossiersRequired: Boolean(requireDossiers),
    registryVersion: registry.version,
    registryUpdatedAt: registry.updatedAt || undefined,
    registryDigest: digest(JSON.stringify({
      registry,
      dossierDigests: [...dossiersById.entries()]
        .filter(([id]) => eligibleDossierIds.has(id))
        .map(([id, dossier]) => [id, dossier.digest])
        .sort(([left], [right]) => String(left).localeCompare(String(right))),
    })),
    selectionKey: digest(JSON.stringify(requestSummary)),
    selectionReceipt: {
      policy: "attempt-rotated-exposure-balanced-style-ranked-v3",
      businessKind: industry,
      seed,
      eligibleReferenceIds: registry.records.map((record) => record.id).sort(),
      feasibleCombinationCount: selection.feasibleCombinationCount,
      selectedReferenceIds: anchors.map((record) => record.id),
      selectedRendererFamilyIds: routes.map((route) => route.familyId),
      selectedRendererFamilyCount: new Set(routes.map((route) => route.familyId)).size,
      multiFamilyCombinationAvailable: selection.maximumFeasibleRendererFamilyCount >= 2,
      maximumFeasibleRendererFamilyCount: selection.maximumFeasibleRendererFamilyCount,
      selectedExposureScore: selection.exposureScore,
      historyMode: selection.mode.id,
    },
    request: requestSummary,
    routes,
  };
}
