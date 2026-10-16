# Creative promotion-gate diagnosis (2026-10-16)

Status: investigation complete; recalibration requires product approval.
Scope: why the creative promotion gate rejects candidates on every reviewed run,
on baseline and optimized pipelines and on both providers alike.

## Evidence base

- Four matched QA runs with full round evidence: `#158` baseline `38878871977` /
  optimized `38914658136`, `#134` baseline `38928340329` / optimized
  `38928345911` (12 authored candidates, 105 judged candidate-rounds, ~40
  rounds total).
- Historical context: the 2026-10-01 calibration record in
  `docs/creative-quality-bar-review.md`, the acceptance run `38620904674`, and
  the Juniper full run `38779046390`.
- Methodology: every `creative-repair/round-*/creative-bakeoff.json` was parsed
  for candidate failures, rendered-judge audits, per-dimension scores, major
  findings, and diversity pairs. Analysis scripts are reproducible from the QA
  repositories; no product code was changed by this investigation.

## Primary root cause: the gate is a near-perfect-score conjunction the judge pipeline cannot produce

The rendered-reference judge must simultaneously satisfy, for one candidate:

1. verdict `pass`, or `revise` with **zero critical/major findings**;
2. `overallScore` >= 78;
3. every one of eleven dimensions at its own bar (72-80);
4. the rendered score must also clear `referenceFidelityScore` 78, feed
   `visualScore` >= 78, and `eligible` must survive every other failure list;
5. pairwise rendered diversity >= 72 with no generic-fallback flag.

Measured across all 105 judged draws:

| Condition | Result |
| --- | --- |
| `overall` >= 78 | **0 of 105** (maximum ever observed: 77; median 47) |
| `spatialRhythm` >= 78 | **0 of 105** (maximum ever observed: 76) |
| `mobileRecomposition` >= 78 | **0 of 105** (maximum ever observed: 77) |
| zero major findings | **0 of 105** (median 5 majors per draw, range 1-9) |
| all score bars together | **0 of 105** even relaxed 20 points |
| all bars + no major + diversity | **0 combined passes** |

Three bars sit **above the maximum the judge has emitted all week**, and the
zero-major requirement is unmet by every single draw. No authoring quality and
no repair strategy can pass this gate: the loop's ~90 minutes of repair per run
are spent trying to bridge an impossible conjunction, then the candidate pool is
exhausted. This matches the loop behavior already measured (11 rounds, 14
repairs, identical blockers persisting round over round).

Why it stayed hidden: the 2026-10-01 calibration lowered the overall bar from 82
to **78 - the historical maximum itself** - and left every other dimension bar
unchanged, despite recording "no single candidate has held all dimensions
passing at once." Its review plan ("revisit after ten runs") was never executed,
and at least six later changes moved the judge scale further (interaction
evidence, branding/fonts, platform-chrome exclusion, dossier refinements,
graded minors). The reachable ceiling moved further below the bars, so the gate
now rejects everything.

## Contributing cause: contrast audit bail classes are unrepairable by design

7,802 `contrast unresolved` findings across the four runs; 7,775 carry an
explicit audit reason:

| reason | count |
| --- | ---: |
| overlapping non-ancestor paint requires rendered review | 5,779 |
| filter, blend, backdrop-filter or group opacity | 1,138 |
| combinations, partial plates, pseudo-element backdrops | 885 |

These are structural bail-outs: the audit cannot bound the backdrop from the DOM
graph and returns `unresolved`, which the contract routes to "bounded author
repair". The author model cannot repair them, because the condition is the
audit's inability to prove the backdrop - not a defect in the page. Candidates
in this class stay `valid=false` regardless of their fidelity scores
(`base158`, `base134`, `opt134` all ended this way; `opt158` shows it is
escapable only when a draw happens to avoid decorated overlaps entirely). The
audit already captures rendered screenshots; a pixel-based resolution path for
this class is the missing piece.

## Contributing cause: candidate-pool attrition collapses diversity evidence

Repeated repair-output rejections exclude candidates; both `#134` runs ended with
a single renderable candidate, so diversity reported
`incomplete-rendered-evidence` and the preview pool could never form. Diversity
itself is not the primary wall (31 of 81 observed pairs already clear 72), but
attrition turns an already-hard gate into an impossible one.

## Contributing cause: deterministic geometry checks fail consistently

`hero exceeds desktop viewport` (1536x864) and media-coverage topology minimums
(`split-media`, `media-overlay`, `image-led`) failed in nearly every judged draw
of every run. These are genuine authoring misses against a stated contract, but
they add more conjuncts to the same conjunction.

## Recommended direction (product decision required)

1. **Principled recalibration, not another tweak.** Build a calibration harness
   that re-judges a defined sample set (existing best draws plus fresh
   candidates), reports the per-dimension score distribution and major-finding
   rate, and sets each bar at a discriminating percentile - e.g. "the best
   decile of draws passes" - with a holdout verification of the combined pass
   rate. Target a measurable, non-zero conjunction pass rate (for example
   ~10-20 percent of good draws) so the repair loop has near-misses it can
   actually close. Re-run this calibration automatically whenever the judge
   model, judge prompt, or reference material changes; alert when the reachable
   ceiling approaches the bars. This executes the review plan the October 1
   document promised.
2. **Resolve contrast bail classes from rendered pixels.** For the overlap and
   filter/blend classes, sample the actual rendered text/backdrop region from
   the screenshots the audit already produces. Real low contrast still fails;
   provable-on-screen text stops being an unrepairable blocker.
3. **Protect the pool.** Bound exclusions so at least two renderable candidates
   remain, or treat incomplete diversity evidence as an explicit blocked state
   earlier instead of exhausting repair cycles.
4. **Decide the open product question** from the October 1 document: whether
   near-miss previews (open findings, within a bounded margin, developer review
   link) may ship while hard accessibility and overflow gates remain absolute.
   This is the durable answer for shipping velocity, but it is the operator's
   call and is not implemented here.

## What this diagnosis explicitly does not change

No quality bar, threshold, judge prompt, or check was modified by this
investigation. The evidence shows the current conjunction is unpassable; any
change to it must be a measured, product-approved recalibration with holdout
verification, not a unilateral lowering.
