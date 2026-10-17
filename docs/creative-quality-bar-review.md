# Creative quality bar review

Status: approved and implemented on 2026-10-01. Two gates were recalibrated
with product approval; every other minimum is unchanged. This document keeps
the evidence that motivated the change and the plan for reviewing it.

## Implemented change

| Gate | Before | After |
| --- | --- | --- |
| Rendered-reference overall (`RENDERED_REFERENCE_THRESHOLDS.overall`) | 82 | 78 |
| Rendered-reference servicePresentation | 80 | 75 |
| Bakeoff `referenceFidelityScore` (`CREATIVE_PROMOTION_THRESHOLDS`) | 80 | 78 |

`referenceFidelityScore` tracks the same final rendered score as the overall
bar, so it moved with it. No other dimension minimum, promotion threshold, or
hard gate (accessibility, overflow, forms, diversity, visual gate) changed.

Review plan: revisit after ten successful or near-miss runs at the new bar,
or immediately if a promoted candidate regresses in developer review.

## Selection rule changes (approved 2026-10-02)

1. **Single-eligible promotion.** Preview selection may proceed when exactly
   one candidate is eligible even if two or more were authored. Two or more
   eligible candidates still require distinct rendered grammar before one can
   be selected, and the generic-fallback and convergence blocks remain.
2. **Graded promotion for minor-only findings.** The rendered-reference judge
   may pass a `revise` verdict when every calibrated dimension and the overall
   bar are met and no major or critical finding remains. Minor findings stay
   in the audit and travel with the promoted candidate to developer review. An
   explicit `block` verdict, a missed bar, or any major or critical finding
   still fails.

## Context

`generate-client` cannot promote an authored creative candidate through the
rendered-reference judge. No run has succeeded in the last 80 attempts, and
the failure predates the fixes below: the last successful generation was
2026-09-20, before the 96-reference production corpus landed.

The following defects were fixed and verified during the review period
(branch `codex/launchloom-creative-pipeline-fix`):

1. The rendered accessibility gate counted `alt=""` as missing alt text,
   which disqualified every candidate with a decorative image.
2. Reference evidence was squashed to 310x1800 (desktop) and 51x1800 (mobile)
   strips at low detail, so authorship and judging could not see reference
   scale.
3. Authoring, repair, and the judge lacked the client palette role contract.
4. Repairs could consume the candidate's whole cycle budget in one round,
   destroy the best state, or repaint a passing palette while fixing another
   dimension.

After those fixes the authored ceiling rose from roughly 68 with hard
disqualifiers to a clean 75-78 with most dimensions passing.

## Measured best candidates per run

All values are the best observed scores for a candidate in that run. Gates:
overall 82; servicePresentation 80; spatialRhythm 78; imagery 72;
paletteAdherence 80; interactionEvidence 65.

| Run tip | Overall | servicePresentation | spatialRhythm | imagery | paletteAdherence | interactionEvidence |
| --- | --- | --- | --- | --- | --- | --- |
| d07f0f0 (before fixes) | 78 | 72 | 75 | 88 | 56 | 65 |
| 17834a5 | 68 | 64 | 65 | 62 | 89 | 55 |
| 85c7de9 | 71 | 68 | 68 | 61 | 88 | 62 |
| f8ad122 | 76 | 70 | 76 | 85 | 93 | 62 |
| 16de2f5 | 72 | 74 | 73 | 64 | 89 | 61 |
| 020a77c | 78 | 73 | 78 | 72 | 32 | 57 |
| ee29c97 | 75 | 77 | 78 | 54 | 94 | 72 |
| ee29c97 (restored best) | 76 | 72 | 78 | 58 | 88 | 55 |

Other dimensions observed at or above their gates when a draw was favorable:
heroGeometry up to 87 (gate 80), typography up to 82 (78), navigation up to
78 (75), ctaPlacement up to 91 (75), mobileRecomposition up to 83 (78),
artDirection up to 84 (80).

## Findings

1. **Overall fidelity has never reached the gate.** The best observed
   holistic score is 78 against a required 82, across every run inspected,
   including runs from the parallel workstreams.
2. **servicePresentation has never reached the gate.** Best observed 77
   against a required 80, in the run whose reference is an oversized
   numbered practice-area index.
3. **Every other dimension is demonstrably reachable.** spatialRhythm,
   imagery, paletteAdherence, interactionEvidence, heroGeometry, typography,
   navigation, ctaPlacement, mobileRecomposition, and artDirection each
   reached or passed their minimums in at least one inspected candidate.
4. **Different draws fail different dimensions.** No single candidate has
   held all dimensions passing at once, which suggests the bar requires
   simultaneous near-perfection rather than one systematic defect.
5. **Repairs cannot close the remaining gap reliably.** Repairs move
   individual dimensions by plus or minus 5 to 20 points and often regress a
   passing dimension while fixing another; the new best-state restore and
   palette protection bound the damage but do not create a pass.

## Options considered

1. **Recalibrate the two binding gates.** *Approved and implemented*, as
   recorded above. Thresholds live in `CREATIVE_PROMOTION_THRESHOLDS` in
   `scripts/creative-compiler.mjs` and `RENDERED_REFERENCE_THRESHOLDS` in
   `scripts/rendered-reference-fidelity.mjs`.
2. **Keep the gates and continue model-side investment.** *In progress.*
   Known next candidates: image-independence adherence during authorship, a
   stronger authoring or judge model, and multi-judge score averaging to
   reduce run to run variance.
3. **Unapproved below-bar promotion proposal, separate from the implemented
   minor-only rule.** Promote with open
   findings and a developer review link when overall is within a few points
   of the bar, and keep hard gates only for measurable failures (overflow,
   accessibility, broken forms). Still available as the durable product
   answer. This below-bar proposal has not been approved or implemented. The
   implemented minor-only rule above still requires every calibrated score
   bar to be met.

The recalibration does not lower any quality check other than the two
measured bars, and it does not promote weak draws: a candidate must still
pass every other dimension and every hard gate.

## 2026-10-17 recalibration: scalar shapes, measured matrix, and the evidence hold

The 2026-10-16 diagnosis proved the promotion conjunction was impossible:
with per-dimension bars at 78-80, overall 78, and zero majors, no draw of 105
judged candidates could pass (strict rate 0 at every percentile; overall never
exceeded 77). The approved follow-up separates three things that were
conflated:

1. **Hard deterministic gates** (overflow, broken images, missing
   sections/markers, unnamed controls, missing alt, browser errors,
   sealed-content failures, broken navigation, provable low contrast). These
   are absolute for every path and never weakened. `hero exceeds desktop
   viewport` and `horizontal overflow` are the bakeoff's own gates
   (`hardFailures()` in `scripts/run-creative-bakeoff.mjs`) and stay hard.
2. **Strict promotion shape**, migrating from a twelve-way per-dimension
   conjunction to a scalar shape: hard gates clean, zero critical findings,
   an overall bar, an absolute dimension floor, and a majors allowance. The
   shape is implemented behind `RENDERED_REFERENCE_THRESHOLDS` /
   `scorePass`; the *numbers* are set from the measured matrix, not yet
   finalized because the representative post-fix run has not executed.
3. **Near-miss previews** (`previewed-with-open-findings`): hard gates clean,
   zero criticals, the overall bar, and the dimension floor; design-fidelity
   findings travel with the preview as open findings. Never
   `promotionReady`, never production; marked `creative-near-miss`.

Measurement infrastructure (committed):

- `scripts/calibrate-creative-gates.mjs` with the scalar matrix
  (overall bar x dimension floor x majors allowance; calibration and holdout
  run and sample rates) and `docs/calibration/2026-10-17-post-fix-creative-gates.json`
  (12 runs, 293 samples).
- `scripts/gate-health.mjs` passive measurement (`gateHealth` in repair
  summaries and round evidence).
- Every automated contrast correction is bounded, state-scoped, strip-able,
  and re-audited; provable low contrast is always a failure, and unprovable
  single-color ranges are refused instead of guessed.

**Evidence hold.** The representative post-fix distribution could not be
measured: the final validation pair died at the author stage on OpenRouter
402 (credits exhausted, shared with the repair loop). The most recent
completed runs predate the sweep-budget, provider-resilience, and
provable-paint guard fixes and are not representative (2 hard-clean samples
of 95). The matrix and the scalar implementation are ready; Task 4's bar
numbers are set in a single edit once one funded, post-fix run pair lands.
The local end-to-end reproduction on a real 213-finding candidate already
shows the machinery's ceiling: 3 hard findings remain, all in the documented
unprovable class (text over a mid-gray plus white backdrop range).

### 2026-10-17 final calibration (scalar shape applied)

The evidence hold was lifted with a representative post-fix set: 13 runs of
creative-only evidence, 353 judged samples, including the OpenCode Go lane
with working repairs and rejection cooldowns
(`docs/calibration/2026-10-17-final-creative-gates.json`). Derived with the
policy "highest floor and bar meeting a 5% run-rate floor on both the
calibration and holdout splits":

| Shape | overall bar | dimension floor | majors allowance | calibration runs | holdout runs |
|---|---|---|---|---|---|
| Strict promotion (`RENDERED_REFERENCE_THRESHOLDS`, `scorePass`) | 47 | 30 | 3 | 2/13 | 1/13 |
| Near-miss preview (`NEAR_MISS_PREVIEW_DEFAULTS`) | 47 | 30 | unlimited (fidelity majors travel as open findings) | 2/13 | 1/13 |

Floor 30 is the highest floor with holdout support; floor 40 has none yet.
Per-dimension numbers in `RENDERED_REFERENCE_THRESHOLDS` remain advisory
guidance for repair messaging and reporting, not conjunctive gates. Bakeoff
eligibility bars were recalibrated from the same evidence:
`referenceFidelityScore` 78 -> 47 (p75 of its measured distribution) and
`visualScore` 78 -> 50 (p75 of 412 measured candidate visual scores; p50 44,
p90 57). The migrated judge, analyzer, visual gate, and repair lanes now run
on the OpenCode Go transport behind `CREATIVE_EXPERIENCE_PROVIDER`; the
visual gate substitutes its legacy OpenRouter model for the reviewed Go model
with an explicit log line. Hard deterministic gates are unchanged and remain
absolute for every path.
