# Operations events and reconciliation

Implementation only. Production migration, cron activation, dispatch and live
OIDC staging are **not authorized** by this document.

## State and evidence

- Migration `005-reconciliation.sql` adds owner-fenced late events, GitHub
  observations, delivery state, decimal rollups and append-only operator audit.
  Apply migrations 001 through 005 only to an approved isolated database first.
- Events use stable attempt/stage/transition/occurrence keys. Transport retries
  reuse the same body. An existing key with changed semantic evidence conflicts;
  do not overwrite it. A deliberate new occurrence gets a new key. Event arrival
  time is not execution order and cannot overwrite an execution outcome.
- The existing Task 4 OIDC endpoint derives repository ID, run ID and run attempt.
  Client-supplied identities are rejected. Only that exact elected owner can
  append events, including late evidence after a terminal observation.
- New-mode producers never send legacy tracking secrets, intake details, raw
  failures, signed URLs, provider responses or legacy thumbnails. Cost summary
  conversion copies only stage, kind and reported USD amount, never its detail.
  Decimal amounts and `actual`, `estimated`, `unreported` remain distinct. The
  rollup's unreported count is event-level, not a dollar estimate; missing amounts
  are never zero-priced usage. Separate currencies are never added together.
- New-mode preview-ready requires a `handoff/completed` event with the selected
  client build's full SHA **and** observed GitHub success for the exact owner/run
  attempt. Handoff is emitted after the existing rendered, deployment, secure URL,
  private review and developer email gates, not at the earlier legacy preview
  marker. Nothing here changes release or publication authorization.
- All event sends retry at most three times. Exhaustion creates a runner-local
  `operations-telemetry-incomplete` marker, returns nonzero and blocks handoff.
  Missing handoff becomes operator attention even when GitHub reports success.
  Earlier terminal failures/cancellations never become success from late events.

## Scheduled observation (disabled by default)

`OPERATIONS_RECONCILE_MODE=observe-v1` is a separate explicit opt-in from dispatch.
It requires operations DB access, the configured workflow repository and an
Actions-read-capable `GITHUB_ORG_TOKEN`. Do not enable it against a live target
without separate authorization and credential review.

The existing local-only `operations-dispatch-local` cron recipe in `wrangler.jsonc`
wakes the Worker. The scheduled handler runs observation independently of
dispatch, including when dispatch is disabled or fails. No production trigger
was added or activated. Each wake observes at most 25 eligible attempts with a
five-minute observation interval, oldest observation first. Unknown unclaimed
dispatches age to attention; no guessed run ID, listing-based correlation or
blind replay is used. GitHub requests use the exact run-attempt endpoint and
verify returned repository ID, run ID and attempt number. HTTP failures, malformed
or mismatched responses are controlled unknown observations, not proof of death.

GitHub calls happen outside transactions. Applying each observation locks the
attempt and rechecks its owner, so a stale observation cannot change another run.
Alerts expose bounded opaque attempt IDs and reason codes for aging outboxes/runs,
repeated dispatch failure, failed/cancelled attempts, incomplete streams and
unavailable observations. Scheduler dependency failure emits only a fixed code.
Alert queries return at most 100 oldest records; this is a bounded operational
window, not a complete history or an external alert-delivery service.

## Authorized operator surface

Routes live below the existing authenticated, origin-checked workspace prefix:
`/api/admin/onboarding-invites/workspace/operations`.

- `GET /alerts`: private bounded alert records; requires an existing verified
  owner/admin session or verified allowlisted Access principal.
- `POST /attempts/:attemptId/reconcile`: re-observe the stored owner, never a
  caller-provided run identity. This does not dispatch or authorize release.
- `POST /resolutions`: body `{attemptId, decision: "retain_attention",
  evidenceRef}`. `evidenceRef` is the SHA-1/SHA-256 of a private operator evidence
  record, not a URL, token, free-text note or proof of safe external effects.
  The actor comes from the existing verified principal. The audit preserves
  actor, server time, selected run identity, checked conclusion and decision.
  Worker role has no direct audit-table read/update/delete privileges.

**Retry, clearing attention, ownership transfer and force-success are not
supported resolution actions.** Neither terminal GitHub status alone nor a
body-supplied "effects reconciled" checkbox proves repository, Pages, model or
email effects are safe to repeat. Retain attention and escalate to the operator
with the private run/effect evidence. A later exact-effect recovery procedure
needs its own authorization, design and tests before enabling a new attempt.
There is no generic retry button and no automatic claim takeover.

## Verification boundary

Synthetic tests cover exact owner fencing, duplicates/conflicts, late updates,
lost terminal callback, failed/cancelled GitHub outcomes, missing handoff, valid
SHA-bound handoff, unknown correlation, decimal cost categories and audited admin
attention decisions. Local loopback PostgreSQL proves SQL behavior under the
dedicated operations role. Signed synthetic JWT tests prove the HTTP identity
boundary; they are not a live GitHub OIDC exchange. Live user-visible staging,
production DB permissions/restore policy and deployed cron/alert delivery remain
separate gates.

## Reviewed cost and preparation contract (migration 006)

Apply `006-cost-coverage.sql` only to the approved isolated target after 005.
It removes the implicit eight-place monetary typemod, adds nullable
`coverage_complete`, and extends `attempt_cost_rollup` with `incomplete` and
`unknown_coverage` counts. `actual` is a **known actual subtotal**, not a complete
bill: it can be nonzero while coverage is incomplete. `estimated` remains a
separate subtotal. Unknown legacy coverage is not upgraded to complete. Coverage
counts are attempt-wide and repeat across currency rows; do not add those counts
across currencies. Rollup amounts remain exact decimal text, without rounding.
The return-shape change deliberately has no `CASCADE`: unexpected dependent
views/functions must stop migration for operator review, not be dropped silently.

Operations money supports up to 20 integer digits and 30 fractional digits. The
CLI's operations reader preserves original JSON numeric lexemes before parsing
money, including exponent notation. Decimal parsing, addition and multiplication
use BigInt-backed decimal arithmetic, not binary floating-point addition. Per-call
provider usage takes precedence over possibly rounded cache aggregates. Amounts
outside these explicit bounds are incomplete/unrepresentable evidence, never
silently rounded. Already-rounded upstream artifacts cannot have lost digits
reconstructed; the exact subtotal reflects the available source evidence.

The summary's `exact.stages` sidecar contains decimal strings, cost kind and
coverage. Existing numeric six-place legacy summary/event fields remain unchanged;
no new properties are added to strict legacy event objects. The operations
converter consumes the exact sidecar and emits `coverageComplete` separately from
the amount. Contradictory `recorded-incomplete` or `detail.complete=false` evidence
always wins over a claim of complete coverage. Summary detail, prompts, arbitrary
model/provider labels and artifact paths are not copied into operations events.

`record-operations-telemetry.mjs` owns the entire summary subprocess and posting
boundary. Preview handoff requires all of the following:

1. The preview telemetry step's raw outcome is success.
2. No incomplete or preparing marker exists.
3. A successful preparation receipt matches the current attempt and selected SHA.

The receipt is written only after the real summary command and all event posts
succeed. A skipped, killed, failed-to-load or failed-to-prepare command cannot
pass merely because a negative marker is absent. Deleting the negative marker
does not manufacture a positive preparation receipt. A previously failed stage
write's incomplete marker is never cleared by later summary success.

On generation failure, the same boundary collects available SEO/config/authoring,
image and rendered repair usage from the known artifact paths. It tolerates absent
files without inventing a zero-cost stage. Malformed/capped evidence is explicitly
incomplete; valid evidence from other sources can still be retained. Failure events
and cost observations use stable keys on retry and cannot change execution or
delivery state. Conflicting evidence for the same occurrence remains a conflict,
not an overwrite or an extra charge. If preparation/posting fails, the original
failure observation is still attempted and a fixed incomplete diagnostic emitted.

The rendered repair producer records each gate call in its round directory and
then copies that same report into `final/visual-gate.json` for downstream review.
Cost collection ignores the copied destination when a canonicalized, identical
round report was already discovered, and ignores a file reached twice through
overlapping roots. Reports in separate round directories, and the distinct
`visual-gate-plan.json`/`visual-gate-final.json` revision gates, stay separate paid
calls. An unreadable copy is still incomplete evidence, and a readable report is
never suppressed by a malformed one. Unknown gate amounts stay unknown instead of
being counted as a priced zero, and the ignored copy count is reported as
`repair_qa.detail.duplicateReports`.

Collection is bounded: 2 MB per file, 8 MB total bytes, 512 items per array,
50,000 JSON nodes, 512 discovered directory entries, 64 discovered QA report
files, four nested directory levels and a 15-second summary subprocess timeout.
Symlinked artifacts are refused. Raw subprocess stdout/stderr is not exposed.

**Remaining staging gate:** URL-to-selected-SHA readiness is inherited from the
existing deployment/readiness path, not newly proved by these telemetry tests.
An authenticated source-build SHA attestation alone does not prove the bytes
served by the deployed URL. Verify that binding and the real OIDC/scheduled flow
in separately authorized user-visible staging before activation. The four
pre-Task-5 baseline app failures are migration regressions to resolve during later
integration, not unrelated failures or permission to weaken preview gates.
