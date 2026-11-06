# Generation logistics: preview-first pipeline

Status: draft for independent review, 2026-11-06.
Owner: LaunchLoom main agent.
Reviewer: GPT-6.1 Sol (medium, OpenAI).

## Intent

Design quality moves out of the generation loop. When a delivered design is not
good enough, a more capable local design agent repairs it and the site is
redeployed. The generation pipeline's job becomes logistics:

1. Deliver a reviewable site on almost every run.
2. Spend fewer rounds and fewer tokens doing it.
3. Make the run observable while it happens.
4. Hand a clean repair bundle to the design agent when quality is short.

The current pipeline optimizes for a strict visual pass and throws away usable
work when that pass is missed. The measured result is 6/100 successful runs over
the last 100, with creative at 1/21, while creative is the default renderer.
That is the failure this design addresses.

## Definitions

- **Delivered preview**: a private review URL exists for the attempt, the attempt
  is marked delivered, and the developer can inspect it. It may be clean or
  carry open findings.
- **Clean preview**: delivered with no open findings.
- **Warned preview**: delivered with open design, substance, or SEO findings.
  Hard integrity gates passed.
- **Published**: the client-facing public site on its production domain. This is
  not part of the 90% target. Publishing stays a deliberate step after review or
  design repair.
- **Hard integrity gate**: a check whose failure can mislead a visitor or break
  the site: build failure, missing verified facts, fabricated reviews, prices,
  guarantees, credentials or availability, unlicensed assets, broken forms or
  navigation, missing alt text on meaningful images, critical accessibility
  failures, broken images, and em dashes in rendered copy.

## Goals

1. **Delivery rate**: at least 90% of dispatched full-profile intakes deliver a
   preview, measured over a rolling 20 runs. Clean rate is tracked separately
   and is not the 90% target.
2. **Time to preview**: p50 at or under 20 minutes and p90 at or under 35
   minutes, measured after Phase 0 establishes the baseline.
3. **Rounds**: one authored candidate and one repair cycle by default. A second
   candidate or cycle requires an explicit quality mode.
4. **Honest warnings**: every warned preview lists its open findings in the
   admin, the developer email, and the repair bundle.
5. **Live visibility**: stage, active model call, and accumulated tokens update
   within 2 seconds. Model output deltas update within 1 second once streaming
   lands.
6. **Repair handoff**: one action produces a bundle with the client repo, the
   selected candidate, screenshots, findings, config, and the exact redeploy
   command.

## Non-goals

- Making designs excellent inside the generation loop.
- Building the local design repair agent or choosing its model.
- Public auto-publish without review.
- New renderers, new intake fields, or new client-facing artifacts.
- Relaxing fact integrity, licensing, or accessibility rules.
- Rewriting historical attempt records to improve the metric.

## Anti-goals

These would make the plan a failure even if the delivery number reaches 90%:

- Counting diagnostic or broken builds as delivered previews.
- Hiding a renderer switch or a warning from the developer.
- Letting a warned preview carry a critical accessibility or content-integrity
  defect.
- Reducing rounds by skipping the final build or the rendered check entirely.
- Reporting success from workflow conclusion alone.

## Current behavior (verified against `main` at `ac713c23`)

### Renderer selection

`renderer_policy` accepts `creative`, `foundation`, or `pack`. The default
requested renderer is `creative`. The pipeline does not choose a renderer based
on whether reference material exists.

### Reference eligibility

`scripts/inspiration-registry.mjs` requires six distinct production-eligible
business-matched dossiers before it will select references. The workflow then
requires exactly three selected dossiers and three routes:

```
jq -e '... .referenceLibrary.selectedDossierCount == 3 and (.routes | length == 3) ...'
```

The current library has 150 dossier directories. Only one is
production-eligible and matched to `wellness`; `beauty` has seven. A wellness
intake therefore fails before rendering with an eligibility error. This matches
the live attempt `d16920cc`, where the trace worked but no preview was produced.

### Authoring and repair rounds

- `Author independent experience candidates` authors three candidates
  (`timeout-minutes: 100`).
- `Render and repair creative candidates in the production shell` passes
  `--max-cycles 3`.
- The repair script defaults to `maxCycles = 2`; the workflow overrides it to 3.

### Creative deployment gates

The creative branch of `Build and direct-upload public preview` requires all of:

1. `site.config.json` has `selectionMode` equal to `creative-preview` or
   `creative-bakeoff`.
2. `.launchloom/creative-bakeoff.json` has `selectedCandidateId` equal to the
   chosen candidate and `fallback == false`.
3. The final visual gate has `status != "error"`, `audit.verdict == "pass"`,
   zero blockers, and zero critical or major findings.
4. `seo-release-gate.mjs --mode review` passes. The creative branch calls it
   directly, unlike foundation and pack, which use `run_seo_gate` and fall back
   to a noindex diagnostic preview.
5. `verify-rendered-revision.mjs` passes.
6. No em dash appears in rendered text assets.

A failure at any of these prevents the `review-initial` deploy and the run is
recorded as failed.

### The near-miss path already exists

`scripts/run-rendered-creative-repair.mjs` has a default-enabled near-miss path
(`CREATIVE_NEAR_MISS_PREVIEW`, default `true`). It:

- requires every hard deterministic gate to be clean;
- rejects critical findings and content/accessibility majors;
- allows an overall score at or above 47 and dimensions at or above 30;
- accepts a judge verdict of `pass` or `revise`;
- promotes with `selectionMode: "creative-near-miss"` and
  `nearMissSelection: true`;
- carries open design findings, capped at 80.

The deploy checks above reject this path on points 1, 2 and 3. So the pipeline
already knows how to produce a bounded warned preview, but the deploy step
refuses to ship it.

### Status and measurement

`Record preview ready` sets `STATUS=attention` when a creative recovery is
available or the deploy is diagnostic. Otherwise it sets `preview_ready`.
`scripts/generation-success-rate.mjs` counts only the GitHub run conclusion, so
it neither distinguishes clean from warned previews nor attributes the failure
stage.

### Activity trace

The trace is live and verified. It records stage, model start and finish, tool
calls, usage, and the full model output. It is non-streaming by design:

- `observeModelCall` emits `model_started`, then the completed `output` and
  `usage`.
- `src/lib/generation-activity-contract.mjs` has no delta event kind.
- `src/admin/useGenerationActivity.ts` polls every 2 seconds while active and
  every 15 seconds when idle.
- There is no server-sent events endpoint and no cancel, retry, or repair
  action.

## Decisions made in this design

**D1. The 90% target is delivered previews, not public publishing.** Public
publishing remains a separate, deliberate step after design repair. This matches
the stated flow: generate, review, repair if needed, redeploy for the client. If
the owner wants automatic public publishing, the policy can change later without
changing the pipeline mechanics.

**D2. Hard integrity gates stay hard.** The relaxation applies to design
fidelity, composition, visual score, and SEO substance. It does not apply to
facts, licensing, forms, navigation, accessibility-critical failures, broken
images, or build integrity.

**D3. Warned previews keep the existing `attention` delivery status initially.**
Adding a new status enum touches the admin contract, worker contract, filters,
badges, and tests. Phase 1 will add a structured warning summary and a
`preview_with_warnings` display label on top of `attention`; a first-class enum
can follow if the data proves it is needed.

**D4. Renderer fallback is visible.** If a creative intake cannot get enough
reference material, the run may use the pack renderer, but the delivery email
and admin record must say so. No silent downgrade.

**D5. Streaming is additive.** The completed `output` event remains the
authoritative record. Deltas are ephemeral UI evidence, bounded and throttled.

## Plan

### Phase 0: baseline and funnel report (0.5 day)

Add `scripts/generation-funnel.mjs` and an npm script. It reads GitHub run
conclusions, operation attempts, stage events, and activity usage, then reports:

- dispatched, delivered, clean, warned, failed, cancelled;
- failure stage and category;
- time from dispatch to preview;
- input and output tokens per run and per stage;
- candidate count and repair cycles where recorded.

Snapshot the last 100 runs before changing behavior. Record the baseline in the
progress ledger. `generation-success-rate.mjs` stays for compatibility, but the
funnel report becomes the number the team reviews.

Exit: baseline recorded, with a per-renderer breakdown and the top three failure
stages.

### Phase 1: preview-first delivery (2 to 3 days)

1. **Accept the near-miss preview in the deploy step.** Allow
   `selectionMode == "creative-near-miss"` and `nearMissSelection == true`.
   Replace the strict final-gate check with a severity-aware check: status not
   `error`, zero blockers, zero critical findings, zero content or accessibility
   majors. Open design findings are allowed.
2. **Add a last-resort preview.** If no candidate clears the near-miss bars,
   select the best candidate whose hard failures are empty. If none exists,
   deploy the deterministic pack or foundation renderer for that intake. The
   attempt is warned, never failed, as long as a build and a preview exist.
3. **Relax reference requirements.** Require at least one selected dossier and
   one route instead of exactly three. If zero business-matched eligible
   dossiers exist, fall back to the pack renderer before authoring starts.
4. **Make the creative SEO gate soft.** Reuse `run_seo_gate` from the foundation
   and pack branches so a failed SEO review deploys a noindex diagnostic preview
   instead of failing the run.
5. **Record warnings.** Extend the preview-ready event with a bounded warning
   summary (count, categories, first few findings). Keep `attention` as the
   status. Show the summary in the attempt inspector and the developer email.
6. **Produce a repair bundle.** Extend `prepare-creative-recovery.mjs` or add a
   small script that writes a manifest with the repo, branch, selected
   candidate, screenshots, findings, config path, and redeploy command. Link it
   from the warned-preview email and the admin.

Exit: five consecutive real intakes deliver a preview, at least one is creative,
each has a complete trace and a warning summary. No hard-integrity defect
reaches a preview.

### Phase 2: fewer rounds (2 days)

- Default to one authored candidate. Keep two behind a quality flag.
- Default to one repair cycle. Keep three behind a quality flag.
- Add an early exit: if hard gates are clean and the advisory score clears the
  floor, stop repairing.
- Add per-stage time budgets and surface overruns in the trace.
- Remove duplicate reference captures when the selected dossier set is smaller.

Exit: p50 time to preview down at least 40%, input and output tokens down at
least 25%, delivery rate unchanged or better.

### Phase 3: real-time (3 to 5 days)

1. **Live counters first (about one day).** In the Generations view and attempt
   inspector: current stage, elapsed time, active model call, accumulated input
   and output tokens, last heartbeat, and the latest candidate thumbnail. Reuse
   the existing polling and the open "live pipeline state" work.
2. **Literal token streaming.** Spike the provider's SSE support first. If it
   works, add an `output_delta` event kind with a bounded payload, throttle
   deltas to 250 to 500 milliseconds, keep the final `output` event, and add an
   SSE read route with cursor replay. The inspector renders deltas with a
   "streaming" label and falls back to polling.
3. **Management actions.** Cancel, retry, and "send to design repair", after the
   convergence freeze permits new admin actions or the owner grants an
   exception.

Exit: a real run shows stage changes and token growth within 2 seconds, and
streamed text within 1 second when the provider supports it.

### Phase 4: compact prompts (2 to 3 days)

Use the Phase 0 funnel and per-call usage to rank prompts by input tokens and
output tokens. Compress the top three:

- remove duplicated instructions across authoring, repair, and site copy;
- move stable rules and schemas into a cached prefix, extending the existing
  `AUTHOR_CACHE_BOUNDARY_TEXT` pattern;
- cap verbose structured outputs to the fields actually consumed;
- reduce repair feedback to actionable findings and drop repeated summaries.

Exit: input tokens per run down at least 35%, output tokens down at least 20%,
and the hard-gate failure rate no worse.

## Metrics

| Metric | Source | Baseline | Target |
| --- | --- | --- | --- |
| Delivered preview rate | funnel report | measure in Phase 0 | >= 90% over 20 |
| Clean preview rate | funnel report | measure in Phase 0 | track, no target |
| Time to preview p50 / p90 | funnel report | measure in Phase 0 | <= 20 / 35 min |
| Candidates per run | workflow and bakeoff | 3 | 1 default |
| Repair cycles per run | repair report | up to 3 | 1 default |
| Input tokens per run | trace usage | measure in Phase 0 | -35% |
| Output tokens per run | trace usage | measure in Phase 0 | -20% |
| Hard-integrity defects in previews | warnings and audit | 0 | 0 |
| Manual design repairs per 10 runs | operations ledger | measure | track |

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Warned previews hide real defects | Hard-integrity set stays blocking; warnings are structured and visible; clean and warned rates are separate |
| Near-miss promotion ships a content or accessibility defect | Reuse `classifyFailureLine`; block critical findings and content/accessibility majors; test with fixtures |
| Renderer fallback changes the client's design language silently | Flag the switch in the admin, email, and repair bundle |
| Fewer candidates lowers design quality | Accepted tradeoff; the local design agent owns quality after delivery |
| Streaming floods events or storage | Throttle deltas, cap bytes, drop deltas after the final output, keep the completion event authoritative |
| Provider does not support streaming | Spike first; ship live counters and keep completion output if not |
| Success metric is gamed by redefining failure | Report delivered, clean, warned, and failed separately; keep GitHub conclusion as a secondary signal |
| New actions conflict with the convergence freeze | Sequence actions after five green preview runs or ask for an explicit exception |
| Cancelled or timed-out runs leave a partial preview | Only count a preview when the deploy step completed and the URL loads with a rendered check |

## Builder boundaries

This design leaves the following to the builder:

- exact workflow edits and helper structure;
- whether the funnel report is a new script or an extension;
- the warning summary schema and its size limits;
- the streaming transport details, subject to the spike;
- test placement and fixture strategy;
- the order inside Phase 1 once the five-run proof is possible.

The following are not the builder's to change:

- fact integrity, licensing, accessibility-critical, and form/navigation rules;
- public publishing policy;
- the local design agent, its model, and its prompts;
- reference dossier content.

## Open questions

1. Is the existing near-miss bar (overall 47, dimension floor 30) the right
   floor for warned previews, or should the last-resort preview go lower?
2. Should a warned preview be visible to the client, or developer-only until the
   design repair agent approves it?
3. Does the provider support streamed Responses for the production models, and
   at what cost or rate-limit impact?
4. Should the renderer fallback happen at dispatch time, or inside the generation
   job after reference analysis?
5. Is `attention` sufficient for warned previews, or does the admin need a
   first-class `preview_with_warnings` status now?
