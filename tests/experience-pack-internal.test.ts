import { describe, expect, it } from "vitest";
import type { ExperiencePackId } from "../templates/client-site/src/lib/experience-pack";
import {
  compileExperienceCandidates,
  compileExperiencePack,
  listExperiencePacks,
  listInternalExperiencePacks,
  selectExperiencePackId,
} from "../templates/client-site/src/lib/experience-pack";
import type { SiteConfig } from "../templates/client-site/src/lib/site";

function site(name: string, packId?: string, internal = false): SiteConfig {
  return {
    preset: "wellness",
    industry: "professional-services",
    businessKind: "dental",
    business: {
      name,
      tagline: "Considered care for every visit.",
      description: "A neighborhood dental practice.",
      phone: "01234 567890",
      email: "hello@example.com",
      address: "",
      serviceAreas: ["Bristol"],
      hours: "",
      primaryCta: "Start a conversation",
      leadEmail: "hello@example.com",
    },
    style: { primaryColor: "#2f4b7c", tone: "editorial" },
    services: [
      {
        name: "Preventive care",
        description: "Routine exams and cleanings.",
        slug: "preventive-care",
      },
    ],
    differentiators: [],
    locations: [],
    images: { hero: "/images/hero.webp" },
    design: {
      recipe: "care-editorial",
      sections: [],
      experience: packId ? { packId, internal } : undefined,
    },
  };
}

const internalPackIds: ExperiencePackId[] = [
  "stage-index",
  "editorial-ledger",
  "results-ledger",
];

describe("internal reference packs", () => {
  it("keeps the production pack list unchanged", () => {
    const production = listExperiencePacks();
    expect(production.map((pack) => pack.packId)).toEqual([
      "cinematic-narrative",
      "bold-utility",
      "kinetic-poster",
    ]);
    expect(production.every((pack) => pack.internalOnly === false)).toBe(true);
  });

  it("registers the reference packs as internal with unique fingerprints", () => {
    const internal = listInternalExperiencePacks();
    expect(internal.map((pack) => pack.packId).sort()).toEqual(
      [...internalPackIds].sort(),
    );
    expect(internal.every((pack) => pack.internalOnly === true)).toBe(true);
    const fingerprints = new Set([
      ...listExperiencePacks().flatMap((pack) =>
        pack.variants.map((variant) => variant.fingerprint),
      ),
      ...internal.flatMap((pack) =>
        pack.variants.map((variant) => variant.fingerprint),
      ),
    ]);
    expect(fingerprints.size).toBe(
      listExperiencePacks().reduce(
        (total, pack) => total + pack.variants.length,
        0,
      ) + internal.reduce((total, pack) => total + pack.variants.length, 0),
    );
  });

  it("never selects an internal pack for production generation", () => {
    for (const recipe of [
      "care-editorial",
      "local-trades",
      "general-editorial",
    ] as const) {
      for (const seed of ["one", "two", "three", "four", "five"]) {
        const selected = selectExperiencePackId({ recipe, seed });
        expect(internalPackIds).not.toContain(selected);
      }
      for (const requested of internalPackIds) {
        const selected = selectExperiencePackId({
          recipe,
          seed: "requested",
          requested,
        });
        expect(internalPackIds).not.toContain(selected);
      }
    }
  });

  it("excludes internal packs from default candidate compilation", () => {
    const candidates = compileExperienceCandidates(
      site("Production candidates"),
      "care-editorial",
    );
    expect(candidates.length).toBeGreaterThan(0);
    expect(
      candidates.every(
        (candidate) => !internalPackIds.includes(candidate.packId),
      ),
    ).toBe(true);
  });

  it("includes internal packs only behind the explicit flag", () => {
    const candidates = compileExperienceCandidates(
      site("Internal candidates"),
      "care-editorial",
      { includeInternalPacks: true },
    );
    const packIds = new Set(candidates.map((candidate) => candidate.packId));
    for (const packId of internalPackIds)
      expect(packIds.has(packId)).toBe(true);
  });

  it("compiles a requested internal pack for internal review", () => {
    const compiled = compileExperiencePack(
      site("Stage review", "stage-index", true),
      "care-editorial",
    );
    expect(compiled.program.packId).toBe("stage-index");
    expect(compiled.program.variantId).toBe("standard");
    expect(compiled.source).toBe("requested");
    expect(compiled.program.sectionOrder.slice(0, 3)).toEqual([
      "hero",
      "conversion",
      "services",
    ]);
  });

  it("replaces a requested internal pack safely without the internal flag", () => {
    const compiled = compileExperiencePack(
      site("Production request", "results-ledger"),
      "care-editorial",
    );
    expect(compiled.program.packId).not.toBe("results-ledger");
    expect(
      compiled.diagnostics.some((diagnostic) =>
        diagnostic.includes("not available to production selection"),
      ),
    ).toBe(true);
  });
});
