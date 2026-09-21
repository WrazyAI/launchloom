# OpenRouter inference caching

LaunchLoom treats inference caching as part of the production architecture, not
as a dashboard-only optimization.

## Goals

- keep related requests on the same upstream provider from the first request;
- maximize reusable prompt prefixes without moving business-specific facts into
  static instructions;
- avoid paying for identical deterministic judge/analyzer calls twice;
- preserve creative variation for authoring, copy generation, and repair;
- record cache read/write tokens so cache efficiency can be measured per run.

## Request policy

All script-level OpenRouter Chat Completions requests must go through
`scripts/openrouter-client.mjs`. Direct endpoint calls from other
`scripts/*.mjs` files are regression-tested.

The shared client supports three independent mechanisms:

1. **Sticky sessions.** Stable, hashed `session_id` values keep related calls on
   the same provider. Session identifiers are derived from stable workflow
   identity and never contain raw business contact information.
2. **Prompt-prefix caching.** OpenAI GPT-5.6+ requests can mark a large invariant
   prefix with an explicit cache breakpoint and stable `prompt_cache_key`.
   Dynamic route, business, feedback, current-source, and candidate screenshot
   data belongs after the reusable prefix.
3. **Exact response caching.** `X-OpenRouter-Cache` is enabled only for
   deterministic/idempotent analysis or control calls such as visual judges,
   Reference DNA analysis, and revision-operation planning. Creative authorship,
   copy generation, and source repair do not use exact response caching.

## Production creative author

The production Luna author keeps the compiler rules, typography policy, content
token vocabulary, release rules, and Reference Fidelity rules in one stable
system prefix. Route-specific Reference DNA, sealed content shape, contracts,
source files, and validation failures remain in the later user payload.

Every stage records OpenRouter usage plus normalized cache metrics. The resulting
`.launchloom/generated-experiences/creative-run.json` contains both per-stage
cache data and an aggregate `cacheSummary`. The CLI also prints:

- `production_experience_cache_hit_percent`
- `production_experience_cached_tokens`
- `production_experience_cost`
- `production_experience_cache_discount`

The shared OpenRouter transport requests `usage: { include: true }` by default
so these metrics are not dependent on provider-default response detail. When
OpenRouter supplies `usage.cost` or `usage.cache_discount`, both are retained
in per-request cache telemetry and the creative-run aggregate.

The first call can be a cache write. Judge cache health over repeated calls in
the same workflow and over multiple generations that share the stable compiler
prefix.

## Rendered repair and judging

Rendered reference evaluation orders its reusable context as:

1. Reference DNA
2. source-reference screenshot evidence
3. cache breakpoint
4. candidate desktop/compact/mobile screenshots

That allows rerender/repair cycles to reuse the immutable reference package
while still judging new candidate pixels.

Creative repair uses the same pattern: Reference DNA and source-reference
screenshots precede the breakpoint; findings, current source, and current
candidate screenshots follow it.

Reference DNA extraction itself is deterministic. Analyzer requests use a
reference-route-stable session and a 24-hour exact response-cache TTL, so a
reused static reference can skip provider inference entirely during the cache
window. File-system paths are not part of the session identity.

## Observability

All migrated lanes emit an `openrouter_cache` log entry with prompt tokens,
cached tokens, cache-write tokens, and hit percentage when usage information is
available. Lanes using exact response caching also emit
`openrouter_response_cache` with the OpenRouter `HIT`/`MISS` status, age,
and TTL. Exact response-cache hits report zero billable token usage, so this
header-level signal must be read separately from prompt-cache token metrics.

OpenRouter disables response caching when account-level Zero Data Retention is
enforced. Cached responses are otherwise API-key scoped and retained only for
their configured TTL.

Do not treat the aggregate OpenRouter dashboard hit rate as the only signal.
Break it down by lane: a visual request with new screenshots naturally has a
larger dynamic suffix than the production author's shared compiler prefix.
