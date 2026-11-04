# Live generation observability, v1

Status: owner approved on 2026-11-03 for implementation planning. This approval
does not authorize paid provider calls, production writes, main merge, or deployment.

## Intent and agreed boundaries

The owner wants to understand a generation while it happens, rather than see only
the final site. Show the current pipeline stage, the work being performed, tools
and actions, model output, token usage, retries, and failures with inspectable
evidence. The owner explicitly selected **observe-only for the first version**.

No stopping, pausing, steering, approval gates, new agent orchestration, model
changes, or automatic retries beyond the generation's existing retry policy.
No client-facing surface, renderer, intake field, or public activity endpoint.
No access to private model reasoning. Reasoning-token counts, when reported, are
usage metadata only, never a transcript of reasoning.

The owner accepted a visual mockup and supplied Beautiful UI as design guidance
at `/mnt/c/Users/jnopa/beautiful-ui-reference.md`. The owner approved the complete
v1 scope, including the technical recommendations below, before planning.

## Current evidence

Inspected `origin/main` at `ec3fae46` on 2026-11-03. These are source observations,
not claims that every optional code path is active in production:

- `.github/workflows/generate-client.yml` emits stage transitions around intake,
  research, reference analysis, authoring, rendering/repair, deployment, and handoff.
- `scripts/record-generation-stage.mjs` supports two identities: legacy tracking
  context and the newer operation-backed workflow. Their failure policies differ.
- `scripts/record-generation-event.mjs` and
  `worker/src/operations/contracts.ts` protect lifecycle and cost evidence. They
  are not currently a general-purpose tool/output trace contract.
- `scripts/generation-inference.mjs` is a shared completion boundary, reached by
  authorship, configuration generation and creative-lane adapters. It supports
  legacy OpenRouter and provider-neutral completions.
- `scripts/inference-client.mjs` explicitly uses non-streaming responses today.
  It is not a chat-agent runtime exposing a generic tool loop.
- `scripts/author-production-experiences.mjs`,
  `scripts/creative-lane-inference.mjs` and
  `scripts/run-rendered-creative-repair.mjs` contain meaningful substeps and
  independently executed script actions. A pipeline action is not automatically
  a model-requested tool invocation.
- `src/admin/GenerationsView.tsx` already polls visible active runs every 15s;
  `src/admin/AttemptInspector.tsx` renders stage events.
- Admin APIs have separate legacy-attempt and operation-record reads in
  `src/admin/api.ts`. Do not join or merge their attempt identities heuristically.

The convergence report remains 5/100: creative 0/6, pack 3/4, unknown 2/90.
Five consecutive `preview_ready` runs are not established. Keep implementation
limited to loop-shortening diagnostics inside the existing inspector; a separate
new admin destination would require resolving the convergence-freeze constraint.

## Product experience

Open an attempt from Sites or the ledger and expand its existing inspector into
an activity workspace. Keep the current navigation, attempt URL/selection, client
history, site preview and lifecycle summary. No new top-level navigation item.

Three coordinated areas on wide screens:

1. **Stage rail:** real configured stages and substeps, elapsed times, and known
   states. Group stages for readability but retain their precise source labels.
   Include skipped/not-applicable stages without calling them completed. Parallel
   work can have multiple active substeps; do not invent a linear percentage.
2. **Activity:** chronological entries grouped by actor/task and stage. Filters
   for all, tools/actions, model output, and issues. Show actual model request
   start/completion, concrete file/process/browser actions, and bounded retries.
3. **Inspector:** selected action's identity, stage, start/end times, sanitized
   input, result or error, truncation/withholding state, and relevant artifacts.

Usage is a run/response-level summary, not invented per-tool token attribution.
Show reported input/output/cache/reasoning token categories only where supported.
Display actual and estimated cost separately; unknown is not zero. Deduplicate
response usage before adding it and count separately billed retries separately.

The activity view follows new entries only while the reader is at the bottom.
Reading older output never forcibly scrolls them away. Offer a working “Jump to
latest” action. Preserve filters, selection, and expanded evidence on refresh.
On compact screens place the inspector below the feed; on mobile show a compact
stage strip and selected details inline or in the existing accessible panel.

Design principles: cool near-white surfaces, one blue selection/action accent,
semantic status colors, crisp hairlines, compact task rows and tool chips,
progressive disclosure, tabular changing numbers, and code font for artifacts.
Adapt within the existing dashboard, not a global theme replacement. No decorative
animations, fake thinking, filler subtitles, or fake “live” counters. Respect
reduced motion, keyboard focus and contrast. Use original adapted styling;
retain upstream MIT attribution if substantial source is later reused.

## Truth and coverage

- Label each actor as a model role, orchestrator, or external tool/process.
  A model role is not proof of a persistent autonomous agent or concurrency.
- Distinguish **model-requested tool calls** from **pipeline actions**. For
  example, a script saving a model-produced file is a pipeline action.
- Show dispatch start promptly and “Waiting for model response” while the
  current non-streaming transport is running. Emit the completed visible output
  as soon as available, not only at the end of generation.
- Token-by-token streaming is **not a prerequisite for v1**. The inspected shared
  transport does not support it today. Where unsupported, label output as arriving
  on response completion. Do not animate completed text to imply live generation.
  Adding streaming transport is a separate reviewed change unless a supported
  existing adapter is found during implementation.
- Instrument major generation phases in the ordinary full workflow: preparation,
  configuration/copy, research/reference analysis, imagery, applicable authoring
  lane, rendering, checks, repairs, preview preparation and handoff. Pack/foundation
  runs show their actual branches without fictional authoring agents.
- Every boundary in a checked-in coverage inventory states instrumented,
  not-applicable, or unsupported. Never advertise “all tool calls” without that
  evidence. Internal hosted-provider actions cannot be inferred or inspected.
- Older runs without traces say “Detailed activity was not recorded for this
  run.” Retain their existing stage history. Do not manufacture historical traces.

## Recommended technical structure

### A separate append-only activity trace

Keep diagnostic trace events separate from lifecycle/cost authority. They must
never mark an attempt successful, change preview readiness, dispatch work, or
bypass existing mandatory operation telemetry/handoff gates.

Use a common validated trace contract with an explicit identity namespace
(`legacy` or `operations`) plus canonical attempt ID. Ingestion must independently
authorize and bind that identity to the actual workflow run and run attempt using
the existing trusted producer mechanism. New-mode runs use the existing verified
workload identity/claim; legacy runs use the existing tracking trust boundary,
with verified attempt/run ownership, not a caller-supplied ID alone. If the legacy
boundary cannot prove ownership adequately, strengthen it before enabling traces;
never fall back to a weaker ingest path after an authorization rejection.

Persist bounded trace metadata in a dedicated private append-only relation in the
existing operations persistence layer; this is additive diagnostic storage, not
a migration of lifecycle records. Trace reads resolve the correct identity through
the existing authorized detail path. No cross-store identity guesses or broad
operations migration are part of this work. Confirm deployed storage readiness
before implementation; if unavailable, explicitly block rollout rather than add
another temporary persistence service.

An event envelope contains schema version, opaque stable event ID, identity,
stage/substep, task/parent task ID, actor kind/role, call/response ID when relevant,
producer sequence, emitted time, server received time, event kind and validated
payload. Required kinds: task start/end, model request start/end, action start/end,
visible output, usage, retry, sanitized error, and coverage/incompleteness notices.

Assign one ingestion cursor per identity partition transactionally. Replays of the
same stable event ID are idempotent; reject conflicting payload reuse. Cursor
order is receipt order; retain producer sequence and timestamps to explain delayed
or parallel events. Never imply a cross-process causal order from wall clocks.
Reads use cursor/keyset pagination, not offsets. Return coverage, ingestion cursor,
and retention/truncation state in addition to events.

### Producer instrumentation

Wrap shared completion dispatch to emit start, safe completion/failure, model
identity, latency, visible output and normalized reported usage. Add semantic
context at callers so a request has the correct stage, candidate and repair pass.
Map other provider boundaries explicitly through the coverage inventory rather
than assuming the shared wrapper covers every call.

Instrument actual orchestration boundaries for process launches, file artifacts,
reference/image inspection, verification and repair. Record safe paths and status
codes, not arbitrary command strings or environment dumps. Do not parse raw CI
stdout or a model's narrative to invent structured tool events.

Use a bounded producer queue and stable event IDs for retry. Recommended defaults:
flush every 1s or 20 events, 3s request deadline, at most two retries for transient
delivery failures; reject authentication/validation failures without fallback.
Bound queue to 1 MiB, batch to 128 KiB, event to 16 KiB, and sanitized text payload
to 8 KiB. At 10,000 events or 10 MiB per attempt stop retaining verbose content
and expose an explicit coverage limit; reserve capacity for terminal/gap notices.
Never block model generation indefinitely waiting for this diagnostic channel.

Diagnostic delivery failure does not override generation outcomes. Preserve a
bounded sanitized runner spool for retry while alive; record an incompleteness
notice on recovery. Process termination can lose unflushed events, which must
remain visible as incomplete coverage, not claimed durable before server ACK.
Keep existing lifecycle telemetry's fail-closed rules unchanged.

### Delivery to the browser

Use incremental authenticated polling for v1, not WebSockets or a new event
broker. While an active attempt is open in a visible tab, request new trace events
every 2s, with no overlapping requests. Stop rapid polling while hidden or after
terminal-state drain; keep existing list refresh policy. Fetch up to 100 events
per page and bounded catch-up pages; schedule continuation rather than one
unbounded response. Fetch missed events from the last acknowledged cursor.

Target under 5s from emitted event to display under normal healthy conditions;
measure emission, ingestion and browser receipt independently. A backend poll
succeeding is not evidence the producer is alive. Emit a lightweight producer
heartbeat approximately every 10s while work is active. After 30s without a
heartbeat show “No recent activity signal”; after 60s show “Activity may be
incomplete.” Distinguish transport disconnected, producer quiet, waiting for model,
and terminal run state. Silence never automatically fails a generation.

Serve reads with `no-store` under existing admin permissions; tenant/attempt scope
must be checked on every page. UI trace code renders text as text, not executable
HTML/JSX or unsafe Markdown. Keep only a bounded feed window (500 entries), with
older history paged on demand. Streaming/push delivery can be evaluated later
without changing trace identity and replay semantics.

## Privacy and retention

Use positive allowlists, not only regex redaction. Do not store provider credentials,
auth headers, environment values, invitation/session/review-link tokens, private
intake contact details, raw prompts, private reasoning, or unrestricted URLs/logs.
Inputs and results are typed sanitized excerpts. Source/code output is eligible
only after bounded sanitization with sensitive fields removed; unclassified content
is withheld with a visible reason, not dumped into a generic string field.

Sanitize before spool/network/storage and validate again at ingest. Truncate after
sanitization. Cap nesting and width to avoid the earlier structured-evidence
amplification defect. Tests include secrets embedded in model text and tool errors.
Links use approved artifact routes and existing authorization, not arbitrary URLs.

Recommended diagnostic retention is 30 days for content and trace metadata, with
actual deletion and an explicit expired-history state. Existing stage/cost/accounting
retention remains unchanged. Do not run existing data deletion as part of design
work; the future retention job affects only the new trace namespace after rollout.

## Validation and rollout

1. Contract/security tests: wrong attempt/run/tenant rejected, namespaces separated,
   idempotent resend, conflicting IDs, delayed/parallel events, cursor catch-up,
   secret suppression, Unicode/oversized/deep content and malicious markup.
2. Producer tests: pending call visible before completion, output after completion,
   usage unknown versus zero, retries counted once per response, cancellation and
   errors truthful, unsupported coverage visible, bounded queue/retry/deadline,
   and diagnostic failure never weakens lifecycle handoff rules.
3. Local end-to-end fixture: delayed mock provider and real producer → ingest →
   persistence → admin read → browser. Verify real intermediate states and reload
   replay, not only final DOM markers. Fixtures perform no paid calls or dispatch.
4. Browser: filters, selection, disclosure, follow/jump behavior, stale heartbeat,
   disconnect/reconnect, expired authorization, historical missing/expired trace,
   desktop/compact/mobile layout, accessible focus, bounded feed and no overflow.
5. Existing affected root/Worker suites, type checks, admin/platform builds and
   release gates stay mandatory. Any generated-site path changes require relevant
   recipe/configuration and local release/rendered gates. Independent bounded
   review required for authorization, privacy and replay/data-integrity behavior.
6. Ship additive contract/storage before enabling emitters/readers with a reviewed
   capability flag. Verify the deployed identity path, not only source availability.
   Disabling detailed activity restores the existing inspector without changing
   generation, model choices, promotion gates, or historical lifecycle evidence.
7. Final live proof requires a separately authorized ordinary generation, entered
   through the admin invitation/client intake as requested previously. Observe it
   during a slow model call and at completion, then reload and compare retained
   evidence. Do not dispatch a paid run just to close this design task. If no run
   is authorized, keep production-generation proof explicitly pending.

## Builder discretion and approval

Builder may choose exact module/file decomposition, coverage manifest format,
index layout, safe-payload codecs and polling backoff, preserving the contracts
above. Validate platform limits and current library/provider APIs before choosing
implementation syntax. No dependency or framework rewrite is required.

The owner approved this complete description, including the v1 completed-response
output boundary, embedded inspector placement, 30-day diagnostic retention, and
recommended polling design. The next gate is review of the implementation plan,
not an automatic paid run or production deployment.
