import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  avoidPackIdsFromNotes,
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
      {
        name: "Residential design",
        description: "Plan a home around its site and daily routines.",
        slug: "residential-design",
      },
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
  it("describes local coverage using the business category without changing its page structure", () => {
    const local = site("Harbor Plumbing", "kinetic-poster");
    local.industry = "home-services";
    local.preset = "home-services";
    local.businessKind = "home-services";
    local.design = { ...local.design!, recipe: "local-trades", sections: [] };
    const care = site("Harbor Glow Wellness", "bold-utility");
    care.industry = "wellness";
    const bakery = site("Lumière Artisan Bakery & Café", "cinematic-narrative");
    bakery.industry = "hospitality";
    bakery.services = [{
      name: "Catering",
      description: "Catering orders for local gatherings.",
      slug: "catering",
    }];

    expect(compileExperiencePack(local, "local-trades").content.coverageHeading).toBe("Service in nearby communities.");
    expect(compileExperiencePack(care, "care-editorial").content.coverageHeading).toBe("Areas the practice serves.");
    expect(compileExperiencePack(site("Oak & Ledger", "bold-utility"), "general-editorial").content.coverageHeading)
      .toBe("Support across the local area.");
    expect(compileExperiencePack(bakery, "general-editorial").content).toMatchObject({
      coverageHeading: "Local to Asheville.",
      coverageIntro: "Ask about catering for a gathering.",
    });
  });

  it("splits model experience authorship into bounded response stages", () => {
    const stages = createSplitExperienceStages();
    expect(stages.map((stage) => stage.id)).toEqual([
      "contract",
      "appJsx",
      "stylesCss",
      "indexHtml",
    ]);
    expect(stages.every((stage) => stage.maxTokens <= 10000)).toBe(true);
    expect(
      stages.every((stage) => stage.schema.schema.required.length <= 2),
    ).toBe(true);

    expect(
      assembleSplitExperience({
        contract: {
          designContract: "A coherent contract",
          designRationale: "Distinct.",
        },
        appJsx: { content: "export default function App(){}" },
        stylesCss: { content: "body{}" },
        indexHtml: { content: '<div id="root"></div>' },
      }),
    ).toEqual({
      appJsx: "export default function App(){}",
      stylesCss: "body{}",
      indexHtml: '<div id="root"></div>',
      designRationale: "Distinct.",
      designContract: "A coherent contract",
    });
  });

  it("keeps model authorship behind deterministic release gates", () => {
    const lab = readFileSync(
      "scripts/generate-model-experience-lab.mjs",
      "utf8",
    );
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

  it("uses xhigh effort as the default Luna creative reasoning effort", () => {
    const author = readFileSync(
      "scripts/author-production-experiences.mjs",
      "utf8",
    );
    const repair = readFileSync("scripts/creative-repair-loop.mjs", "utf8");
    expect(author).toContain(
      '(model === "openai/gpt-6-luna" ? "xhigh" : "low")',
    );
    const sessionEffortIndex = repair.indexOf(
      "creativeSession?.reasoningEffort",
    );
    const envEffortIndex = repair.indexOf(
      "process.env.CREATIVE_EXPERIENCE_REASONING_EFFORT",
    );
    const xhighFallbackIndex = repair.indexOf('"xhigh";', envEffortIndex);
    expect(sessionEffortIndex).toBeGreaterThan(-1);
    expect(envEffortIndex).toBeGreaterThan(sessionEffortIndex);
    expect(xhighFallbackIndex).toBeGreaterThan(envEffortIndex);
  });

  it("runs one reasoning preflight before Luna and threads the frozen session through repair", () => {
    const workflow = readFileSync(
      ".github/workflows/generate-client.yml",
      "utf8",
    );
    const preflightIndex = workflow.indexOf(
      "scripts/run-reasoning-preflight.mjs",
    );
    const authorIndex = workflow.indexOf("npm run author:experiences");
    const repairIndex = workflow.indexOf(
      "scripts/run-rendered-creative-repair.mjs",
    );
    expect(preflightIndex).toBeGreaterThan(-1);
    expect(authorIndex).toBeGreaterThan(preflightIndex);
    expect(repairIndex).toBeGreaterThan(authorIndex);
    expect(workflow).toContain("vars.REASONING_PREFLIGHT_MODE || 'shadow'");
    expect(workflow).toContain(
      "vars.REASONING_PREFLIGHT_MODEL || 'jev-1.13.0'",
    );
    expect(workflow).toContain(
      "TYPESAFE_API_KEY: ${{ secrets.TYPESAFE_API_KEY || secrets.JEV_API_KEY }}",
    );
    expect(workflow).toContain("--session /tmp/reasoning-preflight.json");
    expect(workflow).toContain(
      '--session "$PWD/.launchloom/reasoning-preflight.json"',
    );
    expect(workflow).toContain(
      "cp /tmp/reasoning-preflight.json .launchloom/reasoning-preflight.json",
    );
    expect(workflow).toContain(
      'echo "reasoning_fallback=$FALLBACK_USED" >> "$GITHUB_OUTPUT"',
    );
    expect(workflow).toContain(
      "::warning title=Reasoning preflight fallback::TypeSafe/Jev selector fallback is active",
    );
    expect(workflow).toContain(
      "This creative session is frozen at max reasoning for quality safety.",
    );
  });

  it("reserves inspiration against latest history before reference analysis", () => {
    const workflow = readFileSync(
      ".github/workflows/generate-client.yml",
      "utf8",
    );
    const reservationIndex = workflow.indexOf(
      "- name: Reserve inspiration routes",
    );
    const reservationCompileIndex = workflow.indexOf(
      'node "$GITHUB_WORKSPACE/scripts/compile-inspiration-pack.mjs"',
      reservationIndex,
    );
    const recordIndex = workflow.indexOf(
      'node "$GITHUB_WORKSPACE/scripts/record-launch.mjs"',
      reservationIndex,
    );
    const analysisIndex = workflow.indexOf(
      "- name: Analyze reserved inspiration and freeze creative session",
    );
    expect(reservationIndex).toBeGreaterThan(-1);
    expect(reservationCompileIndex).toBeGreaterThan(reservationIndex);
    expect(recordIndex).toBeGreaterThan(reservationCompileIndex);
    expect(analysisIndex).toBeGreaterThan(recordIndex);
    expect(workflow).toContain(
      "History push raced with another intake; reselecting from latest main",
    );
    expect(workflow).toContain('--record-key "$LAUNCHLOOM_INTAKE_ID"');
    const reservationBlock = workflow.slice(reservationIndex, analysisIndex);
    expect(reservationBlock).toContain(
      'HISTORY_DIR="$RUNNER_TEMP/launchloom-history-main"',
    );
    expect(reservationBlock).toContain(
      'git worktree add --detach "$HISTORY_DIR" origin/main',
    );
    expect(reservationBlock).toContain('--history "$HISTORY_FILE"');
    expect(reservationBlock).toContain('git -C "$HISTORY_DIR" push origin HEAD:main');
    expect(reservationBlock).not.toContain("git reset --hard origin/main");
  });

  it("runs a three-viewport internal bakeoff and preserves a safe fallback", () => {
    const bakeoff = readFileSync("scripts/run-experience-bakeoff.mjs", "utf8");
    expect(bakeoff).toContain("width: 1536, height: 864");
    expect(bakeoff).toContain("width: 1366, height: 768");
    expect(bakeoff).toContain("width: 390, height: 844");
    expect(bakeoff).toContain("delete finalConfig.design.experience");
    expect(bakeoff).toContain('selectionMode: "internal-bakeoff"');
    expect(bakeoff).toContain("hero exceeds desktop viewport");
    expect(bakeoff).toContain("experience_bakeoff_candidate=");
    const workflow = readFileSync(
      ".github/workflows/generate-client.yml",
      "utf8",
    );
    expect(workflow).toContain(".launchloom/creative-bakeoff.json");
    expect(workflow).toContain("vars.CREATIVE_EXPERIENCE_MODE == 'promote'");
    expect(workflow).not.toContain("vars.CREATIVE_EXPERIENCE_MODE == 'legacy'");
    expect(workflow).not.toContain("run-experience-bakeoff.mjs");
    expect(workflow).not.toContain(
      "if: env.CREATIVE_EXPERIENCE_MODE != 'legacy'",
    );
    const creativeRender = workflow.slice(
      workflow.indexOf(
        "name: Render creative candidates in the production shell",
      ),
      workflow.indexOf("name: Build and direct-upload public preview"),
    );
    expect(creativeRender).not.toContain("continue-on-error: true");
    expect(workflow).toContain("Authored creative renderer was not selected");
    expect(workflow).toContain("CANDIDATE_ID=$(jq -r");
    expect(workflow).toContain("openai/gpt-6-luna");
    expect(workflow).toContain(
      "vars.CREATIVE_EXPERIENCE_REASONING_EFFORT || 'xhigh'",
    );
    expect(workflow).toContain(".launchloom/creative-bakeoff.json");
    expect(workflow).not.toContain("experience-bakeoff-screenshots");
    expect(workflow).not.toContain("Upload experience bakeoff evidence");
  });

  it("defines a factual, visually distinct second-business canary", () => {
    const fixture = JSON.parse(
      readFileSync(
        "fixtures/model-experience-businesses/portland-arborist.json",
        "utf8",
      ),
    );
    expect(fixture.businessBrief).toContain("Northline Tree Response");
    expect(fixture.assignedDirection).toContain("Bright Swiss utility");
    expect(fixture.assetBrief).toContain("canopy-hero.png");
    expect(fixture.interactionBrief).toContain("symptom-first tree assessment");
    expect(fixture.forbiddenClaims).toContain("24\\/7");
  });

  it("defines a separate gym canary with its own assets and interaction", () => {
    const fixture = JSON.parse(
      readFileSync(
        "fixtures/model-experience-businesses/oakland-bouldering-gym.json",
        "utf8",
      ),
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

  it("keeps guided portrait copy distinct and hides missing closing contact details", () => {
    const component = readFileSync(
      "templates/client-site/src/components/experiences/GuidedConversationExperience.astro",
      "utf8",
    );
    const styles = readFileSync(
      "templates/client-site/src/styles/experience-packs.css",
      "utf8",
    );

    expect(component).toContain(
      '{copy.contactHeading || "Tell us what would help."}',
    );
    expect(component).toContain(
      '{hero.primaryLabel || "Continue the conversation."}',
    );
    expect(component).toContain(
      '<a href="#guided-experience-lead">Start an inquiry</a>',
    );
    expect(component).toContain("{brand.email && <a href={`mailto:${brand.email}`}");
    expect(component).toContain("{brand.address && <p>{brand.address}</p>}");
    expect(styles).toContain(".xp-guide__hero figcaption");
    expect(styles).toContain("z-index: 2;");
    expect(styles).toContain("overflow-wrap: anywhere;");
    expect(styles).not.toContain("text-overflow: ellipsis;");
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
    const compiled = compileExperiencePack(requestedSite, "general-editorial");
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
    const first = compileExperiencePack(
      site("North Star"),
      "general-editorial",
    );
    const repeated = compileExperiencePack(
      site("North Star"),
      "general-editorial",
    );
    expect(repeated.program.fingerprint).toBe(first.program.fingerprint);
    const alternative = compileExperiencePack(
      site("North Star"),
      "general-editorial",
      {
        recentFingerprints: [first.program.fingerprint],
      },
    );
    expect(alternative.program.fingerprint).not.toBe(first.program.fingerprint);
  });

  it("keeps all three structural packs reachable for each recipe", () => {
    for (const recipe of [
      "care-editorial",
      "local-trades",
      "general-editorial",
    ] as const) {
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

  it("compiles bakeoff candidates with per-pack coverage while rejecting image-dependent packs without media", () => {
    const input = site("No Image Business");
    const candidates = compileExperienceCandidates(input, "general-editorial");
    expect(candidates).toHaveLength(6);
    expect(new Set(candidates.map((candidate) => candidate.packId))).toEqual(
      new Set(["cinematic-narrative", "bold-utility", "kinetic-poster"]),
    );
    for (const packId of [
      "cinematic-narrative",
      "bold-utility",
      "kinetic-poster",
    ] as const) {
      expect(
        candidates.filter((candidate) => candidate.packId === packId),
      ).toHaveLength(2);
    }
    for (const candidate of candidates.filter(
      (item) => item.packId === "cinematic-narrative",
    ))
      expect(candidate.diagnostics).toContain(
        "This experience requires a verified business-relevant image.",
      );
    expect(
      compileExperiencePack(input, "general-editorial").program.packId,
    ).not.toBe("cinematic-narrative");
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
      expect.arrayContaining([
        "hero",
        "conversion",
        "services",
        "faq",
        "contact",
      ]),
    );
  });

  it("registers variant structures with unique fingerprints and a primary standard", () => {
    const packs = listExperiencePacks();
    const fingerprints = packs.flatMap((pack) =>
      pack.variants.map((variant) => variant.fingerprint),
    );
    expect(new Set(fingerprints).size).toBe(fingerprints.length);
    for (const pack of packs) {
      expect(pack.variants[0].id).toBe("standard");
      expect(pack.variantId).toBe("standard");
      expect(pack.fingerprint).toBe(pack.variants[0].fingerprint);
      expect(new Set(pack.variants.map((variant) => variant.hero)).size).toBe(
        pack.variants.length,
      );
      expect(
        new Set(pack.variants.map((variant) => variant.services)).size,
      ).toBe(pack.variants.length);
    }
  });

  it("compiles a requested variant behind the same stable interface", () => {
    const input = site("Variant Request", "bold-utility");
    input.design!.experience = {
      packId: "bold-utility",
      variantId: "portrait",
    };
    const compiled = compileExperiencePack(input, "general-editorial");
    expect(compiled.source).toBe("requested");
    expect(compiled.program.packId).toBe("bold-utility");
    expect(compiled.program.variantId).toBe("portrait");
    expect(compiled.program.hero).toBe("guided-portrait");
    expect(compiled.program.services).toBe("service-grid");
    expect(compiled.program.sectionOrder[0]).toBe("hero");
    expect(compiled.program.sectionOrder[1]).toBe("conversion");
  });

  it("falls back to the standard variant when a requested variant is unknown", () => {
    const input = site("Variant Fallback", "bold-utility");
    input.design!.experience = {
      packId: "bold-utility",
      variantId: "nonexistent",
    };
    const compiled = compileExperiencePack(input, "general-editorial");
    expect(compiled.program.variantId).toBe("standard");
    expect(compiled.diagnostics.join(" ")).toContain(
      "Unknown experience variant",
    );
  });

  it("caps bakeoff candidates while keeping every compatible pack reachable", () => {
    const input = site("Cap Check");
    input.images.hero = "/images/hero.webp";
    const candidates = compileExperienceCandidates(input, "general-editorial", {
      maxCandidates: 4,
    });
    expect(candidates).toHaveLength(4);
    expect(new Set(candidates.map((candidate) => candidate.packId)).size).toBe(
      3,
    );
  });

  it("front-loads one candidate per inspiration route", () => {
    const input = site("Route Aware");
    input.images.hero = "/images/hero.webp";
    const routePreferences = [
      {
        navigation: "discreet-overlay-navigation",
        heroGeometry: "image-narrative-monument",
        servicePresentation: "editorial-index-chapters",
        typographyCategory: "cinematic-editorial-contrast",
      },
      {
        navigation: "utility-pill-navigation",
        heroGeometry: "editorial-dialogue-portrait",
        servicePresentation: "service-chapters-qualifier",
        typographyCategory: "humanist-calm",
      },
      {
        navigation: "command-bar-navigation",
        heroGeometry: "poster-split-full-bleed",
        servicePresentation: "diagnostic-list-problem-grid",
        typographyCategory: "graphic-impact-documentary",
      },
    ];
    const candidates = compileExperienceCandidates(input, "general-editorial", {
      routePreferences,
    });
    expect(
      candidates
        .slice(0, 3)
        .map((candidate) => `${candidate.packId}:${candidate.variantId}`),
    ).toEqual([
      "cinematic-narrative:standard",
      "bold-utility:standard",
      "kinetic-poster:full-bleed",
    ]);
    const repeated = compileExperienceCandidates(input, "general-editorial", {
      routePreferences,
    });
    expect(
      repeated
        .slice(0, 3)
        .map((candidate) => `${candidate.packId}:${candidate.variantId}`),
    ).toEqual([
      "cinematic-narrative:standard",
      "bold-utility:standard",
      "kinetic-poster:full-bleed",
    ]);
  });

  it("maps prohibited brand-note patterns to avoided packs", () => {
    expect(
      avoidPackIdsFromNotes(
        "Do not use a white pill navbar, pale arch hero panel, centered split-card layout, or the guided-conversation visual language.",
      ),
    ).toEqual(["bold-utility"]);
    expect(avoidPackIdsFromNotes("Avoid command-bar navigation.")).toEqual([
      "kinetic-poster",
    ]);
    expect(avoidPackIdsFromNotes("Warm, calm, and human.")).toEqual([]);
  });

  it("penalizes an avoided pack during candidate scoring and selection", () => {
    const input = site("Avoidance Check");
    input.images.hero = "/images/hero.webp";
    const avoid = avoidPackIdsFromNotes(
      "Do not use a white pill navbar, pale arch hero panel, centered split-card layout, or the guided-conversation visual language.",
    );
    const candidates = compileExperienceCandidates(input, "general-editorial", {
      avoidPackIds: avoid,
    });
    const baseline = compileExperienceCandidates(input, "general-editorial");
    const findBold = (list: ReturnType<typeof compileExperienceCandidates>) =>
      list.find(
        (candidate) =>
          candidate.packId === "bold-utility" &&
          candidate.variantId === "standard",
      );
    expect(findBold(candidates)!.compatibilityScore).toBeLessThan(
      findBold(baseline)!.compatibilityScore,
    );

    const selected = selectExperiencePackId({
      recipe: "general-editorial",
      seed: "avoidance|check",
      hasImage: true,
      avoidPackIds: avoid,
    });
    expect(selected).not.toBe("bold-utility");
  });

  it("varies the preferred variant by intake seed", () => {
    const preferred = new Set(
      Array.from({ length: 40 }, (_, index) => {
        const input = site(`Seed Business ${index}`);
        input.images.hero = "/images/hero.webp";
        return compileExperienceCandidates(input, "general-editorial")
          .filter((candidate) => candidate.packId === "bold-utility")
          .sort(
            (left, right) => right.compatibilityScore - left.compatibilityScore,
          )[0].variantId;
      }),
    );
    expect(preferred).toEqual(new Set(["standard", "portrait"]));
  });

  it("penalizes a recently launched pack and variant fingerprint", () => {
    const input = site("Variant Recency");
    input.images.hero = "/images/hero.webp";
    const baseline = compileExperienceCandidates(input, "general-editorial");
    const boldStandard = baseline.find(
      (candidate) =>
        candidate.packId === "bold-utility" &&
        candidate.variantId === "standard",
    );
    expect(boldStandard).toBeDefined();
    const penalized = compileExperienceCandidates(input, "general-editorial", {
      recentFingerprints: [boldStandard!.blueprint.fingerprint],
    });
    const penalizedBold = penalized.find(
      (candidate) =>
        candidate.packId === "bold-utility" &&
        candidate.variantId === "standard",
    );
    expect(penalizedBold!.compatibilityScore).toBeLessThan(
      boldStandard!.compatibilityScore,
    );
  });
});
