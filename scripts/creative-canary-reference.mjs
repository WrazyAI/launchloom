import {
  buildInspirationPack,
  businessKindMatches,
} from "./inspiration-registry.mjs";
import { buildRouteContract } from "./creative-compiler.mjs";
import { loadReferenceDossier } from "./reference-dossier.mjs";
import { validateReferenceDna } from "./reference-dna.mjs";

const CANARY_BUSINESS_KIND = "architecture";
const CANARY_REFERENCE_ID = "kokoro-spatial-editorial";
const CLEARED_RIGHTS = new Set(["licensed", "permission-cleared", "owned"]);
export const CREATIVE_CANARY_IMAGE_ASSETS = Object.freeze({
  hero: "data/creative-assets/architecture-canary/hero-atrium.webp",
  secondary: "data/creative-assets/architecture-canary/ridge-house.webp",
  tertiary: "data/creative-assets/architecture-canary/project-mosaic.webp",
});

export function buildCreativeCanaryPack(repositoryRoot, registry) {
  const pack = buildInspirationPack(
    {
      seed: "architecture-core-model-canary",
      industry: CANARY_BUSINESS_KIND,
      styleTerms: ["editorial", "architecture", "image-led projects", "material detail"],
      recentReferenceIds: [],
      recentRouteSignatures: [],
    },
    registry,
    { repositoryRoot, requireDossiers: true },
  );
  const record = registry.records.find((candidate) => candidate.id === CANARY_REFERENCE_ID);
  if (!record?.dossierPath)
    throw new Error(`The controlled creative canary is missing its ${CANARY_REFERENCE_ID} dossier.`);
  const dossier = loadReferenceDossier(record.dossierPath, { repositoryRoot });
  if (dossier.productionEligible)
    throw new Error(`The ${CANARY_REFERENCE_ID} canary reference must remain archive-only.`);
  if (!CLEARED_RIGHTS.has(dossier.source.rights))
    throw new Error("The controlled Kokoro canary reference is not cleared for model use.");
  const referenceDna = validateReferenceDna(dossier.referenceDna, { requireEvidence: true });
  const route = {
    id: "route-01",
    label: record.name,
    intent: `Use ${record.heroGeometry} with ${record.servicePresentation}, guided by ${record.sectionRhythm}.`,
    navigation: record.navigation,
    heroGeometry: record.heroGeometry,
    servicePresentation: record.servicePresentation,
    sectionRhythm: record.sectionRhythm,
    typographyCategory: record.typographyCategory,
    imageStrategy: record.imageStrategy,
    motionOpportunity: record.motionOpportunities?.[0] || "restrained-native-motion",
    familyId: record.familyId,
    referenceFamilyId: dossier.familyId,
    referenceName: dossier.referenceName,
    referenceNotes: record.referenceNotes || record.notes,
    mobileBehavior: record.mobileBehavior,
    prohibitedPatterns: record.prohibitedPatterns,
    referenceIds: [record.id],
    evidence: [{
      id: record.id,
      name: record.name,
      source: record.source,
      rights: record.rights,
      screenshotPath: record.screenshotPath,
      notes: record.notes,
    }],
    referenceDna,
  };
  const canaryRoute = {
    ...route,
    ...buildRouteContract(route, 0),
    referenceDna,
    referenceDossier: {
      id: dossier.id,
      referenceName: dossier.referenceName,
      familyId: dossier.familyId,
      source: dossier.source,
      path: dossier.path,
      digest: dossier.digest,
      tags: dossier.tags,
      designPrompt: dossier.designPrompt,
    },
  };
  const routes = [
    canaryRoute,
    ...pack.routes.filter((candidate) =>
      candidate.familyId !== canaryRoute.familyId &&
      !candidate.referenceIds?.includes(CANARY_REFERENCE_ID),
    ).slice(0, 2),
  ].map((candidate, index) => ({
    ...candidate,
    id: `route-${String(index + 1).padStart(2, "0")}`,
  }));
  if (routes.length !== 3)
    throw new Error(
      "The controlled Kokoro canary cannot supply two additional independent production families.",
    );
  return {
    ...pack,
    routes,
    canaryReferenceOverride: {
      referenceId: dossier.id,
      dossierDigest: dossier.digest,
      productionEligible: dossier.productionEligible,
    },
    selectionReceipt: {
      ...pack.selectionReceipt,
      policy: "controlled-kokoro-reference-canary-only-v1",
      eligibleReferenceIds: [...new Set([
        ...pack.selectionReceipt.eligibleReferenceIds,
        dossier.id,
      ])].sort(),
      selectedReferenceIds: routes.flatMap((candidate) => candidate.referenceIds || []),
    },
  };
}

export function selectCreativeCanaryReference(pack) {
  const route = Array.isArray(pack?.routes)
    ? pack.routes.find((candidate) =>
        candidate.referenceDossier?.id === CANARY_REFERENCE_ID,
      ) || pack.routes.find((candidate) => {
        const businessTags = candidate.referenceDossier?.tags?.business || [];
        return businessKindMatches(
          { industries: businessTags },
          CANARY_BUSINESS_KIND,
        );
      })
    : undefined;
  if (!route?.referenceDossier || !route.referenceDna)
    throw new Error(
      `The creative canary pack has no canonical ${CANARY_BUSINESS_KIND} reference route.`,
    );
  if (!CLEARED_RIGHTS.has(route.referenceDossier.source?.rights))
    throw new Error("The creative canary reference is not cleared for model use.");
  if (
    route.referenceDna.evidence?.desktopScreenshot?.fullPage !== true ||
    route.referenceDna.evidence?.mobileScreenshot?.fullPage !== true
  )
    throw new Error("The creative canary reference must include full-page desktop and mobile evidence.");
  return route;
}
