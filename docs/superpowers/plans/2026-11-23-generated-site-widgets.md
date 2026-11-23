# Generated-Site Widget Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task by task. Steps use checkboxes for tracking.

**Goal:** Restore exact maps for verified public locations, show a labeled approximate waypoint from the public city or service area otherwise, and keep Quick Answers reachable when the desktop floating position is blocked.

**Architecture:** Use the existing location resolver and shared map component as the renderer-independent boundary for location data and map markup. Preserve the shared Quick Answers instance and switch its positioning, rather than adding a second widget.

**Tech Stack:** Astro, React, TypeScript, Vitest, Playwright.

**Spec:** The approved scope is quoted in the conversation and recorded in [the progress ledger](../../../.github/agents/progress-update/UPDATE-2026-11-23.md).

## Global Constraints

- Preserve the selected primary action, verified business facts, and address privacy; a service area is not a business location.
- Reuse existing widgets and renderers; no intake, admin, or AI chat expansion during the convergence freeze.
- Do not weaken release gates, review/test isolation, collision protection, or lead-form behavior.
- No em dashes in generated or rendered client copy. No real lead submissions during verification.

## Review Focus

- Public location with `Call now`: one map, original CTA unchanged.
- Private location with stale address, Place ID or Maps URL: use only a safe public area waypoint or omit the map.
- Approximate map: label the named waypoint, query only the area, and never offer directions to an unverified business or infer a storefront.
- A pre-existing creative candidate already rendering a full map: no second map or duplicate `#location`.
- Desktop collision, keyboard focus, and viewport resize: reachable assistant that never overlays the obstacle or moves out from under focus.

### Task 1: Share map eligibility and verify renderer parity

**Files:** `templates/client-site/src/lib/{location-map.mjs,location-map.d.mts,site.ts,experience-pack.ts,creative-runtime.tsx}`, `templates/client-site/src/components/{LocationMap,FoundationExperience,CreativeExperience}.astro`, `scripts/{production-experience-author,verify-rendered-revision}.mjs`, `tests/creative-location-map.test.ts`, and a rendered fixture test.

**Interface:** `resolveLocationMap` accepts visibility, public city and service areas alongside existing inputs and returns the address, map link, embed, kind, and waypoint. A private value discards precise inputs, not the separate public area. `shouldShowLocationMap()` derives visibility from the resolved public data; `primaryCtaHref()` still only routes to the map for the directions CTA.

- [ ] Add red tests: a verified public street address with a non-directions CTA is eligible without changing the CTA; a public city produces a labeled approximate map; private exact fields alone are not eligible. Cover Place ID, exact Maps destinations, and short links that do not prove a destination. Use a renderer fixture with an existing creative map call to catch duplicate sections.
- [ ] Run `npx vitest run tests/creative-location-map.test.ts tests/foundation-render.test.ts` and the focused renderer fixture; verify the old policy fails the public non-directions or missing-foundation case.
- [ ] Route both map markup and expectations through the resolver. Mount the existing Astro component in the foundation and creative shell where eligible. Suppress the candidate's full-map helper when the creative shell owns it, preserving its compact directions affordance and the existing offline judge boundary. Keep map placement and branding aligned with the renderer and validate that `Get directions` still targets a unique `#location`.
- [ ] Update the rendered verifier to assert a map section for eligible data, an iframe only for embeddable data, a usable directions link, and no map for ineligible data. Assert exact count in the focused fixtures. Keep unrelated gates unchanged.
- [ ] Rerun focused tests and commit the map repair after its rendered cases pass.

### Task 2: Keep Quick Answers reachable without overlap

**Files:** `templates/client-site/src/lib/quick-answers-layout.mjs`, `templates/client-site/src/styles/site.css`, `scripts/{quick-answers-verification,verify-rendered-revision}.mjs`, `tests/quick-answers-{layout,verification}.test.ts`, and `docs/site-generation-guidelines.md`.

**Interface:** `installQuickAnswersLayout(root)` retains its existing `refresh()` interface and applies a layout state to the same focusable launcher. A true collision switches to page flow rather than hiding or disabling it.

- [ ] Add a red Playwright case with a fixed desktop corner obstacle: the launcher must remain visible and keyboard reachable, the panel must open and close in flow, and no duplicate launcher or clipping is allowed. Keep tests for clear corners, mobile, and focus restoration; preserve review-link suppression.
- [ ] Run `npx vitest run tests/quick-answers-layout.test.ts tests/quick-answers-verification.test.ts`; verify the existing collision behavior fails.
- [ ] Use the existing corner calculation to choose inline or floating placement. Recheck collision without relying on computed `position` in fallback mode, and avoid promotion while open or focused. Prevent layout oscillation and viewport overflow. Update the verifier so a collision no longer excuses an unreachable assistant; assert that real clicks and answers work without hiding page content.
- [ ] Rerun focused tests, update the map and assistant guidance, and commit after the checks pass.

### Release and handoff

- [ ] Run Astro checks, production builds and `npm run verify:local-release -- --config <fixture> --build` for representative foundation, pack and creative configs plus the private-address case. If the creative local-release helper cannot stage the selected candidate, stage it in the isolated fixture and verify the equivalent build and gates directly.
- [ ] Inspect rendered desktop and mobile output: correct public map and directions, private map absent, collision fallback reachable, existing CTA and synthetic form work, no overflow, no em dashes.
- [ ] Obtain required review, rerun affected checks against current main, and verify any authorized deployment by exact commit. Record convergence rates, actual verification, Work OS completion and worktree cleanup. Do not regenerate or republish an existing client site without approval.
