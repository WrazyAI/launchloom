# Visual content pipeline continuation plan

Date: 2026-10-28

This file is the handoff for the next session after context compaction. Read it
first. It records the current objective, the exact state of the work, the two
remaining fixes, and the commands needed to verify them.

## Objective

Finish the visual content pipeline for the unaffiliated Case Study Coffee
Roasters concept:

1. Make flat muted-text contrast fail-safe in the pipeline, not by patching a
   single QA candidate.
2. Make image-led hero composition faithful to the assigned reference, with a
   floating headline and compact scrim instead of a large bordered card.
3. Re-run the gated creative-only candidate and verify the rendered desktop and
   mobile result before claiming completion.

This remains a private, unaffiliated concept. No public production without the
cafe's written authorization. No invented facts, reviews, prices, staff,
credentials, hours, or client assets. No em dashes.

## Repo, worktree, and task state

- Shared checkout: `/home/maigreeks/projects/launchloom`
- Active worktree: `/home/maigreeks/projects/.worktrees/launchloom-visual-followup`
- Branch: `codex/launchloom-visual-followup`
- Current HEAD: `ef5889a2` (clean at the time this plan was written)
- `origin/main` was also `ef5889a2` when this plan was written. Fetch and rebase
  before new work.
- `node_modules` is installed in the worktree. Do not modify shared dependencies
  in the shared checkout.
- Work OS ledger task: `80327069-f5fa-487c-8f0f-c5d127dc6ac6`
  - `LaunchLoom: finish the visual content pipeline`
  - Subtasks:
    - `2a3d2341-cfdf-4a20-8e07-c30d35e3b65e` Add deterministic flat-contrast repair
    - `d2c63d06-95c9-43e2-8131-d41b6c6bb3b5` Add hero-card coverage evidence
    - `93d57e9d-89d8-426a-a42d-f240d02c53dd` Add route-scoped hero-card repair
    - `f2d107e7-32bb-4719-9b8e-2839bcfa5a5f` Run focused tests and type checks
    - `a34972df-b081-4e2a-9a70-967d631120d5` Deploy and re-run gated candidate
    - `6b741236-9a73-4157-a025-de912c486e30` Inspect rendered desktop and mobile gates
    - `abb2806e-1aa7-4825-9877-261c42081706` Record verified outcome and receipt
- Canonical task tool: `/home/dev/agent-os/scripts/work-os-ledger.mjs` on the
  VPS. Use `/home/dev/.hermes/node/bin/node`. Do not use Nifty IDs for new work.
- Historical Nifty task `8CljAcBI6!` is closed/historical. Do not use it for new
  writes.

## What is already shipped

Do not redo these. They are on `main`.

- `b3b6b264` Narrative spine in the copy lane: audience, offer, actions,
  objections, supplied proof, section jobs, and page argument stored privately in
  `qualityReport`, plus `COPY SPECIFICITY` and a service-name restatement guard.
- `e545afcf` Image restoration and image-aware selection:
  - Asset reviewer allows incidental unreadable texture, grain, and multi-object
    still lifes while rejecting readable text, fake UI, signage, logos,
    watermarks, and people.
  - Default image request budget raised from 9 to 15.
  - `creativeImageCoverage`, `routeRequiresHeroImage`, `imageCompletenessScore`,
    and `rankFallbackCandidates` added.
  - Bakeoff winner sort prefers image-complete candidates when the route needs a
    hero; the failed-bakeoff fallback ranks by image completeness, preference,
    and visual score.
- `598bfb39` Site-copy output ceiling raised to 24,576 initial, 12,288
  refinement, 24,576 retry.
- `4483b0c2` Production model policy pinned to DeepSeek V4.1 Flash:
  - OpenCode Go: `opencode-go/deepseek-v4.1-flash`
  - OpenRouter: `deepseek/deepseek-v4.1-flash`
  - GLM-5.3, GLM-5.3-Flash, and GPT-6 Luna removed from production defaults.
  - Guarded by `tests/production-model-policy.test.ts`.
- `e748636e` Image-overlay hero contract:
  - `scripts/hero-overlay-contract.mjs` injected into contract, experience, and
    styles stages.
  - Mobile hero-action fit gate for image-overlay routes in
    `scripts/run-creative-bakeoff.mjs`.
  - `IMAGE_OVERLAY_HERO_REPAIR_GUIDANCE` in `scripts/creative-repair-loop.mjs`.
  - Tests in `tests/hero-overlay-contract.test.ts`.

## Current gated result

Run `40553569891` at `e748636e`, issue #185, creative-only, DeepSeek.

- Verdict: failed.
- Preview: `https://cb035b2a.launchloom-pipeline-preview.pages.dev`
- Candidate repo: `WrazyAI/llqa-185-creative-40553569891-1`
- Branch: `qa/creative-only/40553569891-1`
- Selected candidate: `candidate-b` / `route-02` (Café Carmellini,
  editorial-monument).
- Images: route-02 has an approved hero
  `/images/generated/hero-13050271d025.webp` and secondary
  `/images/generated/secondary-bc30d291d8fd.webp`.
- The hero is visually correct: full-bleed cafe interior, dark overlay panel,
  clear promise, and both `Plan a visit` and `Services` actions visible on
  desktop and mobile.
- Technical failed on flat muted text `#6b716d` on `#ece7dc`: 4.047 against
  4.5 in service pages.
- Creative failed on reference fidelity: score 61 on the fallback candidate.
  Findings include:
  - large bordered hero card instead of a floating headline in the image's
    negative space
  - missing script-label signatures
  - dark nighttime palette against the warm daylight brief
  - missing later image choreography
- The repair loop ran ten rounds and did not close either issue. The run took
  about 2h50m. No gate was weakened.

Previous runs for context:

- `40530254254` at `598bfb39`: technical passed, creative failed because the
  hero image was a 197px band instead of a full-bleed stage. This is the run that
  motivated the hero-overlay contract.
- `40370761876`: failed with `GoUsageLimitError` HTTP 429.
- `40526013296`: failed at site copy with `SITE_COPY_OUTPUT_TRUNCATED` at 8,192
  tokens.

## Fix 1: deterministic flat-contrast repair

This must be a pipeline fix, not a QA-repo CSS patch.

### Goal

When the rendered contrast gate reports a flat text/background pair below 4.5,
the pipeline darkens the text to the nearest passing shade and re-renders,
without spending a model repair cycle.

### Scope

- Only flat pairs where the finding provides both a concrete foreground hex and
  a concrete background hex.
- Do not touch variable backgrounds, overlapping non-ancestor paint, focus
  outlines that overlap borders, or structural contrast findings.
- Do not change the background or the design system.
- Do not weaken the 4.5 threshold.
- Preserve the authored palette intent and all unrelated CSS.

### Suggested implementation

- Add `scripts/flat-contrast-repair.mjs` with pure helpers:
  - `parseFlatContrastFindings(findings)`: return
    `{ foreground, background, ratio, required, text }` entries only when both
    colors are concrete hex values.
  - `wcagContrast(foreground, background)`: standard relative luminance.
  - `darkenToContrast(foreground, background, required = 4.5)`: step the
    foreground toward black until it passes; preserve hue where practical.
  - `repairFlatContrastCss(css, pairs)`: replace the exact foreground hex
    tokens in `styles.css` with the passing shade. Bound the number of edits and
    fail closed if the token is not present.
- Wire it into `scripts/run-rendered-creative-repair.mjs` after the contrast
  gate returns flat findings and before the next model repair. Apply the CSS
  change, rebuild, and re-run the contrast gate. Record the repair in the
  candidate evidence.
- Keep a source-safe fallback: if the exact hex is not present, or the pair is
  ambiguous, leave it to the model repair loop.
- Add `tests/flat-contrast-repair.test.ts`:
  - `#6b716d` on `#ece7dc` fails at 4.047 and repairs to a passing shade.
  - `#646966` on `#ece7dc` passes at 4.536.
  - variable backgrounds and overlapping-surface findings are ignored.
  - CSS replacement is bounded and does not touch unrelated colors.

### Acceptance

- The next gated candidate has zero flat muted-text contrast failures.
- The contrast gate still runs at 4.5 and still fails genuinely unresolved
  surfaces.
- The repair is recorded in the candidate evidence and the ledger.

## Fix 2: hero-card coverage and route-scoped repair

This is also a pipeline fix, not a one-off JSX edit.

### Goal

For image-led routes whose reference uses a floating headline, a large bordered
hero card is a fidelity failure. Replace it with a floating headline in the
image's negative space and a compact scrim behind the text only, while keeping
the full-bleed stage and both actions visible.

Do not apply this to references that legitimately use a bordered card.

### Evidence to add

In `scripts/run-creative-bakeoff.mjs` `inspect(page)`:

- Measure the hero stage bounds.
- Measure the visible copy container bounds. Prefer the element carrying
  `data-hero-copy`; if the copy is split, use the smallest visible ancestor that
  contains the promise group and actions.
- Compute:
  - `heroCopyAreaRatio = copyArea / heroArea`
  - `heroCopyWidthRatio = copyWidth / heroWidth`
  - `heroCopyHasBorder` and `heroCopyHasOpaqueBackground` from computed styles
  - `heroCopyMobileAreaRatio` for 390x844
- Add these fields to `compositionEvidence` and to the viewport evidence.

### Route-scoped rule

- Apply only when the assigned route is image-led and the reference DNA or
  composition topology indicates a floating or media-led headline.
- Trigger a fidelity finding when:
  - `heroCopyAreaRatio` is greater than about 0.30 on desktop, or
  - `heroCopyMobileAreaRatio` is greater than about 0.35 on mobile, and
  - the copy container has a visible border or an opaque card background.
- Do not trigger for text-led routes, split-form routes, or references whose
  dossier explicitly shows a bordered card.
- Keep the existing mobile action-fit hard gate.

### Repair guidance

Add `HERO_CARD_FIDELITY_REPAIR_GUIDANCE` to
`scripts/creative-repair-loop.mjs` and include it when the findings contain
hero-card coverage or a "bordered hero card" phrase:

- Replace the large bordered card with a floating headline in the image's
  negative space.
- Use a compact gradient scrim or a narrow solid strip behind the text only.
- Keep the full-bleed image stage and both actions visible at 390x844.
- Do not cover more than about 25 percent of the desktop image or 35 percent of
  the mobile hero with the copy field.
- Do not remove the image, flatten the stage into a band, or hide an action.

### Tests

Add `tests/hero-card-contract.test.ts`:

- A large bordered card on an image-led route produces a fidelity finding.
- The same card on a text-led route does not.
- The repair guidance is included for a hero-card finding.
- A compact scrim with both actions visible passes.

### Acceptance

- The next gated candidate's hero uses a floating headline and compact scrim
  when the reference calls for it.
- The hero remains full-bleed on desktop and mobile.
- Both actions remain visible at 390x844.
- The creative judge no longer reports the large bordered card.

## Validation and re-run procedure

Run from the worktree:

```bash
cd /home/maigreeks/projects/.worktrees/launchloom-visual-followup
git fetch origin main
git rebase origin/main

npx vitest run \
  tests/flat-contrast-repair.test.ts \
  tests/hero-card-contract.test.ts \
  tests/hero-overlay-contract.test.ts \
  tests/creative-repair-loop.test.ts \
  tests/creative-promotion.test.ts

npm run check
```

Commit and push only when those pass:

```bash
git add <changed files>
git commit -m "fix(creative): repair flat contrast and hero-card fidelity"
git push origin HEAD:main
```

Verify the deploy:

```bash
gh run list --repo WrazyAI/launchloom --workflow deploy-platform.yml --limit 1
```

Dispatch the gated run only after the deploy succeeds:

```bash
gh workflow run generate-client.yml --repo WrazyAI/launchloom --ref main \
  -f issue=185 -f test_profile=creative-only -f inference_provider=opencode-go
```

Monitor the run. Do not use `gh run watch` alone for hours; it has repeatedly
lost network. Poll `gh run view <id> --json status,conclusion` at long intervals
or use the GitHub UI.

## Inspecting the candidate without cloning

The candidate repo can be very large after ten repair rounds. Do not clone it.
Use targeted GitHub API reads:

```bash
REPO=WrazyAI/llqa-185-creative-<run-id>-1
REF=qa/creative-only/<run-id>-1

gh api "repos/$REPO/contents/.launchloom/pipeline-test-report.json?ref=$REF" \
  -H "Accept: application/vnd.github.raw"

gh api "repos/$REPO/contents/src/site.config.json?ref=$REF" \
  -H "Accept: application/vnd.github.raw"

gh api "repos/$REPO/contents/src/generated-experiences/selected/manifest.json?ref=$REF" \
  -H "Accept: application/vnd.github.raw"

gh api "repos/$REPO/contents/.launchloom/generated-assets.json?ref=$REF" \
  -H "Accept: application/vnd.github.raw"
```

For JSON files larger than the contents API limit, get the blob SHA and decode:

```bash
SHA=$(gh api "repos/$REPO/contents/<path>?ref=$REF" --jq '.sha')
gh api "repos/$REPO/git/blobs/$SHA" --jq '.content' | base64 -d > /tmp/file.json
```

For screenshots:

```bash
gh api "repos/$REPO/contents/.launchloom/creative-repair/round-XX/screenshots/candidate-a-desktop-viewport.png?ref=$REF" \
  -H "Accept: application/vnd.github.raw" > /tmp/candidate-a-desktop.png
```

Inspect at minimum:

- `pipeline-test-report.json`: verdict, stage statuses, technical gates.
- `site.config.json`: `images` and `creativeAssets`.
- `selected/manifest.json`: selected candidate and route.
- `generated-assets.json`: accepted and skipped placements, review reasons.
- Latest round `creative-bakeoff.json`: selected candidate, scores, diversity,
  failures.
- `candidate-*-desktop-viewport.png` and `candidate-*-mobile-viewport.png`.

## Constraints and boundaries

- Production model policy: DeepSeek V4.1 Flash only.
  - Go: `opencode-go/deepseek-v4.1-flash`
  - OpenRouter: `deepseek/deepseek-v4-flash` is not the approved name. Use
    `deepseek/deepseek-v4.1-flash`.
- Do not introduce GLM-5.3, GLM-5.3-Flash, or GPT-6 Luna into production lanes.
- Do not weaken or bypass any gate. Add checks; do not lower thresholds.
- Do not patch the QA candidate and call it fixed.
- Do not publish a public production site without the cafe's authorization.
- Do not invent business facts, proof, reviews, prices, staff, credentials,
  hours, or locations.
- Do not use em dashes in generated content or rendered client pages.
- Preserve other agents' ledger entries and worktrees.
- The worktree is only removable after the work is merged, deployed, verified,
  and the follow-up is closed. Follow the current `AGENTS.md` cleanup rule.

## Key files

- `scripts/generate-site-config.mjs`: copy lane, narrative spine, model
  selection, output budgets.
- `scripts/generate-contextual-assets.mjs`: asset generation and review.
- `scripts/creative-compiler.mjs`: image coverage, route hero requirements,
  fallback ranking.
- `scripts/run-creative-bakeoff.mjs`: candidate evidence, hard gates, winner
  selection, mobile action fit.
- `scripts/creative-repair-loop.mjs`: repair prompts and targeted guidance.
- `scripts/hero-overlay-contract.mjs`: image-overlay hero contract.
- `scripts/visual-quality-gate-lib.mjs`: visual gate model.
- `scripts/rendered-reference-fidelity.mjs`: rendered reference and diversity
  judges.
- `tests/production-model-policy.test.ts`: DeepSeek-only policy guard.
- `tests/hero-overlay-contract.test.ts`: hero contract and mobile action gate.
- `.github/workflows/generate-client.yml`: production env and model defaults.
- `.github/agents/progress-update/UPDATE-2026-10-27.md` and
  `UPDATE-2026-10-28.md`: work ledger.

## Handoff checklist after compaction

1. Read this file and `AGENTS.md`.
2. Check the Work OS task `80327069-f5fa-487c-8f0f-c5d127dc6ac6` and its
   subtasks. Re-read before writes.
3. Check OpenCode Go quota before any model call. If quota is exhausted, stop
   and record the blocker; do not dispatch a run.
4. Confirm the worktree and branch, fetch `origin/main`, and rebase.
5. Implement Fix 1 and Fix 2 in the pipeline. Do not patch the QA candidate.
6. Run the focused tests and `npm run check`.
7. Commit, push, verify the deploy.
8. Dispatch the gated creative-only run on issue #185.
9. Inspect the candidate via GitHub API. Check hero coverage, full-bleed stage,
   both actions at 390x844, flat contrast, creative score, and preview.
10. Update the ledger with actual commands and evidence. Complete subtasks only
    when their outcomes are verified. Run `task_complete` only after the gated
    result is verified.
11. Clean up the worktree only after merge, deploy, and follow-up closure, per
    `AGENTS.md`.

## Do not do

- Do not claim the visual fix is proven from a single screenshot or a partial
  gate.
- Do not claim a pipeline-green report if the verdict is failed.
- Do not use the old Nifty IDs for new work.
- Do not copy tokens, print `.env` contents, or commit credentials.
- Do not remove another agent's worktree or unmerged work.
