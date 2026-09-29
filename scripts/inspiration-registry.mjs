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
// Hero composition is normalized separately so semantically equivalent
// descriptions cannot masquerade as structurally distinct routes.
const STRUCTURAL_FIELDS = [
  "navigation",
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
    .concat(
      normalizedHeroArchetype(record),
      record.sectionRhythm,
      record.imageStrategy,
    )
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
  return score;
}

function structuralTokenSet(values) {
  return new Set(
    (Array.isArray(values) ? values : [values])
      .flatMap((value) => normalizedPhrase(value).split(" "))
      .filter((token) => token.length >= 4),
  );
}

function tokenSetDistance(left, right) {
  if (!left.size && !right.size) return 0;
  let overlap = 0;
  for (const token of left)
    if (right.has(token)) overlap += 1;
  const union = left.size + right.size - overlap;
  return union ? 1 - overlap / union : 0;
}

function selectionReferenceDna(record) {
  return record.selectionReferenceDna || record.canonicalReferenceDna || {};
}

/**
 * Coarse hero-composition vocabulary. This intentionally collapses prose
 * variants such as "dark photo with a left promise" and "mountain image with
 * overlaid repair copy" into the same image-overlay archetype. The selector
 * can therefore prefer genuinely different first-view mechanics instead of
 * rewarding wording differences in curated descriptions.
 */
export function normalizedHeroArchetype(record) {
  const dna = selectionReferenceDna(record);
  const hero = normalizedPhrase(
    [record?.heroGeometry, dna?.heroGeometry?.mode].filter(Boolean).join(" "),
  );
  const composition = normalizedPhrase(
    (Array.isArray(record?.referenceTags?.composition)
      ? record.referenceTags.composition.slice(0, 2)
      : []
    ).join(" "),
  );
  const text = `${hero} ${composition}`.trim();
  const hasImage =
    /\b(?:image|photo|photograph|portrait|interior|scene|video|film|technician|house|roof|salon|dining|garage|mountain|skyline|equipment)\b/u.test(
      text,
    );

  if (
    /\b(?:form|quote form|enquiry|consultation|zip finder|finder)\b/u.test(text) &&
    /\b(?:split|right|floating|beside|paired|alongside|embedded|integrated|panel|shares)\b/u.test(text)
  )
    return "split-form";
  if (
    /\b(?:contact ribbon|phone and quote ribbon|action ribbon|lower hero edge|three part phone|three-part phone)\b/u.test(
      text,
    )
  )
    return "contact-ribbon";
  if (/\b(?:collage|mosaic|layered|offset product|multi window|multi-window)\b/u.test(text))
    return "collage-mosaic";
  if (
    /\b(?:equipment montage|product equipment|product hero|isolated object|object stage|product still|product composition)\b/u.test(
      text,
    )
  )
    return "object-product-stage";
  if (
    /\b(?:translucent text panel|booking panel|message panel|floating booking|floating panel|inset manifesto)\b/u.test(
      text,
    )
  )
    return "image-panel";
  if (
    /\b(?:service symbol|service quartet|choice grid|symptom choice|service rail|program band|service tiles)\b/u.test(
      text,
    )
  )
    return "service-rail-hero";
  if (
    /\b(?:split|beside|paired|adjacent|two column|two-column|shares the first viewport|image and|image-and|portrait window|portrait proof)\b/u.test(
      text,
    ) &&
    /\b(?:image|photo|portrait|interior|scene|photograph|form)\b/u.test(text)
  )
    return "split-media-copy";
  if (
    /\b(?:skyline banner|utility identity|utility header|dense logo phone header)\b/u.test(
      text,
    )
  )
    return "utility-banner";
  if (
    /\b(?:text led|text-led|editorial statement on white|performance statement on white|oversized black and red type on cream|white editorial repair statement|near black text led|graphic opening field|oversized accented practice promise)\b/u.test(
      text,
    )
  )
    return "text-led-editorial";
  if (
    /\b(?:full bleed|full-bleed|full screen|full-screen|edge to edge|edge-to-edge|immersive|cinematic|full width|full-width|photographic stage|photo statement|image led|image-led|photo carries|photograph carries|photo supports|photograph supports|photo frames|image frames|image under|photo under)\b/u.test(
      text,
    ) ||
    (hasImage &&
      /\b(?:poster|wordmark|headline|promise|statement|type overlay|outline type)\b/u.test(
        text,
      ))
  )
    return "image-overlay";
  if (
    !hasImage &&
    /\b(?:typographic|poster|oversized type|wordmark|monument)\b/u.test(text)
  )
    return "text-led-editorial";
  if (hasImage) return "image-led-editorial";
  return "text-led-editorial";
}

/**
 * Compare the actual reference mechanics used by the author, not only the
 * registry labels. A higher score means the pair offers more structural
 * separation before any model call is made.
 */
export function referenceStructuralDistance(left, right) {
  const leftDna = selectionReferenceDna(left);
  const rightDna = selectionReferenceDna(right);
  const categoricalPairs = [
    [left.familyId || left.referenceFamilyId, right.familyId || right.referenceFamilyId],
    [normalizedHeroArchetype(left), normalizedHeroArchetype(right)],
    [leftDna.navigationGeometry?.mode || left.navigation, rightDna.navigationGeometry?.mode || right.navigation],
    [leftDna.servicePresentation?.pattern || left.servicePresentation, rightDna.servicePresentation?.pattern || right.servicePresentation],
    [leftDna.typography?.category || left.typographyCategory, rightDna.typography?.category || right.typographyCategory],
    [leftDna.imageTreatment?.mode || left.imageStrategy, rightDna.imageTreatment?.mode || right.imageStrategy],
    [leftDna.mobileRecomposition?.strategy || left.mobileBehavior, rightDna.mobileRecomposition?.strategy || right.mobileBehavior],
    [leftDna.ctaPlacement?.early, rightDna.ctaPlacement?.early],
    [leftDna.motion?.primitive || left.motionOpportunities?.[0], rightDna.motion?.primitive || right.motionOpportunities?.[0]],
  ].filter(([a, b]) => a || b);
  const categoricalDistance = categoricalPairs.length
    ? categoricalPairs.filter(([a, b]) => normalizedPhrase(a) !== normalizedPhrase(b)).length /
      categoricalPairs.length
    : 0;
  const sectionDistance = tokenSetDistance(
    structuralTokenSet(leftDna.sectionSequence || left.sectionRhythm),
    structuralTokenSet(rightDna.sectionSequence || right.sectionRhythm),
  );
  const signatureDistance = tokenSetDistance(
    structuralTokenSet(
      (leftDna.requiredSignatureElements || []).flatMap((item) => [
        item?.id,
        item?.description,
      ]),
    ),
    structuralTokenSet(
      (rightDna.requiredSignatureElements || []).flatMap((item) => [
        item?.id,
        item?.description,
      ]),
    ),
  );
  return Math.round(
    (categoricalDistance * 0.55 +
      sectionDistance * 0.3 +
      signatureDistance * 0.15) *
      100,
  );
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

function rankedRecords(registry, request) {
  return registry.records
    .map((record) => ({
      record,
      score: scoreRecord(record, request),
      explicit: explicitlyRequested(record, request),
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.record.id.localeCompare(right.record.id),
    );
}

function independentAnchors(ranked, request, history) {
  const candidates = [];
  for (let first = 0; first < ranked.length; first += 1) {
    for (let second = first + 1; second < ranked.length; second += 1) {
      for (let third = second + 1; third < ranked.length; third += 1) {
        const trio = [ranked[first], ranked[second], ranked[third]];
        const anchors = trio.map((candidate) => candidate.record);
        if (
          !structurallyIndependent(anchors[0], []) ||
          !structurallyIndependent(anchors[1], [anchors[0]]) ||
          !structurallyIndependent(anchors[2], anchors.slice(0, 2))
        )
          continue;
        const distances = [
          referenceStructuralDistance(anchors[0], anchors[1]),
          referenceStructuralDistance(anchors[0], anchors[2]),
          referenceStructuralDistance(anchors[1], anchors[2]),
        ];
        const heroArchetypes = anchors.map(normalizedHeroArchetype);
        candidates.push({
          anchors,
          heroArchetypes,
          heroArchetypeCount: new Set(heroArchetypes).size,
          explicitCount: trio.filter((candidate) => candidate.explicit).length,
          minimumDistance: Math.min(...distances),
          totalDistance: distances.reduce((sum, value) => sum + value, 0),
          fitScore: trio.reduce((sum, candidate) => sum + candidate.score, 0),
          stableKey: anchors.map((anchor) => anchor.id).sort().join("|"),
        });
      }
    }
  }
  const latestTrio = history.recentTrios.at(-1) || new Set();
  for (const candidate of candidates) {
    const ids = candidate.anchors.map((anchor) => anchor.id.toLowerCase());
    candidate.repeatedRecentTrio = history.recentTrios.some((trio) =>
      ids.every((id) => trio.has(id)));
    candidate.latestTrioOverlap = ids.filter((id) => latestTrio.has(id)).length;
    candidate.exposure = ids.reduce((sum, id) => sum + (history.exposure.get(id) || 0), 0);
    candidate.patternExposure = candidate.anchors.reduce((sum, anchor) =>
      sum + Number(history.recentFamilyIds.has(buildRouteContract(anchor).familyId.toLowerCase())) +
        Number(history.recentRouteSignatures.has(signatureFor(anchor))), 0);
    candidate.rankScore =
      candidate.heroArchetypeCount * 45 +
      candidate.minimumDistance * 0.8 +
      candidate.totalDistance * 0.15 +
      candidate.fitScore +
      stableFraction(`${request.seed}|${candidate.stableKey}`) * 90;
  }
  candidates.sort(
    (left, right) =>
      right.explicitCount - left.explicitCount ||
      Number(left.repeatedRecentTrio) - Number(right.repeatedRecentTrio) ||
      left.exposure - right.exposure ||
      left.latestTrioOverlap - right.latestTrioOverlap ||
      left.patternExposure - right.patternExposure ||
      right.heroArchetypeCount - left.heroArchetypeCount ||
      right.rankScore - left.rankScore ||
      left.stableKey.localeCompare(right.stableKey),
  );
  return { chosen: candidates[0], validTrioCount: candidates.length };
}

function selectionHistory(request, eligibleIds, eligibleSignatures, industry) {
  const recentReferenceIds = new Set(
    (Array.isArray(request.recentLaunches) ? [] : cleanList(request.recentReferenceIds, 200))
      .filter((id) => eligibleIds.has(id)),
  );
  const recentTrios = [];
  const exposure = new Map();
  const relevantLaunches = [];
  const launches = Array.isArray(request.recentLaunches)
    ? request.recentLaunches.slice(-30)
    : [];
  for (const launch of launches) {
    if (launch?.businessKind && !businessKindMatches({ industries: [launch.businessKind] }, industry))
      continue;
    const ids = cleanList(launch?.referenceIds, 20);
    if (!ids.length) {
      // Older launches may lack both IDs and business kind. In that case an
      // exact eligible route signature is the only safe niche evidence.
      const matchingSignatures = (Array.isArray(launch?.routeSignatures)
        ? launch.routeSignatures
        : []).map((value) => cleanText(value, 600))
        .filter((signature) => eligibleSignatures.has(signature));
      if (launch?.businessKind || matchingSignatures.length)
        relevantLaunches.push({
          ...launch,
          routeSignatures: matchingSignatures,
          // A kind-less record can mix niches. Its global family IDs cannot
          // be assigned to the matched signatures without route-level links.
          ...(!launch?.businessKind ? {
            routeFamilyIds: [],
            creativeFamilyId: "",
            referenceFamilyId: "",
          } : {}),
        });
      continue;
    }
    if (!ids.every((id) => eligibleIds.has(id))) continue;
    relevantLaunches.push(launch);
    for (const id of ids) {
      recentReferenceIds.add(id);
      exposure.set(id, (exposure.get(id) || 0) + 1);
    }
    if (ids.length === 3) recentTrios.push(new Set(ids));
  }
  for (const id of recentReferenceIds)
    if (!exposure.has(id)) exposure.set(id, 1);
  if (!recentTrios.length && recentReferenceIds.size === 3)
    recentTrios.push(new Set(recentReferenceIds));
  return { recentReferenceIds, recentTrios, exposure, relevantLaunches };
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
          selectionReferenceDna: dossiersById.get(record.id).referenceDna,
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
  const eligibleSignatures = new Set(registry.records.map(signatureFor));
  const history = selectionHistory(
    request,
    new Set(registry.records.map((record) => record.id.toLowerCase())),
    eligibleSignatures,
    industry,
  );
  const recentReferenceIds = history.recentReferenceIds;
  const eligibleFamilyIds = new Set(registry.records.flatMap((record) => [
    record.familyId,
    record.referenceFamilyId,
    buildRouteContract(record).familyId,
  ].filter(Boolean).map((value) => value.toLowerCase())));
  const recentFamilyInput = Array.isArray(request.recentLaunches)
    ? history.relevantLaunches.flatMap((launch) => [
        ...(Array.isArray(launch.routeFamilyIds) ? launch.routeFamilyIds : []),
        launch.creativeFamilyId,
        launch.referenceFamilyId,
      ])
    : request.recentFamilyIds;
  const recentSignatureInput = Array.isArray(request.recentLaunches)
    ? history.relevantLaunches.flatMap((launch) =>
        Array.isArray(launch.routeSignatures) ? launch.routeSignatures : [])
    : request.recentRouteSignatures;
  const recentFamilyIds = new Set(
    cleanList(recentFamilyInput, 200).filter((id) => eligibleFamilyIds.has(id)),
  );
  const recentRouteSignatures = new Set(
    (Array.isArray(recentSignatureInput)
      ? recentSignatureInput
      : []
    ).map((value) => cleanText(value, 600)).filter((value) => eligibleSignatures.has(value)),
  );
  history.recentFamilyIds = recentFamilyIds;
  history.recentRouteSignatures = recentRouteSignatures;
  const ranked = rankedRecords(registry, { ...request, seed, industry });
  const selection = independentAnchors(ranked, { ...request, seed, industry }, history);
  if (!selection.chosen)
    throw new Error(
      `The inspiration registry cannot supply three structurally independent creative routes for '${industry}'.`,
    );
  const anchors = selection.chosen.anchors;
  const selectedHeroArchetypes = anchors.map(normalizedHeroArchetype);
  const heroArchetypeGroups = registry.records.reduce((groups, record) => {
    const archetype = normalizedHeroArchetype(record);
    const ids = groups.get(archetype) || [];
    ids.push(record.id);
    groups.set(archetype, ids);
    return groups;
  }, new Map());
  const distinctHeroArchetypeCount = heroArchetypeGroups.size;
  const heroInventory = {
    targetDistinctArchetypes: Math.min(6, registry.records.length),
    eligibleReferenceCount: registry.records.length,
    distinctArchetypeCount: distinctHeroArchetypeCount,
    shortageToSix: Math.max(0, 6 - distinctHeroArchetypeCount),
    selectedDistinctArchetypeCount: new Set(selectedHeroArchetypes).size,
    selectedHeroArchetypes,
    byArchetype: Object.fromEntries(
      [...heroArchetypeGroups.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([archetype, ids]) => [archetype, [...ids].sort()]),
    ),
  };

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
      heroArchetype: normalizedHeroArchetype(anchor),
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
    recentReferenceSets: history.recentTrios.map((trio) => [...trio].sort()),
    selectedReferenceIds: anchors.map((anchor) => anchor.id),
    selectedHeroArchetypes,
    heroInventory,
    selectionHistory: {
      recentTrioCount: history.recentTrios.length,
      repeatedRecentTrio: selection.chosen.repeatedRecentTrio,
      latestTrioOverlap: selection.chosen.latestTrioOverlap,
      selectedExposure: selection.chosen.exposure,
      selectedPatternExposure: selection.chosen.patternExposure,
      validTrioCount: selection.validTrioCount,
      minimumStructuralDistance: selection.chosen.minimumDistance,
      selectedHeroArchetypeCount: selection.chosen.heroArchetypeCount,
      availableHeroArchetypeCount: distinctHeroArchetypeCount,
      heroArchetypeShortageToSix: heroInventory.shortageToSix,
      rationale: history.recentTrios.length
        ? `${selection.chosen.repeatedRecentTrio ? "Repeated" : "Avoided"} a recent trio; latest trio overlap ${selection.chosen.latestTrioOverlap} of 3; selected exposure ${selection.chosen.exposure} across ${selection.validTrioCount} structurally independent trios. Explicit reference intent ranks first, followed by history, prompt fit, and seeded rotation.`
        : recentReferenceIds.size
          ? `${recentReferenceIds.size} recent reference IDs influenced exposure ranking across ${selection.validTrioCount} structurally independent trios; ${recentRouteSignatures.size} matched route signatures and ${recentFamilyIds.size} matched families were also considered. Explicit reference intent ranks first, followed by prompt fit and seeded rotation.`
        : recentRouteSignatures.size || recentFamilyIds.size
          ? `${recentRouteSignatures.size} matched route signatures and ${recentFamilyIds.size} matched families influenced history ranking across ${selection.validTrioCount} structurally independent trios. Explicit reference intent ranks first, followed by prompt fit and seeded rotation.`
          : `No recent matching trio or pattern; selected across ${selection.validTrioCount} structurally independent trios using prompt fit and seeded rotation.`,
    },
    freshnessFallback: anchors.every((anchor) => recentReferenceIds.has(anchor.id.toLowerCase()))
      ? "history-relaxed"
      : anchors.some((anchor) => recentReferenceIds.has(anchor.id.toLowerCase()))
        ? "history-balanced"
        : "fresh",
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
