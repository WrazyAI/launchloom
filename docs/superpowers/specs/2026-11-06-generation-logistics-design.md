# Generation logistics: preview-first pipeline

Status: refined after independent GPT-6.1 Sol review, 2026-11-06.
Owner: LaunchLoom main agent.
Reviewer verdict: direction correct, start with changes.

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

- **Delivered preview**: a review URL exists for the attempt, the attempt is
  marked delivered, the URL returns a rendered page, and the developer can
  inspect it. It may be clean or carry open findings.
- **Clean preview**: delivered with no open findings.
- **Warned preview**: delivered with open design, substance, or SEO findings.
  Hard integrity gates passed.
- **Published**: the client-facing public site on its production domain. This is
  not part of the 90% target. Publishing stays a deliberate step after review or
  design repair.
- **Hard integrity gate**: a check whose failure can mislead a visitor or break
  the site. This includes build failure, missing verified facts, fabricated
  reviews, prices, guarantees, credentials or availability, unlicensed assets,
  broken forms or navigation, meaningful images without alt text, critical
  accessibility failures, broken images, private location leakage, missing
  rendered routes, unresolved internal links or anchors, and em dashes in
  rendered copy.
- **Advisory finding**: design fidelity, composition, visual score, metadata
  quality, sitemap substance, or SEO recommendation. It travels with a warned
  preview and never blocks delivery by itself.

## Goals

1. **Delivery rate**: at least 90% of eligible attempts deliver a preview over a
   rolling 20 attempts. Clean rate is tracked separately and is not the target.
2. **Time to preview**: p50 at or under 20 minutes and p90 at or under 35
   minutes, measured after the baseline in the first slice.
3. **Rounds**: one authored candidate and one reference-fidelity repair cycle by
   default, plus at most one visual-gate repair. A larger budget requires an
   explicit quality mode.
4. **Honest warnings**: every warned preview lists its open findings in the
   admin, the developer email, and the repair bundle.
5. **Live visibility**: stage and completed-call token totals update within 3
   seconds. Streamed text, when supported, updates within 1.5 seconds of the
   provider emitting it.
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
- Reducing rounds by skipping the final build or the rendered check.
- Reporting success from workflow conclusion alone.
- Downgrading an unknown or missing audit result to advisory.

## Measurement provenance

- The 6/100 baseline was measured on 2026-11-05 from the shared checkout with
  `npm run report:generation-success` at deployed commit `8547ebf2`. Output:
  unknown 2/75, creative 1/21, pack 3/4, overall 6/100.
- Attempt `d16920cc-3be4-4528-b80f-905f658147df` was the live trace proof on
  2026-11-05 at about 20:14Z: 22 events, 2 model responses, 4,982 input and
  15,544 output tokens, recording complete. Its generation failed at the
  reference-library gate and produced no preview.
- Reference counts were verified read-only on 2026-11-06 by calling
  `buildInspirationPack` against `data/inspiration-registry.json` at `ac713c23`:
  wellness 0 eligible and no pack, beauty 6 eligible and 3 routes, dental 6 and 3
  routes, plumbing 4 and 3 routes.

## Current behavior (verified against `main` at `ac713c23`)

### Renderer selection

`renderer_policy` accepts `creative`, `foundation`, or `pack`. The default
requested renderer is `creative`. The pipeline does not choose a renderer based
on whether reference material exists.

### Reference eligibility

`scripts/inspiration-registry.mjs` requires six distinct production-eligible
business-matched dossiers before it selects references. The workflow then
requires exactly three selected dossiers and three routes:

```
jq -e '... .referenceLibrary.selectedDossierCount == 3 and (.routes | length == 3) ...'
```

The library has 150 dossier directories, but wellness has zero eligible
business-matched dossiers. A wellness intake fails before rendering. Beauty has
six, which is exactly the selector minimum.

Authoring also asserts exactly three routes
(`production-experience-author.mjs`, `assertInspirationPack`). So reducing to one
candidate is not a workflow flag; it is a contract change across selection,
authoring, selection diversity, and tests.

### Authoring and repair rounds

- `Author independent experience candidates` authors three candidates and has a
  100-minute timeout.
- `Render and repair creative candidates in the production shell` passes
  `--max-cycles 3`.
- `resolvePipelineTestPolicy` returns `candidateCount: 3` and `repairCycles: 3`
  for the full profile.
- Each candidate gets up to three reference-fidelity cycles, up to two visual
  gate repairs (`MAX_GATE_REPAIRS = 2`), and separately bounded rejection
  retries. The real per-run budget is larger than "three cycles".

### Creative deployment gates

The creative branch of `Build and direct-upload public preview` requires all of:

1. `site.config.json` has `selectionMode` equal to `creative-preview` or
   `creative-bakeoff`.
2. `.launchloom/creative-bakeoff.json` has `selectedCandidateId` equal to the
   chosen candidate and `fallback == false`.
3. The final visual gate has `status != "error"`, `audit.verdict == "pass"`,
   zero blockers, and zero critical or major findings.
4. `seo-release-gate.mjs --mode review` passes.
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
- promotes with `selectionMode: "creative-near-miss"`;
- writes `nearMissSelection: true` into the final bakeoff report;
- carries open design findings, capped at 80.

The final bakeoff keeps its original `fallback` and `promotionReady` values, and
the final `visual-gate.json` is the original audit, not a rewritten pass. So the
deploy checks reject near-miss on the selection mode always, and on the bakeoff
and final gate depending on the original audit. The pipeline already knows how
to produce a bounded warned preview, but the deploy step refuses to ship it.

### SEO and rendered verification are not purely advisory

`seo-release-gate.mjs` also fails on private location fields, missing rendered
routes, unresolved internal links or anchors, orphaned routes, and em dashes.
`verify-rendered-revision.mjs` independently blocks metadata and sitemap
defects. Softening the whole SEO gate would soften integrity checks. Any
relaxation must be a finding-level classification, not a wrapper around the
whole script.

The pack branch also calls `seo-release-gate.mjs` unconditionally before its
`run_seo_gate` fallback, so the pack fallback is currently dead code. Foundation
does not have that duplicate call.

### Status, delivery, and measurement

- Legacy `Record preview ready` sets `STATUS=attention` when a creative recovery
  is available or the deploy is diagnostic, otherwise `preview_ready`.
- The operations path exits that step early and attests delivery through
  `Record authenticated operations handoff`. Its contract exposes
  `deliveryState` and `deliveryStatus` as only `none | preview_ready`
  (`worker/src/operations/contracts.ts`).
- `scripts/generation-success-rate.mjs` counts only the GitHub run conclusion
  and includes arbitrary workflow runs without profile or attempt identity.
- The preview URL is a bare `https://review-initial.<project>.pages.dev` alias.
  A tokenized review link is also created, but the bare preview URL is posted in
  the pull request and issue. The preview is unlisted and noindex at best; it is
  not proven to require authentication.

### Activity trace

The trace records stage, model start and finish, tool calls, usage, and the
completed visible output. Text is sanitized and bounded to 8 KiB per text
payload. The transport is non-streaming:

- `observeModelCall` emits `model_started`, then the completed `output` and
  `usage` after `invoke()` returns.
- The producer flushes about once per second.
- `src/admin/useGenerationActivity.ts` polls every 2 seconds while active and 15
  seconds when idle.
- There is no delta event kind, no server-sent events endpoint, and no cancel,
  retry, or repair action.

So the current system can show stage changes within roughly 3 seconds, but it
cannot show live token growth during an active non-streaming call. Token totals
appear after the call completes.

## Decisions made in this design

**D1. The 90% target is delivered previews, not public publishing.** Public
publishing remains a separate, deliberate step after design repair. If the owner
wants automatic public publishing later, the policy can change without changing
the pipeline mechanics.

**D2. Hard integrity gates stay hard.** The relaxation applies to design
fidelity, composition, visual score, metadata, and SEO substance. It does not
apply to facts, licensing, forms, navigation, accessibility-critical failures,
broken images, private location leakage, missing routes, broken links, or build
integrity. Unknown or missing audit evidence is hard.

**D3. Warned previews use an orthogonal warning record, not a new status enum
yet.** Legacy delivery keeps `attention`. Operations keeps `preview_ready` but
adds a bounded warning summary to the authenticated handoff and the admin
projection. A first-class status can follow if the data proves it is needed.

**D4. Renderer fallback is visible.** If a creative intake cannot get enough
reference material, the run may use the pack renderer, but the delivery email
and admin record must say so. No silent downgrade.

**D5. Streaming is additive.** The completed `output` event remains the
authoritative record. Deltas are ephemeral UI evidence, bounded and throttled.

## Refined plan

### First slice: safe near-miss delivery (2 days)

This is the smallest change that proves the direction without touching candidate
counts or the reference selector.

1. Add a shared gate policy module, for example `scripts/gate-policy.mjs`, that
   classifies each finding as `hard` or `advisory`. Reuse
   `creative-gate-severity.mjs` for creative findings. Unknown, missing, or
   unparseable evidence is `hard`. Unit tests must prove that a hard finding
   cannot be downgraded and that missing evidence never becomes advisory.
2. Extend the near-miss deploy checks:
   - accept `selectionMode == "creative-near-miss"`;
   - accept `nearMissSelection == true` and do not require `fallback == false`
     for that path;
   - validate the final gate against hard blockers only, not all critical and
     major findings;
   - keep `status != "error"`, zero hard blockers, and zero critical findings.
3. Write a bounded warning summary into the delivery receipt: count, categories,
   and the first few findings. Carry it through both the legacy preview event
   and the operations handoff. Show it in the attempt inspector and the
   developer email.
4. Add a post-deploy smoke check: fetch the preview URL, expect a 2xx, and
   assert a rendered site marker. Do not count a preview that does not load.
5. Add the baseline funnel report and snapshot the last 100 runs.

Exit: one real creative run delivers a warned preview, the trace is complete, the
warning summary is visible in both lifecycle paths, the preview loads, and no
hard-integrity finding reached it.

### Week 1 remainder: recovery path and honest SEO (2 to 3 days)

1. Fix the pack branch's duplicate hard `seo-release-gate.mjs` call so its
   diagnostic fallback is reachable.
2. Split SEO and rendered findings into hard and advisory using the shared
   policy. Keep private fields, missing routes, broken links, orphaned routes,
   em dashes, and missing rendered pages hard. Allow metadata and substance
   findings to produce a warned or noindex diagnostic preview.
3. Introduce one authoritative **effective renderer**:
   - detect a reference shortage before authoring;
   - catch authoring and render failures, not only "no candidate passed";
   - propagate the effective renderer to downstream steps, since `needs`
     outputs are fixed before the job starts;
   - fall back to pack, then foundation, and only fail when no build and no
     preview are possible;
   - flag the switch in the receipt, email, and admin.
4. Add fixtures covering reference shortage, authoring failure, render failure,
   and successful fallback for wellness, beauty, dental, and plumbing.

Exit: a wellness intake produces a preview through the fallback path, a creative
intake produces a warned preview, and both carry correct renderer and warning
labels.

### Week 2: fewer rounds and live counters (3 to 4 days)

1. Migrate the single-candidate contract:
   - `resolvePipelineTestPolicy` returns one candidate and one repair cycle for
     the default profile;
   - `assertInspirationPack` accepts one to three routes;
   - the selector can choose one independent anchor when the candidate count is
     one, without requiring a six-dossier pool;
   - diversity checks are disabled or reduced for a single candidate;
   - add a total model-call and wall-clock budget across selection, authoring,
     repair, and gate retries.
2. Ship live counters in the Generations view and attempt inspector: current
   stage, elapsed time, active call, completed-call input and output tokens,
   heartbeat, and latest candidate thumbnail. State clearly that token totals
   are per completed call, not live token growth.
3. Finish the repair bundle: client repo, selected build SHA, candidate source,
   screenshots, findings, config, effective renderer, and redeploy command.
   Keep private source out of public artifacts.
4. Measure a rolling 20 eligible attempts. Fix the dominant delivery failures
   before touching prompts.

Exit: 18 of 20 eligible attempts deliver a preview, p50 time to preview is down
at least 40%, tokens are down at least 25%, and the repair bundle is usable
without asking the pipeline for more context.

### Later: streaming, prompts, actions

1. Spike provider streaming. If supported, add a bounded `output_delta` event,
   throttle deltas, add an SSE read route with cursor replay, and render deltas
   with a streaming label. Keep polling as fallback.
2. Compress the top three prompts by measured input and output tokens. Extend
   the cached-prefix pattern, remove duplicated instructions, cap structured
   output to consumed fields, and shorten repair feedback.
3. Add cancel, retry, and "send to design repair" actions after the convergence
   freeze permits new admin actions or the owner grants an exception.

## Metrics contract

The 20-attempt denominator must be defined before the target is quoted:

- **Include**: full-profile intakes that actually start the `generate` job.
- **Exclude**: owner-cancelled runs, invalid or synthetic test intakes,
  access-only, seo-only, and creative-only profiles.
- **Retries**: report attempt-level and intake-level. A successful retry counts
  as a delivered intake, but the failed attempt remains visible.
- **Unknown telemetry**: count as `unknown`, never as success or clean.
- **Clean vs warned**: separate columns, never merged.
- **Hard-integrity defects**: must remain zero in delivered previews.

| Metric | Source | Baseline | Target |
| --- | --- | --- | --- |
| Delivered preview rate | funnel report | 6/100 run success, delivery unknown | >= 90% over 20 eligible attempts |
| Clean preview rate | funnel report | unknown | track, no target |
| Time to preview p50 / p90 | funnel report | measure in first slice | <= 20 / 35 min |
| Candidates per run | policy and bakeoff | 3 | 1 default |
| Repair cycles per run | repair report | 3 + 2 gate repairs per candidate | 1 + 1 default |
| Input tokens per run | trace usage | measure in first slice | -35% |
| Output tokens per run | trace usage | measure in first slice | -20% |
| Hard-integrity defects in previews | audit and receipt | 0 | 0 |
| Manual design repairs per 10 runs | operations ledger | measure | track |

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Warned previews hide real defects | Hard policy with unknown as hard; warnings visible; clean and warned rates separate |
| Near-miss promotion ships a content or accessibility defect | Reuse the severity classifier; block critical findings and hard majors; fixture tests |
| SEO softening breaks integrity | Classify individual findings; keep private fields, routes, links, anchors, and em dashes hard |
| Renderer fallback changes the design language silently | Effective renderer in the receipt, email, and admin; always visible |
| Fallback cannot start because reference compilation fails | Detect shortage before authoring; add a recovery path and fixtures |
| One candidate lowers quality | Accepted owner tradeoff; design repair moves after delivery |
| Streaming floods events or storage | Throttle deltas, cap bytes, keep final output authoritative |
| Provider does not stream | Ship counters and completion output; streaming is optional |
| Success metric is gamed | Define the denominator, report unknowns, keep GitHub conclusion secondary |
| New actions conflict with the convergence freeze | Defer actions until the freeze condition is redefined or an exception is granted |
| Preview URL is not actually private | Treat it as unlisted/noindex; add an access check if authenticated preview is required |
| Operations path cannot represent warnings | Add a warning summary to the operations receipt and projection in the first slice |

## Builder boundaries

Left to the builder:

- exact workflow edits and helper structure;
- whether the funnel report is new or extends the success script;
- warning summary schema and size limits;
- streaming transport details, subject to the spike;
- test placement and fixtures;
- order within the first slice once the proof is possible.

Not the builder's to change:

- fact integrity, licensing, accessibility-critical, form and navigation rules;
- public publishing policy;
- the local design agent, its model, and its prompts;
- reference dossier content.

## Decisions required from the owner

1. **Preview access**: is unlisted plus noindex enough, or must the preview
   require authentication? Recommendation: unlisted plus noindex for this phase,
   with an access check before any client-facing link is sent.
2. **Visual floor for delivery**: may an integrity-clean build with arbitrarily
   low visual scores count as delivered? Recommendation: yes for this phase.
   Design quality is the repair agent's job. Warnings carry the score.
3. **20-attempt denominator**: confirm the include and exclude rules above,
   especially cancellations and retries.
4. **Client review of warned previews**: developer-only first, or client-visible
   immediately? Recommendation: developer-only for the first 10 delivered
   previews, then client-visible with warnings.
5. **Convergence freeze**: the current rule counts only `preview_ready` and
   treats diagnostic previews as failures. This plan needs a green run to mean
   "delivered preview with no hard-integrity defect". Confirm the replacement.
6. **Latency objectives**: accept percentile objectives and completed-call token
   totals, with live token growth only when streaming lands.

## Appendix: review disposition

### Real concerns accepted

- Blanket SEO softening would relax integrity checks. Fixed by a shared
  finding-level policy.
- The near-miss gate still rejects design majors because blockers equal all
  critical and major findings. Fixed by hard-blocker validation.
- The fallback does not cover reference, authoring, or render failures, and
  downstream steps use fixed renderer outputs. Added an effective-renderer
  recovery path.
- Legacy and operations delivery are different state machines. Added warning
  persistence to both.
- One candidate requires coordinated contract changes across selection,
  authoring, bakeoff, repair, and tests. Scoped as a migration.
- The current transport cannot show live token growth. Adjusted latency claims
  and separated completed-call totals from streaming deltas.
- Five green runs do not prove 90%. Replaced with 18 of 20 and a defined
  denominator.
- The dossier counts were wrong: wellness is 0 eligible, not 1. Corrected and
  re-verified.
- Pack's SEO fallback is dead because of a duplicate hard gate. Added to Week 1.
- Preview privacy was overstated. Corrected to unlisted/noindex.
- The repair budget was understated. Corrected to include gate repairs and
  rejection retries.
- "Full model output" was inaccurate; it is sanitized and bounded to 8 KiB.

### Concerns rejected as non-blocking

- A new status enum is not required now; an orthogonal warning record works
  across both lifecycles.
- Lower visual scores are not unsafe if hard integrity gates stay blocking.
- Helper and fixture names are builder detail.
- Provider streaming uncertainty does not block preview-first delivery.
- The local repair agent does not need to be designed before the handoff bundle.
- Fewer candidates may reduce polish; that is the accepted owner tradeoff.
