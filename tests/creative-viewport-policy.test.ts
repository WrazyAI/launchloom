import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("creative viewport policy", () => {
  it("allows a desktop hero to continue below the fold when the DNA and rendered image both say so", async () => {
    const { heroViewportFitFailure } = await import(
      "../scripts/run-creative-bakeoff.mjs"
    );

    expect(heroViewportFitFailure).toBeTypeOf("function");
    const failure = heroViewportFitFailure(
      {
        heroBottom: 1501,
        viewportHeight: 864,
        openingImage: { topRatio: 0.784, bottomRatio: 1.741 },
      },
      { name: "desktop", height: 864 },
      {
        heroGeometry: {
          viewport:
            "The portrait image begins around 0.79 viewport heights and continues below the fold.",
        },
      },
    );

    expect(failure).toBeNull();
  });

  it("accepts the measured Kokoro desktop continuation from the canonical dossier", async () => {
    const { heroViewportFitFailure } = await import(
      "../scripts/run-creative-bakeoff.mjs"
    );
    const dossier = JSON.parse(
      readFileSync(
        "data/reference-library/dossiers/kokoro-spatial-editorial/manifest.json",
        "utf8",
      ),
    );
    const bakeoffSource = readFileSync("scripts/run-creative-bakeoff.mjs", "utf8");

    expect(
      heroViewportFitFailure(
        {
          heroBottom: 1501,
          viewportHeight: 864,
          openingImage: { topRatio: 0.784, bottomRatio: 1.741 },
        },
        { name: "desktop", height: 864 },
        dossier.referenceDna,
      ),
    ).toBeNull();
    expect(bakeoffSource).toContain("candidate.manifest.referenceDna");
  });

  it("still rejects an overflowing desktop hero when the route requires a one-screen opening", async () => {
    const { heroViewportFitFailure } = await import(
      "../scripts/run-creative-bakeoff.mjs"
    );

    expect(heroViewportFitFailure).toBeTypeOf("function");
    const failure = heroViewportFitFailure(
      {
        heroBottom: 900,
        viewportHeight: 864,
        openingImage: { topRatio: 0.15, bottomRatio: 0.9 },
      },
      { name: "desktop", height: 864 },
      { heroGeometry: { viewport: "A complete one-screen opening" } },
    );

    expect(failure).toBe("hero exceeds desktop viewport");
  });

  it("does not exempt a hero unless the opening image actually crosses the fold", async () => {
    const { heroViewportFitFailure } = await import(
      "../scripts/run-creative-bakeoff.mjs"
    );

    expect(heroViewportFitFailure).toBeTypeOf("function");
    const failure = heroViewportFitFailure(
      {
        heroBottom: 1000,
        viewportHeight: 864,
        openingImage: { topRatio: 0.15, bottomRatio: 0.8 },
      },
      { name: "desktop", height: 864 },
      {
        heroGeometry: {
          viewport: "An image may continue below the fold if needed.",
        },
      },
    );

    expect(failure).toBe("hero exceeds desktop viewport");
  });

  it("applies the same Reference DNA exception in recovery-preview verification", () => {
    const source = readFileSync("scripts/verify-creative-diagnostic.mjs", "utf8");

    expect(source).toContain('args.manifest || "src/generated-experiences/selected/manifest.json"');
    expect(source).toContain("selectedManifest?.creativeManifest?.referenceDna");
    expect(source).toContain("heroViewportFitFailure(state, viewport, referenceDna)");
  });
});
