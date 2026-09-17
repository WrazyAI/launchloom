import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildInspirationPack } from "../scripts/inspiration-registry.mjs";

const registry = JSON.parse(
  fs.readFileSync(path.resolve("data/inspiration-registry.json"), "utf8"),
);

const jewelryRequest = {
  seed: "intake-33-maison-orphee",
  industry: "fine-jewelry",
  styleTerms: ["luxury", "nocturnal", "editorial", "precise"],
  recentReferenceIds: [],
  recentRouteSignatures: [],
};

describe("inspiration registry", () => {
  it("builds three reproducible, structurally independent creative routes", () => {
    const first = buildInspirationPack(jewelryRequest, registry);
    const second = buildInspirationPack(jewelryRequest, registry);

    expect(first).toEqual(second);
    expect(first.routes).toHaveLength(3);
    expect(
      new Set(first.routes.flatMap((route: any) => route.referenceIds)).size,
    ).toBe(first.routes.flatMap((route: any) => route.referenceIds).length);
    for (const field of [
      "navigation",
      "heroGeometry",
      "servicePresentation",
      "typographyCategory",
    ]) {
      expect(new Set(first.routes.map((route: any) => route[field])).size).toBe(
        3,
      );
    }
    expect(
      new Set(first.routes.map((route: any) => route.signature)).size,
    ).toBe(3);
  });

  it("excludes recently used references and route signatures", () => {
    const initial = buildInspirationPack(jewelryRequest, registry);
    const next = buildInspirationPack(
      {
        ...jewelryRequest,
        recentReferenceIds: initial.routes.flatMap(
          (route: any) => route.referenceIds,
        ),
        recentRouteSignatures: [initial.routes[0].signature],
      },
      registry,
    );

    expect(next.routes.flatMap((route: any) => route.referenceIds)).not.toEqual(
      expect.arrayContaining(
        initial.routes.flatMap((route: any) => route.referenceIds),
      ),
    );
    expect(next.routes.map((route: any) => route.signature)).not.toContain(
      initial.routes[0].signature,
    );
  });

  it("preserves reference-only rights and never exposes source assets as usable site assets", () => {
    const pack = buildInspirationPack(jewelryRequest, registry);

    expect(pack.routes.flatMap((route: any) => route.evidence)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rights: "reference-only" }),
      ]),
    );
    expect(JSON.stringify(pack)).not.toContain("assetUrl");
    expect(JSON.stringify(pack)).not.toContain("downloadUrl");
  });

  it("fails clearly when the registry cannot supply three independent routes", () => {
    expect(() =>
      buildInspirationPack(jewelryRequest, {
        version: 1,
        records: registry.records.slice(0, 2),
      }),
    ).toThrow("three structurally independent creative routes");
  });
});
