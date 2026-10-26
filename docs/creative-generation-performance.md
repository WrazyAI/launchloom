# Creative generation performance

The creative stage is the longest part of a generation run: authoring three
candidates, rendering each one at three viewports plus authored pages, and
running model judges and bounded repairs until the promotion gates pass. This
document describes the optimization workstream (2026-10-16) and the switches
and tooling that keep it measurable and reversible.

## What changed

1. **Exact-input evidence reuse.** Each candidate's rendered evidence
   (screenshots plus the serializable bakeoff result) and its judge result are
   cached under a digest of every input that can change the rendered artifact:
   candidate sources, shared site inputs (pages, layout, assets, config, build
   inputs), render settings (viewport sets, settle timing), the judge model,
   and a cache version. Managed contrast-correction blocks are stripped before
   hashing because they are a deterministic function of the audited render. A
   round reuses evidence for candidates whose inputs did not change instead of
   rebuilding, re-capturing, and re-judging them. Incomplete captures and
   failed evaluations are never cached as passes; a reused render whose judge
   failed re-runs only the judge.
2. **Bounded judge concurrency.** Per-candidate judge calls are scheduled as
   soon as that candidate's evidence exists and overlap the next candidate's
   render, bounded by a 2-worker limiter. Models, reasoning effort, screenshot
   detail, viewport coverage, and candidate count are unchanged.
3. **Progress-aware repairs.** A stable signature of a candidate's blocking
   findings detects repairs that leave the blocker set unchanged. After two
   consecutive no-progress repairs the candidate is marked stagnated: its
   remaining repair budget is not spent, other candidates can still be
   repaired, and the run fails with an explicit `Stagnation guard` error
   instead of repeating equivalent work.
4. **Pinned template adherence.** The retained Apache-2.0 frontend-design
   review copy (`docs/design-guidance/anthropic/frontend-design/`) is read at
   runtime and injected, together with a binding template-adherence contract,
   into both the authoring system prompt and the repair prompt. The contract
   preserves structure, section order, and design mechanics while allowing
   copy, brand roles, imagery, and responsive composition to adapt. A
   deterministic `section-order` finding reports reference sections that appear
   out of their assigned DOM order before any rendered judging.
5. **Timing instrumentation.** Bakeoffs record per-candidate phase timings
   (`source`, `promote`, `build`, `contrast`, `capture`, `authored-pages`,
   `judge`) in the round report; the repair orchestrator writes
   `creative-repair/timing.json` (bakeoff, gate, repair, round-start entries)
   with serialized atomic writes; judge, diversity, and repair calls record
   their own duration and attempt count. `scripts/report-creative-timings.mjs`
   reads a `.launchloom` evidence directory and can compare two runs.

No client-site runtime code changed: generated-site performance and rendering
behavior are unaffected by construction, and every run still passes the same
rendered technical gates.

## Switches

| Switch                                       | Default                                                                   | Effect                                                                                                                                                                                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CREATIVE_EVIDENCE_REUSE`                    | `true`                                                                    | `false` disables evidence reuse entirely (pre-optimization path) without changing anything else.                                                                                                                                            |
| `CREATIVE_JUDGE_CONCURRENCY`                 | `2`                                                                       | Judge worker bound, clamped to 1-3. `1` restores fully serial judges.                                                                                                                                                                       |
| `CREATIVE_REPAIR_STAGNATION`                 | `true`                                                                    | `false` restores the pre-optimization repair loop (no stagnation guard).                                                                                                                                                                    |
| `CREATIVE_REFERENCE_JUDGE_MODEL`             | `opencode-go/deepseek-v4.1-flash` (Go) / `deepseek/deepseek-v4.1-flash` (OpenRouter) | Judge model; part of the evidence cache key, so changing it re-judges.                                                                                                                                                                      |
| `CREATIVE_EXPERIENCE_PROVIDER`               | `openrouter`                                                              | `opencode-go` runs the whole creative lane (authoring, reference analysis, rendered judge, visual quality gate, repairs) on the OpenCode Go transport; OpenRouter-only models substitute to `CREATIVE_EXPERIENCE_GO_MODEL` with a log line. |
| `CREATIVE_EXPERIENCE_GO_MODEL`               | `opencode-go/deepseek-v4.1-flash`                                         | Reviewed Go model used when the configured component model is not served by the Go slice (for example the visual gate's legacy OpenRouter model).                                                                                           |
| `CREATIVE_EXPERIENCE_MODEL`                  | `deepseek/deepseek-v4.1-flash`                                            | Authoring/repair model; the workflows set it from this repository variable. It resolves to the Go wire model on OpenCode Go and to the same DeepSeek model on OpenRouter.                                                                     |
| `CREATIVE_EXPERIENCE_REASONING_EFFORT`       | `max` (Go) / `xhigh` (OpenRouter)                                         | Shared creative-lane reasoning effort; per-lane overrides: `CREATIVE_REFERENCE_JUDGE_EFFORT`, `CREATIVE_REFERENCE_ANALYZER_EFFORT`, `VISUAL_GATE_EFFORT`.                                                                                   |
| `CREATIVE_REFERENCE_ANALYZER_FALLBACK_MODEL` | `opencode-go/deepseek-v4.1-flash` (Go) / `deepseek/deepseek-v4.1-flash` (OpenRouter) | Analyst model tried once when Reference DNA keeps failing on OpenCode Go after the normal and desktop-only retries. The strict schema still validates the result.                                                                           |
| `CREATIVE_REFERENCE_JUDGE_FALLBACK_MODEL`    | `deepseek/deepseek-v4.1-flash`                                            | Visual judge retry model. It is a visual-only lane; the verdict thresholds and schema are unchanged. GLM-5.3 is not approved for production use.                                                                                            |
| `CREATIVE_REFERENCE_ANALYZER_MODEL`          | creative-lane default                                                     | Analyst model override; changing it changes the reference-analysis contract and should be intentional.                                                                                                                                      |
| `CREATIVE_NEAR_MISS_PREVIEW`                 | `true`                                                                    | `false` refuses open-findings preview delivery; runs fail as before when the strict conjunction is unmet.                                                                                                                                   |
| `CREATIVE_PIXEL_CONTRAST`                    | `true`                                                                    | `false` restores the DOM-only contrast contract; structural bail classes stay unresolved.                                                                                                                                                   |

When OpenCode Go returns a persistent provider fault for a reference, the
analyzer retries the same request uncached, then once with
`CREATIVE_REFERENCE_ANALYZER_FALLBACK_MODEL` on the full evidence, and finally
once more with low-detail mobile evidence if the media itself is the trigger.
The analyzer validates the required schema fields client-side before accepting
a fallback result; diagnostics log machine codes, keyword hints and missing
field names, never raw provider prose or prompt payloads. The fallback does
not relax the schema or any acceptance gate; if every attempt fails, the run
still fails closed.

Repair budget and stagnation policy live in
`scripts/run-rendered-creative-repair.mjs` (`maxCycles`, `MAX_GATE_REPAIRS`,
`MAX_STAGNANT_REPAIRS`) and are covered by tests.

## Measuring a run

```bash
# Report one focused-test evidence directory:
node scripts/report-creative-timings.mjs --launchloom <site>/.launchloom

# Compare a matched baseline and an optimized run:
node scripts/report-creative-timings.mjs --compare <baseline>/.launchloom <optimized>/.launchloom
```

Matched runs use the same intake, profile (`creative-only`), and provider; the
baseline is a pinned commit on `codex/launchloom-creative-loop-baseline` and
the optimized run dispatches from the optimization branch. Evidence lives in
the private `WrazyAI/llqa-<issue>-creative-<runId>-<attempt>` QA repositories
under `qa/creative-only/<runId>-<attempt>`.
