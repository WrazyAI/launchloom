# Stage 1 of 4: Confirmed facts and research evidence

Status: approved by the user for implementation on 2026-10-02. Local implementation and verification are recorded in [the fact contract](../business-facts-contract.md) and the daily progress ledger. Merge, deployment, and paid provider canaries still require separate authorization.

## Purpose and sequence

Integrate the useful requirements from the Dominic & Dalton Builder Prompt Playbook into LaunchLoom's existing pipeline. Preserve Astro static HTML, sealed business truth, reference-led creative authorship, shared conversion runtime, bounded repairs, and current promotion criteria.

| Stage | Outcome | Dependency |
| --- | --- | --- |
| [1: Facts and research](seo-playbook-plan-1.md) | Explicit fact states and reliable research evidence | User approval |
| [2: Approved routes](seo-playbook-plan-2.md) | One route inventory and deliberate location-page admission | Stage 1 |
| [3: Page content](seo-playbook-plan-3.md) | Substantive service and location briefs inside the existing design system | Stage 2 |
| [4: Verification](seo-playbook-plan-4.md) | Route evidence, release checks, and reviewable handoff | Stage 3 |

Estimate: 3–5 engineering hours for this stage, including local verification. Estimates exclude user response time, provider outages, external review queues, and release work.

## Baseline and evidence boundary

Planning baseline: `origin/main` at `66d97fcd0ec8246bea58fcd290c05865f3f5c049`, refreshed on 2026-10-02. The earlier exploration inspected an older, dirty shared checkout. Current main already has a v2 keyword-to-page map, research completeness checks, cited fallback research, per-city coverage research, and authored service/location hosts. Extend these capabilities; do not rebuild their predecessors.

The earlier empty-provider and duplicate-city probes are historical observations, not reproduced failures on this baseline. Recheck them and retain existing fixes. Current product policy permits approval when primary-city research meets the existing measured or cited-fallback rules; additional confirmed cities can remain explicitly pending under shared budgets. Preserve that policy.

Source playbook: `/mnt/c/Users/jnopa/Downloads/Copy-of-Dominic-Baptist-AI-Studio-Website.md`, questionnaire and Prompts 1–4. Do not copy the full playbook into model prompts or public assets.

## Implementation steps after approval

1. Inspect the current canonical brief, intake validation, research readiness, and generated config. Record existing behavior and separate already-fixed observations from remaining gaps. Create an isolated worktree from fresh main and reuse equivalent active Nifty work before editing.
2. Extend the existing fact contract with source, confirmation state, public-display permission, and affected requirements. Distinguish confirmed, missing but deferrable, contradictory, and launch-blocking values. Client confirmation remains evidence of what the client supplied, not independent verification of credentials.
3. Add explicit address visibility. A verified private address may remain in protected operational data but must be absent from public HTML, public config, JSON-LD, maps, and model payloads that do not need it. Preserve public address behavior through a documented legacy migration.
4. Harden existing research evidence where regressions show a gap: empty successful responses, duplicate geographic terms, missing/unknown metrics, locale selection, fallback provenance, and budget reporting. Keep measured evidence distinct from qualitative citations; do not label a pending city complete or invent metrics.
5. Connect fact and research states to the existing developer review/readiness report. Ask only about genuine contradictions or launch blockers; safe omissions must not prevent a review preview.

## Likely implementation seams

Inspect `scripts/seo-research.mjs`, `scripts/generate-site-config.mjs`, `scripts/compile-canonical-site-brief.mjs`, `scripts/confirmed-coverage.mjs`, `templates/client-site/src/lib/seo-readiness.mjs`, `templates/client-site/src/lib/site.ts`, `SiteLayout.astro`, `Footer.astro`, `src/components/OnboardingForm.tsx`, and Worker intake/readiness adapters. Exact ownership is confirmed before edits; do not introduce a second readiness implementation.

## Verification and acceptance

- Focused regression coverage proves contradictions are retained, unknown facts are omitted, private addresses do not leak, and legacy public-address behavior has an explicit migration rule.
- Research tests exercise empty/malformed responses, already-localized queries, missing metrics, cited fallback, cost uncertainty, and additional-city pending status. Preserve the approved primary-city policy and provider caps.
- Run relevant `tests/seo-research.test.ts`, `tests/seo-readiness.test.ts`, `tests/coverage-contract.test.ts`, and affected Worker tests. Run `npm run check:worker` if Worker contracts change.
- If intake or review UI changes, run `npm run check`, `npm run build`, and desktop/mobile browser checks for confirmation, disclosure, persistence, and omission. Use synthetic data and mocked providers initially.
- Deliver a versioned fact/research contract, compatibility notes, and actual results. Stage 2 may consume it only after these checks pass.

## Boundaries and handoff

No blanket all-city research requirement, relaxed promotion criteria, newly invented services, automatic paid campaign, framework migration, or A2P changes. This stage does not create new content pages. Paid provider canaries, merge, deployment, and customer communications require explicit authorization within the later implementation scope.

Handoff: confirmed fact contract, research sufficiency report, migration decisions, regression results, and any exact unresolved client input.
