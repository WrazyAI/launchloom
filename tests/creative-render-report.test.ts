import { describe, expect, it } from "vitest";
import * as creativeBakeoff from "../scripts/run-creative-bakeoff.mjs";

const candidateId = "candidate-a1b2c3";

function viewport(name: string, width: number, height: number) {
  return {
    name,
    width,
    height,
    evidence: {
      h1Count: 1,
      hasHero: true,
      hasEarlyConversion: true,
      hasServices: true,
      hasFaqs: true,
      hasContact: true,
      missingFragments: 0,
      missingNavTargets: 0,
      hasLeadForm: true,
      missingAlt: 0,
      unnamedControls: 0,
      heroBottom: 600,
      viewportHeight: height,
      viewportWidth: width,
      headline: null,
      openingImage: null,
      navigation: null,
      earlyConversion: null,
      overflow: false,
      brokenImages: 0,
      emDashes: 0,
      navTargets: [],
      referenceSignatures: [],
      referenceSections: [],
      heroGeometry: "",
      navigationGeometry: "",
      servicePresentation: "",
      ctaPlacement: "",
      mobileRecomposition: "",
      motionPrimitive: "",
      creativeRenderer: "creative-candidate",
    },
    renderedDom: '<main data-creative-host="true"></main>',
    browserErrors: [],
    fullPageCaptureErrors: [],
  };
}

function validReport() {
  return {
    version: 1,
    candidateId,
    viewports: [
      viewport("desktop", 1536, 864),
      viewport("compact", 1366, 768),
      viewport("mobile", 390, 844),
    ],
  };
}

describe("creative render report validation", () => {
  it("accepts the required viewport contract and rejects malformed worker evidence", () => {
    const validator = (
      creativeBakeoff as unknown as {
        validateCreativeRenderReport?: (
          report: unknown,
          options: { candidateId: string; requireRenderedDom: boolean },
        ) => void;
      }
    ).validateCreativeRenderReport;
    expect(validator).toBeTypeOf("function");
    if (typeof validator !== "function") return;

    const options = { candidateId, requireRenderedDom: true };
    expect(() => validator(validReport(), options)).not.toThrow();

    const duplicateNames = validReport();
    duplicateNames.viewports[1] = viewport("desktop", 1536, 864);
    const wrongDimensions = validReport();
    wrongDimensions.viewports[1].width = 1280;
    const missingEvidence = validReport();
    missingEvidence.viewports[0].evidence = null as never;
    const malformedBrowserErrors = validReport();
    malformedBrowserErrors.viewports[2].browserErrors = {} as never;
    const missingRenderedDom = validReport();
    missingRenderedDom.viewports[0].renderedDom = null as never;

    for (const report of [
      duplicateNames,
      wrongDimensions,
      missingEvidence,
      malformedBrowserErrors,
      missingRenderedDom,
    ])
      expect(() => validator(report, options)).toThrow(/incomplete evidence/iu);
  });
});
