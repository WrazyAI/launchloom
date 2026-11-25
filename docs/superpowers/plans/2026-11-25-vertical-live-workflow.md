# Vertical Live Workflow Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement the tasks inline.

**Goal:** A downward workflow graph that follows current work while preserving run diagnostics.
**Architecture:** Retain the current SVG/React graph and canonical authenticated attempt endpoint. Own sequential refresh and inspection state inside the workflow panel.
**Tech Stack:** React, TypeScript, SVG, CSS, Vitest and Playwright.
**Spec:** `docs/superpowers/specs/2026-11-25-vertical-live-workflow.md`.

## Global Constraints

- Do not change workflow execution, generation/promotion gates, API authorization or raw-log handling.
- Use a dedicated branch from current main; preserve unrelated work and progress entries.
- Do not merge or deploy without shipping authorization.

## Review Focus

- Wide/narrow graphs retain downward chronology and readable, non-overlapping connections.
- Auto-follow never steals the page scroll or keyboard focus during inspection.
- Transient failures retain evidence and recover without duplicate or overlapping reads.
- Run changes abort old requests and cannot mix selections or paginated evidence.
- Terminal and duplicate-key evidence remains current despite late reconciliation.

### Task 1: Vertical graph and follow viewport

**Files:** `src/admin/WorkflowGraph.tsx`, `src/admin/redesign.css`, `tests/admin-workspace-browser.test.ts`.
**Interface:** Existing WorkflowGraph props plus controlled following state from the panel.

- [x] Add browser regressions proving downward dependency geometry, no overflow,
  latest stages within the scroll region, manual pause and explicit resume.
- [x] Run the regressions and observe the current horizontal/no-follow failures.
- [x] Lay out depth rows, route long connections around cards, and add a bounded
  keyboard-accessible scroll region with a follow toggle.
- [x] Re-run new and existing workflow browser checks, inspect desktop/mobile captures.

### Task 2: Live canonical run evidence

**Files:** `src/admin/ClientWorkflow.tsx`, `src/admin/AttemptInspector.tsx`, optional focused hook, browser tests.
**Interface:** Preserve `WorkflowRunPanel` props and `AdminApi.getAttempt`/`getAttemptEvents` contracts.

- [x] Add browser regressions for progressive stages, terminal diagnostics, refresh
  errors/recovery, paused inspection, selected-run changes and duplicate event keys.
- [x] Observe missing updates against the current code.
- [x] Implement abortable sequential visible-tab polling, seed from supplied detail,
  preserve last-good state, merge current evidence over old pages, and key by run.
- [x] Run all affected admin browser/API/view-model tests, admin build and type checks.

### Task 3: Review and handoff

- [x] Perform an independent bounded review of the diff and behavioral evidence.
- [x] Resolve concrete defects, re-run affected checks and record verification.
- [ ] Publish the connected layout/live-refresh changes in one reviewable commit.
- [ ] Open a PR against latest main and report its actual checks and shipping status.

## Verification checkpoint

All 148 affected checks pass, including the complete 99-case admin workspace
browser suite, API/view-model checks and layout regressions. Astro checking and
both builds pass, and final desktop/mobile captures have been inspected. The complete local
test run reports 2,906 passed, 381 failed and 115 skipped: 380 failures and two
suite import errors require the 301 absent R2 reference PNGs, while one unchanged
contextual-assets test timed out during live-network image handling. CI retains
the existing asset hydration and all required gates. Implementation and local
verification are complete; PR publication and CI readback are the next steps.
