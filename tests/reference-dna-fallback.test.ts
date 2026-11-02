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

  it.each([
    "Reference analyzer returned invalid JSON after one uncached retry (finish_reason=error/quota, http 402).",
    "Reference analyzer returned invalid JSON after one uncached retry (finish_reason=error/authentication, http 401).",
    "Reference analyzer failed for route-01 (403): invalid JSON response",
    "Reference analyzer did not produce content (http_status=402).",
  ])(
    "preserves provider access failures even when wrapped as analyzer content errors: %s",
    (message) => {
      expect(dossierAnalysisFallback(route, new Error(message))).toBeNull();
    },
  );

  it.each([
    { providerErrorCode: "quota" },
    { providerErrorCode: "authentication" },
    { providerHttpStatus: 401 },
    { providerHttpStatus: 402 },
    { providerHttpStatus: 403 },
  ])("preserves structured provider access evidence: %j", (metadata) => {
    const error = Object.assign(
      new Error("Reference analyzer returned no content"),
      metadata,
    );
    expect(dossierAnalysisFallback(route, error)).toBeNull();
  });
});
