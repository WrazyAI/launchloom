# Dossier Routing and Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep creative work on its validated dossier selection and make fixed-pack success distinguishable from a dossier-led delivery.

**Architecture:** Compile once in the reservation step; use the resulting routes or typed shortage for routing. Retry only to handle a concurrent history update. Keep requested and rendered designs separate in a safe workflow summary.

**Tech Stack:** Node.js, GitHub Actions, Vitest.

**Spec:** [Dossier audit and approved follow-up](../../research/2026-11-19-dossier-coverage-and-renderer-audit.md).

## Global Constraints

No changes to copy, rights, contrast, form, preview or public authorization gates. Keep the existing single-candidate default and model roles. No new admin or client-facing surface.

## Review Focus

Home care with a broad wellness industry; genuine shortage; invalid evidence never treated as shortage; non-creative requests; failed creative work followed by a verified pack build; frozen creative reuse.

### Task 1: Unify selection and routing

- [x] Add CLI tests: specific home care emits three routes in workflow mode, coffee roaster emits a typed shortage only in workflow mode, explicit fixed renders bypass reads, corrupt registry still exits nonzero.
- [x] Run the tests to prove the unsupported workflow outcomes fail.
- [x] Extend `scripts/compile-inspiration-pack.mjs` with `--selection strict|allow-shortage|skip` (default strict); share the typed shortage emitted by `scripts/inspiration-registry.mjs`.
- [x] Move fresh selection to one workflow step in `generate-client.yml`, preserve atomic reservation and frozen reuse, and update the workflow and intake identity tests.
- [x] Run the compiler and workflow tests.

### Task 2: Correct design evidence

- [x] Add tests for a real rendered marker, explicit pack vs creative fallback, and binding the current creative candidate to its dossier instead of all proposed routes.
- [x] Run tests red, then implement a sanitized design receipt in the workflow summary after a successful deploy and live marker check. Distinguish diagnostic from reviewable delivery. Only actually reserved routes get a completed reservation event.
- [x] Read independent review and address the five findings.
- [x] Run focused tests and build. Keep quality and publication gates unchanged.
- [ ] Finish full-suite verification before integration or live runs.
