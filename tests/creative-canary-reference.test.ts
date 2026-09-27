import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CREATIVE_CANARY_IMAGE_ASSETS,
  buildCreativeCanaryPack,
  selectCreativeCanaryReference,
} from "../scripts/creative-canary-reference.mjs";
import { buildInspirationPack } from "../scripts/inspiration-registry.mjs";
import { assertReferenceDossierPack } from "../scripts/reference-dossier.mjs";

const registry = JSON.parse(fs.readFileSync("data/inspiration-registry.json", "utf8"));

describe("creative generation canary reference", () => {
  it("keeps its generated-image fixtures available without a template archive", () => {
    for (const relativePath of Object.values(CREATIVE_CANARY_IMAGE_ASSETS))
      expect(fs.existsSync(path.resolve(relativePath)), relativePath).toBe(true);
  });

  it("pins the isolated canary to Kokoro without admitting the archive into production selection", () => {
    const pack = buildCreativeCanaryPack(process.cwd(), registry);

    expect(pack.referenceDossiersRequired).toBe(true);
    const route = selectCreativeCanaryReference(pack);
    expect(route.referenceDossier.id).toBe("kokoro-spatial-editorial");
    const manifest = JSON.parse(fs.readFileSync(
      path.resolve("data/reference-library/dossiers/kokoro-spatial-editorial/manifest.json"),
      "utf8",
    ));
    expect(pack.canaryReferenceOverride).toMatchObject({
      referenceId: "kokoro-spatial-editorial",
      productionEligible: false,
    });
    expect(route.referenceDossier.tags.business).toContain("architecture");
    expect(["licensed", "permission-cleared", "owned"]).toContain(
      route.referenceDossier.source.rights,
    );
    expect(route.referenceDna.evidence.desktopScreenshot.fullPage).toBe(true);
    expect(route.referenceDna.evidence.mobileScreenshot.fullPage).toBe(true);
    expect(manifest.referenceDna.heroGeometry.viewport).toMatch(
      /632x852px.*y=708px.*below the fold/iu,
    );
    expect(manifest.referenceDna.ctaPlacement.early).toMatch(
      /after the portrait image.*centered thesis/iu,
    );
    expect(() => assertReferenceDossierPack(pack, { repositoryRoot: process.cwd() })).toThrow(
      /stale or mismatched Reference Dossier/iu,
    );
    expect(() => assertReferenceDossierPack(pack, {
      repositoryRoot: process.cwd(),
      // @ts-expect-error The untyped JS default [] is inferred as never[]; runtime accepts IDs.
      allowArchiveReferenceIds: ["kokoro-spatial-editorial"],
    })).not.toThrow();
    expect(() => assertReferenceDossierPack(pack, {
      repositoryRoot: process.cwd(),
      // @ts-expect-error The untyped JS default [] is inferred as never[]; runtime accepts IDs.
      allowArchiveReferenceIds: ["a1-craft-collage-field"],
    })).toThrow(/stale or mismatched Reference Dossier/iu);

    const productionPack = buildInspirationPack(
      { seed: "architecture-production-test", industry: "architecture" },
      registry,
      { repositoryRoot: process.cwd(), requireDossiers: true },
    );
    expect(productionPack.routes.flatMap((candidate: { referenceIds: string[] }) => candidate.referenceIds)).not.toContain(
      "kokoro-spatial-editorial",
    );
  });

  it("preserves a broad two-level identity for long client names without copying source styling", () => {
    const route = selectCreativeCanaryReference(
      buildCreativeCanaryPack(process.cwd(), registry),
    );
    const prompt = route.referenceDossier.designPrompt;

    expect(prompt).toMatch(/desktop.*identity broad.*0\.93/iu);
    expect(prompt).toMatch(/viewport width/iu);
    expect(prompt).toMatch(/two-line break or a two-level lockup/iu);
    expect(prompt).toMatch(/long business name into one undersized line/iu);
    expect(prompt).toMatch(/do not reproduce the source's handwritten treatment/iu);
    expect(prompt).not.toMatch(/balanced wrapping that turns the identity into a compact stacked title/iu);
    expect(prompt).toMatch(/mobile.*Menu|Menu.*mobile/iu);
    expect(prompt).toMatch(/opposing corners/iu);
    expect(prompt).toMatch(/do not repeat the .*studio name in a tiny header/iu);
    expect(prompt).toMatch(/distinct thesis section after the image/iu);
    expect(prompt).toMatch(/desktop[^\n]*0\.74[^\n]*width-to-height/iu);
    expect(prompt).toMatch(/desktop[^\n]*0\.44[^\n]*viewport width[^\n]*0\.95[^\n]*viewport height/iu);
    expect(prompt).toMatch(/mobile[^\n]*0\.46[^\n]*width-to-height/iu);
    expect(prompt).toMatch(/mobile[^\n]*0\.92[^\n]*viewport width[^\n]*0\.93[^\n]*viewport height/iu);
    expect(prompt).toMatch(/may continue below the first viewport|continues below the fold/iu);
    expect(prompt).toMatch(/edge to edge/iu);
    expect(prompt).toMatch(/empty image panel|empty extension/iu);
  });

  it("accepts architecture sub-niche tags recognized by production matching", () => {
    const route = {
      referenceDossier: {
        id: "residential-study",
        tags: { business: ["residential-architecture"] },
        source: { rights: "licensed" },
      },
      referenceDna: {
        evidence: {
          desktopScreenshot: { fullPage: true },
          mobileScreenshot: { fullPage: true },
        },
      },
    };

    expect(selectCreativeCanaryReference({ routes: [route] })).toBe(route);
  });
});
