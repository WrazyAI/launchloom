import { describe, expect, it } from "vitest";
import { dossierAnalysisFallback } from "../scripts/analyze-reference-dna.mjs";

describe("reference analyzer dossier fallback", () => {
  const route = {
    id: "route-01",
    referenceDna: {
      heroGeometry: { mode: "hero-integrated-quote-form" },
      compositionTopology: { hero: "utility-panel" },
      complete: true,
      analyzerModel: "canonical-dossier",
    },
  };

  it("uses the dossier DNA when the analyzer returns no content", () => {
    const fallback = dossierAnalysisFallback(
      route,
      new Error("Reference analyzer returned no content."),
    );
    expect(fallback).toMatchObject({
      id: "route-01",
      referenceDna: {
        analyzerModel: "dossier-fallback",
        analyzedFromEvidence: false,
      },
    });
    expect(fallback.referenceDna.analysisFallback).toContain("no content");
  });

  it("does not hide a provider auth or quota failure", () => {
    expect(
      dossierAnalysisFallback(route, new Error("quota exceeded")),
    ).toBeNull();
    expect(
      dossierAnalysisFallback(
        { referenceDna: { complete: false } },
        new Error("no content"),
      ),
    ).toBeNull();
  });
});
