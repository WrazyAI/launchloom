import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { probeCreativeReferences } from "../scripts/reference-availability.mjs";
import { resolveEffectiveRenderer } from "../scripts/resolve-effective-renderer.mjs";

const root = path.resolve(".");
const registry = JSON.parse(
  fs.readFileSync(path.join(root, "data/inspiration-registry.json"), "utf8"),
);

describe("creative reference availability", () => {
  it("reports wellness as short and the other core industries as available", () => {
    const wellness = probeCreativeReferences({
      industry: "wellness",
      registry,
      repositoryRoot: root,
    });
    expect(wellness).toMatchObject({
      available: false,
      eligible: 0,
      reason: "reference-shortage",
    });
    for (const industry of ["beauty", "dental", "plumbing"]) {
      const result = probeCreativeReferences({
        industry,
        registry,
        repositoryRoot: root,
      });
      expect(result.available).toBe(true);
      expect(result.routes).toBe(3);
    }
  });

  it("maps a wellness shortage to the pack fallback", () => {
    const wellness = probeCreativeReferences({
      industry: "wellness",
      registry,
      repositoryRoot: root,
    });
    expect(
      resolveEffectiveRenderer({
        requested: "creative",
        profile: "full",
        creativeReferencesAvailable: wellness.available,
        packId: "editorial-ledger",
      }),
    ).toMatchObject({ effective: "pack", degraded: true });
  });

  it("does not treat an unsupported or generic kind as a shortage", () => {
    expect(() =>
      probeCreativeReferences({
        industry: "local-business",
        registry,
        repositoryRoot: root,
      }),
    ).toThrow(/specific business kind|unsupported/iu);
  });
});
