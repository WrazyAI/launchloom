# AI design skills assessment

Date: 2026-10-26

Sources inspected:

- [elayadesign/ai-design-skills](https://github.com/elayadesign/ai-design-skills) at
  `a2735a3eaf092eaaffb6dc17df25de33ef3bd048` (MIT, Copyright 2026 Elaya)
  - `skills/landing-page-design/SKILL.md`
  - `skills/design-to-motion/SKILL.md`
- [elayadesign/redesign-skill](https://github.com/elayadesign/redesign-skill) at
  `7df13f6a289f4a7f91c5fe3efd70f51fd584ec28` (MIT)
  - `skills/redesign-existing-projects/SKILL.md`
- LaunchLoom authoring and gate code:
  - `scripts/author-production-experiences.mjs`
  - `scripts/rendered-reference-fidelity.mjs`
  - `scripts/visual-quality-gate.mjs`
  - `docs/site-generation-guidelines.md`
  - `docs/local-business-design-direction.md`
  - `templates/client-site/src/lib/font-catalog.mjs`
  - `templates/client-site/src/layouts/SiteLayout.astro`

## Bottom line

`landing-page-design` is a strong craft baseline, but it is not a drop-in
addition to the authoring prompt. Roughly:

- 35 to 45 percent is directly useful: conversion discipline, type and spacing
  systems, radius logic, motion rules, interaction states, ship checklist.
- 25 to 30 percent is adaptable: content specificity, proof placement, page
  structure, motion timing.
- 25 to 30 percent conflicts with LaunchLoom rules or is irrelevant: invented
  proof, mandated fonts, Tailwind-only scales, mandatory tagline section,
  blanket bans on italics and hyphens.

`design-to-motion` is mostly a Figma-to-MP4/GIF showcase workflow. About 10
percent applies to client sites, mainly its website motion rules. It should not
be integrated into the client-site authoring lane now.

The companion `redesign-existing-projects` skill is highly relevant to the
revision and visual-repair lane. It is a diagnostic checklist, not a page
recipe, so it fits the existing source-repair loop better than the initial
authoring prompt.

Recommendation: integrate a curated, fact-safe craft layer plus a deterministic
craft audit, behind a flag, and prove it in a three-recipe bakeoff before making
it the default. Do not paste either full skill into the prompt.

## What each skill actually provides

### landing-page-design

Part A is strategy and structure:

- One offer, one audience, one primary action.
- Required above-the-fold content and a conventional mid-page argument.
- Layout selection by traffic and intent.
- Specific copy, benefit-first writing, objection handling, proof placement.
- SEO and AEO guidance.

Part B is a visual system:

- Type scale, line heights, tracking, button type.
- Spacing scale.
- Radius scale and nested-radius formula.
- Flat backgrounds and border rules.
- Hero heading treatment and line-break guidance.
- Icon set restrictions.
- Motion curve, durations, scroll reveals, navigation motion.
- Content realism rules.
- Interaction states and ship requirements.
- A mandatory large-type tagline reveal section.

The useful core is Part B's execution discipline and the conversion rules in
Part A. The brand-specific rules are the weak part for LaunchLoom because our
clients choose from a self-hosted font catalog and our page recipes already
define composition.

### design-to-motion

Part A rebuilds a Figma frame exactly. Part B defines loading choreography and
story loops for product visuals. Part C records and exports MP4 and GIF files.

Only the website rules in the "Two contexts" section and parts of B8 apply to a
client marketing site:

- Trigger section motion with `IntersectionObserver` at about 30 percent
  visibility.
- Play the intro once; pause stories when the section leaves the viewport.
- Stagger in reading order inside the section.
- Animate `transform`, `opacity`, `filter`, and `clip-path` only.
- Respect `prefers-reduced-motion`.

Everything about Figma layer export, PSNR fidelity, capture clocks, and MP4/GIF
encoding is out of scope for the client-site pipeline. It may be useful later
for LaunchLoom's own marketing assets or a product-showcase lane.

### redesign-existing-projects

This is the most directly useful skill for the revision lane. It is a diagnostic
with a fix-priority order:

1. Font swap
2. Color and surface cleanup
3. Hover, active, and focus states
4. Layout and spacing
5. Motion pass
6. Generic component replacement
7. Loading, empty, and error states
8. Copy pass
9. Type scale polish

It also contains a broad "generic AI design" checklist: three equal card
columns, gradient backgrounds, pill badges, accordion FAQs, default easing,
missing states, dead links, placeholder copy, and so on. That is a good
vocabulary for the source-repair prompt and for visual-gate findings.

It has the same content-realism conflicts as `landing-page-design`, so it must
be adapted before use.

## Fit against LaunchLoom

| Skill rule                                         | Decision                | Reason                                                                                       |
| -------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------- |
| One primary action, one secondary action           | Keep                    | Already in `site-generation-guidelines.md`; reinforces it.                                   |
| Proof next to the claim it supports                | Adapt                   | Keep only when proof is supplied or verified. Never invent it.                               |
| Specific copy, banned filler words                 | Keep                    | Aligns with the existing copy standard.                                                      |
| Objection handling and FAQ                         | Adapt                   | Useful, but the page recipe decides sequence and count.                                      |
| Type scale and role hierarchy                      | Adapt                   | Use a modular scale in local CSS, not Tailwind class names.                                  |
| Spacing scale                                      | Adapt                   | Use a 4/8-based local scale; do not force Tailwind values.                                   |
| Radius scale and nested formula                    | Adapt                   | Useful execution rule; must not override dossier geometry.                                   |
| Motion curve and durations                         | Adapt                   | Use one base curve, animate cheap properties, reduced motion.                                |
| `IntersectionObserver` reveals                     | Adapt                   | Already partly present; make it explicit in the motion stage.                                |
| Hover, active, focus, loading, empty, error states | Adapt                   | Host already provides some; authored components still need them.                             |
| Skip link, 404, meta, sitemap, alt text            | Keep as audit           | Template already covers most; audit candidate-specific gaps.                                 |
| Mandatory tagline reveal section                   | Reject as mandatory     | Conflicts with local-trades directness and dossier section rhythm. Make optional per recipe. |
| Mandated fonts (Geist, Manrope, Poppins)           | Reject                  | Clients choose from the self-hosted OFL catalog, which includes Inter.                       |
| One typeface per site                              | Reject                  | Editorial and care recipes use display/body pairing.                                         |
| Tailwind default type scale                        | Adapt                   | Our sites are vanilla CSS and Astro; use the ratio and role logic.                           |
| Flat backgrounds, no gradients                     | Adapt                   | Keep flat surfaces; a text gradient is risky for the contrast gate.                          |
| No italics anywhere                                | Reject                  | Editorial recipes may use italic accents; keep the client's choice.                          |
| No hyphens in copy                                 | Reject                  | Too broad; the existing rule is no em dashes.                                                |
| Invent testimonials, names, logos, prices, metrics | Reject                  | Direct conflict with the business-facts contract and provenance rules.                       |
| Invent a risk reversal or guarantee                | Reject                  | Only use supplied offers and terms.                                                          |
| Figma fidelity, PSNR, MP4/GIF export               | Reject for client sites | Out of scope; separate asset lane if needed.                                                 |

## Serious conflicts that must be resolved in the prompt

These are not style preferences. They are correctness and safety issues.

1. **Fabricated proof.** `landing-page-design` B8 says to give testimonials
   and team members specific names, invent customer brands, and make pricing
   look real. LaunchLoom forbids invented reviews, staff, prices, credentials,
   guarantees, and client assets. The adapted rule is: write specific,
   non-claiming copy from sealed facts, and omit proof when it is not supplied.
2. **Font mandate.** The skill bans Inter and requires one typeface. Our font
   catalog includes Inter, and client choice plus recipe pairing must win.
3. **Tailwind scale.** The skill assumes Tailwind classes. Our authored CSS is
   vanilla. The rule becomes a local modular scale with documented roles.
4. **Mandatory tagline reveal.** A large animated tagline section is wrong for
   urgent local trades and can conflict with the dossier's section sequence.
   It becomes an optional editorial treatment, never a required section.
5. **Invented risk reversal.** Free trials, guarantees, and cancellation terms
   cannot be invented. Only supplied offers may appear.
6. **Blanket bans on italics and hyphens.** These would fight the editorial
   recipe and normal compound words. Keep the existing em dash ban.

## Recommended integration architecture

### 1. Normative standard, not a vendored skill

Create `docs/design-craft-standard.md` as the LaunchLoom-specific standard. It
should contain the adapted rules, the precedence order, and MIT attribution. It
is the document humans review and the source for the prompt block.

Precedence order, highest first:

1. Business facts, provenance, and safety contract
2. Client visual brief and supplied assets
3. Assigned Reference Dossier and Reference DNA
4. Page recipe
5. Design craft rules

The craft layer improves execution. It never changes composition, facts, or
brand direction.

### 2. One shared token contract

Create `scripts/design-craft-contract.mjs` exporting:

- `DESIGN_CRAFT_PROMPT` for the authoring prompt.
- `DESIGN_CRAFT_TOKENS` for the audit: type ratios, spacing steps, radius
  steps, motion durations, easing curves.
- `DESIGN_CRAFT_RULES` for the judge and audit: banned filler, required states,
  motion constraints, conflict notes.

The prompt and the audit read the same values. This avoids the common failure
where the prompt says one thing and the gate checks another.

### 3. Compact prompt block, not the full skill

Add a `DESIGN CRAFT CONTRACT` block to `authorSystemPrompt`, roughly 50 to 70
lines or 5,000 to 7,000 characters. The current system prompt is about 5,500
characters, so this is a meaningful but bounded increase. The block should say:

- The dossier defines composition; this contract defines execution quality.
- Choose one display role and one body role from the client's resolved fonts.
- Resolve type to a small modular scale; no arbitrary one-off sizes.
- Resolve spacing to a 4/8-based scale; keep section rhythm consistent.
- Use one radius family; apply the nested-radius formula only when it fits.
- Use one base easing curve; animate transform and opacity only.
- Use `IntersectionObserver` for reveals; respect reduced motion.
- Ship focus, hover, active, loading, empty, and error states where relevant.
- Never invent proof, prices, staff, guarantees, or assets.
- No em dashes. No placeholder copy.

Stage-specific additions:

- **Contract stage:** include the type scale, spacing rhythm, radius family,
  motion plan, and state plan in `designContract`.
- **Styles stage:** define the tokens once, bind client font variables, and
  avoid arbitrary values outside the scale.
- **Motion stage:** one base curve, cheap properties, `IntersectionObserver`,
  reduced-motion equivalent.

### 4. Deterministic craft audit, report-only first

Create `scripts/design-craft-audit.mjs` and run it after the build, before the
visual gate. It should report, not block, in the first rollout:

- Distinct font sizes and whether they follow the declared scale.
- Spacing values that fall outside the declared steps.
- Radius values outside the declared family.
- Transition timing functions and durations.
- Scroll event listeners used for animation.
- `prefers-reduced-motion` coverage.
- Focus-visible coverage on interactive elements.
- Skip link, 404 route, meta description, and image alt coverage.
- Banned filler words in authored marketing copy.
- Em dashes.

The audit produces a JSON report with counts and selectors. It does not rewrite
copy or CSS. Blocking rules are added only after the bakeoff shows the signal is
reliable.

### 5. Judge rubric additions

The rendered judge already scores `typography`, `spatialRhythm`, and
`interactionEvidence`. Add explicit language to the judge prompt:

- Penalize default `ease`, `linear`, and `ease-in-out` on entrances.
- Penalize visibly inconsistent spacing and one-off type sizes.
- Penalize missing focus treatment and reduced-motion handling.
- Penalize generic card walls, gradient backgrounds, and dead controls.

Do not add new hard thresholds in the first pass. The existing thresholds stay
unchanged. The craft layer should raise the quality of what reaches the gate,
not lower the bar.

### 6. Revision lane uses the diagnostic skill

For source repair on a selected candidate, add the adapted
`redesign-existing-projects` fix-priority checklist to the repair prompt. This
is a better fit than `landing-page-design` because the revision lane already
has an approved design and only needs targeted improvement. Keep the same fact
and provenance precedence.

## Prompt shape

The block should read like a contract, not a tutorial. Example:

```text
DESIGN CRAFT CONTRACT
The assigned Reference Dossier defines composition, section rhythm, and visual
mechanics. This contract defines execution quality inside that assignment. If
they conflict, the dossier wins on composition and this contract wins on craft.
Business facts and provenance always win over both.

TYPE
- Use the resolved client heading and body families. Never load remote fonts.
- Use one display role and one body role. Do not add a third family.
- Resolve sizes to a small modular scale with documented roles. No one-off
  sizes, no arbitrary clamp values without a role.
- Cap body measure near 65 characters. Use text-wrap balance on headings and
  pretty on body copy.

SPACE AND SHAPE
- Resolve margins, padding, and gaps to a 4/8-based scale.
- Keep one section rhythm across the page; vary it only for deliberate emphasis.
- Use one radius family. When a shape sits inside another with a gap under 32px,
  use inner = outer - gap, and only when the result is greater than 2.
- Do not use single-sided card borders or decorative background gradients.

MOTION
- Use one base easing curve for entrances and one shorter curve for color and
  opacity. Never ship browser-default ease or linear on entrances.
- Animate transform and opacity. Do not animate top, left, width, or height.
- Use IntersectionObserver for section reveals. Never use an unthrottled scroll
  listener.
- Respect prefers-reduced-motion with a still or opacity-only equivalent.

STATES
- Every interactive element needs hover, active, and visible focus.
- Forms need inline validation and specific error text.
- Loading states use skeletons shaped like the real content, not spinners.
- Empty states are composed, not blank.
- No dead links. The current page is indicated in navigation.

COPY
- Write specific sentences from sealed facts. Do not pad with slogans.
- Never invent reviews, testimonials, staff, prices, credentials, guarantees,
  response times, logos, or client assets.
- Omit proof that was not supplied.
- No em dashes. No placeholder Latin. Sentence case for headings and buttons.
```

## Rollout plan

### Phase 0: Baseline

- Pick three representative dossiers: one care, one local trades, one editorial.
- Record current judge scores, visual-gate verdicts, repair cycles, token cost,
  and wall-clock time.
- Freeze the comparison fixtures.

### Phase 1: Prompt behind a flag

- Add the craft contract and the shared token module.
- Gate it with an environment flag such as `DESIGN_CRAFT_LAYER=1`.
- Do not change any gate threshold or blocking rule.
- Run the three dossiers with and without the layer.

### Phase 2: Measure and tune

Compare:

- Rendered judge overall, typography, spatialRhythm, interactionEvidence.
- Visual-gate pass, revise, and block counts.
- Repair cycles per candidate.
- Token cost and wall-clock time.
- Blind developer preference between paired outputs.
- Fact and provenance regressions. These must be zero.

If the layer does not improve the paired outputs, tune the prompt or drop it.
Do not keep it because the skill looks good on paper.

### Phase 3: Audit and judge

- Add the deterministic craft audit as report-only.
- Add the judge language.
- Review false positives before making any audit rule blocking.

### Phase 4: Default and document

- Make the layer the default for new creative runs.
- Keep the flag for rollback.
- Document the token values and the precedence order.
- Add regression tests for the prompt block and the audit.

## Benefit estimate

High confidence:

- More consistent type, spacing, radius, and motion across candidates.
- Fewer visibly generic first drafts.
- Fewer visual repair cycles caused by missing states or default easing.
- A clearer shared vocabulary for developer review and source repair.

Medium confidence:

- A measurable lift in the judge's typography and spatial-rhythm scores.
- Faster developer approval because the first preview is more polished.

Low confidence:

- Higher conversion. The skill has good conversion discipline, but conversion
  depends on offer, traffic, and proof, not just layout.
- Differentiation. The skill is a baseline, not a unique concept. The dossier
  and client brief still do the differentiating work.

Honest estimate: this is a meaningful craft upgrade, not a magic bullet. I
would expect roughly 10 to 20 percent fewer visual repair cycles and a modest
judge lift, but those are hypotheses to validate in the bakeoff, not promises.

## Licensing

Both repositories are MIT licensed. If we adapt substantial portions, include
the copyright notice and permission notice in the adapted document or a
third-party notices file. Attribution is also the right thing to do even where
the README says it is not required.

## Decision requested

Recommended scope for the first implementation:

1. Write the adapted standard and shared token module.
2. Add the compact prompt block behind `DESIGN_CRAFT_LAYER`.
3. Run the three-recipe bakeoff.
4. Report paired evidence before changing any default or gate.

Do not integrate `design-to-motion` into client-site authoring. Keep it for a
future LaunchLoom marketing-asset lane.

Do not adopt the redesign skill's content-realism rules. Use only its diagnostic
and fix-priority structure in the revision lane.
