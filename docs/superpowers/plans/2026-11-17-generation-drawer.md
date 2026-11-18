# Generation Drawer Implementation Plan

> **For agentic workers:** Use `executing-plans` inline. Track work in the daily progress ledger.

**Goal:** Make generation evidence usable without leaving the existing attempt drawer.

**Architecture:** Keep attempt selection, authentication and polling contracts. Add internal view selection, reuse the activity transport, and interpret only recorded SEO stage evidence. Keep captures and interactive destinations separate.

**Tech Stack:** React, existing admin CSS, Vitest, Playwright.

**Spec:** User request and screenshots: dedicated Agent Runs thread, SEO Research and better Site Preview in the same side panel. Use Beautiful UI Thinking/Task Rows, Insight Cards and Agent Screen as patterns, not scripted demo states.

## Global constraints and review focus

No new routes, telemetry, dependencies or preview permissions. Preserve unrelated attempt navigation, attribution, diagnostics, evidence limits, and the distinction between missing and zero. Check capability off, incomplete activity, malformed historic SEO, narrow viewports, and related-preview provenance.

1. [ ] **Drawer navigation and agent thread:** Write browser tests in `tests/admin-workspace-browser.test.ts` for lazy activity access and in-place thread evidence. Update `AttemptInspector.tsx` and `GenerationActivity.tsx` to show recorded activity chronologically, with inline disclosure and summary, preserving operations' existing presentation. Verify tests fail before changes, then pass and commit.
2. [ ] **SEO and structured evidence:** Test that `context-only` shows what the research can and cannot support, zero differs from missing, and raw evidence remains inspectable. Implement `AttemptSeoResearch.tsx`, surfacing stage data and planner evidence without implying ranking predictions or inferring publication readiness from spend. Verify red to green and commit.
3. [ ] **Preview:** Test the capture is an uncropped fit in its own view, can be opened at full size, and never attributes a related preview to the inspected attempt. Implement `AttemptSitePreview.tsx`, reusing the existing authenticated capture and safe links. Verify red to green and commit.
4. [ ] **Release checks:** Run dashboard browser suite, checks and build; inspect screenshots at desktop/mobile. Independently review the whole branch before integration.
