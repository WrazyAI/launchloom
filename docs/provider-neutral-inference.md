# Provider-neutral inference: preparation layer

## Status

This is the first migration slice, not a provider cutover. OpenRouter remains the
default in every existing pipeline/Worker/workflow. No Go model profile is enabled,
no secret or subscription is changed, and there is no environment switch that
can redirect existing calls. Go permission/capability and search/non-coding
workload questions from the assessment remain unresolved.

## Interfaces

`scripts/inference-client.mjs` is SDK-independent and uses Web APIs (fetch,
Response, Headers, URL, AbortSignal). TypeScript callers have declarations in
`scripts/inference-client.d.mts`.

- `buildInferenceRequest(profile, request)`: pure validation and serialization;
  no credentials or network. It returns the exact URL/body and non-secret headers.
- `normalizeInferenceResponse(profile, payload, options)`: common result state,
  visible text, annotations, token/cache/cost provenance and quota/error metadata.
- `requireCompletedInference(result)`: gate before parsing source/config; partial,
  refused, tool-dependent, unknown and errored responses cannot become source.
- `inferenceCompletion(...)`: explicit opt-in credential and transport API with
  cancellation, redirect refusal and one request only; no automatic retry,
  provider fallback, secret lookup, model inference or cache assumptions.
- `postInferenceJson(...)`: shared raw POST transport. The existing
  `openRouterChatCompletion` wrapper delegates here while preserving its old wire
  bytes, headers, session/cache/usage extensions, raw Response and fetch injection.
  It does not apply the new result semantics or capability restrictions to old
  callers; migrating a caller is an explicit subsequent step.

## Narrow neutral contract

The first slice supports non-streaming source/config/judge-style text and inline
image requests, not a general tool-using chat agent or arbitrary HTTP proxy.
Profiles are trusted application configuration, never client-controlled input.
Declare the provider, exact model, protocol, HTTPS endpoint, auth scheme and
capabilities. Capabilities are assertions backed by separate validation, not
values inferred from a model name/catalog or proof of Go support.

The request has ordered `messages`, `maxOutputTokens`, optional `temperature`,
`reasoning`, `outputFormat` and an opaque `sessionId`. Blocks are `text` or
`image` with a PNG/JPEG/WebP/GIF base64 data URL. Image bytes and prompt strings
are preserved; remote hotlinks and filesystem paths are rejected. Explicit
image detail is rejected when the protocol cannot express it, rather than dropped.

| Feature | Chat Completions | Responses | Messages |
| --- | --- | --- | --- |
| Instructions | Leading system messages | Leading system messages in input | Leading system blocks lifted to top-level system |
| Images | image_url | input_image | image with base64 source |
| Token ceiling | Explicit max_tokens or max_completion_tokens | max_output_tokens | max_tokens |
| Schema output | response_format/json_schema, strict | text.format/json_schema, strict | output_config.format/json_schema |
| JSON without schema | Declared json_object | Declared json_object | Rejected |
| Reasoning | Declared effort | Declared effort | Declared adaptive effort or explicit thinking budget |

These serializers follow generic protocol references:
[OpenAI Responses](https://platform.openai.com/docs/api-reference/responses/create)
and [Anthropic Messages](https://platform.claude.com/docs/en/api/messages/create).
They do not establish that a particular Go proxy/model accepts every native option
or schema keyword. Messages profiles must separately specify any required API
version; none is guessed. Go profiles/session headers/auth remain future explicit
configuration after service-specific acceptance.

Unsupported modalities, tool input/replay, streaming, cached-prefix hints,
provider extension fields, late system messages and unexpressible reasoning modes
fail before dispatch. Output allowances and reasoning are never silently reduced.
Responses are stateless (`store:false`). Full tool/reasoning continuation needs
its own typed request contract; hidden reasoning is not flattened into visible text.

## Result and safety semantics

Results keep `provider`, `model`, `protocol`, response ID, `status`, visible `text`,
annotations and normalized usage. Only `completed` exposes text. A normal
tool-call result is `requires-action`, not successful final source. Truncation is
`incomplete`; refusal is `refused`; malformed/empty/unknown envelopes fail closed.
Visible text blocks retain order; thinking/redacted-thinking/reasoning summaries
are not returned as source. Unknown output blocks are rejected, not guessed.

Callers must still apply their existing JSON/schema, content, source, scope,
rendered, contrast and promotion validators. Requesting a provider schema does
not replace those checks; `requireCompletedInference` is not a schema validator.

Usage absence remains `null`, never invented zero. Explicit provider cost is
`provider-reported`; missing cost is `unreported`. Messages' fresh input plus
cache reads/writes are normalized to total input, keeping cache values separately.
No subscription-equivalent token estimate is mislabeled actual cash expense.
Generation ledger migration is a later slice; historical OpenRouter rows stay as-is.

HTTP auth, quota, rate-limit, invalid request, timeout and upstream statuses map
to safe codes, with numeric or date `Retry-After` retained. Provider error envelopes
at HTTP200 also fail. Transport exception bodies, credentials, provider refusal
prose and raw payloads are not included in results/errors. No retry decision is
made here; orchestration owns bounded budgets and deferred/manual quota states.
An already-aborted signal prevents dispatch. The opt-in API rejects redirects so
credentials cannot follow a provider redirect. The legacy wrapper retains its
existing transport semantics during this preparation.
Provider/model/capability configuration is snapshotted at dispatch, so an
in-flight request cannot be relabeled if a shared role profile changes later.

## Local verification checkpoint

No live provider credentials or inference were used. Tests deny global fetch and
inject in-memory protocol fixtures; placeholder auth strings are fixture values,
not real provider keys. The final protocol/OpenRouter focused run passed **74/74**.
An earlier affected orchestration/SEO/revision/judge/cost/preflight run passed
**436/436 across 11 files**; the later profile-snapshot safeguard is covered by
the final focused run. Root Astro check/build passed with credentials for provider
calls and Sentry uploads removed from the build environment.

The broader intake-render runner fails before inference on confirmed coverage;
the identical failure was reproduced on an isolated, unchanged `d861a1c1`
baseline. The full Worker run exceeded its 300-second harness allowance and
reported a five-second generation-ledger timeout. The full renderer-pack matrix
also exceeded its harness allowance after nine logged viewport checks, with
browser closure during cancellation; do not count this as 45/45. Representative
cinematic-narrative and bold-utility desktop/mobile screenshots were inspected
at `/tmp/opencode/neutral-inference-rendered-packs/screenshots/`. Those are
existing deterministic renderer fixtures, not designs generated by a new provider.

The first full application run finished **1591 passed / 9 failed across114files**.
It ran while the dispatch snapshot regression/fix was being added, so it is not
an exact-source certification. A fresh process on committed `1455bf65` passed
all **74 protocol/OpenRouter tests**, including the reported provenance failure.
Six other failures were test timeouts; two were browser assertion failures.
The stable full Worker rerun passed **161/161 across17files** in87.12s, with
unchanged timeouts/assertions. The five implicated application suites then passed
**154/154** in272.76s on the stable tree: browser-route verification, interaction
evidence, reference dossiers, rendered repair and inspiration registry. The two
long promotion cases then passed **2/2** in845.99s; the other20cases in that
targeted invocation were skipped, not counted as passes. Their original300s/900s
per-test budgets were unchanged. Thus every failed case from the first full run
has a successful stable-source rerun, not a new single-run whole-suite certificate.
The renderer rerun passed **45/45 viewport/palette checks**, with
desktop/mobile cinematic-narrative and stage-index screenshots directly inspected
at `/tmp/opencode/neutral-inference-rendered-packs-rerun/screenshots/`. No source,
assertion or individual timeout changed between those runs. The preparation layer
is locally verified; this is not a completed production release or Go capability
test. The independent intake-render runner's baseline coverage mismatch remains
unresolved. No CI gate, failed run or missing live acceptance evidence is bypassed.

## Follow-up, not included in this slice

### Generation caller implementation follow-up

The next implementation slice is in `scripts/generation-inference.mjs` and
`scripts/author-inference-adapter.mjs`. `completeGeneration` takes exactly one
explicit transport: `openRouter` retains its raw response/envelope and existing
wire extensions; `inference` takes a trusted profile, canonical request and
explicit credential. Both return a normalized result. The neutral path never
fabricates an OpenRouter payload, cost or cache ledger. `parseGenerationOutput`
gates completion before the existing JSON parser. A `GenerationInferenceError`
retains normalized status/provenance/quota/Retry-After for future orchestration,
without source, annotations or raw private diagnostics.

The production author CLI uses that boundary in its **existing OpenRouter path**.
Prompts, schema, token budgets, frozen reasoning policy, caching and retries are
unchanged. It now records normalized inference provenance/usage alongside the
legacy usage row and rejects parseable partial/refused/tool-dependent output
before authorship. It does not expose a CLI/environment switch to a new provider.

`createInferenceAuthorAdapter` is an opt-in `generate` adapter for the real
`authorExperienceCandidates` engine. The host must explicitly supply a reviewed
profile, credential and `prepareRequest(stageRequest)` returning the approved
canonical prompts/images/schema. No generic design prompt is substituted here.
Each stage must request its **existing exact output budget**, schema mode and
supported capabilities. The adapter snapshots the profile, retains stage
deadlines/cancellation and performs one request without reasoning fallback.
Configure the engine's `model` to the same profile model when using this adapter;
this slice does not replace the frozen session/preflight model allowlists.
Existing source/factual/repair/reference validators still run in the engine.

Offline tests exercise all three protocols with the real author engine and its
source validators using deterministic safe sources. These are transport and
orchestration compatibility tests, not evidence that a real model follows a
prompt or that production prompts have been fully migrated. CLI prompt
preparation remains OpenRouter-specific. Rendered judge/repair/search paths,
provider-aware historical cost aggregation and workflow configuration are still
pending explicit migration. Go permission and live-capability gates still apply.

TestSprite verification is unavailable locally: `testsprite --version` returned
command-not-found. No TestSprite installation, external test project or paid run
was created. Local Vitest/Astro/build evidence must not be labeled TestSprite or
production/provider acceptance.

1. Resolve Go workload permission and service-specific wire/capability acceptance.
2. Add reviewed role profiles and explicitly migrate generation/analysis/judge/
   repair callers, reasoning preflight model IDs and frozen session provenance.
3. Migrate hosted search separately; no generic compatibility claim supplies
   OpenRouter's web-search tool/citation behavior.
4. Update provider-aware cost/usage aggregation, quota concurrency handling,
   endpoint-specific repair call guards and retry classifications.
5. Decide whether/how to replace non-coding Worker suggestions/visitor AI before
   changing deployment secrets. No public feature is silently disabled.
6. Only after approval, wire CI secrets and run bounded live acceptance. This
   layer's fixture tests are not evidence of real provider behavior or new designs.

Prior dossier refinements and assessment reports remain on their dedicated
branches; this work starts from current main and does not erase or silently merge
those independent artifacts.
