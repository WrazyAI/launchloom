# Reference Dossier Worktree Reconciliation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to execute this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconcile only validated, reference-pipeline changes from `feat/reference-dossier-checkpoint` onto a clean branch based on current `origin/main`, without losing or mutating the original dirty checkout.

**Architecture:** Treat the clean main-based worktree as the integration target and the existing dirty checkout as immutable evidence. Compare committed and staged content separately, then port only changes that are still needed on current main. Keep canonical production dossiers distinct from archive-only evidence and generated test artifacts; preserve current-main checks unless a replacement is demonstrably equivalent.

**Tech Stack:** Git worktrees, Node.js, Vitest, Astro, LaunchLoom reference-dossier/compiler scripts.

**Spec:** `docs/creative-compiler.md`, `data/reference-library/README.md`, and the active Nifty task `sXC08aTzwY`.

## Global Constraints

- Do not edit, unstage, reset, delete from, or commit the original dirty checkout at `/home/maigreeks/projects/launchloom`.
- Base integration on fetched `origin/main`; never replay the stale branch wholesale or force-push.
- The existing mainline core of 96 unique references across 16 niches is already present; do not duplicate it.
- Retain evidence only when its provenance and rights record support the intended archive or production use; do not infer rights from a screenshot alone.
- Keep all quality, safety, SEO, contrast, diversity, and promotion gates unchanged.
- Do not push, merge to main, or deploy; return a locally validated feature branch for review.

## Review Focus

- Stale branch ancestry may make committed fixes obsolete or conflict with later mainline fixes; compare behavior and tests, not commit titles.
- The 35 `data/inspiration-evidence/` additions may be duplicates, unique archive material, or unsupported evidence; require hash/provenance classification before inclusion.
- The 64 added `data/reference-library/` paths may complete existing dossier records or be redundant; verify each path against the current registry and content digest.
- Eight staged deletions against current main include tests and runtime support; retain them unless a concrete replacement is proven and tested.
- The untracked selected-candidate manifest uses `test/model` and lacks mobile evidence; keep it out of production artifacts and do not use it as a generation result.

---

### Task 1: Produce a source-to-main reconciliation map

**Files:**
- Read: existing dirty checkout `feat/reference-dossier-checkpoint` and its index, without modifying it.
- Create: `docs/verification/reference-dossier-reconciliation-2026-10-07.md`.
- Test: `git diff --check` on the clean branch after creating the report.

**Interfaces:**
- Consumes: branch HEAD `c91a103`, the original index/worktree, local `origin/main` fetched at `7fc34f0`, and parent Nifty task `sXC08aTzwY`.
- Produces: a path-level classification of unique commits, staged deltas, untracked files, duplicate evidence, rights support, deletions, and changes already present on main.

- [x] **Step 1: Verify the current diff counts and branch refs** against the captured inventory; record the exact comparison base and distinguish committed branch work from staged-index work.
- [x] **Step 2: Compare the 64 added canonical-library paths and 35 parallel-evidence paths** with current dossier paths, registry references, manifests, hashes, and rights/provenance records.
- [x] **Step 3: Classify each non-data code change** as required reference-pipeline behavior, already present on main, unrelated feature work, or unresolved; explicitly inspect each of the eight deletions.
- [x] **Step 4: Write the reconciliation report** with retain/port/exclude/needs-decision status and evidence; do not remove or rewrite files in the original checkout.
- [x] **Step 5: Run `git diff --check`** and review the report against the original index listing.

### Task 2: Port only necessary reference and pipeline changes

**Files:**
- Modify only paths justified by Task 1, expected areas include `data/reference-library/`, `data/inspiration-registry.json`, `scripts/creative-compiler.mjs`, `scripts/compile-inspiration-pack.mjs`, and their focused tests.
- Preserve current-main files unless a reviewed change has a direct, tested replacement.
- Test: affected reference, compiler, authoring, and promotion suites.

**Interfaces:**
- Consumes: Task 1's path-level reconciliation report.
- Produces: a minimal, current-main-based change set with canonical paths, valid rights/provenance, no stale legacy fallback, and no unrelated onboarding/feedback/admin/email work.

- [x] **Step 1: Write or update focused tests** for any missing dossier/registry/compiler behavior before porting its implementation.
- [x] **Step 2: Port required dossier files and production code** without copying the 96-reference core already on main or importing unreferenced evidence into production selection.
- [x] **Step 3: Keep duplicate parallel evidence out of the integration branch;** if a unique item is eligible for archive retention, add its canonical dossier/archive manifest and rights evidence before registering it.
- [x] **Step 4: Restore current-main tests/runtime files by default;** accept a deletion only when the new code removes the dependency and a focused test proves equivalent behavior.
- [x] **Step 5: Re-run the affected tests** and inspect the resulting path list and diff against `origin/main`.

### Task 3: Validate and hand off a clean consolidation branch

**Files:**
- Modify: `docs/verification/reference-dossier-reconciliation-2026-10-07.md` with final classifications and results.
- Test: root, Worker, client-template, and reference-library checks.

**Interfaces:**
- Consumes: Task 2's minimal change set.
- Produces: local validation evidence and a reviewable branch; no mainline or production mutation.

- [x] **Step 1: Run the focused suites** for dossier integrity, inspiration compilation, creative authoring/promotion, and any retained behavior changes.
- [x] **Step 2: Run `npm test`, `npm run test:worker`, `npm run check`, `npm run check:worker`, and `npm run build`.**
- [x] **Step 3: Run client-site Astro check/build and compile a production-style inspiration pack** using the current main config; confirm three matching references, complete desktop/mobile evidence, and no unrelated filler.
- [x] **Step 4: Review `git diff --check`, staged/untracked state, and all diff paths; record the exact results in the progress ledger.**
- [ ] **Step 5: Commit only the validated reconciliation on this feature branch** if all gates pass; do not push, merge, or deploy.
