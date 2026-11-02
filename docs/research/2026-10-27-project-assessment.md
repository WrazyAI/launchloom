# LaunchLoom project assessment

> **Historical assessment, recovered 2026-11-01.** The body below is preserved
> from `a6a4be2d29ace50124e583e0bbbc88cfd4881476` and describes October 27
> baseline `038c85a8`, not current production readiness. Architecture, storage
> configuration, model policy, line numbers and latest-run statements are dated
> observations. Main subsequently gained Postgres operations work and later
> generation results. This recovery did not rerun the historical tests, inspect
> current production privacy flags, or certify present end-to-end acceptance.
> The final record-retention paragraph is also historical: documentation recovery
> is now approved, but shipping and source-worktree cleanup remain controller-owned.

Assessment date: 2026-10-27 UTC. Source baseline: `origin/main` `038c85a88ac3406f536f4f3ca02fbd6420c636fe`. Nifty: `77_Xlr_iQs`.

## Judgment

LaunchLoom has a credible product thesis and substantial implementation. Its most valuable capability is the managed production lifecycle: confirmed business facts, research, authored websites, review, bounded revision, exact-version approval, publication and recovery. I would position it first as an internal production system for an agency or operator serving local businesses.

The implementation is more mature in release safety and coordination than in repeatable creative delivery. It has reached the point where improving the percentage of intakes that produce an acceptable, approved site matters more than adding breadth. Current evidence supports a capable but operationally demanding product in development; it does not establish readiness for unattended, broad self-service use or profitable unit economics.

## Product and architecture

The platform uses Astro and React for onboarding/review and an operations workspace. A Cloudflare Worker handles API requests. SQLite-backed Durable Objects own invitations, attempts and generation reporting, revisions and publication. R2 stores assets. GitHub Actions runs research, model authoring, browser evaluation, repair and deployment. Generated client source lives in private repositories; built sites are directly uploaded to Cloudflare Pages. A Neon Auth integration supports administrator sessions and membership while operational workflow state remains in Durable Objects.

This is a coherent starting architecture. Static generated sites are independently deployable; their serving path does not require a model call. Per-client coordination suits the ordering requirements. Private repositories give operators an inspectable source history and reviewable changes. The tradeoff is distributed workflow complexity across Durable Objects, Actions, GitHub, Pages and email. Actions offers useful evidence and durable logs but also introduces scheduling, environment and cross-service recovery concerns into product delivery.

Evidence: `wrangler.jsonc`, `src/admin/AdminApp.tsx`, `worker/src/admin/neon-auth.ts`, `worker/src/onboarding-invites.ts`, `worker/src/revision-coordinator.ts`, `worker/src/publication.ts`, `.github/workflows/generate-client.yml`, `.github/workflows/publish-site.yml`.

## Strengths worth preserving

- Business facts and provenance are explicit. Missing facts can be deferred or block release; private addresses are projected out of public output; qualitative search is distinguished from measured SEO. These are useful product constraints, although they do not fix the separate public intake storage issue below.
- Release authority is deliberate. Publication binds to the reviewed PR and SHA, uses durable ownership and outboxes, and separates verified deployment from email delivery. Scoped feedback and bounded patches protect approved work.
- Verification reaches rendered output. The pipeline includes browser route checks, mobile/desktop evidence, contrast, interaction and visual review. It does more than compile generated code.
- Operators have meaningful lifecycle tooling: invitations, clients, attempts, stage status, failure context, costs and screenshots. This supports a managed-service operating model.
- CI is substantial and currently green. The final PR validation associated with the baseline ran application/Worker tests, Astro/TypeScript checks, a production build and rendered route fixtures successfully. A fresh focused local run passed 64 tests across six files.

## Material concerns

### 1. Public intake storage is an immediate client-readiness issue

GitHub API readback on the assessment date reports `WrazyAI/launchloom` as public. `worker/src/index.ts:1325` posts the normalized intake as JSON into that repository's issue body. Restricting access to the onboarding form or keeping generated client repositories private does not make those issue bodies private. Contact information, operational details, private-location fields and asset references need a field-by-field storage review.

Before onboarding real customers, move intake payloads into private storage, pass opaque references through orchestration, and audit historical issue/artifact visibility. This assessment did not enumerate customer issue bodies or establish which historical submissions contain sensitive information.

Evidence: `gh api repos/WrazyAI/launchloom`; `worker/src/index.ts:1280-1329`; existing disclosure in `README.md`.

### 2. End-to-end generation remains the principal product bottleneck

The latest 21 recorded generation-workflow runs, dated October 21-26, all have workflow conclusion `failure`. This is a mixed diagnostic sample: nine titles use issue zero, profiles differ, and some failed runs produced usable previews or had later isolated judge reruns. It is not a customer conversion rate and does not prove every generated candidate was unusable.

The actionable evidence is the variety of failure modes:

- Full landscaping run `39968388739` stopped because only one eligible niche-matched dossier existed when three were required. Main subsequently expanded references; this historical blocker should not be described as an unchanged current shortage without a fresh run.
- Full plumbing run `39971185509` rejected all three candidates for inline styles, an unsealed image source and an unsafe service URL expression. Main subsequently clarified authoring safety instructions; a successful fresh run is still needed to establish the fix's effect.
- The October 26 visual audit found that selected candidates could have no approved imagery even when a sibling had a hero. Image review and candidate ranking fixes are present on main. Their end-to-end rendered benefit remains unverified by the latest gated rerun.
- Run `40370761876` failed during authoring with OpenCode Go HTTP 429 `GoUsageLimitError`. No later generation run appeared in the inspected workflow history. The current quota state was not probed and no paid generation was initiated.

The repair system is sophisticated, but too many failures can occur before a customer gets a reviewable result. The next improvement should reduce expected failures at intake, reference selection and source construction, not simply increase repair rounds.

### 3. Source size and orchestration breadth increase change risk

Current file sizes include 4,318 lines in `production-experience-author.mjs`, 3,835 in the Worker entry point, 3,583 in `generate-site-config.mjs`, 2,610 in `OnboardingForm.tsx`, and 1,126 in `generate-client.yml`. There are 174 tracked files under `scripts/`. These counts do not prove bad design; together with provider and contract interactions they indicate a substantial maintenance surface.

Refactor around stable responsibilities when touching these areas: intake/storage, workflow operations, author contracts/source validation, candidate evaluation, and release authority. Avoid a wholesale rewrite while delivery reliability is still being measured.

### 4. Model and judge changes need outcome-based qualification

Current model policy uses DeepSeek V4.1 Flash across production lanes, with provider-aware transport. Source checks confirm the policy and the focused tests pass. That establishes configuration correctness, not authored-site quality or judge calibration.

The October 16 diagnosis is historical: its original impossible gate conjunction was subsequently recalibrated. Current scalar values include overall 47, dimension floor 30 and at most three majors for strict rendered-reference acceptance, with a separate preview disposition for near misses. A value of 47 here is a judge-specific decision threshold, not a human quality grade. When model/prompt defaults change, qualify them against a fixed human-labeled sample, holdout results and whole-workflow outcomes. The same model family authoring and judging is also a reason to retain deterministic and human checks.

Evidence: `scripts/creative-lane-inference.mjs`, `scripts/rendered-reference-fidelity.mjs`, `scripts/creative-compiler.mjs`, `docs/calibration/2026-10-17-final-creative-gates.json`, the later entries in `UPDATE-2026-10-16.md`.

### 5. Documentation is lagging implementation

The README still names GLM/GPT production defaults while source policy pins DeepSeek. It says there is no external SQL database while the current administrator account subsystem includes Neon Auth and SQL-backed membership. Its Access-only dashboard description also predates newer account/preview paths. `docs/generation-tracking.md` describes the earlier two-tab dashboard. `docs/ghl-integration.md` still mentions Netlify forms.

The detailed ledger is valuable, but new contributors must reconstruct current behavior from multiple dates and source files. Maintain one current architecture/operating guide and treat progress entries as history.

## Recommended priorities

1. Close the public intake storage boundary before real-client expansion. Keep factual, source and release checks intact.
2. Pick one or two supported business niches and one frozen provider/model configuration. Verify the complete flow from ordinary intake through preview, revision, exact-commit approval, production and actual lead delivery using authorized fictional/internal data.
3. Report first-attempt preview yield, eventual approved-site yield, failure stage, elapsed time, repair rounds, total provider cost including failed candidates, and human intervention minutes. Existing stage/cost records provide a foundation, but observed business outcomes and complete unit economics are not established by this assessment.
4. Reduce generation freedom where it repeatedly causes invalid source. Test whether qualified source foundations or strongly typed composition primitives can preserve visual variety while reducing code-contract failures. This is a proposed experiment, not a conclusion that the open source-first branch should be merged.
5. Expand references, niches and premium visual craft only after the selected niches meet an explicit reliability and operating-cost target. Broader coverage increases the acceptance matrix and should follow evidence of repeatability.

Commercial interpretation: predictable delivery, fewer client revision cycles, maintainable output and safe publication are the strongest value proposition. Measured SEO inputs are a useful production feature; search-ranking or conversion improvement still requires longitudinal evidence from actual sites.

## Verification and limits

- Repository/source inspection at `038c85a8`; freshly fetched `origin/main` matched the shared checkout. Shared checkout's unrelated untracked `skills/` was preserved.
- GitHub connector could not run without a missing connection `link_id`; read-only authenticated `gh` commands provided the fallback.
- Repository metadata and recent workflow records read live through GitHub API/CLI. Latest platform deployment `40499990299` concluded success for `038c85a8`. This is workflow evidence; no fresh production smoke or generated-site browser session was performed.
- Latest relevant PR validation `40498232440` has successful `classify`, `validate` and `route-fixtures` jobs: 2,524 application tests passed (13 skipped), 354 Worker tests passed, checks and build passed. This is CI evidence, not a local full-suite rerun.
- Fresh local command: `./node_modules/.bin/vitest run tests/production-model-policy.test.ts tests/creative-compiler.test.ts tests/seo-release-gate.test.ts tests/generate-client-idempotency.test.ts tests/gate-health.test.ts tests/revision-scope.test.ts`: six files, 64 tests passed.
- Local Node 24.20.0 was selected explicitly. Shared dependency versions for Vitest, Zod, Astro and Astro check match the lockfile. The shared installation lacks Neon Auth; no local full auth/Worker/build verification is claimed. Dependencies were reused read-only via an ignored symlink and not installed or changed.
- Visual-quality conclusions draw on historical rendered audits and current source fixes; no new visual-quality score or current rendered acceptance claim is made.
- No product code, secrets, provider settings, repository visibility, client data or deployment was changed. No model generation was paid for or initiated.

GitHub evidence: [final PR validation](https://github.com/WrazyAI/launchloom/actions/runs/40498232440), [latest platform deploy](https://github.com/WrazyAI/launchloom/actions/runs/40499990299), [quota-blocked generation](https://github.com/WrazyAI/launchloom/actions/runs/40370761876), [landscaping generation](https://github.com/WrazyAI/launchloom/actions/runs/39968388739), [plumbing generation](https://github.com/WrazyAI/launchloom/actions/runs/39971185509).

## Record retention

Assessment records remain on `codex/launchloom-project-assessment-20261027` at `/home/maigreeks/projects/.worktrees/launchloom-project-assessment-20261027`. Cleanup blocker: these records are not integrated into `origin/main`; pushing main triggers deployment, outside this analysis-only scope. Preserve this branch/worktree pending authorized integration and deployment verification, or explicit owner abandonment with preservation. Nifty remains open for that bookkeeping dependency, not unfinished product analysis.
