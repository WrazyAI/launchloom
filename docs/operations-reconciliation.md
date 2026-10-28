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
