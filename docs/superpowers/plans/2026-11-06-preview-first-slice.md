# Preview-First Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first safe slice of the preview-first generation plan: bounded warned creative previews, warning receipts, post-deploy rendered checks, and baseline delivery instrumentation.

**Architecture:** A pure decision function classifies the final visual gate report into clean, warned, or reject. A selection validator combines the site config, bakeoff report, and gate report into one deployment decision. The workflow uses that decision to deploy the existing `review-initial` preview with a bounded warning receipt instead of failing. Preview readiness gains an optional renderer marker check so a 200 response alone cannot count as delivered.

**Tech Stack:** Node ESM, Vitest, GitHub Actions YAML, TypeScript Worker contracts.

**Spec:** `docs/superpowers/specs/2026-11-06-generation-logistics-design.md`

## Global Constraints

- No em dashes in generated content or rendered client pages.
- Hard integrity gates stay hard. Unknown, missing, or unparseable evidence is hard.
- Do not change candidate counts, repair cycles, or the reference selector in this slice.
- Do not add a new admin surface. Warnings appear in the existing attempt inspector and operations event list.
- Do not print secrets. Tests use synthetic data only.
- Keep the existing `review-initial` preview URL contract.
- The final `output` activity event remains the authority; this slice does not add streaming.

## Review Focus

- A near-miss report with a critical finding must never deploy.
- A strict selection with `fallback: true` must never deploy as clean.
- A missing or undefined gate report must reject, not warn.
- A preview URL that returns 200 but lacks the renderer marker must not count as delivered.
- A warning receipt must never turn a hard failure into `attention`.

---

### Task 1: Classify the visual gate report

**Files:**
- Modify: `scripts/creative-gate-severity.mjs`
- Test: `tests/creative-gate-severity.test.ts`

**Interfaces:**
- Consumes: `classifyJudgeFinding(finding)`, `classifyFailureLine(line)`, `splitFailureLines(failures)` from the same module.
- Produces: `classifyVisualGateReport(report)` returning
  `{ decision: "clean" | "warned" | "reject", hard: string[], warnings: string[], reasons: string[] }`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/creative-gate-severity.test.ts`:

```ts
import { classifyVisualGateReport } from "../scripts/creative-gate-severity.mjs";

describe("visual gate report classification", () => {
  function report(overrides: Record<string, any> = {}) {
    return {
      version: 1,
      mode: "verify",
      status: "quality-blocked",
      audit: { verdict: "revise", findings: [], operations: [] },
      blockers: [],
      ...overrides,
    };
  }

  it("marks a passing report with no findings as clean", () => {
    expect(
      classifyVisualGateReport(
        report({ status: "ok", audit: { verdict: "pass", findings: [] } }),
      ),
    ).toMatchObject({ decision: "clean", hard: [], warnings: [] });
  });

  it("marks open design findings as a warned preview", () => {
    const result = classifyVisualGateReport(
      report({
        audit: {
          verdict: "revise",
          findings: [
            {
              severity: "major",
              category: "hero-geometry",
              viewport: "both",
              evidence: "hero geometry drifts",
              recommendation: "tighten the hero",
            },
          ],
        },
        blockers: [
          {
            severity: "major",
            category: "hero-geometry",
            viewport: "both",
            evidence: "hero geometry drifts",
            recommendation: "tighten the hero",
          },
        ],
      }),
    );
    expect(result.decision).toBe("warned");
    expect(result.hard).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("rejects critical findings, hard majors, and unknown blockers", () => {
    expect(
      classifyVisualGateReport(
        report({
          audit: {
            verdict: "revise",
            findings: [{ severity: "critical", category: "hero-geometry" }],
          },
        }),
      ).decision,
    ).toBe("reject");
    expect(
      classifyVisualGateReport(
        report({
          audit: {
            verdict: "revise",
            findings: [{ severity: "major", category: "accessibility" }],
          },
        }),
      ).decision,
    ).toBe("reject");
    expect(
      classifyVisualGateReport(report({ blockers: [{ unexpected: true }] }))
        .decision,
    ).toBe("reject");
  });

  it("rejects a missing, errored, or unknown report", () => {
    expect(classifyVisualGateReport(null).decision).toBe("reject");
    expect(classifyVisualGateReport(report({ status: "error" })).decision).toBe(
      "reject",
    );
    expect(
      classifyVisualGateReport(report({ audit: { verdict: "unknown" } }))
        .decision,
    ).toBe("reject");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/creative-gate-severity.test.ts --maxWorkers=1`
Expected: FAIL because `classifyVisualGateReport` is not exported.

- [ ] **Step 3: Implement `classifyVisualGateReport`**

Add to `scripts/creative-gate-severity.mjs`:

```js
function describeBlocker(blocker) {
  if (!blocker || typeof blocker !== "object") return "unclassified blocker";
  const severity = String(blocker.severity || "major");
  const category = String(blocker.category || "unclassified");
  const detail = String(
    blocker.evidence || blocker.message || blocker.recommendation || "",
  )
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 180);
  return `${severity} ${category}: ${detail}`;
}

export function classifyVisualGateReport(report) {
  if (!report || typeof report !== "object")
    return { decision: "reject", hard: ["missing report"], warnings: [], reasons: ["missing report"] };
  if (report.status === "error")
    return { decision: "reject", hard: ["gate error"], warnings: [], reasons: ["gate error"] };
  const verdict = report.audit?.verdict;
  if (!["pass", "revise", "block"].includes(verdict))
    return { decision: "reject", hard: ["unknown verdict"], warnings: [], reasons: ["unknown verdict"] };
  const findings = Array.isArray(report.audit?.findings) ? report.audit.findings : [];
  const hard = [];
  const warnings = [];
  for (const finding of findings) {
    const classification = classifyJudgeFinding(finding);
    if (classification === "critical" || classification === "hard")
      hard.push(describeJudgment(finding));
    else warnings.push(describeJudgment(finding));
  }
  for (const blocker of Array.isArray(report.blockers) ? report.blockers : []) {
    if (!blocker || typeof blocker !== "object" || !blocker.severity || !blocker.category) {
      hard.push(describeBlocker(blocker));
      continue;
    }
    const classification = classifyJudgeFinding(blocker);
    if (classification === "critical" || classification === "hard")
      hard.push(describeBlocker(blocker));
    else warnings.push(describeBlocker(blocker));
  }
  if (hard.length)
    return { decision: "reject", hard, warnings, reasons: hard };
  if (verdict === "pass" && warnings.length === 0)
    return { decision: "clean", hard: [], warnings: [], reasons: [] };
  if (verdict === "pass" || verdict === "revise")
    return { decision: "warned", hard: [], warnings, reasons: [] };
  return { decision: "reject", hard: ["blocked verdict"], warnings, reasons: ["blocked verdict"] };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/creative-gate-severity.test.ts --maxWorkers=1`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/creative-gate-severity.mjs tests/creative-gate-severity.test.ts
git commit -m "feat(gates): classify visual gate reports for preview delivery"
```

---

### Task 2: Validate the creative preview selection

**Files:**
- Create: `scripts/validate-creative-preview-selection.mjs`
- Test: `tests/creative-preview-selection.test.ts`

**Interfaces:**
- Consumes: `classifyVisualGateReport(report)` from Task 1.
- Produces: `validateCreativePreviewSelection({ config, bakeoff, gate })` returning
  `{ decision: "clean" | "warned" | "reject", candidateId: string | null, warnings: string[], reasons: string[] }`.
- CLI: `node scripts/validate-creative-preview-selection.mjs --config <path> --bakeoff <path> --gate <path> --out <path>`.
  Exit 0 for `clean` or `warned`, exit 1 for `reject`. The JSON output is written to `--out` and to stdout.

- [ ] **Step 1: Write the failing tests**

Create `tests/creative-preview-selection.test.ts` with cases for:

```ts
import { describe, expect, it } from "vitest";
import { validateCreativePreviewSelection } from "../scripts/validate-creative-preview-selection.mjs";

function config(overrides: Record<string, any> = {}) {
  return {
    design: {
      experience: {
        renderer: "creative-candidate",
        candidateId: "candidate-a",
        selectionMode: "creative-preview",
      },
    },
    ...overrides,
  };
}

function bakeoff(overrides: Record<string, any> = {}) {
  return {
    selectedCandidateId: "candidate-a",
    fallback: false,
    ...overrides,
  };
}

function gate(overrides: Record<string, any> = {}) {
  return {
    version: 1,
    mode: "verify",
    status: "ok",
    audit: { verdict: "pass", findings: [] },
    blockers: [],
    ...overrides,
  };
}

describe("creative preview selection", () => {
  it("accepts a clean strict selection", () => {
    expect(
      validateCreativePreviewSelection({ config: config(), bakeoff: bakeoff(), gate: gate() }),
    ).toMatchObject({ decision: "clean", candidateId: "candidate-a" });
  });

  it("accepts a near-miss with open findings as warned", () => {
    const result = validateCreativePreviewSelection({
      config: config({
        design: { experience: { renderer: "creative-candidate", candidateId: "candidate-a", selectionMode: "creative-near-miss" } },
      }),
      bakeoff: bakeoff({ nearMissSelection: true, fallback: true }),
      gate: gate({
        status: "quality-blocked",
        audit: { verdict: "revise", findings: [{ severity: "major", category: "hero-geometry", evidence: "drift" }] },
        blockers: [{ severity: "major", category: "hero-geometry", evidence: "drift" }],
      }),
    });
    expect(result.decision).toBe("warned");
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("rejects a strict selection with fallback true", () => {
    expect(
      validateCreativePreviewSelection({ config: config(), bakeoff: bakeoff({ fallback: true }), gate: gate() }).decision,
    ).toBe("reject");
  });

  it("rejects a near-miss without nearMissSelection", () => {
    expect(
      validateCreativePreviewSelection({
        config: config({ design: { experience: { renderer: "creative-candidate", candidateId: "candidate-a", selectionMode: "creative-near-miss" } } }),
        bakeoff: bakeoff({ fallback: true }),
        gate: gate(),
      }).decision,
    ).toBe("reject");
  });

  it("rejects a near-miss with a hard blocker", () => {
    expect(
      validateCreativePreviewSelection({
        config: config({ design: { experience: { renderer: "creative-candidate", candidateId: "candidate-a", selectionMode: "creative-near-miss" } } }),
        bakeoff: bakeoff({ nearMissSelection: true, fallback: true }),
        gate: gate({ status: "quality-blocked", audit: { verdict: "revise", findings: [{ severity: "critical", category: "content-integrity" }] }, blockers: [{ severity: "critical", category: "content-integrity" }] }),
      }).decision,
    ).toBe("reject");
  });

  it("rejects a missing candidate or unknown selection mode", () => {
    expect(
      validateCreativePreviewSelection({ config: config({ design: { experience: { renderer: "creative-candidate", candidateId: null, selectionMode: "creative-preview" } } }), bakeoff: bakeoff(), gate: gate() }).decision,
    ).toBe("reject");
    expect(
      validateCreativePreviewSelection({ config: config({ design: { experience: { renderer: "creative-candidate", candidateId: "candidate-a", selectionMode: "unknown" } } }), bakeoff: bakeoff(), gate: gate() }).decision,
    ).toBe("reject");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/creative-preview-selection.test.ts --maxWorkers=1`
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the module and CLI**

Rules:
- Require `config.design.experience.renderer === "creative-candidate"`, a non-empty `candidateId`, and `bakeoff.selectedCandidateId === candidateId`.
- Strict modes `creative-preview` and `creative-bakeoff`: require `bakeoff.fallback === false` and `gate.decision === "clean"`. A warned gate rejects the strict path.
- Near-miss mode `creative-near-miss`: require `bakeoff.nearMissSelection === true`; accept `fallback: true`; require `gate.decision` to be `"clean"` or `"warned"`.
- Any other mode rejects.
- Return reasons for every rejection.

CLI behavior: parse `--config`, `--bakeoff`, `--gate`, `--out`; read JSON; call the function; write `--out` with `JSON.stringify(result, null, 2) + "\n"`; print the JSON to stdout; exit 1 when decision is `reject`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/creative-preview-selection.test.ts --maxWorkers=1`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/validate-creative-preview-selection.mjs tests/creative-preview-selection.test.ts
git commit -m "feat(gates): validate creative preview selection decisions"
```

---

### Task 3: Deploy warned creative previews from the workflow

**Files:**
- Modify: `.github/workflows/generate-client.yml` (creative branch of `Build and direct-upload public preview`, around lines 1264-1309)
- Test: `tests/generation-workflow-creative-preview.test.ts`

**Interfaces:**
- Consumes: the Task 2 CLI, its JSON `decision`, `warnings`, and `candidateId`.
- Produces: workflow output `creative_decision` with `clean` or `warned`; log line `generation_delivery=<decision>`; warning count `generation_warnings=<n>`.

- [ ] **Step 1: Write the failing workflow test**

Create `tests/generation-workflow-creative-preview.test.ts` that reads the YAML and asserts:

```ts
import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("creative preview workflow", () => {
  it("uses the selection validator and deploys warned previews", async () => {
    const workflow = await fs.readFile(".github/workflows/generate-client.yml", "utf8");
    expect(workflow).toContain("validate-creative-preview-selection.mjs");
    expect(workflow).not.toContain(
      'selectionMode == "creative-preview" or .design.experience.selectionMode == "creative-bakeoff"',
    );
    expect(workflow).toContain("generation_delivery=");
    expect(workflow).toContain("creative_warnings=");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/generation-workflow-creative-preview.test.ts --maxWorkers=1`
Expected: FAIL because the validator call is not present.

- [ ] **Step 3: Update the workflow**

Replace the strict selection checks with:

```bash
node "$GITHUB_WORKSPACE/scripts/validate-creative-preview-selection.mjs" \
  --config src/site.config.json \
  --bakeoff .launchloom/creative-bakeoff.json \
  --gate .launchloom/creative-repair/final/visual-gate.json \
  --out "$RUNNER_TEMP/creative-preview-decision.json"
CREATIVE_DECISION=$(jq -r '.decision' "$RUNNER_TEMP/creative-preview-decision.json")
CREATIVE_WARNINGS=$(jq -r '.warnings | length' "$RUNNER_TEMP/creative-preview-decision.json")
echo "creative_decision=$CREATIVE_DECISION" >> "$GITHUB_OUTPUT"
echo "creative_warnings=$CREATIVE_WARNINGS" >> "$GITHUB_OUTPUT"
echo "generation_delivery=$CREATIVE_DECISION"
echo "generation_warnings=$CREATIVE_WARNINGS"
```

Keep the `data-creative-host` and candidate markers, rendered revision check, SEO gate, em dash scan, and the stale-source check. Deploy `review-initial` for both `clean` and `warned`. Add `delivery=$CREATIVE_DECISION` to the deploy output. Do not use `review-diagnostic` for a warned creative preview.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/generation-workflow-creative-preview.test.ts --maxWorkers=1`
Expected: PASS.

- [ ] **Step 5: Run the surrounding workflow tests**

Run: `npm test -- tests/generation-workflow-foundation.test.ts tests/operations-workflow.test.ts --maxWorkers=1`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/generate-client.yml tests/generation-workflow-creative-preview.test.ts
git commit -m "feat(workflow): deploy near-miss creative previews with warnings"
```

---

### Task 4: Carry warnings into the delivery receipt and admin

**Files:**
- Modify: `scripts/record-generation-event.mjs`
- Modify: `scripts/record-operations-telemetry.mjs`
- Modify: `.github/workflows/generate-client.yml` (`Record preview ready` and `Record authenticated operations handoff`)
- Modify: `src/admin/AttemptInspector.tsx`
- Test: `tests/operations-telemetry.test.ts`
- Test: `tests/admin-view-model.test.ts` or the nearest existing attempt inspector test

**Interfaces:**
- Consumes: the workflow `creative_decision` and `creative_warnings` outputs.
- Produces: `buildOperationsEvent` accepts `detailCode` and includes it on the event; `recordOperationsTelemetry` accepts `detailCode` and forwards it; the handoff event uses `preview_with_warnings` when the preview carries warnings.

- [ ] **Step 1: Write the failing tests**

Add to `tests/operations-telemetry.test.ts`:

```ts
it("carries a controlled warning detail code on the handoff event", () => {
  const event = buildOperationsEvent("00000000-0000-0000-0000-000000000001", {
    stage: "handoff",
    "stage-status": "completed",
    sha: "a".repeat(40),
    "detail-code": "preview_with_warnings",
  });
  expect(event.detailCode).toBe("preview_with_warnings");
});
```

Add an admin assertion in the existing attempt inspector test: when `deliveryStatus` is `attention`, the inspector shows the open-warnings notice text. Keep the exact text consistent with the component.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/operations-telemetry.test.ts --maxWorkers=1`
Expected: FAIL because `detailCode` is not set.

- [ ] **Step 3: Implement the receipt path**

In `scripts/record-generation-event.mjs`:
- Validate `args["detail-code"]` against `/^[a-z0-9_]{1,80}$/u`.
- Set `event.detailCode = value` when present.

In `scripts/record-operations-telemetry.mjs`:
- Accept `detailCode` in the options object.
- Pass `"detail-code": detailCode` into `postOperationsEvent` when set.

In `.github/workflows/generate-client.yml`:
- In `Record authenticated operations handoff`, pass `--detail-code preview_with_warnings` when `steps.deploy.outputs.creative_decision == 'warned'`.
- In `Record preview ready`, set `STATUS=attention` when the creative decision is `warned`.
- Write `.launchloom/delivery-warnings.json` in the client repo with the decision result and commit it to the review branch.
- Add a warning block to the developer email and PR comment using the existing `--feedback-file` mechanism.

In `src/admin/AttemptInspector.tsx`:
- Add a notice when `attempt.deliveryStatus === "attention"`: "Delivery has open review warnings. The preview is usable, but the listed findings are unresolved."

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/operations-telemetry.test.ts tests/admin-view-model.test.ts --maxWorkers=1`
Expected: PASS.

- [ ] **Step 5: Run the workflow tests**

Run: `npm test -- tests/operations-workflow.test.ts --maxWorkers=1`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/record-generation-event.mjs scripts/record-operations-telemetry.mjs .github/workflows/generate-client.yml src/admin/AttemptInspector.tsx tests/operations-telemetry.test.ts tests/admin-view-model.test.ts
git commit -m "feat(delivery): carry preview warnings into receipts and admin"
```

---

### Task 5: Check the rendered marker after deployment

**Files:**
- Modify: `scripts/pages-preview-readiness.mjs`
- Modify: `scripts/wait-for-pages-preview.mjs`
- Modify: `.github/workflows/generate-client.yml` (`Wait for secure preview URL` step)
- Test: `tests/pages-preview-readiness.test.ts` (new) or extend `tests/pipeline-test-runner.test.ts`

**Interfaces:**
- Consumes: the deployed preview URL and the expected renderer marker.
- Produces: `waitForPagesPreview({ url, marker, ... })` requires the marker in the first 2xx HTML response. The CLI accepts `--marker`.
- Failure behavior: if the marker is missing, the call retries until the timeout and then throws. A 200 without the marker never counts as ready.

- [ ] **Step 1: Write the failing tests**

Create `tests/pages-preview-readiness.test.ts` with cases:
- A 200 response containing the marker resolves `{ state: "ready", status: 200 }`.
- A 200 response without the marker retries, then throws after the timeout.
- A marker check does not change the existing no-marker behavior.

Use injected `send`, `wait`, and `now` so the test is deterministic.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/pages-preview-readiness.test.ts --maxWorkers=1`
Expected: FAIL because `marker` is not supported.

- [ ] **Step 3: Implement the marker option**

In `pages-preview-readiness.mjs`:
- Add `marker = ""` to the options.
- When `marker` is non-empty and the response is 2xx, read `await response.text()` and require `text.includes(marker)`. Missing marker counts as `retry` with `lastFailure = "renderer marker missing"`.
- Parse `--marker` in `parseWaitForPagesPreviewArgs` as a value flag.
- Export the parse function and test it.

In the workflow:
- Pass `--marker 'data-creative-host="true"'` for creative.
- Pass `--marker "data-foundation-dossier=\"$FOUNDATION_ID\""` for foundation.
- Pass `--marker "data-experience-pack=\"$PACK_ID\""` for pack.
- Keep the existing timeout and interval.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/pages-preview-readiness.test.ts tests/pipeline-test-runner.test.ts --maxWorkers=1`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/pages-preview-readiness.mjs scripts/wait-for-pages-preview.mjs .github/workflows/generate-client.yml tests/pages-preview-readiness.test.ts
git commit -m "feat(preview): require a rendered marker before counting delivery"
```

---

### Task 6: Record the delivery line and baseline

**Files:**
- Modify: `.github/workflows/generate-client.yml` (already emits `generation_delivery` and `generation_warnings` after Task 3)
- Create: `docs/superpowers/specs/2026-11-06-preview-baseline.md`
- Test: `tests/generation-workflow-creative-preview.test.ts`

**Interfaces:**
- Consumes: the workflow log line `generation_delivery=clean|warned|reject` and `generation_warnings=<n>`.
- Produces: a recorded baseline note with the known 6/100 run success rate and the new delivery line format, so the funnel report can parse it next.

- [ ] **Step 1: Add the baseline note**

Create `docs/superpowers/specs/2026-11-06-preview-baseline.md` with:
- The 2026-11-05 `npm run report:generation-success` output.
- The 2026-11-05 trace proof for attempt `d16920cc`.
- The fact that delivered-preview rate is not yet measurable until the next runs emit `generation_delivery`.
- The exact log line format the funnel will parse.

- [ ] **Step 2: Assert the workflow emits the line**

Extend `tests/generation-workflow-creative-preview.test.ts` to assert `generation_delivery=` and `generation_warnings=` appear exactly once in the creative branch.

- [ ] **Step 3: Run the tests**

Run: `npm test -- tests/generation-workflow-creative-preview.test.ts --maxWorkers=1`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-11-06-preview-baseline.md tests/generation-workflow-creative-preview.test.ts
git commit -m "docs: record the preview delivery baseline"
```

---

## Verification after all tasks

- [ ] Run the focused suite:
  `npm test -- tests/creative-gate-severity.test.ts tests/creative-preview-selection.test.ts tests/generation-workflow-creative-preview.test.ts tests/operations-telemetry.test.ts tests/pages-preview-readiness.test.ts tests/pipeline-test-runner.test.ts --maxWorkers=1`
- [ ] Run the Worker type check:
  `npm run check:worker`
- [ ] Run the relevant workflow tests:
  `npm test -- tests/operations-workflow.test.ts tests/generation-workflow-foundation.test.ts --maxWorkers=1`
- [ ] Run the rendered release gate on a fixture if the changed workflow touches the client template:
  `npm run verify:local-release -- --config <fixture-site.config.json> --build`
- [ ] Confirm no secret or private client asset appears in the diff.
- [ ] Record the outcome in `.github/agents/progress-update/UPDATE-2026-11-06.md`.
- [ ] Run `bash ./task_complete "<verified outcome>"` after the first real warned preview is verified.
