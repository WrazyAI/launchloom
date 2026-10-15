# Juniper Design Corrections Implementation Plan

> **For agentic workers:** Use executing-plans inline; no delegation. Steps use checkboxes.

**Goal:** Correct the approved B/C design defects without replacing the retained authored sites.

**Architecture:** Bounded edits to ignored copies of retained JSX/CSS, production-built in the existing Astro/React shell. Shared author guidance captures the causes; rendered gates remain unchanged.

**Tech Stack:** Existing Astro, React, CSS, Playwright, Vitest.

**Spec:** Approved B/C correction description in conversation; `.github/agents/progress-update/UPDATE-2026-10-15.md`.

## Global Constraints
- Preserve original failed QA and previous recovered source; no fabricated business facts or em dashes.
- Keep original client assets and selected fonts, overlay versus split-media topologies, disabled leads and noindex.
- Do not lower gates, regenerate full sites or claim local manual fixes prove deployed automation.

## Review Focus
- B guide must change useful preparation content, not just selection styling or labels.
- Switching and restoring the guide must preserve original content and ARIA state.
- C mobile navigation must collapse without hiding keyboard-accessible links permanently.
- C hero copy and focus indicators need a provable opaque surface with visible adjacent artwork.
- Structural edits must not retarget old positional contrast-repair selectors silently.

### Task 1: B guide and post-hero transition
**Files:** ignored `artifacts/juniper-replay/.launchloom/design-corrected/candidate-b/{Experience.jsx,styles.css}`; local browser assertions `/tmp/opencode/verify-juniper-design-corrections.mjs`.
- [ ] Preserve recovered candidates as baseline and copy into design-corrected.
- [ ] Assert baseline guide panel contains distinct body guidance and a controlled panel; post-hero section has multiple fact-grounded editorial cells. Observe failure.
- [ ] Add indexed preparation guidance, stable control/panel binding, and a restrained service/scope/location transition; preserve sealed facts.
- [ ] Rebuild, verify content changes/restoration, desktop/mobile geometry, contrast and inquiry safety.

### Task 2: C hero and mobile navigation
**Files:** ignored `design-corrected/candidate-c/{Experience.jsx,styles.css}` and same browser assertions.
- [ ] Assert baseline has a closed compact mobile menu and hero text plate occupies less than 55% of desktop media width; observe failure.
- [ ] Add native disclosure mobile menu and restrained light desktop navigation; replace oversized card with a narrow editorial overlay and expose supplied artwork. Keep a fully opaque text/focus plate.
- [ ] Inspect/remove only stale positional repair rules affected by new geometry, preserving previous snapshots and rebuilding/auditing all routes.
- [ ] Verify mobile menu open/close/keyboard, no overflow, asset loads, hero composition, disabled form and contrast.

### Task 3: Durable guidance and verification
**Files:** `scripts/production-experience-author.mjs`, associated prompt tests, `docs/site-generation-guidelines.md`, progress ledger.
- [ ] Add failing prompt-contract assertions for useful selector content and reference overlay/mobile navigation guidance.
- [ ] Strengthen existing guidance without changing palette/visual thresholds or requiring fabricated proof.
- [ ] Run affected suites, Astro/build; freeze final code for full-suite run. Assess corrected B/C once only if local checks pass; record actual failures and cost.
- [ ] Keep unfinished work open; external review, integration and deployed acceptance are separate release dependencies.
