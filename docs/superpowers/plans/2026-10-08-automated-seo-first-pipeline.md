# Automated SEO-First Creative Generation Pipeline Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Turn LaunchLoom's generation path into an automated, research-led process that produces a useful, fact-grounded multi-page site, applies screenshot-backed reference mechanics, passes SEO and rendered-quality gates, and invokes manual attention only after bounded automatic recovery fails.

**Architecture:** Keep verified facts, SEO evidence, route planning, authored creative, and release checks as separate contracts. Infer customer query intent from minimal confirmed intake, validate intent with measured research, build route-specific content briefs, and evaluate independent creative candidates in the real Astro shell. Automated retries and repair are bounded; unresolved facts or failed gates create a private noindex diagnostic path, never a legacy fallback or a production bypass.

**Tech Stack:** Node.js, TypeScript, Vitest, OpenRouter, DataForSEO, FAL, Astro, Playwright, GitHub Actions, Cloudflare Pages.

**Spec:** User-approved execution plan in the conversation (2026-10-08); normative constraints in docs/site-generation-guidelines.md, docs/creative-compiler.md, docs/local-business-design-direction.md, and repository AGENTS.md.

## Global Constraints

- Do not require clients to submit SEO keywords; infer them from verified business kind, services, service areas, website, and authorized business information. Exact client phrases may be optional hints only.
- Do not invent business facts, reviews, credentials, prices, local offices, rankings, keyword volumes, difficulty, or backlinks.
- Measured SEO readiness requires complete evidence for the intended indexable routes; qualitative fallback is never mislabeled as measured research.
- Create only useful service and location routes supported by confirmed facts and distinct local evidence; no thin city-swap pages.
- New intakes remain on creative-candidate; failures never fall back to legacy output.
- Reference screenshots, family-specific acceptance checks, and mobile recomposition remain mandatory for creative authoring and repair.
- Keep current fact, contrast, accessibility, responsive, reference-fidelity, visual-quality, pairwise-diversity, and production-promotion gates unchanged or stronger.
- Diagnostic output remains private and noindex; never let test profiles or repair overrides publish to production.
- Internal hypothetical canaries must be explicitly marked fictional, visibly disclosed, noindex, and unable to submit leads or receive client approval; that marker must block every production publication path.
- No em dashes in generated or rendered client content.

## Review Focus

- Intake with only business kind, a few confirmed services, and one primary city must yield useful research without a keyword questionnaire.
- A niche with ambiguous names or generic services must not receive invented service phrases or an ungrounded business type.
- DataForSEO may return successful but sparse metrics; the pipeline must broaden research within budget or remain not-ready.
- Multiple service areas must not multiply indexable pages unless each area has unique, confirmed value and coverage evidence.
- A missing reference screenshot, FAL failure, visual repair timeout, synthetic intake, or test-profile flag must not bypass facts, safety, or release gates.

---

### Task 1: Reconcile current generation and focused-profile evidence

**Files:**
- Review: .github/workflows/generate-client.yml
- Review: scripts/run-pipeline-test.mjs
- Review: tests/ focused-profile and creative-promotion tests
- Update if required: .github/workflows/generate-client.yml, scripts/run-pipeline-test.mjs, their direct tests

**Interfaces:**
- Consumes: current origin/main at 15ec47d; draft PR #151 head and exact-head CI; failing main generation run #37613635991; prior focused-profile run #37671943300.
- Produces: a reconciled profile contract where full, seo-only, and creative-only remain private test flows with accurate skipped-stage reporting and no release bypass; synthetic canaries are visibly fictional and cannot send leads or be approved.

- [ ] Re-read PR #151 head, merge-base, changed files, review threads, and exact-head checks; compare its effective diff with current main.
- [ ] Reproduce and classify the local baseline timeouts before attributing them to code. Baseline npm test reported 1,481 passing and two timed-out tests: creative-diagnostic-verifier.test.ts and creative-promotion.test.ts.
- [ ] Verify a synthetic intake can reach a private diagnostic for research/creative evaluation while retaining a visible fictional notice, disabled lead form, immutable test provenance, and production rejection.
- [ ] Add or adjust a focused failing test for any reproducible profile-policy defect; assert test runs cannot set production approval, skip required safety, or claim an unrun generation.
- [ ] Make the smallest verified fix, preserving the existing preview-only, noindex, and no-production guarantees.
- [ ] Run focused tests and the full application, Worker, Astro/type, and production-build suites; record any host-only timeout separately from code failures.

### Task 2: Research inferred customer intent and enforce measured SEO readiness

**Files:**
- Modify: scripts/seo-research.mjs
- Modify if necessary: scripts/generate-site-config.mjs
- Modify if necessary: templates/client-site/src/lib/seo-readiness.mjs
- Test: tests/seo-research.test.ts
- Test: tests/seo-readiness.test.ts

**Interfaces:**
- Consumes: normalized SEO intake with confirmed services, business kind, primary city, confirmed coverage, language, and existing website.
- Produces: an auditable route-level query/intent map where each supported service route has a measured primary intent cluster or explicit not-ready evidence. Keep public model/CLI output and persisted dossier provenance backward-compatible.

- [x] Add tests proving minimal intake derives the correct bounded local/commercial/informational query families without an explicit keyword field.
- [x] Add tests for explicit service names, niche synonyms, language, missing city, ambiguous/general business kind, and empty services. Existing normalization and query behavior met the contract, so no duplicate keyword field or parallel planner was added.
- [x] Add tests where DataForSEO succeeds but returns sparse or mismatched metrics; readiness remains false unless required route coverage is complete.
- [x] Add tests that context-only citations remain clearly qualitative and cannot satisfy the measured production SEO gate, including historical or forged ready flags.
- [x] Enforce measured-only publication in dossier creation, config normalization, shared readiness, review messaging, and the production SEO gate. Preserve fallback citations for private review, null metrics, source provenance, provider cost caps, and privacy rules.
- [x] Verify page maps use measured service intent and reject unrelated provider rows; cited search observations remain separate from business facts.

### Task 3: Verify useful, distinct, fact-grounded content across planned routes

**Files:**
- Inspect and modify as evidence requires: templates/client-site/src/lib/page-briefs.mjs
- Inspect and modify as evidence requires: scripts/route-content-audit.mjs
- Inspect and modify as evidence requires: scripts/generate-site-config.mjs
- Test: tests/route-content-audit.test.ts
- Test: directly affected page-brief and config tests

**Interfaces:**
- Consumes: sealed business facts, Task 2 route/intent map, supported page briefs, built HTML and approved service/coverage records.
- Produces: route-level content evidence that a visitor can decide and act, plus explicit findings for missing, duplicated, thin, unsupported, or non-rendered content.

- [ ] Add tests for useful service scope/process/preparation/next-step coverage and exact business fact provenance.
- [ ] Add tests that distinguish route-specific information from headings or text produced only by city/service name substitution.
- [ ] Add tests proving unsupported testimonials, credentials, prices, guarantees, staff, and locations remain rejected.
- [ ] Add tests that a confirmed service route and a location route are not created or indexed without adequate supporting facts.
- [ ] Implement the smallest route-brief and rendered-audit changes; avoid arbitrary word-count thresholds as the sole richness measure.
- [ ] Verify audit evidence comes from built HTML, not model claims or metadata markers alone.

### Task 4: Close dossier-fidelity and rendered-repair gaps

**Files:**
- Review and modify only for reproduced defects: scripts/compile-inspiration-pack.mjs, scripts/analyze-reference-dna.mjs, scripts/production-experience-author.mjs, scripts/run-creative-bakeoff.mjs, scripts/run-rendered-creative-repair.mjs
- Test: direct tests for the failing seam, including tests/creative-promotion.test.ts where applicable

**Interfaces:**
- Consumes: canonical dossier screenshots and prompts, sealed content, Task 2 intent map, Task 3 route briefs, independent authored candidate files.
- Produces: rendered candidates whose reference mechanics, section rhythm, page content, responsive behavior, and visual difference are measured and repairable without reducing any hard gate.

- [ ] Reproduce the latest main-branch creative-render/repair failure and map each gate finding to source, DOM, screenshot, and repair evidence.
- [ ] Add a failing regression test for each confirmed source-to-render or finding-to-repair defect.
- [ ] Fix only the demonstrated authoring, renderer, judge, or repair seam; retain independent candidate composition and the existing repair-cycle cap.
- [ ] Verify desktop, compact desktop, mobile, inner pages, actual interactions, contrast, accessibility, and screenshot-level candidate distance.
- [ ] Keep all reference evidence private, rights/provenance intact, and candidate assets within existing limits.

### Task 5: Prove automated cloud acceptance and release behavior

**Files:**
- Workflow: .github/workflows/generate-client.yml
- Test-only orchestration: scripts/run-pipeline-test.mjs
- Verification artifacts: docs/verification/ and private workflow artifacts only

**Interfaces:**
- Consumes: passing Tasks 1-4, a controlled new-business intake with accurate fixture provenance, and configured provider budgets.
- Produces: a full cloud canary report containing SEO readiness, route/content evidence, selected candidate/family, dossier identity, visual and technical gates, repair history, preview URL, noindex state, and release decision.

- [ ] Run a bounded seo-only profile and verify measured coverage and its safe diagnostic output.
- [ ] Run a bounded creative-only profile and verify dossier fidelity, distinctiveness, and explicit SEO-not-run reporting.
- [ ] Run one full preview-only cloud canary for a new niche/style. For a synthetic business, require a visible fictional notice, disabled lead form, immutable test provenance, and production rejection. Require publishReady=true, route-content pass, promotionReady=true, all technical/rendered gates, and private noindex delivery.
- [ ] Run a contrasting second business only if the first proves the pipeline and its provider budget is acceptable; require visibly distinct business and reference mechanics.
- [ ] Verify failed gates automatically stop public handoff and route to the manual exception path only after bounded automated retries/repairs are exhausted.
- [ ] Reconcile to current main, rerun affected checks, request code review, and merge/deploy only when every acceptance criterion is evidenced.

## Acceptance Criteria

- No mandatory client keyword questionnaire; inferred intent is source-bound and validated through measured research.
- Every intended indexable service page has a unique, useful, fact-grounded content brief and sufficient research evidence.
- Thin/duplicate location pages and unverified claims are blocked.
- A synthetic canary remains visibly fictional, noindex, non-interactive for lead submission, and permanently ineligible for production publication.
- The selected creative candidate demonstrably uses its assigned dossier mechanics and passes hard reference, visual, accessibility, responsive, and diversity gates.
- A full cloud canary produces a private, reviewable preview only after all gates pass; no failed or test-only path can publish publicly.
- Manual attention is reserved for missing/conflicting facts, unavailable required evidence, or exhausted bounded recovery.
