import { describe, expect, it } from "vitest";
import {
  assertIndependentRoutes,
  buildCandidateManifest,
  buildRouteContract,
  diversityReport,
  fingerprintDistance,
  validateCandidateManifest,
} from "../scripts/creative-compiler.mjs";

const routes = [
  {
    id: "route-01",
    label: "Editorial monument",
    heroGeometry: "typographic-monument-with-central-portrait",
    navigation: "whispered-corner-navigation",
    servicePresentation: "magazine-ledger",
    sectionRhythm: "slow-cinematic-chapters",
    typographyCategory: "monumental-serif-with-script-accent",
    imageStrategy: "warm-architectural-tableaux",
    motionOpportunity: "masked-image-reveal",
    signature: "editorial-monument-signature",
  },
  {
    id: "route-02",
    label: "Utility diagnostic",
    heroGeometry: "diagnostic-split-with-live-status",
    navigation: "performance-scoreboard-navigation",
    servicePresentation: "horizontal-program-bands",
    sectionRhythm: "impact-band-recovery",
    typographyCategory: "oversized-athletic-condensed",
    imageStrategy: "full-bleed-action-documentary",
    motionOpportunity: "velocity-linked-type",
    signature: "utility-diagnostic-signature",
  },
  {
    id: "route-03",
    label: "Archive rail",
    heroGeometry: "editorial-face-and-type-collision",
    navigation: "micro-menu-with-cart-counterpoint",
    servicePresentation: "archive-collection-rail",
    sectionRhythm: "campaign-spread-sequence",
    typographyCategory: "fashion-grotesk-and-display-mix",
    imageStrategy: "hard-cropped-fashion-portrait",
    motionOpportunity: "horizontal-archive-scrub",
    signature: "archive-rail-signature",
  },
];

describe("creative compiler", () => {
  it("normalizes routes into independent design families", () => {
    const contracts = assertIndependentRoutes(routes);
    expect(contracts.map((route) => route.familyId)).toEqual([
      "editorial-monument",
      "utility-diagnostic",
      "archive-rail",
    ]);
    expect(new Set(contracts.map((route) => route.fingerprint)).size).toBe(3);
  });

  it("rejects a route set that only changes copy", () => {
    expect(() => assertIndependentRoutes(routes.map((route) => ({
      ...route,
      familyId: "editorial-monument",
      navigation: routes[0].navigation,
      heroGeometry: routes[0].heroGeometry,
      servicePresentation: routes[0].servicePresentation,
      typographyCategory: routes[0].typographyCategory,
    })))).toThrow(/not independent/iu);
  });

  it("reports pairwise distance and dimension diversity", () => {
    const candidates = routes.map((route, index) => ({
      id: `candidate-${index + 1}`,
      contract: buildRouteContract(route),
    }));
    const report = diversityReport(candidates);
    expect(report.pass).toBe(true);
    expect(report.uniqueDimensionCount).toBeGreaterThanOrEqual(4);
    expect(report.pairs.every((pair) => pair.distance >= 4)).toBe(true);
    expect(fingerprintDistance(candidates[0], candidates[1])).toBeGreaterThanOrEqual(4);
  });

  it("validates the promotion manifest", () => {
    const manifest = buildCandidateManifest({
      candidate: { candidateId: "candidate-a" },
      route: routes[0],
      model: "test/model",
      contentManifestDigest: "digest",
      assets: ["content.hero.image"],
    });
    expect(validateCandidateManifest(manifest)).toBe(manifest);
    expect(() => validateCandidateManifest({ ...manifest, requiredSections: ["hero"] })).toThrow(/early-conversion/iu);
  });

  it("persists a validated dossier prompt for rendered creative repair", () => {
    const referenceDossier = {
      id: "licensed-service-reference",
      referenceName: "Quote-first service desk",
      familyId: "licensed-service-reference",
      path: "data/reference-library/dossiers/licensed-service-reference",
      digest: "a".repeat(64),
      source: {
        name: "Permission-cleared reference",
        url: "https://example.com/reference",
        rights: "permission-cleared",
        rightsEvidence: "Requester attested to reference use.",
        rightsEvidencePath: "rights/requester-attestation.md",
        assetEvidencePaths: ["rights/requester-attestation.md"],
      },
      tags: { business: ["home-services"] },
      designPrompt: `# Reference implementation brief\n\n${"A careful reference mechanic. ".repeat(40)}`,
    };
    const manifest = buildCandidateManifest({
      candidate: { candidateId: "candidate-a" },
      route: { ...routes[0], referenceDossier },
      model: "test/model",
      contentManifestDigest: "digest",
    });

    expect(manifest.referenceDossier).toEqual(referenceDossier);
    expect(validateCandidateManifest(manifest)).toBe(manifest);
    expect(() => validateCandidateManifest({
      ...manifest,
      referenceDossier: { ...referenceDossier, digest: "invalid" },
    })).toThrow(/incomplete Reference Dossier binding/iu);
    expect(() => validateCandidateManifest({
      ...manifest,
      referenceDossier: { ...referenceDossier, source: undefined },
    })).toThrow(/incomplete Reference Dossier binding/iu);
  });
});
