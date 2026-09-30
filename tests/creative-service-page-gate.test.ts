import { describe, expect, it } from "vitest";
import {
  servicePageFailures,
  servicePageIdentityFindings,
} from "../scripts/run-creative-bakeoff.mjs";

const baseEvidence = {
  hasHost: true,
  creativeRenderer: "creative-candidate",
  hasServicePageMarker: true,
  h1Count: 1,
  hasServiceHero: true,
  hasServiceSupport: true,
  hasServiceRelated: true,
  hasContactSection: true,
  hasLeadForm: true,
  missingAlt: 0,
  unnamedControls: 0,
  overflow: false,
  brokenImages: 0,
  emDashes: 0,
};

describe("creative service page gate", () => {
  it("accepts a complete authored service page render", () => {
    expect(servicePageFailures(baseEvidence)).toEqual([]);
  });

  it("reports missing service regions and unsafe render states", () => {
    expect(
      servicePageFailures({
        ...baseEvidence,
        hasServicePageMarker: false,
        hasServiceSupport: false,
        overflow: true,
        emDashes: 1,
      }),
    ).toEqual([
      "missing authored service page marker",
      "missing service decision-support region",
      "horizontal overflow",
      "em dash found",
    ]);
  });

  it("flags canvas and heading drift from the authored homepage", () => {
    const home = {
      bodyBackground: "rgb(16, 18, 20)",
      htmlBackground: "rgb(16, 18, 20)",
      headingFontFamily: "Georgia, serif",
      headingFontWeight: "700",
    };
    expect(
      servicePageIdentityFindings(home, {
        ...home,
        bodyBackground: "rgb(248, 246, 240)",
      }),
    ).toEqual([
      "service page canvas background drifts from the homepage (rgb(16,18,20) to rgb(248,246,240))",
    ]);
    expect(
      servicePageIdentityFindings(home, {
        ...home,
        headingFontFamily: "Arial, sans-serif",
        headingFontWeight: "400",
      }),
    ).toEqual([
      "service page heading typeface drifts from the homepage typeface",
      "service page heading weight drifts from the homepage weight",
    ]);
    expect(servicePageIdentityFindings(home, home)).toEqual([]);
  });
});
