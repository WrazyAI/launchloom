# Bounded fresh-demo repair contract implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover the two preserved fictional sites through reliable bounded source edits, then prove one actual form delivery from each without weakening any gate.

**Architecture:** A trusted, deterministic catalog names unique bounded spans of the current source. The model selects span IDs and supplies replacements; trusted code compiles these into the existing literal replacement validator. Explicit runtime-role ownership and private rejection diagnostics address the measured failures; scoped human feedback keeps its existing interface.

**Tech stack:** Existing Node ESM, SHA-256, Vitest, Playwright, Astro, GitHub Actions and the current model/provider adapters. No new dependency.

**Spec:** [README.md](README.md). Read its measured evidence and requirements before implementation.

## Global constraints

- Same sealed client/config/assets/reference cohorts; no initial authoring, SEO refresh or historical-client retargeting.
- Existing limits remain 1–12 edits, 6,000 characters per find/replace, 24,000 total patch characters, 80,000 per complete file, and 400,000 textual prompt characters. Existing validators stay authoritative.
- Candidate-owned variables use `--ll-creative-*`. Runtime colour roles are read-only through `var(...)`; declarations and `@property` registrations continue to reject.
- Unchanged factual/source/scope/contrast/reference/promotion requirements; no static fallback or confidence waiver. Native and authored pages must satisfy their actual gates.
- One controlled experiment after review: one cycle and one actual repair-provider call per candidate, at most two calls per client run and four across the two runs, including internal retries. Stop on a rejected contract. No blind restart with a fresh budget.

## Review focus

1. Stale source, unknown IDs and repeated source spans must reject without writes.
2. Overlapping/duplicate edits and over-limit strings must not bypass the existing literal budget.
3. Runtime-role reads must pass; host-variable writes, registrations and motion mutations must still reject.
4. Rejected output must remain private and bounded; public diagnostics must contain no source or recipient.
5. Human feedback must retain existing section scope, and experiment retries must consume the same explicit call ceiling.

## Task 1: Explicit runtime ownership and exact rejection diagnostics

**Files:** Modify `scripts/creative-authoring-output.mjs`, `scripts/creative-repair-loop.mjs`, `scripts/run-rendered-creative-repair.mjs`; test `tests/creative-repair-loop.test.ts`, `tests/reference-fidelity.test.ts`, `tests/rendered-creative-repair.test.ts`.

**Interface:** Export `repairRejectionSummary(edit, index, occurrences)` from the repair module. Return only bounded codes, logical file name, index, find/replace types and lengths, and occurrence count. No literal text. Preserve the existing rejection code and fail-closed result.

- [x] Add RED tests for explicit read-only instructions and distinct diagnostics for nonstring, empty, over-6,000, missing and repeated find fragments. Retain the real validator tests proving all eight role reads pass and declarations/registrations fail.
- [x] Run `npx vitest run tests/creative-repair-loop.test.ts tests/reference-fidelity.test.ts tests/rendered-creative-repair.test.ts`; verify the new expectations fail before code changes.
- [x] State explicitly that runtime roles must never be declared, assigned or registered. Preserve rejected provider payloads only in the existing private repair artifact path, with a 256,000-character storage ceiling, digest and truncation flag; public output uses the summary interface only. No acceptance guard changes.
- [x] Run the same tests; expect all passing, including redaction, bounded retention and unchanged write isolation.
- [x] Commit this independently reviewable correction with its append-only progress evidence.

## Task 2: Trusted bounded span catalog

**Files:** Create `scripts/creative-repair-contract.mjs`, `scripts/creative-repair-spans.mjs`, `tests/creative-repair-spans.test.ts`; modify the existing repair module to import the unchanged file sets and limits from the contract module.

**Interfaces:** `buildRepairSpanCatalog(files, {allowedFiles})` returns `{version:1, spans:[{id,file,sourceDigest,find}]}`. `compileRepairSpanEdits(files, catalog, edits)` accepts `{spanId,replace}[]` and returns existing `{file,find,replace}[]`. Allowed logical files are `experience`, `styles`, `motion`, `servicePage`, `locationPage`, `servicesIndexPage`, narrowed by the caller.

- [x] Add RED tests for deterministic IDs, stale source, unknown IDs, duplicate/nonunique spans, overlapping edits, empty/nonstring replacements, 6,001-character input, 13 edits and 24,001 total characters. Assert failures leave original file bytes unchanged.
- [x] Run `npx vitest run tests/creative-repair-spans.test.ts`; expect failures before implementation.
- [x] Build nonoverlapping windows at most 6,000 characters: newline-bounded for formatted source, parser-bounded exact CSS ranges for valid minified styles. Omit unsupported oversized lines/nodes and nonunique windows rather than granting wider edits. Hash IDs from file, full source digest and window offset/text. Compile only catalog members matching the current full source digest; enforce the same limits before returning literal edits. Feed results into `applyCreativeRepairEdits`, never bypass it.
- [x] Run the new suite plus `tests/creative-repair-loop.test.ts`; expect pass with existing literal-edit semantics unchanged. Verify an actual frozen candidate offline with zero provider calls, preserving unrelated regions and all sealed bindings.
- [x] Commit catalog/compiler and the exact boundary evidence.

## Task 3: Automatic repair integration and offline source proof

**Files:** Modify `scripts/creative-repair-loop.mjs`, `scripts/run-rendered-creative-repair.mjs`, `.github/workflows/generate-client.yml`; test `tests/creative-repair-loop.test.ts`, `tests/rendered-creative-repair.test.ts`, `tests/internal-qa-intake.test.ts`.

**Consumes:** Task 2 catalog/compiler, existing `applyCreativeRepairEdits`, and existing `openRouterChatCompletion({...,fetchImpl})`. **Produces:** automatic repair requests using catalog `{spanId,replace}` edits and optional `qa_repair_experiment` boolean (default false). True requires the existing verified frozen internal-QA preview/reuse guards; it enforces one cycle, one actual provider call per candidate and two per run. Two selected runs therefore allow at most four calls. Human-scoped feedback retains its current literal interface and established scope validation.

- [x] Add RED seam tests showing an automatic mocked repair selects trusted IDs without generating find text; wrong file/snapshot/scope and internal retries beyond the configured ceiling reject. Assert complete current source, dossiers, constraints and measurement tuples remain in context.
- [x] Run the relevant three test files; confirm new expectations fail.
- [x] Integrate the catalog into automatic bounded repairs only; validate compiled patches, syntax, source isolation, sealed content and original scope before writes. Add that optional workflow flag with the stated per-candidate/per-run ceilings. Add optional `fetchImpl` to `requestRepair` and forward it into every `openRouterChatCompletion` invocation. The experiment supplies a wrapper that counts before each actual completion fetch, including internal retries/fallbacks, and rejects before network when either ceiling is exhausted. Halt the experimental run immediately on a contract rejection; do not enter another repair cycle. Preserve normal defaults and never increase the existing maximum.
- [x] Replay both pinned private authored sets offline. Run affected suites, Worker tests/checks, Astro/build, full CI recipe matrix and independent review. Inspect desktop/mobile rendered artifacts. Require all existing tests/gates; no actual provider calls in this task.
- [x] Commit, open a reviewable PR, and merge/deploy only after required checks and review pass. Read back deployed source/version and record the exact outcome.


## Task 4: One controlled recovery and delivery proof

**Files:** Append `.github/agents/progress-update/UPDATE-<current-UTC-date>.md`; private evidence only in the two client repositories and owned QA artifact directory. Use the shipped `verify-internal-qa-delivery.yml`, not another sending tool.

**Consumes:** reviewed deployed repair implementation, same frozen QA sets, approved experiment ceiling and existing authorized client-recipient secret. **Produces:** two gated preview source/deployment records, browser submission evidence and correlated receiving-provider results, or a precise terminal blocker.

- [x] Re-read Nifty parent/delivery state. Verify original sealed identities/recipients, current private source hashes and reference assignments before dispatch.
- [x] Run the same two authored sets with one cycle and one provider call per candidate, at most two calls per run and four across the experiment. Stop immediately on a contract rejection or exhausted ceiling; retain private diagnostics. No new intake/authoring/SEO campaign or gate change.
- [ ] For gate-passing previews, inspect final desktop/mobile identity, contextual imagery, readability, overflow, em dashes and configured routes. Verify deployed commit and signed recipient/project/origin. Use the actual form to prove simulated failure retention, then exactly one labelled real submission per site and successful reset.
- [ ] Run read-only correlated provider verification. Report receiving-provider delivery separately from inbox placement. Missing read access, incomplete listing, bounce or unknown status remains unverified; do not substitute workflow success.
- [ ] Append actual evidence and close only verified Nifty scopes. Keep historical-client/content/approval blockers open. Write a completion receipt only for achieved outcomes; commit the verified ledger and preserve unfinished branches.

## Review decision

Review Tasks 1–3 as the concrete repair-interface change, then authorize the single capped experiment in Task 4. Implementation estimate: 60–90 minutes plus approximately 20 minutes for full CI. Provider runtime is bounded by the existing workflow timeout and the stricter experiment ceiling, not promised as a short run.

User approved execution. Tasks1–3 shipped through PR#139 at `63f6f3e`; PR#140 corrected frozen hero enrichment and shipped at `bafedf9`. Both releases have final CI and deployed Pages/Worker readback. Task4's first two dispatches stopped before provider calls; the explicitly approved resumption (`37295716396`, `37295724468`) stopped after one repair call per site on numeric patch limits. No more retries. Actual client form submissions remain zero. Complete [execution evidence](fresh-demo-repair-contract-execution.md) and the unimplemented [budget follow-up plan](fresh-demo-repair-budget-plan-2.md) record the exact terminal blocker.
