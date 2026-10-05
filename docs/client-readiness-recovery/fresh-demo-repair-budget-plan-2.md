# Budget-feasible span repair implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement inline. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the opt-in frozen-QA repair request express feasible numeric budgets, then test the same sites once without relaxing acceptance.

**Architecture:** Trusted code computes a conservative edit ceiling from the admitted catalog, then adds request-schema bounds and explicit cost instructions. Provider/schema support is verified and the existing compiler/literal validators remain authoritative. Keep ordinary automatic and scoped-human interfaces unchanged; privately persist exact call counts on success and failure.

**Tech Stack:** Existing Node ESM, Vitest, OpenRouter adapter, GitHub Actions, PostCSS catalog and rendered/production checks. No new dependency.

**Spec:** [Execution evidence and budget follow-up specification](fresh-demo-repair-contract-execution.md).

## Global constraints

- Original limits:1–12 edits;6,000 UTF16 code units per find/replacement;24,000 total find+replacement;80,000 full-file;400,000 textual prompt. No acceptance change.
- Same frozen fictional identities, authorized recipient, assets, references and source baselines; no new authoring/SEO/image campaign. Preserve hero bindings and fresh transport tokens.
- Trial only with existing `automaticSpanRepair` experiment opt-in. Ordinary auto repair and human feedback remain unchanged. Full source/dossier/constraint/measurement context stays present.
- Future paid experiment requires explicit approval of this plan:one cycle,one actual completion fetch/candidate,two/site,four total including failed fetches/retries. Immediate stop on rejection; no restart.
- Source/content/scope/contrast/Reference DNA/rendered/promotion gates remain mandatory. A valid bounded response may still fail to repair the site; report that outcome.

## Review focus

1. Empty/malformed/over6,000 catalogs must reject rather than fabricate budget capacity.
2. Unicode code points differ from JavaScript UTF16 length; schema compliance must not bypass actual compiler lengths.
3. Endpoint support can vary; unsupported schema/routing must refuse without silently dropping bounds or an extra fetch.
4. Narrower request capacity can leave findings unresolved; require actual rendered gates rather than accepting a merely valid patch.
5. Zero-call and successful runs need exact private call receipts, not only failure preservation.

## Task 1: Trusted request budget and schema

**Files:** Modify `scripts/creative-repair-contract.mjs`, `scripts/creative-repair-loop.mjs`; create `tests/creative-repair-request-budget.test.ts`; extend `tests/creative-repair-loop.test.ts`.

**Interface:** `buildSpanRequestBudget(catalog)` returns `{maxFindChars,maxReplacementChars:6000,maxEdits,maxPatchChars:24000,unit:"utf16-code-units"}`. F=max trusted find length; K=min(12,floor(24000/(F+6000))). Reject empty/malformed/oversized windows. Input is the existing trusted version1 catalog.

- [ ] Add RED tests for F1,999→K3/worst23,997;F3,491→K2/worst18,982;F2,000→K3/worst24,000;F6,000→K2/worst24,000; empty/nonstring/6,001 find rejects. Add compiler regression showing a schema-sized astral string still rejects when actual UTF16 length exceeds6,000.
- [ ] Run `npx vitest run tests/creative-repair-request-budget.test.ts tests/creative-repair-loop.test.ts tests/creative-repair-spans.test.ts`; observe RED.
- [ ] Implement the pure budget function. Only opt-in automatic span requests use schema `edits.minItems=1/maxItems=K` and `replace.minLength=1/maxLength=6000`, plus explicit UTF16/cost guidance. Preserve unchanged existing per-fragment/compiler/literal checks. Confirm native endpoint support for these keywords from current primary provider documentation before shipping; unsupported capability is a blocker, never a schema waiver. Set `provider.require_parameters=true` for the opt-in request and retain the one-fetch wrapper. Keep all source/dossier/measurement context.
- [ ] Extend real adapter tests: exact new schema/routing fields for opt-in; normal automatic/human schemas unchanged;402/schema rejection attempts do not obtain a second fetch. Run the same suites GREEN and commit.

## Task 2: Offline archive replay, private receipts and shipping

**Files:** Modify `scripts/run-rendered-creative-repair.mjs`, `.github/workflows/generate-client.yml`; extend `tests/rendered-creative-repair.test.ts`, `tests/internal-qa-intake.test.ts`, `tests/generation-workflow-preview.test.ts`; append daily ledger.

- [ ] Add RED tests for experiment zero-call receipt initialization, updated actual fetch counts on failure/success, and committing only private QA count evidence on the successful client path.
- [ ] Initialize private `qa-provider-calls.json` at0 before rendering. Keep existing per-fetch updates. Successful experiment commits this file alongside private candidate evidence; failure preservation stays private. No payload/public artifact upload.
- [ ] Run `npx vitest run tests/creative-repair-request-budget.test.ts tests/creative-repair-loop.test.ts tests/creative-repair-spans.test.ts tests/rendered-creative-repair.test.ts tests/internal-qa-intake.test.ts tests/generation-workflow-preview.test.ts`; expect GREEN.
- [ ] Replay all4 actual admitted catalogs offline through the request adapter, real compiler/literal/source guards and complete enrichment/reuse validation. Retain both rejected raw responses privately; demonstrate they violate new request shape, without applying/truncating them. Test a feasible mocked response with original guards and unchanged unrelated bytes. Zero provider calls.
- [ ] Run full CI/three rendered matrices, Astro/Worker/build, relevant TestSprite and independent review. Commit/review/merge/deploy only after passing; read back exact Pages/Worker source/version. Scope this receipt to shipped implementation.

## Task 3: One newly approved recovery and actual delivery

**Files:** Private client/evidence artifacts and append-only progress; use existing delivery workflow.

- [ ] Re-read Nifty, current private heads, frozen source/image/reference hashes, hero bindings and recipient identity. No retarget or new initial authoring.
- [ ] Dispatch exactly one new opt-in preview-only frozen-QA run per site, with existing one-cycle/per-candidate1/per-run2 ceilings. No retries after contract rejection. Read exact private count receipts, source and terminal gates.
- [ ] For passing sites only, verify deployed source and inspect actual desktop/mobile identity, imagery, readability, overflow, em dashes, calls/forms and configured routes.
- [ ] Use the owned browser driver:fake503 with retention first, then at most one labelled actual enquiry/site with exclusive duplicate-prevention receipt and reset proof. Run `verify-internal-qa-delivery.yml` read-only on exact correlations; distinguish receiving-provider delivery from inbox placement.
- [ ] Record concrete outcomes; close only verified Nifty scopes. If blocked, preserve evidence and name the failed assumption. No completion claim for unverified client delivery.

Self-review: spec constraints map to all3 stages; helper/interface names agree; all5 review inputs have tests or explicit rendered/provider verification. Math bounds are conditional on the unchanged real string checks, not a claim every provider enforces every keyword. Narrower capacity is an explicit tradeoff. No budget implementation, new dispatch or provider call has been authorized or performed under this plan.
