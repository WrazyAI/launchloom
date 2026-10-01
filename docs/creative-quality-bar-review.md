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
3. **Grade promotion instead of binary promotion.** Promote with open
   findings and a developer review link when overall is within a few points
   of the bar, and keep hard gates only for measurable failures (overflow,
   accessibility, broken forms). Still available as the durable product
   answer.

The recalibration does not lower any quality check other than the two
measured bars, and it does not promote weak draws: a candidate must still
pass every other dimension and every hard gate.
