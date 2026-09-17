import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  compileExperiencePack,
  compileExperienceCandidates,
  listExperiencePacks,
  selectExperiencePackId,
} from "../templates/client-site/src/lib/experience-pack";
import type { SiteConfig } from "../templates/client-site/src/lib/site";
import {
  assembleSplitExperience,
  createSplitExperienceStages,
} from "../scripts/model-experience-stages.mjs";

function site(name: string, packId?: string): SiteConfig {
  return {
    preset: "wellness",
    industry: "professional-services",
    businessKind: "architecture",
    business: {
      name,
      tagline: "Spaces shaped around daily life.",
      description: "A residential architecture studio.",
      phone: "",
      email: "hello@example.com",
      address: "",
      serviceAreas: ["Asheville"],
      hours: "",
      primaryCta: "Start a conversation",
      leadEmail: "hello@example.com",
    },
    style: { primaryColor: "#9a6d32", tone: "editorial" },
    services: [
      { name: "Residential design", description: "Plan a home around its site and daily routines.", slug: "residential-design" },
    ],
    differentiators: [],
    locations: [],
    images: {},
    design: {
      recipe: "general-editorial",
      sections: [],
      experience: packId ? { packId } : undefined,
    },
  };
}

describe("experience-pack compiler", () => {
  it("splits model experience authorship into bounded response stages", () => {
    const stages = createSplitExperienceStages();
    expect(stages.map((stage) => stage.id)).toEqual([
      "contract",
      "appJsx",
      "stylesCss",
      "indexHtml",
    ]);
    expect(stages.every((stage) => stage.maxTokens <= 10000)).toBe(true);
    expect(stages.every((stage) => stage.schema.schema.required.length <= 2)).toBe(true);

    expect(
      assembleSplitExperience({
        contract: { designContract: "A coherent contract", designRationale: "Distinct." },
        appJsx: { content: "export default function App(){}" },
        stylesCss: { content: "body{}" },
        indexHtml: { content: "<div id=\"root\"></div>" },
      }),
    ).toEqual({
      appJsx: "export default function App(){}",
      stylesCss: "body{}",
      indexHtml: "<div id=\"root\"></div>",
      designRationale: "Distinct.",
      designContract: "A coherent contract",
    });
  });

  it("keeps model authorship behind deterministic release gates", () => {
    const lab = readFileSync("scripts/generate-model-experience-lab.mjs", "utf8");
    expect(lab).toContain('"z-ai/glm-5.3');
    expect(lab).toContain("moonshotai/kimi-k2.6");
    expect(lab).toContain("qwen/qwen3.6-27b");
    expect(lab).toContain("hero exceeds desktop viewport");
    expect(lab).toContain("broken image");
    expect(lab).toContain("conversion is not immediate");
    expect(lab).toContain("Preserve the visual ambition");
    expect(lab).toContain("args.fixture");
    expect(lab).toContain("unsupported claims");
  });

  it("runs a three-viewport internal bakeoff and preserves a safe fallback", () => {
    const bakeoff = readFileSync("scripts/run-experience-bakeoff.mjs", "utf8");
    expect(bakeoff).toContain('width: 1536, height: 864');
    expect(bakeoff).toContain('width: 1366, height: 768');
    expect(bakeoff).toContain('width: 390, height: 844');
    expect(bakeoff).toContain('delete finalConfig.design.experience');
    expect(bakeoff).toContain('selectionMode: "internal-bakeoff"');
    expect(bakeoff).toContain('hero exceeds desktop viewport');
    expect(bakeoff).toContain('experience_bakeoff_candidate=');
    const workflow = readFileSync(".github/workflows/generate-client.yml", "utf8");
    expect(workflow).toContain(".launchloom/experience-bakeoff.json");
    expect(workflow).toMatch(
      /Upload experience bakeoff evidence[\s\S]*experience-bakeoff-screenshots[\s\S]*\.launchloom\/experience-bakeoff\.json/,
    );
  });

  it("defines a factual, visually distinct second-business canary", () => {
    const fixture = JSON.parse(
      readFileSync("fixtures/model-experience-businesses/portland-arborist.json", "utf8"),
    );
    expect(fixture.businessBrief).toContain("Northline Tree Response");
    expect(fixture.assignedDirection).toContain("Bright Swiss utility");
    expect(fixture.assetBrief).toContain("canopy-hero.png");
    expect(fixture.interactionBrief).toContain("symptom-first tree assessment");
    expect(fixture.forbiddenClaims).toContain("24\\/7");
  });

  it("defines a separate gym canary with its own assets and interaction", () => {
    const fixture = JSON.parse(
      readFileSync("fixtures/model-experience-businesses/oakland-bouldering-gym.json", "utf8"),
    );
    expect(fixture.businessBrief).toContain("Crux Commons");
    expect(fixture.assignedDirection).toContain("Playful neo-brutalism");
    expect(fixture.assetBrief).toContain("hero-climb.png");
    expect(fixture.interactionBrief).toContain("route-finder");
    expect(fixture.forbiddenClaims).toContain("all gear included");
  });

  it("registers structurally independent packs with unique fingerprints", () => {
    const packs = listExperiencePacks();
    expect(packs.map((pack) => pack.packId)).toEqual([
      "cinematic-narrative",
      "bold-utility",
      "kinetic-poster",
    ]);
    expect(new Set(packs.map((pack) => pack.fingerprint))).toHaveLength(3);
    expect(new Set(packs.map((pack) => pack.hero))).toHaveLength(3);
    expect(new Set(packs.map((pack) => pack.services))).toHaveLength(3);
  });

  it("returns isolated nested blueprint data and fingerprints motion", () => {
    const listed = listExperiencePacks();
    const originalProfile = listed[0].motion.profile;
    const originalSection = listed[0].sectionOrder[0];
    (listed[0].motion as { profile: string }).profile = "still";
    (listed[0].sectionOrder as string[])[0] = "contact";

    const refreshed = listExperiencePacks()[0];
    expect(refreshed.motion.profile).toBe(originalProfile);
    expect(refreshed.sectionOrder[0]).toBe(originalSection);
    expect(refreshed.fingerprint).toContain("native-scroll");

    const first = compileExperiencePack(
      {
        ...site("Motion Isolation", "cinematic-narrative"),
        images: { hero: "/images/hero.webp" },
      },
      "general-editorial",
    );
    (first.program.motion as { profile: string }).profile = "still";
    expect(
      compileExperiencePack(
        {
          ...site("Motion Isolation", "cinematic-narrative"),
          images: { hero: "/images/hero.webp" },
        },
        "general-editorial",
      ).program.motion.profile,
    ).toBe("cinematic");
  });

  it("compiles a requested pack behind one stable interface", () => {
    const requestedSite = site("Alder and Ash", "cinematic-narrative");
    requestedSite.images.hero = "/images/hero.webp";
    const compiled = compileExperiencePack(
      requestedSite,
      "general-editorial",
    );
    expect(compiled.source).toBe("requested");
    expect(compiled.program.sectionOrder.slice(0, 3)).toEqual([
      "hero",
      "conversion",
      "services",
    ]);
    expect(compiled.program.motion.maxPinnedScenes).toBeLessThanOrEqual(1);
    expect(compiled.program.version).toBe(2);
    expect(compiled.content.services).toHaveLength(1);
  });

  it("selects reproducibly and can avoid a recent structural fingerprint", () => {
    const first = compileExperiencePack(site("North Star"), "general-editorial");
    const repeated = compileExperiencePack(site("North Star"), "general-editorial");
    expect(repeated.program.fingerprint).toBe(first.program.fingerprint);
    const alternative = compileExperiencePack(site("North Star"), "general-editorial", {
      recentFingerprints: [first.program.fingerprint],
    });
    expect(alternative.program.fingerprint).not.toBe(first.program.fingerprint);
  });

  it("keeps all three structural packs reachable for each recipe", () => {
    for (const recipe of ["care-editorial", "local-trades", "general-editorial"] as const) {
      const selected = new Set(
        Array.from({ length: 200 }, (_, index) =>
          selectExperiencePackId({ recipe, seed: `${recipe}|intake-${index}` }),
        ),
      );
      expect(selected).toEqual(
        new Set(["cinematic-narrative", "bold-utility", "kinetic-poster"]),
      );
    }
  });

  it("compiles three bakeoff candidates while rejecting image-dependent packs without media", () => {
    const input = site("No Image Business");
    const candidates = compileExperienceCandidates(input, "general-editorial");
    expect(candidates).toHaveLength(3);
    expect(candidates.map((candidate) => candidate.packId)).toEqual(
      expect.arrayContaining(["cinematic-narrative", "bold-utility", "kinetic-poster"]),
    );
    expect(
      candidates.find((candidate) => candidate.packId === "cinematic-narrative")?.diagnostics,
    ).toContain("This experience requires a verified business-relevant image.");
    expect(compileExperiencePack(input, "general-editorial").program.packId).not.toBe(
      "cinematic-narrative",
    );
  });

  it("maps legacy pack IDs to their reviewed version-two replacements", () => {
    const input = site("Legacy Guided", "guided-conversation");
    expect(compileExperiencePack(input, "care-editorial").program.packId).toBe(
      "bold-utility",
    );
  });

  it("only enables the social proof section when evidence can render", () => {
    const input = site("Evidence Check", "bold-utility");
    input.socialProof = {
      source: "verified_differentiators",
      heading: "Why people choose us",
      intro: "Verified details",
      points: [],
    };
    expect(
      compileExperiencePack(input, "general-editorial").content.hasSocialProof,
    ).toBe(false);

    input.socialProof.points = ["Locally owned"];
    expect(
      compileExperiencePack(input, "general-editorial").content.hasSocialProof,
    ).toBe(true);
  });

  it("replaces unknown requested packs without weakening required sections", () => {
    const compiled = compileExperiencePack(
      site("Safe Fallback", "unrestricted-html"),
      "general-editorial",
    );
    expect(compiled.source).toBe("selected");
    expect(compiled.diagnostics[0]).toContain("Unknown experience pack");
    expect(compiled.program.sectionOrder).toEqual(
      expect.arrayContaining(["hero", "conversion", "services", "faq", "contact"]),
    );
  });
});
