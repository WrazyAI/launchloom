# Generation Logistics Delta Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a reviewable client preview on at least 18 of 20 eligible full-profile attempts, with design findings advisory, then cut the default creative run to one candidate and one repair cycle.

**Architecture:** The preview-first slice already added a visual-gate classifier, a selection validator, near-miss workflow deployment, and warning receipts. This plan hardens that slice, fixes the technical and verdict paths that can still mark a preview passed without delivering it, splits SEO findings by delivery risk, fixes terminal repair finalization, and then adds the one-candidate fast lane and bounded streaming progress.

**Tech Stack:** Node ESM scripts, GitHub Actions, Astro client template, Playwright rendered checks, React admin workspace, Postgres operations trace.

**Spec:** `docs/superpowers/specs/2026-11-06-generation-logistics-design.md`

**Owner decision (2026-11-06):** A delivered client review or live preview counts as the pass. Public launch remains manual.

**Status 2026-11-09:** Tasks 1, 2, 3, and 6 are implemented on `main` at `d9fb9e0a`. Remaining work is Task 4 (gate policy), Task 5 (repair finalizer), Task 7 (bounded streaming), and Task 8 (delivery funnel). The "Current implementation state" table below is retained as history and is stale for those four tasks.

## Current implementation state

The task branch `codex/launchloom-generation-logistics` has the first preview-first slice at `1d5b5726` (not yet merged into `main`). It includes:

- `classifyVisualGateReport` in `scripts/creative-gate-severity.mjs`.
- `validateCreativePreviewSelection` in `scripts/validate-creative-preview-selection.mjs`.
- Near-miss deployment in `.github/workflows/generate-client.yml`.
- A `delivery-warnings.json` receipt, operations detail code, and a generic admin warning notice.

The slice does not yet cover the gaps below. This plan starts from the merged slice, not from `ac713c23`.

| Gap | Evidence |
| --- | --- |
| Desktop hero height still classifies as hard, so #217 candidate-a is still near-miss ineligible. | `scripts/creative-gate-severity.mjs` classifyFailureLine |
| The gate classifier accepts missing findings and unknown categories as open. | `scripts/creative-gate-severity.mjs` classifyVisualGateReport |
| The selection validator does not check the selected bakeoff candidate's hard failure lines. | `scripts/validate-creative-preview-selection.mjs` |
| The focused technical near-miss exception requires every gate to fail contrast, but the real array includes a passing rendered gate. | `scripts/run-pipeline-test.mjs` nearMissContrastOnly |
| The verdict is computed before deploy, so a failed deploy can still leave `verdict: "passed"`. | `scripts/run-pipeline-test.mjs` runPipelineTest |
| The SEO and rendered review gates are still all-or-nothing, so advisory metadata blocks a warned preview. | `scripts/seo-release-gate.mjs`, `scripts/verify-rendered-revision.mjs` |
| The repair finalizer uses a loop-scoped `record` after the loop and can exit before restoring the best state. | `scripts/run-rendered-creative-repair.mjs` |
| Candidate count and repair cycles are still three by default. | `scripts/pipeline-test-policy.mjs` |
| Streaming has no `output_delta` event and no progress bridge. | `scripts/inference-client.mjs`, `scripts/generation-activity-model.mjs` |
| The 90% metric has no full-profile funnel report. | `scripts/generation-success-rate.mjs` counts GitHub conclusions only |

## Global Constraints

- Hard integrity gates stay blocking: build failure, missing verified facts, fabricated reviews/prices/guarantees/credentials/availability, unlicensed assets, broken forms or navigation, meaningful images without alt text, critical accessibility failures, broken images, private location leakage, missing rendered routes, unresolved internal links or anchors, horizontal overflow, provable contrast below the required minimum, and em dashes in rendered copy.
- Unknown, missing, malformed, or contradictory gate evidence classifies as hard. Never downgrade it to advisory.
- A warned preview must never be reported as clean. Keep `clean` and `warned` as separate counts and labels.
- No new renderers, intake fields, or client-facing artifacts.
- No public auto-publish.
- Generation models stay on DeepSeek V4.1 Flash through OpenCode Go. No GLM or GPT in the generation lane.
- No em dashes in generated content or rendered client pages.
- Every task ends with its own tests and a commit.

## Baseline evidence

- `npm run report:generation-success` at `8547ebf2` reported overall 6/100, creative 1/21 (4.8%), pack 3/4.
- Run `42108445005` ran 3h29m and failed at the creative stage. Configure 5m54s, author 1h39m, creative 1h32m, technical 8m34s. The preview was delivered.
- Round 13 for candidate-a: `audit.overallScore` 72, every dimension at least 50, no content-integrity or accessibility judge findings, and one hard line: `compact: hero exceeds desktop viewport`. Candidate-b had provable contrast failures.
- The repair prompt used 72k input tokens per call. Rounds 08 through 13 reused both candidate renders with no source changes and still ran bakeoff judges.
- OpenCode Go Responses SSE was verified live on 2026-11-06: HTTP 200 `text/event-stream`, `response.output_text.delta`, `response.reasoning_summary_text.delta`, and `response.completed` with usage.

## Review Focus

- A warned deploy that hides a hard content-integrity or accessibility finding because the classifier treats an unknown category as open.
- A mixed technical gate array where rendered verification passed and contrast failed, incorrectly failing the whole stage or softening provable contrast.
- A delivery verdict that is computed before deploy and reports `passed` with no reachable preview.
- A repair finalizer that exits before restoring the best candidate, or hits the loop-scoped `record` after the loop.
- A streamed call that aborts or returns a partial response and is recorded as completed.

---

### Task 1: Make desktop hero height advisory and run the #217 experiment

**Files:**
- Modify: `scripts/creative-gate-severity.mjs`
- Test: `tests/creative-gate-severity.test.ts`
- Test: `tests/rendered-creative-repair.test.ts`

**Interfaces:**
- Consumes: `classifyFailureLine(line): "hard" | "open"`, `nearMissAssessment(candidate)`.
- Produces: the same signatures, with `hero exceeds desktop viewport` classified as advisory.

- [ ] **Step 1: Write the failing tests**

```ts
it("treats a desktop hero height overage as advisory design fidelity", () => {
  expect(classifyFailureLine("compact: hero exceeds desktop viewport")).toBe("open");
  expect(
    classifyFailureLine(
      "mobile: hero action exceeds mobile viewport for an image-overlay route",
    ),
  ).toBe("hard");
  expect(classifyFailureLine("unknown new failure")).toBe("hard");
});
```

Add a near-miss test with a candidate whose only failure is the desktop-height line, `overallScore` 72, every dimension at least 50, and no content-integrity or accessibility findings. Assert `eligible === true` and that the line appears in `openFindings`.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/creative-gate-severity.test.ts tests/rendered-creative-repair.test.ts`
Expected: the new desktop-height case fails as hard.

- [ ] **Step 3: Implement the narrow exception**

After stripping the viewport prefix, return `"open"` only for the exact `hero exceeds desktop viewport` line. Keep the mobile CTA-visibility lines hard.

- [ ] **Step 4: Run the tests and commit**

```bash
npx vitest run tests/creative-gate-severity.test.ts tests/rendered-creative-repair.test.ts
git add scripts/creative-gate-severity.mjs tests/creative-gate-severity.test.ts tests/rendered-creative-repair.test.ts
git commit -m "fix(creative): treat desktop hero height as advisory"
```

- [ ] **Step 5: Run the authorized #217 experiment after the slice is integrated**

```bash
gh workflow run generate-client.yml --repo WrazyAI/launchloom --ref main \
  -f issue=217 -f test_profile=creative-only -f inference_provider=opencode-go
```

Accept either a clean pass or a warned pass. Confirm `verdict: "passed"`, `previewDelivered: true`, and `deliveryMode: "creative-near-miss"` or a clean delivery. If it fails, capture the exact stage, gate, and hard finding. Do not broaden the classifier until the specific blocker is known. Record wall-clock duration, author and creative duration, bakeoff rounds, and token totals.

---

### Task 2: Harden the visual gate classifier and selection validator

**Files:**
- Modify: `scripts/creative-gate-severity.mjs`
- Modify: `scripts/validate-creative-preview-selection.mjs`
- Test: `tests/creative-gate-severity.test.ts`
- Test: `tests/creative-preview-selection.test.ts`

**Interfaces:**
- `classifyVisualGateReport(report)` must reject missing `audit.findings`, missing blockers for a quality-blocked report, unknown severities, unknown categories, and contradictory verdicts.
- `validateCreativePreviewSelection({ config, bakeoff, gate })` must find the selected bakeoff candidate, require its audit evidence, and reject any hard failure line.

- [ ] **Step 1: Write the failing classifier tests**

Add cases where `audit.findings` is missing, where a finding has `severity: "major"` and an unknown category, where `status: "quality-blocked"` has no blockers array, and where the verdict is `"block"`. Assert `decision: "reject"`.

- [ ] **Step 2: Write the failing selection tests**

Add a near-miss bakeoff whose selected candidate has `failures: ["contrast fail: ..."]`. Assert reject. Add a missing selected candidate and a candidate with no `renderedReferenceFidelity.audit`. Assert reject. Keep the existing clean and warned cases passing.

- [ ] **Step 3: Add known-category validation**

Introduce a known advisory category set for design findings. Treat any category outside the known advisory set and the hard set as hard. Keep unknown severities hard. Do not infer a category from free text.

- [ ] **Step 4: Validate the selected bakeoff candidate**

Resolve `bakeoff.candidates.find((candidate) => candidate.candidateId === candidateId)`. Require `renderedReferenceFidelity.audit` and run `splitFailureLines(candidate.failures)`. Any hard line rejects, even when the final visual gate is clean.

- [ ] **Step 5: Run the tests and commit**

```bash
npx vitest run tests/creative-gate-severity.test.ts tests/creative-preview-selection.test.ts
git add scripts/creative-gate-severity.mjs scripts/validate-creative-preview-selection.mjs tests/creative-gate-severity.test.ts tests/creative-preview-selection.test.ts
git commit -m "fix(gates): fail closed on malformed preview evidence"
```

---

### Task 3: Fix the technical near-miss gate, final verdict, and preview smoke

**Files:**
- Modify: `scripts/run-pipeline-test.mjs`
- Modify: `scripts/pages-preview-readiness.mjs`
- Test: `tests/pipeline-test-runner.test.ts`
- Test: `tests/pipeline-test-rendered.test.ts`
- Test: `tests/pages-preview-readiness.test.ts`

**Interfaces:**
- `nearMissContrastOnly` must accept the real gate array `[ {name:"rendered",passed:true}, {name:"contrast",passed:false,...} ]` only when every failed contrast finding is advisory.
- `report.verdict` must be finalized after deploy and smoke. A failed deploy, missing preview URL, or failed marker check means `verdict: "failed"` and `previewDelivered: false`.
- `classifyPagesPreviewResponse` gains an optional `marker` input. A creative preview requires `data-creative-host="true"` in the body.

- [ ] **Step 1: Write the failing mixed-gate test**

Build the real gate array with a passing rendered gate and a failed contrast gate. Assert the technical stage passes only when the contrast findings are advisory. Add a provable below-minimum case and assert it fails.

- [ ] **Step 2: Write the failing deploy-verdict test**

Make the deploy dependency return null. Assert `verdict === "failed"`, `previewDelivered === false`, and no notification is sent.

- [ ] **Step 3: Write the failing marker test**

A 200 response without the creative marker must not count as delivered. A warning preview with the marker must count.

- [ ] **Step 4: Implement structured contrast and finalization**

Read the contrast report from `.launchloom/contrast-report.json` or the gate error's structured data. Keep provable below-minimum failures hard. Treat unresolved findings as advisory only when the existing pixel-resolution policy says unresolved. Move the verdict computation after deploy and notify.

- [ ] **Step 5: Add the marker check**

Extend the preview readiness wait to read a bounded response body and assert the creative marker when the delivery is creative. Do not follow cross-host redirects.

- [ ] **Step 6: Run the tests and commit**

```bash
npx vitest run tests/pipeline-test-runner.test.ts tests/pipeline-test-rendered.test.ts tests/pages-preview-readiness.test.ts
git add scripts/run-pipeline-test.mjs scripts/pages-preview-readiness.mjs tests/pipeline-test-runner.test.ts tests/pipeline-test-rendered.test.ts tests/pages-preview-readiness.test.ts
git commit -m "fix: finalize delivery after the preview smoke check"
```

---

### Task 4: Split SEO and rendered findings by delivery risk

**Files:**
- Create: `scripts/gate-policy.mjs`
- Create: `tests/gate-policy.test.ts`
- Modify: `scripts/seo-release-gate.mjs`
- Modify: `scripts/verify-rendered-revision.mjs`
- Modify: `.github/workflows/generate-client.yml`
- Test: `tests/seo-release-gate.test.ts` (or the existing suite)
- Test: `tests/pipeline-test-rendered.test.ts`

**Interfaces:**
- Produces: `classifyGateFailure({ gate, message }) => "hard" | "advisory"` with unknown as hard.
- Hard: private location fields, missing rendered routes, unresolved internal links or anchors, orphaned routes, em dashes, broken forms, broken navigation, missing alt text, horizontal overflow, provable contrast, build failures.
- Advisory: metadata description quality, structured-data completeness, sitemap substance, SEO recommendations, design-fidelity findings.

- [ ] **Step 1: Write the table test**

Pin every current failure string from `seo-release-gate.mjs` and `verify-rendered-revision.mjs` to `hard` or `advisory`. Add an unknown string and assert `hard`.

- [ ] **Step 2: Implement the policy**

Return a reason and the source gate. Do not wrap an entire script in a soft pass; classify each finding.

- [ ] **Step 3: Apply the policy in review mode**

Hard findings fail the gate; advisory findings are returned in the report and do not fail. Production mode remains strict. Keep the existing `--report` shape and add a `classified` list.

- [ ] **Step 4: Wire the creative preview**

The full creative deploy uses the classified report. A warned preview may carry advisory SEO findings; a hard finding still blocks.

- [ ] **Step 5: Run the tests and commit**

```bash
npx vitest run tests/gate-policy.test.ts tests/pipeline-test-rendered.test.ts
git add scripts/gate-policy.mjs tests/gate-policy.test.ts scripts/seo-release-gate.mjs scripts/verify-rendered-revision.mjs .github/workflows/generate-client.yml
git commit -m "feat: classify SEO and rendered findings by delivery risk"
```

---

### Task 5: Fix terminal repair finalization and the scoped record bug

**Files:**
- Modify: `scripts/run-rendered-creative-repair.mjs`
- Test: `tests/rendered-creative-repair.test.ts`

**Interfaces:**
- Produces: one `finalizeTerminalState` path used by budget exhaustion and the round cap. It distinguishes permanent exhaustion from temporary cooldown, restores better measured states, re-evaluates them, attempts near-miss with matching fresh evidence, and returns a summary or a bounded failure.
- Produces: no post-loop reference to the loop-scoped `record`; finalization uses the last history entry or `finalRoundContext`.

- [ ] **Step 1: Write the failing tests**

Add a case where a better earlier state must be restored before near-miss, a case where the round cap is reached with a hard-clean candidate, and a case where the post-loop near-miss succeeds. The last case must not throw `ReferenceError`.

- [ ] **Step 2: Implement the finalizer**

Do not treat temporary cooldown as permanent exhaustion. Only finalize when no candidate can become repairable within the remaining rounds or gate repairs are exhausted. Move the near-miss attempt after the restore and re-evaluation.

- [ ] **Step 3: Run the tests and commit**

```bash
npx vitest run tests/rendered-creative-repair.test.ts
git add scripts/run-rendered-creative-repair.mjs tests/rendered-creative-repair.test.ts
git commit -m "fix(creative): finalize repair state before delivery"
```

---

### Task 6: Add the one-candidate fast lane

**Files:**
- Modify: `scripts/pipeline-test-policy.mjs`
- Modify: `scripts/production-experience-author.mjs`
- Modify: `scripts/creative-compiler.mjs`
- Modify: `scripts/compile-inspiration-pack.mjs`
- Modify: `scripts/inspiration-registry.mjs`
- Modify: `scripts/run-pipeline-test.mjs`
- Modify: `.github/workflows/generate-client.yml`
- Modify: `.github/workflows/test-generation.yml`
- Test: `tests/pipeline-test-policy.test.ts`
- Test: `tests/creative-compiler.test.ts`
- Test: `tests/compile-inspiration-pack.test.ts`
- Test: `tests/inspiration-registry.test.ts`
- Test: `tests/production-experience-author.test.ts`
- Test: `tests/pipeline-test-runner.test.ts`

**Interfaces:**
- Produces: a `fast_lane` boolean dispatch input, scoped to `creative-only` first. When true, the policy returns `candidateCount: 1`, `repairCycles: 1`, `fast: true`. When false, the existing three-candidate policy is unchanged.
- Produces: `assertIndependentRoutes(routes, expected = 3)` and `assertInspirationPack(pack, expected)` accept the policy count. The selector chooses the requested number of routes while preserving evidence, licensing, and business matching.
- Produces: `run-pipeline-test.mjs` passes `--require-diversity false` for one candidate and sets `CREATIVE_EXPERIENCE_REASONING_EFFORT=medium`, `CREATIVE_REPAIR_EFFORT=medium`, `CREATIVE_REFERENCE_JUDGE_EFFORT=low` for the fast lane.

- [ ] **Step 1: Write the failing policy and compiler tests**

Assert `fast_lane: true` gives one candidate and one cycle; `fast_lane: false` keeps three and three. Assert one valid route compiles and zero routes throw. Assert the selector returns one route when asked for one without relaxing the dossier evidence rules.

- [ ] **Step 2: Implement the policy flag**

Do not add a new profile to the tracking wire contracts yet. The flag keeps the profile `creative-only` and avoids a cross-layer enum migration.

- [ ] **Step 3: Propagate the count**

Pass the requested count from the policy through `compile-inspiration-pack.mjs` to the selector and `assertInspirationPack`. Update every exact-three assertion: `production-experience-author.mjs:574`, `creative-compiler.mjs:272`, `inspiration-registry.mjs:1148`, and the full workflow jq check at `generate-client.yml:669`.

- [ ] **Step 4: Add the dispatch input and focused condition**

Add `fast_lane` to `generate-client.yml` and pass it to the focused workflow. Keep the profile name `creative-only`.

- [ ] **Step 5: Run the focused suites and commit**

```bash
npx vitest run tests/pipeline-test-policy.test.ts tests/creative-compiler.test.ts tests/compile-inspiration-pack.test.ts tests/inspiration-registry.test.ts tests/production-experience-author.test.ts tests/pipeline-test-runner.test.ts
git add scripts/pipeline-test-policy.mjs scripts/production-experience-author.mjs scripts/creative-compiler.mjs scripts/compile-inspiration-pack.mjs scripts/inspiration-registry.mjs scripts/run-pipeline-test.mjs .github/workflows/generate-client.yml .github/workflows/test-generation.yml tests
git commit -m "feat(pipeline): add the one-candidate fast lane"
```

---

### Task 7: Stream bounded model progress

**Files:**
- Modify: `scripts/inference-client.mjs`
- Modify: `scripts/generation-inference.mjs`
- Modify: `scripts/generation-activity-model.mjs`
- Modify: `src/lib/generation-activity-contract.mjs`
- Modify: `src/lib/generation-activity.ts`
- Modify: `src/admin/generation-activity-format.ts`
- Modify: `src/admin/GenerationActivity.tsx`
- Test: `tests/inference-client.test.ts`
- Test: `tests/generation-activity-client.test.ts`
- Test: `tests/generation-activity-contract.test.ts`
- Test: `tests/generation-activity-format.test.ts`

**Interfaces:**
- Produces: `inferenceCompletion({ ..., onProgress })` calls `onProgress({ visibleChars, reasoningDeltas, elapsedMs })` at most once per second while a Responses stream is active.
- Produces: `TRACE_EVENT_KINDS` includes `"output_delta"` with `{ callId, visibleChars, reasoningTokens, elapsedMs }`.
- Produces: the activity panel groups the delta into the active call row and labels the count `estimated while streaming`.

- [ ] **Step 1: Write the failing transport test**

Stub an SSE body with split UTF-8 chunks, `response.output_text.delta`, `response.reasoning_summary_text.delta`, and `response.completed`. Assert progress before the final result and correct completed text and usage. Add abort, failed, incomplete, and absent-completion cases.

- [ ] **Step 2: Write the failing contract and format tests**

Assert a valid `output_delta` is accepted and an extra field or negative count is rejected. Assert the formatter groups the delta into the active call and does not create a second completed row.

- [ ] **Step 3: Implement the stream parser**

Parse only `data:` lines. Do not store reasoning summary text; count deltas. Parse `response.completed.response` through the existing `normalizeInferenceResponse`. Treat a missing completion as a transport failure. Emit usage exactly once.

- [ ] **Step 4: Bridge the callback**

Thread `onProgress` from `completeGeneration` through `generation-inference.mjs` to `observeModelCall`. The observer emits the throttled `output_delta` and keeps the final `output` and `usage` authoritative.

- [ ] **Step 5: Add the UI row**

Show estimated output tokens and reasoning delta count. State that the count is estimated; do not claim exact token accounting until `response.completed` arrives. Report the honest latency budget: one-second throttling plus two-second polling can take up to five seconds.

- [ ] **Step 6: Run the tests and commit**

```bash
npx vitest run tests/inference-client.test.ts tests/generation-activity-client.test.ts tests/generation-activity-contract.test.ts tests/generation-activity-format.test.ts
git add scripts/inference-client.mjs scripts/generation-inference.mjs scripts/generation-activity-model.mjs src/lib/generation-activity-contract.mjs src/lib/generation-activity.ts src/admin/generation-activity-format.ts src/admin/GenerationActivity.tsx tests
git commit -m "feat(activity): stream bounded model progress"
```

---

### Task 8: Report the delivery funnel

**Files:**
- Create: `scripts/generation-delivery-funnel.mjs`
- Create: `tests/generation-delivery-funnel.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `summariseDeliveryFunnel(records, { now }) => { eligible, delivered, clean, warned, failed, unknown, p50Minutes, p90Minutes }`.
- Input: the authenticated admin generations API records, filtered to the last 20 full-profile attempts that started the generate job.
- Exclude access-only, seo-only, creative-only, fast-lane, cancelled, and synthetic test intakes. Missing delivery evidence counts as `unknown`.

- [ ] **Step 1: Write the failing tests**

Fixtures for a clean delivery, a warned delivery, a failed run, an excluded creative-only run, a cancelled run, and a missing report. Assert counts and percentiles.

- [ ] **Step 2: Implement the pure summariser and the CLI**

The CLI accepts `--input <json>` for tests and `--api <base>` for live reads. Never count a missing report as success.

- [ ] **Step 3: Add the npm script**

```json
"report:delivery-funnel": "node scripts/generation-delivery-funnel.mjs"
```

- [ ] **Step 4: Run the tests and commit**

```bash
npx vitest run tests/generation-delivery-funnel.test.ts
git add scripts/generation-delivery-funnel.mjs tests/generation-delivery-funnel.test.ts package.json
git commit -m "feat: report the preview delivery funnel"
```

---

## Verification

Run `npm run check` and the focused suites after each task. Before the first Phase 1 live run:

```bash
npm run check
npx vitest run \
  tests/creative-gate-severity.test.ts \
  tests/creative-preview-selection.test.ts \
  tests/rendered-creative-repair.test.ts \
  tests/pipeline-test-runner.test.ts \
  tests/pipeline-test-rendered.test.ts \
  tests/pages-preview-readiness.test.ts \
  tests/gate-policy.test.ts \
  tests/inference-client.test.ts \
  tests/generation-activity-contract.test.ts \
  tests/generation-activity-format.test.ts \
  tests/generation-delivery-funnel.test.ts
```

Then run the fast lane on #217 and verify:

- `verdict: "passed"`
- `deliveryMode: "creative-near-miss"` or a clean delivery
- one authored candidate
- no more bakeoff rounds than the fast-lane policy allows
- preview URL returns 200 with the creative marker
- admin attempt inspector shows the warned preview and the streamed progress
- total wall clock under 45 minutes for the first proof, then under 35 minutes at p90 over the next 10 runs

## Review disposition

### Real concerns accepted

- Task 1 establishes eligibility, not delivery. The #217 run is an experiment and accepts a clean or warned outcome.
- The visual gate classifier accepts missing findings and unknown categories as open. Task 2 requires schema and category validation.
- The selection validator does not check the selected candidate's deterministic hard failures. Task 2 adds that check.
- The technical near-miss exception requires every gate to fail contrast, while the real array includes a passing rendered gate. Task 3 tests the mixed array and keeps provable contrast hard.
- The verdict is computed before deploy and can report `passed` with no preview. Task 3 finalizes after deploy and the marker check.
- The one-candidate change is a contract migration across policy, compiler, selector, authoring, workflow, and tests. Task 6 lists every contract.
- The repair finalizer must restore best states and attempt near-miss in the right order. Task 5 replaces the proposed insertion point with one finalizer.
- The post-loop near-miss path references a loop-scoped `record`. Task 5 fixes it and tests it.
- Full-profile delivery does not produce the focused pipeline report. Task 8 reads the admin generations API instead.

### Concerns rejected as non-blocking

- SSE requires replacing response normalization. False: the `response.completed` envelope can use the existing normalizer.
- A database migration is required for `output_delta`. Not established: event kinds use a syntactic check, and only usage events update accounting.
- One candidate requires a bakeoff rewrite. False: `requireDiversity: false` already exists.
- A blocked visual-gate subprocess always prevents near-miss. False: valid exit-2 quality-blocked reports are consumed.
- Task 1's desktop-height exception is unsafe. False: it is narrower than the mobile CTA-visibility rules, which stay hard.
- The first slice's warning receipt is enough for every lifecycle. Partially false: the PR comment and email carry the findings, but the admin currently shows a generic notice. Treat the full admin finding list as a follow-up owned by the dashboard workstream, not a blocker for preview delivery.

### Builder calls

- Preview access stays unlisted plus noindex for this phase.
- An integrity-clean build with any visual score may count as a warned delivery.
- The funnel denominator is full-profile attempts; focused lanes are excluded.
- Developer-only review for the first 10 delivered previews, then client-visible with warnings.
- The convergence-freeze definition becomes delivered preview with no hard-integrity defect.
- Streaming latency is reported honestly: one-second producer throttling plus two-second polling can take up to five seconds, not 1.5 seconds.

## Out of Scope

- Public auto-publishing.
- The local design repair agent and its prompts.
- New admin cancel, retry, or promote actions. The repair bundle and those actions are a separate plan.
- Rewriting historical attempts.
