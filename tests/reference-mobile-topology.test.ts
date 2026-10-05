import { describe, expect, it } from "vitest";
import { loadReferenceDossier } from "../scripts/reference-dossier.mjs";
import { validateRenderedCompositionTopology } from "../scripts/rendered-composition-topology.mjs";

// Independently inspected retained mobile captures: the headlines overlay
// photographic fields. These boxes encode that relationship, not branding.
const hero = { left: 0, top: 0, width: 390, height: 440 };
const copy = { left: 24, top: 40, width: 342, height: 200 };

describe.each([
  "web-legal-valemus-law",
  "web-home-care-ivy-homecare",
  "web-beauty-baba-barbers",
  "web-auto-repair-reliance-autos",
  "web-hvac-russell-comfort",
])("retained %s mobile reference geometry", (referenceId) => {
  const dossier = loadReferenceDossier(`data/reference-library/dossiers/${referenceId}`);

  it("accepts a rendered opening that preserves the observed copy-over-image relationship", () => {
    const result = validateRenderedCompositionTopology(
      dossier.referenceDna.compositionTopology,
      { hero, copy: [copy], media: [{ container: hero, visuals: [hero] }] },
      { viewportKind: "mobile" },
    );
    expect(result.skipped).toBe(false);
    expect(result.pass).toBe(true);
  });

  it("rejects a text-only replacement that discards the reference opening image", () => {
    const result = validateRenderedCompositionTopology(
      dossier.referenceDna.compositionTopology,
      { hero, copy: [copy], media: [] },
      { viewportKind: "mobile" },
    );
    expect(result.pass).toBe(false);
    expect(result.findings.map((finding) => finding.code)).toContain("media-overlay-image");
  });
});

it("preserves Aptive's observed text-led mobile recomposition instead of forcing every reference into an image overlay", () => {
  const dossier = loadReferenceDossier("data/reference-library/dossiers/web-homeservices-aptive");
  const result = validateRenderedCompositionTopology(
    dossier.referenceDna.compositionTopology,
    { hero, copy: [copy], media: [] },
    { viewportKind: "mobile" },
  );
  expect(result.skipped).toBe(false);
  expect(result.pass).toBe(true);
});
