# Creative gate recalibration implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the creative promotion pipeline functional again by (1) recalibrating
the rendered-judge bars from a measured score distribution, (2) resolving the
contrast audit's structural bail classes from rendered pixels, (3) protecting the
candidate pool, and (4) delivering bounded near-miss previews with open findings
while production promotion stays strict.

**Architecture:** Measurement first. A gate-health recorder accumulates judge
distributions from every run; a calibration harness derives discriminating bars
with holdout verification; the audit gains a pixel-sampling resolution path for
the backdrop classes it currently cannot bound; the repair orchestrator gains a
severity-classified near-miss preview path that never touches production
promotion or hard accessibility gates.

**Tech Stack:** Node ESM scripts, Playwright (browser audit), sharp (pixel
decode, already a dependency), vitest, the existing focused-pipeline harness
(`run-pipeline-test.mjs`) and QA repositories.

**Spec:** `docs/creative-gate-diagnosis-2026-10-16.md` (root-cause evidence),
`docs/creative-quality-bar-review.md` (2026-10-01 calibration and the
2026-10-02 selection rules this plan extends), and the user approvals in the
2026-10-16 session: proceed with options 1, 2, 3, and allow near-miss previews.

## Global constraints

- **Hard gates stay absolute for every path**: horizontal overflow, broken
  images, missing required sections/markers, unnamed controls, missing alt,
  browser errors, sealed-content/source-contract failures, build failures,
  broken navigation targets, authored-page overflow, and contrast findings with
  a **provable** ratio below the required minimum. Near-miss may never waive
  these.
- **Production promotion stays strict.** Near-miss is a preview-delivery path
  (`creative-only`/`full-preview` test lanes and developer review), never a
  production promotion. `promotionReady` stays false for near-miss summaries.
- **Bars are set from measurement, not taste**: every changed number lands with
  the harness output that produced it and a holdout verification record.
- **Preserve the color-first contrast policy**: no plates, no painted controls;
  the pixel path only proves or fails what is actually rendered.
- **Preserve recipe separation, fact boundaries, and no em dashes** in any
  generated content or rendered page touched by tests/fixtures.
- **Never weaken a check to make a run pass**; every behavior change carries a
  kill-switch and a rollback note.

## Review focus

1. Sample bias: calibration samples from stored QA evidence must not silently
   omit failed/intermediate draws that would move the distribution.
2. Pixel resolution must fail closed: capture/decode failures stay unresolved,
   never pass.
3. Severity classification must not let a content-integrity or accessibility
   finding become "open" on a near-miss preview.
4. Near-miss must remain visibly distinct from a clean pass in every artifact
   (summary, pipeline report, notification), and must never set production
   promotion flags.
5. Gate-health recording must be passive: it may never change selection or
   promotion behavior.

## File structure

- `scripts/gate-health.mjs` (new): pure functions that summarize judge score
  distributions, major-finding rates, and hard/soft failure classes from round
  reports; used by the analyzer, the calibration harness, and the pipeline
  report. One responsibility: measurement.
- `scripts/calibrate-creative-gates.mjs` (new): CLI + library that collects
  samples (from QA evidence and optional fresh judges), splits
  calibration/holdout, derives suggested bars and near-miss margins, renders a
  report artifact, and verifies a holdout pass rate.
- `scripts/creative-gate-severity.mjs` (new): the single source of truth for
  classification of candidate failure lines and judge findings into
  `hard` (blocking everywhere) vs `open` (allowed on near-miss previews), plus
  the measured finding-severity policy table.
- `scripts/rendered-contrast.mjs` (modify): add `resolveRenderedBackdrop` sampling
  for the bail classes (glyph-hide + clipped screenshot + luminance extremes).
- `scripts/run-rendered-creative-repair.mjs` (modify): near-miss preview branch,
  pool protection (`repairBlocked` vs excluded), summary/report fields.
- `scripts/run-pipeline-test.mjs` (modify): accept near-miss delivery in the
  creative guard, surface gate-health + near-miss status in the report.
- `scripts/rendered-reference-fidelity.mjs`, `scripts/creative-compiler.mjs`
  (modify): recalibrated constants (values from the harness run), pinned by
  tests.
- `docs/creative-quality-bar-review.md` (modify): the 2026-10-16 recalibration
  record with the harness numbers and the near-miss policy.
- `docs/site-generation-guidelines.md` (modify): one paragraph noting the
  rendered-pixel resolution path for provable text-over-decoration.
- Tests: `tests/gate-health.test.ts`, `tests/calibrate-creative-gates.test.ts`,
  `tests/creative-gate-severity.test.ts`, `tests/rendered-contrast-pixel.test.ts`
  (new), plus extensions to `tests/rendered-creative-repair.test.ts`,
  `tests/rendered-contrast.test.ts`, `tests/creative-promotion.test.ts`,
  `tests/pipeline-test-runner.test.ts`, `tests/creative-quality-bar-review.test.ts`
  (if present) and `tests/provider-free-reference-integration.test.ts` when
  prompts change.

## Task 1: Gate-health measurement (option 1, foundation)

**Files:** Create `scripts/gate-health.mjs`, `tests/gate-health.test.ts`;
modify `scripts/run-pipeline-test.mjs` (persist stage), `scripts/run-rendered-creative-repair.mjs` (summary).

**Interfaces:** Produces
`summarizeGateHealth({ roundReports }) => { perDimension: { min, median, max, bar, passCount }, overall: {...}, majors: { median, histogram, byCategory }, hardSoft: { hard, open } }`
and `classifyFailureLine(line) => "hard" | "open"` (initially delegating to
Task 3's module; until then a local minimal classifier with the same shape).

- [ ] Write failing tests: a fixture round set yields exact per-dimension
      min/median/max, major histogram, and hard/open split.
- [ ] Implement `summarizeGateHealth` and wire the orchestrator summary to
      include `gateHealth` (pure addition; no behavior change).
- [ ] Persist `gateHealth` into `pipeline-test-report.json` and print a one-line
      summary in `logTimingSummary`-style output.
- [ ] Verify: `npx vitest run tests/gate-health.test.ts`; run against the four
      cloned QA evidence dirs and confirm the numbers match the diagnosis report
      (overall max 77, spatialRhythm max 76, mobileRecomposition max 77).
- [ ] Commit.

## Task 2: Calibration harness (option 1, core)

**Files:** Create `scripts/calibrate-creative-gates.mjs`,
`tests/calibrate-creative-gates.test.ts`, and a checked-in calibration report
`docs/calibration/2026-10-16-creative-gates.json` (data artifact).

**Interfaces:** CLI `node scripts/calibrate-creative-gates.mjs --evidence <dir>... [--fresh] [--target-pass-rate 0.15] [--out <file>]`.
Produces `{ samples, splits, suggested: { perDimension, overall, majorsStrict, nearMissMargin, nearMissMajors }, holdout: { strictPassRate, nearMissRate, byFamily }, provenance }`.

- [ ] Write failing tests with synthetic distributions: p90 derivation, split
      determinism (seeded), holdout evaluation of a given bar set, path remapping
      failures surfacing as errors (not silently dropped).
- [ ] Implement sample collection: parse `creative-repair/round-*/creative-bakeoff.json`,
      remap runner-absolute screenshot paths to the round's `screenshots/`
      directory, skip samples with missing files/audits (**counted in the
      report**, never silently dropped), and optionally re-judge fresh samples
      through the existing `evaluateRenderedReferenceFidelity` seam.
- [ ] Implement derivation: per-dimension and overall bars = the smallest value
      at the requested percentile of the calibration split; strict majors
      allowance and near-miss margin chosen so the holdout near-miss rate meets
      the target while every hard gate stays in the loop.
- [ ] Run it on the real evidence (105 draws): commit the report and record the
      suggested numbers. Expected: overall/spatialRhythm/mobileRecomposition
      suggestions land at or below their observed maxima, making the strict
      conjunction non-zero.
- [ ] Verify: harness re-run reproduces the report byte-for-byte (determinism).
- [ ] Commit.

## Task 3: Severity classification (option 4 prerequisite)

**Files:** Create `scripts/creative-gate-severity.mjs`,
`tests/creative-gate-severity.test.ts`.

**Interfaces:** `classifyFailureLine(line) => "hard" | "open"`;
`classifyJudgeFinding(finding) => "critical" | "hard" | "open"`;
`nearMissEligible(candidate, { bars, margins }) => { eligible, reasons, openFindings }`.

- [ ] Write failing table-driven tests pinning every current producer's output:
      hard — overflow (all viewports), broken image, browser error, missing
      h1/hero/services/faqs/contact/form, missing fragments/nav targets,
      missing/broken alt, unnamed controls, em dash, `source:`/`repaired source:`
      contract failures, `contrast fail` (provable ratio), authored-page
      overflow; open — `rendered-reference:` findings, dimension misses,
      `rendered composition:` topology, `contrast unresolved`, authored-page
      soft misses.
- [ ] Implement, reusing `hardFailures`/`candidateFindings` vocabularies rather
      than inventing new strings; unknown lines classify as **hard** (fail
      closed).
- [ ] Verify: `npx vitest run tests/creative-gate-severity.test.ts`.
- [ ] Commit.

## Task 4: Recalibrated thresholds (option 1, apply)

**Files:** Modify `scripts/rendered-reference-fidelity.mjs`,
`scripts/creative-compiler.mjs`, `docs/creative-quality-bar-review.md`, and the
threshold tests.

- [ ] Apply the harness-suggested numbers to `RENDERED_REFERENCE_THRESHOLDS`
      and `CREATIVE_PROMOTION_THRESHOLDS`; each number carries a comment citing
      the calibration report and the observed distribution.
- [ ] Extend the bar-review doc with the 2026-10-16 record: evidence, method,
      before/after table, holdout rates, and the near-miss policy.
- [ ] Update tests that pin the old values (search for `78` / dimension names in
      `tests/rendered-reference-fidelity.test.ts`, `tests/creative-compiler.test.ts`).
- [ ] Verify: those suites plus `tests/rendered-creative-repair.test.ts` pass;
      re-run the calibration harness against the same evidence and confirm the
      strict conjunction pass rate on the holdout is non-zero (target ~15%,
      reported even if lower).
- [ ] Commit.

## Task 5: Pixel-based contrast resolution (option 2)

**Files:** Modify `scripts/rendered-contrast.mjs`; create
`tests/rendered-contrast-pixel.test.ts`; extend `tests/rendered-contrast.test.ts`.

**Interfaces:** `resolveRenderedBackdrop(page, targets, { route, state }) =>
Map<targetIndex, { status, ratio, background }>`; the audit's unresolved bail
classes call it before finalizing a finding; on success a target becomes `pass`
or `fail` (provable), on capture/decode failure it stays `unresolved`.

- [ ] Write failing tests with real fixture pages served to Playwright:
      (a) decorated sibling overlapping text that is genuinely readable →
      resolves to `pass`; (b) same structure with low-contrast decoration →
      resolves to `fail` with measured ratio; (c) filter/opacity backdrop →
      resolves; (d) forced capture failure (removed locator) → stays
      `unresolved`.
- [ ] Implement: for each unresolved text/icon target in a bail class, locate
      the element by its recorded selector path, hide only glyph paint
      (`color: transparent`, `-webkit-text-fill-color: transparent`,
      `text-shadow: none`), screenshot the element rect, decode with sharp,
      take luminance extremes (1st/99th percentile clamped by min/max), and
      evaluate the required ratio against the target's resolved foreground
      (alpha-composited); restore paint in a `finally`. Bound work (≤120
      resolutions per route/state) and fail closed beyond the bound.
- [ ] Keep the deterministic DOM path untouched for non-bail targets; add an
      audit report field `pixelResolved: n` and keep `unresolved` only for
      genuine capture failures.
- [ ] Verify: new suite + `tests/rendered-contrast.test.ts` +
      `tests/contrast-sweep.test.ts` green; run the audit against one cloned QA
      candidate (via the existing bakeoff fixture path) and report the drop in
      unresolved counts.
- [ ] Commit.

## Task 6: Pool protection (option 3)

**Files:** Modify `scripts/run-rendered-creative-repair.mjs`;
extend `tests/rendered-creative-repair.test.ts`.

- [ ] Write failing tests: (a) a candidate that exhausts contract rejections
      stays renderable (appears in every subsequent bakeoff) and is skipped for
      repair targeting; (b) with two such candidates the bakeoff still reports
      two renderable candidates and diversity evidence is not
      `incomplete-rendered-evidence`; (c) exclusion is still possible when the
      candidate's own build/render evidence is unusable.
- [ ] Implement: rename the semantic to two sets — `repairBlockedCandidateIds`
      (skips repair targeting, keeps rendering and diversity evidence) and
      `excludedCandidateIds` (only for candidates whose evidence cannot render).
      The bakeoff already accepts `excludedCandidateIds`; pass only the
      evidence-excluded set.
- [ ] Verify: targeted suite plus the bakeoff reuse tests.
- [ ] Commit.

## Task 7: Near-miss preview path (option 4)

**Files:** Modify `scripts/run-rendered-creative-repair.mjs` and
`scripts/run-pipeline-test.mjs`; extend `tests/rendered-creative-repair.test.ts`
and `tests/pipeline-test-runner.test.ts`.

- [ ] Write failing orchestrator tests: (a) budgets exhausted with a candidate
      that has only open failures and clean hard gates → summary status
      `previewed-with-open-findings`, `promotionReady:false`,
      `nearMiss:{ candidateId, openFindings, margins }`, preview promoted with
      `selectionMode:"creative-near-miss"`; (b) a candidate with an overflow or
      `contrast fail` line present → still throws the blocked error; (c)
      `CREATIVE_NEAR_MISS_PREVIEW=false` restores the previous hard failure.
      Pipeline tests: the creative guard accepts the near-miss summary for
      preview profiles, the report records `nearMiss`, and the notification
      text distinguishes it from a clean pass.
- [ ] Implement: in the no-selection/exhaustion paths, before throwing, compute
      near-miss eligibility (Task 3) for every renderable candidate, choose the
      one closest to the bars, run the visual gate on it (require verdict
      ∈ {pass, revise} with zero critical findings), promote preview-only, and
      write the degraded summary. Production mode (`mode:"promote"`) never takes
      this path.
- [ ] Verify: both suites green; the exact error strings for genuinely blocked
      runs unchanged.
- [ ] Commit.

## Task 8: Documentation and policy record (options 1-4)

**Files:** Modify `docs/creative-quality-bar-review.md`,
`docs/site-generation-guidelines.md`, `docs/creative-gate-diagnosis-2026-10-16.md`
(append outcome), `docs/creative-generation-performance.md` (switches table).

- [ ] Record the approved policy: strict production promotion unchanged;
      near-miss previews allowed with open findings, bounded margins, explicit
      marking, and hard gates absolute; pixel resolution now proves or fails
      backdrop classes; calibration re-runs required on judge/reference changes.
- [ ] Add the kill-switches to the performance doc:
      `CREATIVE_NEAR_MISS_PREVIEW`, `CREATIVE_PIXEL_CONTRAST`.
- [ ] Commit.

## Task 9: Matched validation (the plan's proof)

**Files:** no product changes; evidence + ledger updates.

- [ ] Dispatch one `creative-only` focused run on `#158` and one on `#134` from
      the implementation branch (same protocol as the optimization workstream).
- [ ] Verify and record, per run: creative stage completes with
      `previewed-with-open-findings` (or a clean pass), preview delivered,
      near-miss status visible in the report, unresolved-contrast counts down
      by the pixel path (report the measured share), pool ≥2 renderable
      candidates through the last round, and no hard-gate failure present in
      the delivered candidate.
- [ ] Re-run the calibration harness against the fresh evidence; record the
      strict and near-miss rates in the bar-review doc.
- [ ] If any run still cannot deliver, diagnose before shipping (this plan's
      whole point is that the loop stops failing every time).

## Task 10: Rollout

- [ ] Full `npm test`, `npm run check`, and the affected rendered suites;
      open the PR, complete review rounds, merge, verify the production deploy
      (same sequence as the optimization shipment).
- [ ] Keep rollback levers documented: bar constants (revert commit),
      `CREATIVE_NEAR_MISS_PREVIEW=false`, `CREATIVE_PIXEL_CONTRAST=false`.
- [ ] Ledger + Nifty completion with readback; remove the task worktree only
      after integration is confirmed.

## Execution order and dependencies

1 → 2 (harness), 3 (severity) → 4 (apply bars), 5 (pixel), 6 (pool), 7
(near-miss) → 8 (docs) → 9 (validation) → 10 (rollout). Tasks 5 and 6 are
independent of 2-4 and may run in parallel with them; Task 7 depends on 3 and 6.

## Open items carried into execution

- The harness will quantify how often each judge category emits majors; if a
  single fidelity category emits majors in most draws, the report proposes a
  rubric-level follow-up rather than folding it into the bars silently.
- Whether near-miss previews should also raise a distinct developer-review email
  subject is left to Task 7's implementation notes (default: same email with an
  explicit `near-miss` section).
