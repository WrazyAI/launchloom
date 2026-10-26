# AI design skills evaluation for the content pipeline

Research date: 2026-10-26

## Decision

Use `elayadesign/ai-design-skills` as **reference material**, not as a
verbatim prompt. Extract three things: a strategy-first narrative spine, an
objection and proof discipline, and a compact visual and motion craft
checklist. Reject the parts that fabricate business facts, mandate a fixed
visual system, or replace the assigned Reference DNA and page recipe.

The skill is a useful addition to the content layer. It is not a new
generation engine, and installing it whole would make the output more
generic and less truthful.

## Source inventory

- Repository: https://github.com/elayadesign/ai-design-skills
- Inspected revision: `a2735a3` (2026-10-26), shallow clone.
- License: MIT. `landing-page-design` credits `Leonxlnx/taste-skill`;
  `design-to-motion` credits three MIT motion collections.
- Files:
  - `skills/landing-page-design/SKILL.md`, 431 lines. Two halves: strategy
    and structure (A1-A8), then a non-negotiable visual system (B1-B11).
  - `skills/design-to-motion/SKILL.md`, 513 lines. A Figma-to-MP4/GIF
    showcase workflow (Parts A-C).
  - `README.md`, install instructions for Claude Code, Cursor, Codex,
    Windsurf, Cline, and chat tools.

## What is genuinely useful

1. **Strategy before prose.** The skill opens with one offer, one audience,
   one primary action, the top three objections, the traffic source, and the
   proof inventory (`landing-page-design`, lines 8-50). Our copy prompt asks
   for the output of that thinking, but it never asks the model to commit to
   the strategy first. That is the highest-leverage idea in the repository.
2. **The page is an argument, not a section list.** Hero promise, problem to
   solution, outcome benefits, how it works, proof, objections, final action
   (`landing-page-design`, lines 52-72). This is a stronger narrative spine
   than "give each section a distinct job."
3. **Objections are a section, not a footnote** (`landing-page-design`, line
   99), and **proof sits next to the claim it supports** (line 378). Our
   current guidelines already forbid invented proof, but they do not force
   the model to place supplied proof beside the claim.
4. **CTA craft.** A CTA is a verb plus what the visitor gets, never "Learn
   more" or "Submit" (`landing-page-design`, lines 108-112). Our prompt says
   one primary and one secondary action, but it does not test the CTA text.
5. **Build and revise section by section.** Never rebuild the whole page on
   each iteration (`landing-page-design`, lines 116-127). This aligns with
   our bounded revision rule and could make revisions more predictable.
6. **Ship-state completeness.** Hover, active, focus, loading, empty, error,
   no dead links, current navigation item, 404, legal links, form validation,
   skip link, favicon, meta tags, alt text (`landing-page-design`, lines
   307-333). Some of this is template-owned already, but it is a useful
   authoring checklist.
7. **Motion should show what changed, not decorate.** The website section of
   `design-to-motion` says to animate only sections with a visual part, to
   trigger once with `IntersectionObserver`, to pause off screen, and to
   respect reduced motion (lines 35-52). The "every visual acts out its
   story" idea (line 236) is useful if reduced to one purposeful interaction.

## What we must not adopt

1. **Invented content realism.** The skill tells the model to give
   testimonials and team members full names and to make pricing look real
   (`landing-page-design`, lines 295-305). That directly violates
   `scripts/business-copy-claims.mjs`, the business-facts contract, and the
   rule against invented reviews, staff, prices, credentials, and outcomes.
2. **A mandatory tagline reveal section** (`landing-page-design`, lines
   335-351). Our guidelines forbid repeating one claim across hero, proof,
   services, and About, and the assigned section rhythm is binding. A
   mandatory extra section would fight both.
3. **A fixed visual system.** Geist/Manrope/Poppins only, no italics, no
   background gradients, a floating pill navigation, a full-height mobile
   menu, and one typeface per site (`landing-page-design`, lines 150-291).
   Our pipeline already has two distinct page recipes, client typography and
   palette contracts, and Reference DNA. A second visual system would flatten
   the recipes and compete with the dossier.
4. **The Figma-to-MP4 workflow.** `design-to-motion` assumes a Figma source,
   layer export, PSNR fidelity checks, deterministic frame capture, and
   video/GIF encoding. That is a showcase-video product, not a multi-page
   local-business site generator. Importing it would add complexity without
   improving the site output.
5. **A wholesale prompt injection.** The two files are roughly 14k tokens.
   Our authoring request already carries the route, dossier, Reference DNA,
   evidence, palette contract, and stage rules. Adding the full skill would
   crowd out the evidence and raise cost without a matching quality gain.

## Mapping to the current pipeline

- Copy lane: `scripts/generate-site-config.mjs`. The system prompt at lines
  2838-2848 already covers who/what/where/next action, one primary and one
  secondary action, distinct section jobs, no repeated claims, no invented
  facts, distinct service descriptions, and route-level FAQs. It does not
  produce an inspectable narrative plan, a top-three objection list, a proof
  inventory, or a CTA text test.
- Copy refinement: `scripts/generate-site-config.mjs`, lines 2911-2918.
  Same gaps.
- Authoring lane: `scripts/author-production-experiences.mjs`. The prompt is
  heavily reference-DNA and gate driven. It already covers hero fit, mobile
  recomposition, contrast, route links, reduced motion, and section markers.
  It does not carry a compact craft checklist for type scale, spacing,
  nested radii, meaningful line breaks, or state completeness.
- Existing retained guidance: `docs/design-guidance/anthropic/frontend-design/`
  already covers distinctive visual direction and warns against generated
  defaults. It is a better fit for the "make it feel designed" problem than
  the new skill's fixed visual system.
- Normative standard: `docs/site-generation-guidelines.md` already states the
  truth, proof, recipe, and acceptance rules. The new material must extend
  this document, not replace it.

## Proposed integration

### 1. Vendor the source as reference

Add `docs/design-guidance/elaya/landing-page-design/` with the upstream
`SKILL.md`, `LICENSE`, and a README recording the revision, source URL, and
the LaunchLoom adaptations. Do not inject it into runtime prompts.

### 2. Add a narrative spine to the copy lane

Before writing copy, the model returns a `narrative` object:

- `audience`: who this page is for, in one sentence.
- `offer`: what the business actually provides, in plain terms.
- `primaryAction` and `secondaryAction`: the real next steps.
- `objections`: the top three reasons a qualified visitor hesitates.
- `proofInventory`: only supplied or verified proof, with its source.
- `sectionJobs`: one sentence per section, with no repeated claim.
- `pageArgument`: the order in which the page answers the visitor.

Copy is then generated from that spine. The spine is stored in the private
brief and is not rendered as public copy.

### 3. Add a deterministic narrative audit

Add `scripts/conversion-narrative-audit.mjs` to check:

- exactly one primary action;
- CTA text is a verb plus an outcome, not "Learn more" or "Submit";
- each of the three objections is answered somewhere in the page;
- every proof claim maps to supplied evidence;
- no section job repeats another;
- the hero promise is 4-10 words and the body is one sentence under 28 words
  (already enforced elsewhere, kept as a cross-check).

The audit is a repair signal first. It becomes a hard gate only after a
calibration run shows it does not reject good sites.

### 4. Add a compact craft checklist to authoring

Add only the rules that survive our contracts, scoped to "where Reference DNA
is silent":

- snap type sizes to the existing scale;
- use the existing spacing scale;
- apply the nested radius formula;
- cap hero copy width and break lines at meaningful points;
- no single-sided card borders;
- every interactive element has hover, active, focus, and disabled states;
- no dead links and the current page is indicated;
- one purposeful motion, transform and opacity only, `IntersectionObserver`,
  reduced-motion fallback.

Do not import the font list, the color list, the mandatory tagline section, or
the navigation pattern.

### 5. Add a soft taste audit

Add a copy and narrative score to the existing quality report: clarity,
specificity, objection handling, proof discipline, and section distinctness.
Keep it as a report, not a hard gate, until it is calibrated against human
review. Use the pinned DeepSeek Flash model for copy critique. GLM remains a
visual judge only.

## Phase 1 implementation and first bake-off (2026-10-26)

Implemented the narrative spine in the copy lane:

- `normaliseNarrativeSpine` and `evaluateNarrativeSpine` in
  `scripts/generate-site-config.mjs`.
- The copy prompt now asks for the narrative before the page copy and adds a
  `COPY SPECIFICITY` block.
- The narrative is stored in `qualityReport.narrative` and
  `qualityReport.narrativeAudit`; it is not rendered.
- A service card that restates its service name is now a copy issue and enters
  the existing bounded repair loop.

Live A/B on the Rainline Plumbing fixture through OpenCode Go, same intake:

| Run | Hero heading | Service cards | Result |
| --- | --- | --- | --- |
| Baseline, pre-change prompt | "Clear Answers for Plumbing Problems" | Concrete but generic in places | Quality 100 |
| Narrative v1, spine without specificity rules | "Plumbing Help, Clearly Explained" | Regressed to "Request [service] for [service] problem" | Narrative audit 100, quality 100 |
| Narrative v2, spine plus `COPY SPECIFICITY` and the restatement check | "A clearer next step for plumbing" | Named symptoms and next steps | Narrative audit 100, quality 100 |

The deterministic restatement check flags the v1 service cards, so that
regression would enter repair rather than ship. This is one sample. It shows
the prompt can improve specificity, not that it always will. The next step is a
three-intake blind comparison and a rendered review.

## Phases

### Phase 1: Content engine (today)

- Baseline three representative intakes with the current prompts.
- Build the narrative spine and copy craft contract.
- Add the deterministic audit and tests.
- Run a blind comparison: current prompt versus narrative-spine prompt.
- Ship only if the comparison shows a clear lift and all existing gates hold.

### Phase 2: Visual and motion craft (this week)

- Add the compact craft checklist to the authoring and styles stages.
- Add the one-purpose motion rule.
- Run creative-only gated candidates and compare rendered output.
- Do not change Reference DNA, recipe selection, or gate thresholds.

### Phase 3: Quality report and revision intents (next)

- Surface the narrative and craft scores in the private preview.
- Map client revision requests to bounded operations: tighten the hero, add an
  objection, change the CTA, replace a proof point, adjust one section.
- Keep the approved site and unrelated sections intact.

### Phase 4: Client approval and publishing (later)

- Client-facing approval state, domain handoff, and publication.
- No public production without the business's authorization.

## Evidence limits

- The initial assessment was a document review. The Phase 1 section records a
  one-sample live A/B; it is not yet a multi-intake measured quality delta.
- The repository is small and new (two skills, one recent revision). Its
  visual rules are opinions, not measured conversion evidence.
- The copy lane currently runs on `z-ai/glm-5.3-flash`. If the model policy is
  "GLM only as a visual judge," that lane should move to the pinned DeepSeek
  Flash model as part of Phase 1.
