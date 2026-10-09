import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ExperiencePackId } from "../templates/client-site/src/lib/experience-pack";
import {
  compileExperiencePack,
  listExperiencePacks,
  listInternalExperiencePacks,
  selectExperiencePackId,
} from "../templates/client-site/src/lib/experience-pack";
import type { SiteConfig } from "../templates/client-site/src/lib/site";

function site(name: string, packId?: string): SiteConfig {
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
      experience: packId ? { packId } : undefined,
    },
  };
}

const promotedPackIds: ExperiencePackId[] = [
  "stage-index",
  "editorial-ledger",
  "results-ledger",
];
const allPackIds: ExperiencePackId[] = [
  "cinematic-narrative",
  "bold-utility",
  "kinetic-poster",
  ...promotedPackIds,
];

describe("promoted reference packs", () => {
  it("lists all six packs in production and none as internal", () => {
    const production = listExperiencePacks();
    expect(production.map((pack) => pack.packId)).toEqual(allPackIds);
    expect(production.every((pack) => pack.internalOnly === false)).toBe(true);
    expect(listInternalExperiencePacks()).toEqual([]);
  });

  it("selects every promoted pack across production seeds", () => {
    for (const recipe of [
      "care-editorial",
      "local-trades",
      "general-editorial",
    ] as const) {
      const selected = new Set(
        Array.from({ length: 300 }, (_, index) =>
          selectExperiencePackId({ recipe, seed: `${recipe}|promo-${index}` }),
        ),
      );
      for (const packId of promotedPackIds)
        expect(selected.has(packId)).toBe(true);
    }
  });

  it("compiles each promoted pack as a requested production pack", () => {
    for (const packId of promotedPackIds) {
      const compiled = compileExperiencePack(
        site(`Requested ${packId}`, packId),
        "care-editorial",
      );
      expect(compiled.program.packId).toBe(packId);
      expect(compiled.program.variantId).toBe("standard");
      expect(compiled.source).toBe("requested");
      expect(compiled.program.sectionOrder.slice(0, 3)).toEqual([
        "hero",
        "conversion",
        "services",
      ]);
    }
  });

  it("keeps selection reproducible after promotion", () => {
    const first = selectExperiencePackId({
      recipe: "care-editorial",
      seed: "promotion",
    });
    const second = selectExperiencePackId({
      recipe: "care-editorial",
      seed: "promotion",
    });
    expect(second).toBe(first);
  });

  it("renders the license credit for every promoted pack", () => {
    const expectations = [
      {
        file: "StageIndexExperience.astro",
        href: "https://html5up.net/dimension",
        license: "CC BY 3.0",
        label: "HTML5 UP",
      },
      {
        file: "EditorialLedgerExperience.astro",
        href: "https://github.com/ColorlibHQ/bootstrap-templates",
        license: "MIT",
        label: "Colorlib",
      },
      {
        file: "ResultsLedgerExperience.astro",
        href: "https://www.spicerdesigns.com",
        license: "CC BY 4.0",
        label: "Spicer Designs",
      },
    ];
    for (const expectation of expectations) {
      const source = readFileSync(
        `templates/client-site/src/components/experiences/${expectation.file}`,
        "utf8",
      );
      expect(source).toContain("ReferencePackCredit");
      expect(source).toContain(`href="${expectation.href}"`);
      expect(source).toContain(`license="${expectation.license}"`);
      expect(source).toContain(expectation.label);
      expect(source).not.toContain("nofollow");
    }
    const credit = readFileSync(
      "templates/client-site/src/components/experiences/ReferencePackCredit.astro",
      "utf8",
    );
    expect(credit).toContain("xp-credit");
    expect(credit).not.toContain("nofollow");
    expect(credit).not.toContain("rel=");
  });
});
