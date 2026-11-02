# PR169 merge-readiness review

> **Archival review, recovered 2026-11-01.** The body below is preserved from
> the hash-verified private snapshot of `launchloom-pr169-review`. Its findings,
> tests and unresolved-thread counts describe October 16, not a fresh review.
> Read-only November 1 metadata still showed PR169 OPEN/DRAFT at the reviewed
> head `6a304793fffa26411c5c67ef6fdc27dc36bcfac5`; it has not been merged by this
> recovery. Current main differs, including provider defaults and workflow shape.
> Reproduce recommendations against the current baseline before implementation;
> neither the historical checklist nor this archive authorizes a paid canary,
> merge or deployment. Referenced temporary evidence paths are historical and
> were not verified or copied as part of this recovery.

PR: https://github.com/WrazyAI/launchloom/pull/169

Reviewed head: `6a304793fffa26411c5c67ef6fdc27dc36bcfac5`.
Current main: `a66db719`. Recommendation: **request changes; do not merge yet**.
User requested review, not a merge, deployment, code fix or paid generation canary.

## Findings

### P1: New author job loses the production inference provider after integration

PR `.github/workflows/generate-client.yml:650-665` defines a fresh
`creative_authoring` job with only the OpenRouter credential. The locally
simulated clean merge with current main keeps PR173's
`CREATIVE_EXPERIENCE_PROVIDER` and `OPENCODE_GO_API_KEY` on `prepare`, not on
`creative_authoring`. Job environments do not propagate through `needs`.
`scripts/author-production-experiences.mjs:89-97` defaults to `openrouter`
without that environment variable. Consequently the new full-generation
path silently moves authoring off the deployed OpenCode Go choice while site
copy remains on Go. This changes cost/quota/provider behavior without an
approved migration. Wire the selected author provider and appropriate key to
the job that executes authoring and add a merged-workflow contract test.

### P1: No-op retries still reject a valid restored ancestor checkpoint

`scripts/restore-generation-stage.sh:33-44` restores an exact ancestor when
`review/initial` has advanced. However the workflow's failed-authoring output
at `.github/workflows/generate-client.yml:744-754` requires local HEAD to equal
the remote head. With no new candidate changes, no push/synchronization occurs,
so a retry fails exporting its SHA. The recovery job then lacks its required
checkpoint and cannot restore inputs or reliably deliver repair evidence.
The preview path similarly rejects metadata-only advancement at lines1097-1099,
even after its runtime-source comparison passes.

Reproduced offline using a bare local repository: input A remains an ancestor
of remote B; B changes only `.launchloom/recovery.json`; the exact extracted
failed-authoring output step exits1 with `Partial authoring checkpoint was not
published privately.` Runtime-source diff excluding `.launchloom` is empty.
This confirms the unresolved existing CodeRabbit thread, rather than relying
solely on its wording. Establish coherent published checkpoint semantics for
no-op paths without silently accepting unverified runtime changes. Test retry
execution, not just the presence of reset/ancestor strings.

Existing thread:
https://github.com/WrazyAI/launchloom/pull/169#discussion_r4274427186

## Verification and limitations

- PR exists and is still a draft; GitHub reports mergeable/CLEAN, not approval.
- PR CI38609769805 passed classify, validate and route-fixtures for reviewed head.
- All3 review threads inspected, pagination complete:2resolved/1unresolved.
- Six changed files inspected. The staged graph is real work, not placeholder
  jobs; private client checkpoints avoid public Actions artifacts.
- PR-head focused tests:3files/21tests PASS.
- Simulated clean merge onto current main: same3files/21tests PASS, plus
  8related suites/259tests PASS. Existing tests miss the reproduced bugs.
- Local simulation was aborted after retaining merged workflow evidence; no
  actual integration commit, remote merge, source fix, push or deployment.
- Matching lockfile hashes allowed dependency reuse without installing or
  changing shared dependencies.
- CodeRabbit0.9.0 completed a six-file committed-scope review with0findings.
  This does not supersede the manually reproduced findings or unresolved
  review thread. No capacity override or repeated review.
- No `generate-client.yml` runs were returned for this PR branch. Its own
  fictional full-graph canary and failure/recovery/exact-SHA acceptance checklist
  remains unchecked. Focused profiles call the separate test-generation
  workflow and cannot prove these new full-path stage boundaries.
- No live generation/model/image calls, full suite rerun, build, delivery or
  deployment were performed as part of this review.

Local evidence: `/tmp/opencode/launchloom-pr169.diff`,
`launchloom-pr169-threads.json`, `launchloom-pr169-ci.json`,
`launchloom-pr169-coderabbit.ndjson`, `launchloom-pr169-merged-workflow.yml`,
`launchloom-pr169-reproductions.json`, `review-launchloom-pr169.mjs`, and
`launchloom-pr169-merged-contract-tests.log`.

## Before merge

1. Correct the provider job boundary and no-op retry/checkpoint behavior.
2. Add regressions and refresh CI against current main.
3. Run an explicitly authorized fictional full-path canary that verifies success,
   failure/recovery, private checkpoint transfer and exact-commit review delivery.
4. Resolve the remaining review thread and move the PR out of draft only when
   the above evidence is satisfactory.
