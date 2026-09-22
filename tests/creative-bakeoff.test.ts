import { describe, expect, it } from "vitest";
import { hardFailures } from "../scripts/run-creative-bakeoff.mjs";

const validEvidence = {
  h1Count: 1,
  hasHero: true,
  heroHasHeading: true,
  heroHasEarlyConversion: true,
  hasEarlyConversion: true,
  hasServices: true,
  hasFaqs: true,
  hasContact: true,
  missingFragments: 0,
  missingNavTargets: 0,
  hasLeadForm: true,
  missingAlt: 0,
  unnamedControls: 0,
  heroBottom: 800,
  viewportHeight: 864,
  overflow: false,
  brokenImages: 0,
  emDashes: 0,
  creativeRenderer: "creative-candidate",
};

describe("creative bakeoff measured hero gate", () => {
  it("rejects a nav-only hero marker even when the page has a heading and CTA elsewhere", () => {
    const failures = hardFailures(
      {
        ...validEvidence,
        heroHasHeading: false,
        heroHasEarlyConversion: false,
      },
      { name: "desktop" },
      true,
    );

    expect(failures).toContain("measured hero does not contain the primary H1");
    expect(failures).toContain("measured hero does not contain the primary early conversion");
  });

  it("keeps legacy structural checks unchanged when measured-hero enforcement is not requested", () => {
    const failures = hardFailures(
      {
        ...validEvidence,
        heroHasHeading: false,
        heroHasEarlyConversion: false,
      },
      { name: "desktop" },
    );

    expect(failures).not.toContain("measured hero does not contain the primary H1");
    expect(failures).not.toContain("measured hero does not contain the primary early conversion");
  });
});
