# Design Craft Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a curated, fact-safe design craft layer to LaunchLoom creative authoring, behind a flag, and prove it with a three-recipe paired bakeoff before changing any default or gate.

**Architecture:** A shared contract module holds three recipe profiles and a compact prompt block. The authoring request carries the site recipe; the system prompt injects the matching profile only when `DESIGN_CRAFT_LAYER=1`. A bakeoff harness runs control and craft arms against the same fixture, then compares rendered judge scores, repair outcomes, cost, and time. The dossier remains authoritative for composition; the craft layer only governs execution quality.

**Tech Stack:** Node.js ESM, Vitest, Astro client-site template, existing OpenCode Go authoring transport, existing rendered-reference judge and creative bakeoff.

**Spec:** `docs/ai-design-skills-assessment.md`

## Global Constraints

- Precedence is fixed: business facts and provenance, then client brief and assets, then Reference Dossier and Reference DNA, then page recipe, then design craft.
- Never invent reviews, testimonials, staff, prices, credentials, guarantees, response times, logos, or client assets.
- Never load remote fonts. Use the resolved client heading and body families.
- Never use em dashes in generated or rendered content.
- `DESIGN_CRAFT_LAYER` defaults off. Only the exact value `1` enables the craft block.
- Do not change rendered-reference thresholds, visual-gate thresholds, technical gates, or promotion rules.
- Code authoring remains pinned to `opencode-go/deepseek-v4.1-flash`.
- The craft prompt block must stay at or below 8,000 characters.
- Three profiles only: `care-editorial`, `local-trades`, `general-editorial`.
- No new runtime dependencies.
- MIT attribution for adapted material stays in the standard and the contract module header.
- The bakeoff must not promote a candidate, deploy a site, or modify the production template.

## Review Focus

- A craft profile must never override dossier composition, section order, or signature mechanics.
- With the flag off, the authoring prompt must contain no craft block and behave as before.
- An unknown or missing recipe must fall back to `general-editorial`, never throw.
- The recipe must reach every authoring stage, not just the contract stage.
- The craft block must not reintroduce the source skill's invented-proof rules.
- The bakeoff must be paired on the same fixture and model, and must not claim improvement from unpaired runs.
- Token cost and wall-clock time must be reported beside quality scores.

---

### Task 1: Shared craft contract and profiles

**Files:**

- Create: `scripts/design-craft-contract.mjs`
- Test: `tests/design-craft-contract.test.ts`

**Interfaces:**

- Produces:
  - `DESIGN_CRAFT_LAYER_ENV: "DESIGN_CRAFT_LAYER"`
  - `DESIGN_CRAFT_PROFILES: Record<"care-editorial" | "local-trades" | "general-editorial", DesignCraftProfile>`
  - `designCraftProfile(recipe?: string): DesignCraftProfile`
  - `designCraftLayerEnabled(env?: Record<string, string | undefined>): boolean`
  - `designCraftPrompt(options?: { recipe?: string; enabled?: boolean }): string`
  - `DesignCraftProfile` shape: `{ id, label, type: { scaleRatio, displayWeight, bodyMeasure, headingTracking, bodyLineHeight }, spacing: { base, sectionRhythm, density }, radius: { family, max, nestedGapThreshold }, motion: { intensity, duration, easing, revealDistance }, signatureMoment }`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import {
  DESIGN_CRAFT_PROFILES,
  designCraftLayerEnabled,
  designCraftProfile,
  designCraftPrompt,
} from "../scripts/design-craft-contract.mjs";

describe("design craft contract", () => {
  it("defines three recipe profiles", () => {
    expect(Object.keys(DESIGN_CRAFT_PROFILES).sort()).toEqual([
      "care-editorial",
      "general-editorial",
      "local-trades",
    ]);
    expect(DESIGN_CRAFT_PROFILES["local-trades"].spacing.density).toBe(
      "compact",
    );
    expect(DESIGN_CRAFT_PROFILES["care-editorial"].motion.intensity).toBe(
      "restrained",
    );
  });

  it("falls back to general editorial for an unknown recipe", () => {
    expect(designCraftProfile("not-a-recipe").id).toBe("general-editorial");
    expect(designCraftProfile(undefined).id).toBe("general-editorial");
  });

  it("enables only on the exact flag value", () => {
    expect(designCraftLayerEnabled({ DESIGN_CRAFT_LAYER: "1" })).toBe(true);
    expect(designCraftLayerEnabled({ DESIGN_CRAFT_LAYER: "true" })).toBe(false);
    expect(designCraftLayerEnabled({})).toBe(false);
  });

  it("returns no prompt when disabled", () => {
    expect(designCraftPrompt({ recipe: "local-trades", enabled: false })).toBe(
      "",
    );
  });

  it("injects the assigned profile and keeps fact safety", () => {
    const prompt = designCraftPrompt({
      recipe: "care-editorial",
      enabled: true,
    });
    expect(prompt).toContain("DESIGN CRAFT CONTRACT");
    expect(prompt).toContain("care-editorial");
    expect(prompt).toContain("Never invent reviews");
    expect(prompt).toContain("No em dashes");
    expect(prompt).not.toContain("mandatory tagline");
    expect(prompt.length).toBeLessThanOrEqual(8_000);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/design-craft-contract.test.ts`
Expected: FAIL because `scripts/design-craft-contract.mjs` does not exist.

- [ ] **Step 3: Implement the contract module**

Create `scripts/design-craft-contract.mjs` with a header that credits
`elayadesign/ai-design-skills` (MIT, Copyright 2026 Elaya) and states that the
LaunchLoom adaptation removes invented-proof, font-mandate, Tailwind, and
mandatory-tagline rules.

Define the three profiles with these values:

| Field                   | care-editorial                                                     | local-trades                                        | general-editorial                                    |
| ----------------------- | ------------------------------------------------------------------ | --------------------------------------------------- | ---------------------------------------------------- |
| `type.scaleRatio`       | `1.25`                                                             | `1.2`                                               | `1.25`                                               |
| `type.displayWeight`    | `"500-600"`                                                        | `"600-700"`                                         | `"500-600"`                                          |
| `type.bodyMeasure`      | `"60-70ch"`                                                        | `"55-65ch"`                                         | `"60-70ch"`                                          |
| `type.headingTracking`  | `"-0.02em to -0.04em"`                                             | `"-0.01em to -0.02em"`                              | `"-0.02em to -0.04em"`                               |
| `type.bodyLineHeight`   | `"1.6-1.75"`                                                       | `"1.45-1.6"`                                        | `"1.6-1.75"`                                         |
| `spacing.base`          | `8`                                                                | `4`                                                 | `8`                                                  |
| `spacing.sectionRhythm` | `"spacious"`                                                       | `"compact"`                                         | `"asymmetric"`                                       |
| `spacing.density`       | `"generous"`                                                       | `"compact"`                                         | `"balanced"`                                         |
| `radius.family`         | `"soft"`                                                           | `"practical"`                                       | `"restrained"`                                       |
| `radius.max`            | `24`                                                               | `12`                                                | `20`                                                 |
| `motion.intensity`      | `"restrained"`                                                     | `"minimal"`                                         | `"purposeful"`                                       |
| `motion.duration`       | `"600-800ms"`                                                      | `"200-300ms"`                                       | `"500-700ms"`                                        |
| `motion.easing`         | `"cubic-bezier(0.22, 1, 0.36, 1)"`                                 | `"cubic-bezier(0.22, 1, 0.36, 1)"`                  | `"cubic-bezier(0.22, 1, 0.36, 1)"`                   |
| `motion.revealDistance` | `"24-32px"`                                                        | `"none"`                                            | `"16-24px"`                                          |
| `signatureMoment`       | `"Optional large-type tagline reveal after the opening argument."` | `"None. Keep the phone and quote actions primary."` | `"Optional editorial pull quote or tagline moment."` |

`designCraftPrompt` must return a block with these sections:

- Precedence statement naming the dossier, recipe profile, and facts.
- `TYPE`: resolved families, one display and one body role, modular scale,
  body measure, wrapping.
- `SPACE AND SHAPE`: spacing scale, section rhythm, one radius family, nested
  radius formula, no single-sided card borders or background gradients.
- `MOTION`: one base curve, transform and opacity only, IntersectionObserver,
  reduced motion.
- `STATES`: hover, active, focus, inline validation, loading, empty, no dead
  links, current-page indicator.
- `COPY`: specific sealed facts, no invented proof, omit unsupplied proof, no
  em dashes, sentence case.
- `PROFILE`: the selected profile values in plain text.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/design-craft-contract.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/design-craft-contract.mjs tests/design-craft-contract.test.ts
git commit -m "feat(design): add recipe-aware craft contract"
```

---

### Task 2: Inject the craft block behind the flag

**Files:**

- Modify: `scripts/author-production-experiences.mjs`
- Modify: `scripts/production-experience-author.mjs`
- Test: `tests/production-experience-author.test.ts`
- Test: `tests/design-craft-contract.test.ts`

**Interfaces:**

- Consumes: `designCraftPrompt({ recipe })` from Task 1.
- Produces: `AuthorStageRequest.recipe?: string`; every stage request carries the site recipe.

- [ ] **Step 1: Write the failing integration test**

In `tests/production-experience-author.test.ts`, extend the existing
`authorExperienceCandidates` adapter test so the fixture site has
`design: { recipe: "care-editorial" }`, and capture the recipe in
`prepareRequest`:

```ts
const seenRecipes: Array<string | undefined> = [];
// inside prepareRequest:
seenRecipes.push(request.recipe);
// after authorExperienceCandidates:
expect(seenRecipes.every((recipe) => recipe === "care-editorial")).toBe(true);
```

Also add a source-level test in `tests/design-craft-contract.test.ts`:

```ts
import { readFileSync } from "node:fs";

it("wires the craft block into the authoring prompt", () => {
  const source = readFileSync(
    "scripts/author-production-experiences.mjs",
    "utf8",
  );
  expect(source).toContain('from "./design-craft-contract.mjs"');
  expect(source).toContain("designCraftPrompt({ recipe: request.recipe })");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/production-experience-author.test.ts tests/design-craft-contract.test.ts`
Expected: FAIL because the recipe is not propagated and the prompt is not wired.

- [ ] **Step 3: Propagate the recipe**

In `scripts/production-experience-author.mjs`:

- Add `recipe?: string;` to the `AuthorStageRequest` typedef.
- In the `base` object inside `authorExperienceCandidates`, add:

```js
recipe: site.design?.recipe || "general-editorial",
```

Do not add the recipe to the content manifest or the visual brief. It is
authoring context, not sealed client content.

- [ ] **Step 4: Inject the prompt block**

In `scripts/author-production-experiences.mjs`:

- Import `designCraftPrompt` from `./design-craft-contract.mjs`.
- In `authorSystemPrompt(request)`, insert the block after `RELEASE RULES` and
  before `REFERENCE FIDELITY RULES`:

```js
${designCraftPrompt({ recipe: request.recipe })}
```

With the flag off, `designCraftPrompt` returns `""` and the prompt behavior is
unchanged apart from whitespace.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/production-experience-author.test.ts tests/design-craft-contract.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the broader authoring tests**

Run: `npx vitest run tests/production-experience-author.test.ts tests/creative-compiler.test.ts tests/rendered-reference-fidelity.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/author-production-experiences.mjs scripts/production-experience-author.mjs tests/production-experience-author.test.ts tests/design-craft-contract.test.ts
git commit -m "feat(design): inject recipe-aware craft contract behind a flag"
```

---

### Task 3: Write the normative standard

**Files:**

- Create: `docs/design-craft-standard.md`
- Modify: `docs/site-generation-guidelines.md`
- Modify: `docs/ai-design-skills-assessment.md` only if implementation reveals a correction.

**Interfaces:**

- Consumes: the three profiles and prompt sections from Task 1.
- Produces: the human-reviewable standard that explains precedence, profile values, and the bakeoff rule.

- [ ] **Step 1: Write the standard**

Include:

- Purpose and scope.
- Precedence order.
- The three recipe profiles and their values.
- Type, spacing, shape, motion, state, and copy rules.
- Explicit non-rules: no invented proof, no mandated fonts, no Tailwind-only
  scale, no mandatory tagline section, no blanket italic or hyphen ban.
- The flag and rollback behavior.
- MIT attribution.

- [ ] **Step 2: Link it from the site generation guidelines**

Add one paragraph to `docs/site-generation-guidelines.md` under the shared
standard:

```md
Creative authoring also follows `design-craft-standard.md` for execution
quality. The Reference Dossier remains authoritative for composition. The craft
standard is gated by `DESIGN_CRAFT_LAYER` until its paired bakeoff is accepted.
```

- [ ] **Step 3: Verify the docs**

Run: `grep -n "design-craft-standard" docs/site-generation-guidelines.md`
Expected: one match.

Run: `grep -n "—" docs/design-craft-standard.md`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add docs/design-craft-standard.md docs/site-generation-guidelines.md
git commit -m "docs(design): add the design craft standard"
```

---

### Task 4: Bakeoff harness

**Files:**

- Create: `scripts/run-design-craft-bakeoff.mjs`
- Test: `tests/design-craft-bakeoff.test.ts`

**Interfaces:**

- Produces:
  - `parseDesignCraftBakeoffArgs(argv: string[]): { config, recipe, out, model, siteDir, testProfile }`
  - `summarizeDesignCraftBakeoff(arms: Array<{ arm, recipe, report, run }>): { recipe, arms, deltas }`
  - `runDesignCraftBakeoff(options): Promise<{ summaryPath, summary }>`
- CLI:
  `node scripts/run-design-craft-bakeoff.mjs --config fixtures/design-demos/home-care.json --recipe care-editorial --out /tmp/opencode/craft-bakeoff/home-care --model opencode-go/deepseek-v4.1-flash`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import {
  parseDesignCraftBakeoffArgs,
  summarizeDesignCraftBakeoff,
} from "../scripts/run-design-craft-bakeoff.mjs";

describe("design craft bakeoff", () => {
  it("parses required arguments", () => {
    const args = parseDesignCraftBakeoffArgs([
      "--config",
      "fixtures/design-demos/home-care.json",
      "--recipe",
      "care-editorial",
      "--out",
      "/tmp/opencode/craft-bakeoff/home-care",
      "--model",
      "opencode-go/deepseek-v4.1-flash",
    ]);
    expect(args.recipe).toBe("care-editorial");
    expect(args.testProfile).toBe("seo-only");
  });

  it("reports paired deltas", () => {
    const summary = summarizeDesignCraftBakeoff([
      {
        arm: "control",
        recipe: "care-editorial",
        report: {
          candidates: [{ score: 70, visualScore: { overallScore: 60 } }],
        },
        run: { cost: 1, totalMs: 1000 },
      },
      {
        arm: "craft",
        recipe: "care-editorial",
        report: {
          candidates: [{ score: 78, visualScore: { overallScore: 68 } }],
        },
        run: { cost: 1.2, totalMs: 1200 },
      },
    ]);
    expect(summary.deltas.score).toBe(8);
    expect(summary.deltas.visualScore).toBe(8);
    expect(summary.deltas.cost).toBeCloseTo(0.2);
    expect(summary.deltas.totalMs).toBe(200);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/design-craft-bakeoff.test.ts`
Expected: FAIL because the script does not exist.

- [ ] **Step 3: Implement the harness**

Responsibilities:

- Parse args. Default `siteDir` to `templates/client-site`, `testProfile` to
  `seo-only` (one candidate), and `model` to
  `opencode-go/deepseek-v4.1-flash`.
- For each arm (`control`, `craft`):
  - Create `<out>/<arm>/site`.
  - Copy the client-site template, excluding `node_modules`, `dist`, `.astro`,
    `.launchloom`, and `.git`.
  - Replace `src/site.config.json` with the fixture config.
  - Symlink the repository `node_modules` into the temp site. If it is
    missing, run `npm ci` in the temp site.
  - Compile the inspiration pack with
    `node scripts/compile-inspiration-pack.mjs --config <temp config> --history <empty history> --out <temp site>/.launchloom/inspiration-pack.json`.
  - Run authoring with
    `node scripts/author-production-experiences.mjs --config <temp config> --inspiration <pack> --out <temp site>/.launchloom/generated-experiences --model <model> --test-profile seo-only`.
    Set `DESIGN_CRAFT_LAYER=0` for control and `1` for craft.
  - Run `runCreativeBakeoff` with `siteDir: tempSite`, `candidatesDir:
".launchloom/generated-experiences"`, `reportPath:
".launchloom/creative-bakeoff.json"`, `screenshotsDir:
".launchloom/creative-bakeoff-screenshots"`, `promote: false`,
    `preview: false`.
  - Read the authoring `creative-run.json` for cost and timing.
  - Copy the bakeoff report and authoring run into `<out>/<arm>/`.
- Write `<out>/summary.json` and `<out>/summary.md`.
- Never promote, deploy, or modify the shared template.
- Load local `.env` keys only in the CLI entrypoint; never print them.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/design-craft-bakeoff.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/run-design-craft-bakeoff.mjs tests/design-craft-bakeoff.test.ts
git commit -m "test(design): add a paired design craft bakeoff harness"
```

---

### Task 5: Run the paired bakeoff

**Files:**

- Create: `docs/calibration/2026-10-26-design-craft-bakeoff.json`
- Create: `docs/calibration/2026-10-26-design-craft-bakeoff.md`
- Modify: `.github/agents/progress-update/UPDATE-2026-10-26.md`

**Interfaces:**

- Consumes: the harness from Task 4.
- Produces: paired evidence for the rollout decision.

- [ ] **Step 1: Run the care recipe**

Run:

```bash
node scripts/run-design-craft-bakeoff.mjs \
  --config fixtures/design-demos/home-care.json \
  --recipe care-editorial \
  --out /tmp/opencode/craft-bakeoff/home-care \
  --model opencode-go/deepseek-v4.1-flash
```

- [ ] **Step 2: Run the local trades recipe**

Run:

```bash
node scripts/run-design-craft-bakeoff.mjs \
  --config fixtures/design-demos/garage-door.json \
  --recipe local-trades \
  --out /tmp/opencode/craft-bakeoff/garage-door \
  --model opencode-go/deepseek-v4.1-flash
```

- [ ] **Step 3: Run the general editorial recipe**

Run:

```bash
node scripts/run-design-craft-bakeoff.mjs \
  --config fixtures/design-demos/architecture.json \
  --recipe general-editorial \
  --out /tmp/opencode/craft-bakeoff/architecture \
  --model opencode-go/deepseek-v4.1-flash
```

- [ ] **Step 4: Record the evidence**

Write the three summaries into the calibration JSON and a short Markdown
report. Include, for each recipe:

- Judge overall and dimension scores.
- Candidate eligibility and selected candidate.
- Visual-gate findings.
- Technical gate result.
- Authoring cost and wall-clock time.
- Any fact, provenance, em dash, or overflow regression.

State plainly that the bakeoff is one candidate per recipe and is directional,
not a production promotion decision.

- [ ] **Step 5: Verify the evidence**

Run: `jq empty docs/calibration/2026-10-26-design-craft-bakeoff.json`
Expected: no output.

Run: `grep -n "—" docs/calibration/2026-10-26-design-craft-bakeoff.md`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add docs/calibration/2026-10-26-design-craft-bakeoff.json docs/calibration/2026-10-26-design-craft-bakeoff.md .github/agents/progress-update/UPDATE-2026-10-26.md
git commit -m "docs(design): record the paired design craft bakeoff"
```

---

### Task 6: Rollout decision

**Files:**

- Modify: `scripts/design-craft-contract.mjs` only if the bakeoff requires tuning.
- Modify: `.github/workflows/generate-client.yml`, `.github/workflows/test-generation.yml`, `.github/workflows/repair-creative-candidate.yml` only if the layer is accepted as default.
- Modify: `.github/agents/progress-update/UPDATE-2026-10-26.md`.

**Interfaces:**

- Consumes: the bakeoff evidence from Task 5.
- Produces: either a default-on rollout with a rollback flag, or a documented rejection with the layer left off.

- [ ] **Step 1: Apply the decision rule**

Accept the layer only if all three hold:

1. No fact, provenance, em dash, overflow, or contrast regression.
2. The craft arm improves or holds the judge overall score in at least two of
   the three recipes.
3. The craft arm does not increase authoring cost or time by more than 25
   percent.

If any condition fails, leave `DESIGN_CRAFT_LAYER` off, record the failed
condition, and stop. Do not tune the thresholds to force a pass.

- [ ] **Step 2: If accepted, set the default**

Set `DESIGN_CRAFT_LAYER=1` in the three creative workflows. Keep the environment
flag documented so a run can set it to `0` to roll back.

- [ ] **Step 3: Verify the workflow envs**

Run:

```bash
grep -n "DESIGN_CRAFT_LAYER" .github/workflows/generate-client.yml .github/workflows/test-generation.yml .github/workflows/repair-creative-candidate.yml
```

Expected: one `DESIGN_CRAFT_LAYER=1` in each creative authoring step.

- [ ] **Step 4: Run the focused tests**

Run:

```bash
npx vitest run tests/design-craft-contract.test.ts tests/design-craft-bakeoff.test.ts tests/production-experience-author.test.ts
```

Expected: PASS.

- [ ] **Step 5: Record the rollout and commit**

```bash
git add .github/workflows/generate-client.yml .github/workflows/test-generation.yml .github/workflows/repair-creative-candidate.yml .github/agents/progress-update/UPDATE-2026-10-26.md
git commit -m "feat(design): enable the design craft layer for creative runs"
```

---

## Self-Review

- Spec coverage: the plan covers the adapted standard, three profiles, compact
  prompt block, flag, paired bakeoff, measurement, and rollback. The audit and
  judge-language work from the assessment are intentionally deferred to a
  follow-up plan after the bakeoff.
- Step scan: each task ends in a testable deliverable. The bakeoff task is
  operational, not code, and records exact commands and evidence.
- Type consistency: `recipe` is a string carried on `AuthorStageRequest`;
  `designCraftPrompt` consumes it; the harness passes the fixture recipe.
- Review focus: the flag-off behavior, unknown recipe fallback, fact safety,
  and paired measurement each have a test or an explicit bakeoff check.
- Proportion: the plan is longer than the spec because it adds a harness and a
  rollout gate, but it does not transcribe the implementation body.
