import { describe, expect, it } from "vitest";
import {
  authoredPageFailures,
  authoredPageIdentityFindings,
} from "../scripts/run-creative-bakeoff.mjs";

const baseEvidence = {
  hasHost: true,
  creativeRenderer: "creative-candidate",
  hasAuthoredMarker: true,
  markers: [
    "data-service-page",
    "data-service-hero",
    "data-service-support",
    "data-service-related",
  ],
  h1Count: 1,
  hasContactSection: true,
  hasLeadForm: true,
  missingAlt: 0,
  unnamedControls: 0,
  overflow: false,
  brokenImages: 0,
  emDashes: 0,
};

const locationEvidence = {
  ...baseEvidence,
  markers: [
    "data-location-page",
    "data-location-hero",
    "data-location-coverage",
    "data-location-related",
  ],
};

const servicesIndexEvidence = {
  ...baseEvidence,
  markers: [
    "data-services-index",
    "data-services-index-hero",
    "data-services-index-list",
  ],
};

describe("creative authored page gate", () => {
  it("accepts complete service, location, and services-index renders", () => {
    expect(authoredPageFailures(baseEvidence, "service")).toEqual([]);
    expect(authoredPageFailures(locationEvidence, "location")).toEqual([]);
    expect(
      authoredPageFailures(servicesIndexEvidence, "services-index"),
    ).toEqual([]);
  });

  it("reports missing page regions and unsafe render states", () => {
    expect(
      authoredPageFailures(
        {
          ...baseEvidence,
          hasAuthoredMarker: false,
          markers: ["data-service-page", "data-service-hero"],
          overflow: true,
          emDashes: 1,
        },
        "service",
      ),
    ).toEqual([
      "missing authored service page marker",
      "missing data-service-support region",
      "missing data-service-related region",
      "horizontal overflow",
      "em dash found",
    ]);
    expect(
      authoredPageFailures({ ...locationEvidence, markers: ["data-location-page"] }, "location"),
    ).toEqual([
      "missing data-location-hero region",
      "missing data-location-coverage region",
      "missing data-location-related region",
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
      authoredPageIdentityFindings(
        home,
        {
          ...home,
          bodyBackground: "rgb(248, 246, 240)",
        },
        "location page",
      ),
    ).toEqual([
      "location page canvas background drifts from the homepage (rgb(16,18,20) to rgb(248,246,240))",
    ]);
    expect(
      authoredPageIdentityFindings(
        home,
        {
          ...home,
          headingFontFamily: "Arial, sans-serif",
          headingFontWeight: "400",
        },
        "services index",
      ),
    ).toEqual([
      "services index heading typeface drifts from the homepage typeface",
      "services index heading weight drifts from the homepage weight",
    ]);
    expect(authoredPageIdentityFindings(home, home, "service page")).toEqual(
      [],
    );
  });
});
