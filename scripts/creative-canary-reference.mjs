import {
  buildInspirationPack,
  businessKindMatches,
} from "./inspiration-registry.mjs";

const CANARY_BUSINESS_KIND = "architecture";
const CLEARED_RIGHTS = new Set(["licensed", "permission-cleared", "owned"]);
export const CREATIVE_CANARY_IMAGE_ASSETS = Object.freeze({
  hero: "data/creative-assets/architecture-canary/hero-atrium.webp",
  secondary: "data/creative-assets/architecture-canary/ridge-house.webp",
  tertiary: "data/creative-assets/architecture-canary/project-mosaic.webp",
});

export function buildCreativeCanaryPack(repositoryRoot, registry) {
  return buildInspirationPack(
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
}

export function selectCreativeCanaryReference(pack) {
  const route = Array.isArray(pack?.routes)
    ? pack.routes.find((candidate) => {
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
