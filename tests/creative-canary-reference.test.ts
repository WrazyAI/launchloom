import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CREATIVE_CANARY_IMAGE_ASSETS,
  buildCreativeCanaryPack,
  selectCreativeCanaryReference,
} from "../scripts/creative-canary-reference.mjs";

const registry = JSON.parse(fs.readFileSync("data/inspiration-registry.json", "utf8"));

describe("creative generation canary reference", () => {
  it("keeps its generated-image fixtures available without a template archive", () => {
    for (const relativePath of Object.values(CREATIVE_CANARY_IMAGE_ASSETS))
      expect(fs.existsSync(path.resolve(relativePath)), relativePath).toBe(true);
  });

  it("selects its verified architecture dossier from the canonical production pool", () => {
    const pack = buildCreativeCanaryPack(process.cwd(), registry);

    expect(pack.referenceDossiersRequired).toBe(true);
    const route = selectCreativeCanaryReference(pack);
    expect(route.referenceDossier.tags.business).toContain("architecture");
    expect(["licensed", "permission-cleared", "owned"]).toContain(
      route.referenceDossier.source.rights,
    );
    expect(route.referenceDna.evidence.desktopScreenshot.fullPage).toBe(true);
    expect(route.referenceDna.evidence.mobileScreenshot.fullPage).toBe(true);
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
