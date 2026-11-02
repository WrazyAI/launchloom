# Admin identity and detail panels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the owner's three annotations without adding filler or changing generation behavior.

**Architecture:** Keep the current React app, server-validated principal, modal dialogs and safe URL helpers. Reuse a structured event-value renderer and a compact definition-list metric strip, with shared panel styling for attempts and clients.

**Tech Stack:** React, TypeScript, existing CSS tokens, Vitest and Playwright.

**Spec:** Owner annotations in this session; questions explicitly skipped with “just start”.

## Global Constraints
- Remove the workspace label, not merely hide it.
- Account identity comes from the authenticated workspace principal; no invented user identity or role.
- Keep existing forest #10251f, paper #fffefa, sage #bad8c8, lime #d9f06b and muted text tokens; retain Manrope. Use 12/14/16/20/24px type and 8/12/16/24/32px spacing.
- No new dependencies, admin routes, generation features, or authorization changes.
- No subtitles or explanatory copy unless needed to distinguish evidence, missing data, errors, or partial coverage.
- Keep execution and delivery separate; missing costs are not zero; related previews never become own-attempt delivery.
- Preserve escape/backdrop dismissal, focus trapping/return, pagination, safe links and escaped text.

## Design
Left-aligned operational detail, not a miniature landing page. Business name and concise profile identify the record; labeled outcome and metric rows come next. Failure evidence precedes secondary screenshots. Technical identifiers live in an expandable record section. The timeline has readable stage headers, timestamp and model/cost fields; JSON objects use nested definition lists and arrays use lists. Client panels start with total attempts and separately identified site availability, followed by contact, site links, history and collapsed record identifiers. Do not infer a success rate from a paginated history.

```text
Business / profile                         Close
Execution            Delivery
Duration             Actual cost       Estimate
Failure evidence (when applicable)
Stage timeline / client history
Site capture (expandable) / contact + site links
Record details (expandable)
```

The large screenshot-first layout was rejected: it hides the operational answer. The metric strip is for real run facts, not decorative dashboard numbers. Shared styling avoids the current nested scroll containers.

## Review Focus
- Principal missing, delayed or unavailable: skeleton/explicit unknown, never the previous account.
- Nested JSON arrays, null/false/zero, malformed JSON and HTML-like values remain legible escaped text.
- Partial histories: show server total, not a misleading loaded-page success rate.
- Long IDs, models and payload values fit a 390px panel without horizontal overflow.
- Unknown/stale attempts and unsafe/related previews retain existing honest boundaries.

### Task 1: Authenticated sidebar identity
**Files:** `src/admin/AdminApp.tsx`, `src/admin/WorkspaceShell.tsx`, `src/admin/ProfileView.tsx`, `tests/admin-workspace-browser.test.ts`.
**Interfaces:** Pass `WorkspacePrincipal | null` plus account loading/error state from the existing bootstrap; profile saves update that principal.
- [x] Add browser assertions for the real bootstrap identity, removed label, fallback email, loading/error states and profile navigation.
- [x] Run the focused browser test and observe the missing identity failure.
- [x] Implement identity display, initials, role and profile link; remove workspace card and redundant sidebar note.
- [x] Run workspace/account browser tests and commit.

### Task 2: Readable, consistent detail panels
**Files:** `src/admin/AttemptInspector.tsx`, `src/admin/ClientDossier.tsx`, new `src/admin/DetailValue.tsx`, new `src/admin/detail-panels.css`, `src/admin/entry.tsx` (or existing stylesheet import entry), `tests/admin-detail-value.test.tsx`, `tests/admin-workspace-browser.test.ts`.
**Interfaces:** `DetailValue({ value: string })` displays JSON objects/arrays structurally and falls back to escaped prose. Shared `.admin-detail-panel` uses a fixed header and one scrolling body.
- [x] Add red tests for JSON structure and hostile/malformed data, attempt metric visibility, long mobile values and client server-total coverage.
- [x] Implement semantic event details, labeled status/metrics, collapsible secondary evidence and shared panel geometry.
- [x] Verify desktop/mobile, keyboard controls, safe/related previews and existing pagination tests; commit.

### Task 3: Verify and ship
**Files:** daily progress ledger and completion receipt.
- [ ] Run full root tests, Worker tests/checks, Astro checks, admin/platform builds and rendered desktop/mobile inspection.
- [ ] Run one bounded final code review; address actionable issues and rerun affected checks.
- [ ] Reconcile latest main, open PR, pass required CI, merge and verify exact deployment SHA.
- [ ] Read-only live smoke test, finish ledgers and remove the clean integrated task worktree.
