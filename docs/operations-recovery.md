# Operations dispatch and recovery

## Task 7 source-to-destination inventory (local source, not live routing)

Inventory command: `rg -n 'issueNumber|ISSUE_NUMBER|client_payload.issue|inputs.issue|FEEDBACK_ISSUE' .github/workflows scripts worker/src`.
Also traced `LAUNCHLOOM_INTAKE_ID`, `intakeIssue` and `intake-issue` to catch indirect config/research consumers. This inventory precedes Task 7 changes; deployed routing has not been inspected.

| Exact modules | Legacy owner | New-mode owner / disposition |
| --- | --- | --- |
| `worker/src/index.ts` intake route, issue recovery/backfill; `worker/src/onboarding-invites.ts`; `worker/src/intake-recovery.ts` | Numeric issue acceptance, legacy dispatch/receipt outboxes, recovery by invite binding | Persisted DO `routing_mode` owns the submission; Postgres route calls `operations/acceptance.ts` and never creates an intake issue. Legacy recovery cannot adopt Postgres reservations. |
| `.github/workflows/generate-client.yml` profile, intake handoff, run names, concurrency, initial generation | Issue input, issue body and completion marker | `operation_id`, `request_id`, `attempt_id`; authenticated claim returns `intakeId`. Claim precedes intake read and side effects; issue-only jobs/comments are excluded. |
| `scripts/operations-client.mjs`; `worker/src/operations/{github-auth,store,contracts}.ts` | Not used | TLS/OIDC protected opaque-ID claim, private payload file and fenced events. No direct workflow DB credential. |
| `.github/workflows/generate-client.yml` intake step; `scripts/generate-site-config.mjs`, `scripts/compile-inspiration-pack.mjs`, `scripts/run-reasoning-preflight.mjs` | Numeric `LAUNCHLOOM_INTAKE_ID` | Inventory discovered a missing initial binding. Task 7 exports the claimed opaque intake ID before config/research, as well as preserving it in subsequent steps. |
| `.github/workflows/generate-client.yml` client repo, branch, review, email and failure steps; `scripts/{create-review-link,send-preview-email}.mjs` | Issue-derived repo suffix; private client PR as feedback issue | Opaque intake-derived repo/project; actual private client PR remains `feedback_issue`. It is a revision artifact, NOT an invented intake issue. Review links stay private, failure notifications link to the run instead of a missing intake issue. |
| `scripts/record-generation-event.mjs`, `scripts/record-generation-stage.mjs`, `scripts/generation-tracking-contract.{mjs,d.mts}` | Numeric issue metadata, legacy tracking secret and DO producer | `OPERATION_ID` selects authenticated `postOperationsEvent`; IDs and controlled fields only. Contract remains legacy-only; no fake numeric issue. |
| `worker/src/generation-ledger.ts`, `worker/src/generation-attempts.ts`; `scripts/reconcile-generation-history.mjs` | Legacy DO history, legacy run-name parsing/recovery | No Postgres writes or import. Current read model is `operations/store.ts`; separate Legacy History reads remain. |
| `.github/workflows/test-generation.yml`; `scripts/run-pipeline-test.mjs`; `scripts/pipeline-test-policy.mjs` | Numeric issue, isolated focused diagnostic runs | Focused runner remains a diagnostic-only legacy interface, not new intake dispatch. The shared policy accepts a new operation instead of an issue for full profile only, rejects mixed references and disallows operations on diagnostic profiles. Diagnostics cannot report client handoff. |
| `.github/workflows/process-feedback.yml`, `.github/workflows/process-client-feedback.yml`, `.github/workflows/repair-creative-candidate.yml`, `.github/workflows/publish-site.yml`; `scripts/apply-feedback.mjs` | Actual private client repo PR/feedback issue | Unchanged revision/publication DO ownership and approved-SHA gates for both modes. These IDs belong to the private repo, not the intake store. |
| `worker/src/admin/workspace-api.ts`; `src/admin/{OperationsView,GenerationsView}.tsx` | Read-only Legacy History source | Authenticated operations records by opaque attempt ID; no payload/consent/email in projection. No operational retry/transfer inferred from a history row. |

No remaining numeric-intake consumer is authorized to be fed `0`, a PR number, or a synthetic intake issue as compatibility. A new uncovered assumption blocks activation until bounded support is tested. Live destinations, repository privacy and the actual legacy in-flight set require separate operator verification.

## Controlled staging proof: STOP until separately authorized

This is a readiness runbook, not an activation instruction. Task 7 authorizes only local disposable loopback PostgreSQL with synthetic data. Do not provision a managed database/branch, change secrets, deploy a Worker/workflow, enable any flag or cron, send a real invitation, dispatch Actions or call a paid provider under this task. An operator must separately approve the environment, actions, cost ceiling and cleanup plan before the following staging proof.

1. Identify the exact non-production Worker, GitHub repository/workflow/ref and immutable repository ID, DB project/branch/database, role and asset/mail destinations. Verify isolation from membership and production data, TLS, least privilege, connection budget, backup history and restore permissions. Record identifiers, not connection strings. No approved target or verified credentials currently exist in this task's evidence.
2. With authorized schema-owner access, apply `db/operations/001-operations.sql` through `007-dashboard.sql` in order. Reapply in the isolated fixture to prove idempotence; use the operations worker role for application calls and prove direct-table/membership access is denied. No workflow receives a DB credential. Keep all runtime flags disabled until identity and release gates are independently reviewed.
3. Verify the deployed workflow revision contains the pre-side-effect claim, full-profile policy, mandatory new-mode telemetry and selected-build handoff. The current OIDC policy accepts `WrazyAI/launchloom/.github/workflows/generate-client.yml@refs/heads/main`, branch subject and `workflow_dispatch` only. A random staging fork/ref is NOT compatible: an explicit reviewed trust policy and deployment authorization are required before any such run. Verify actual GitHub JWT claims against audience, issuer, signing keys, repository ID, ref, workflow, expiry and run attempt; never save or paste a token.
4. Approve a synthetic, unpaid workflow strategy. Existing full generation calls paid models and creates repos/Pages; do not dispatch it just to obtain telemetry. No paid or client run is authorized here. The new path supports full requests, not creative-only diagnostics. A controlled proof must preserve claim, release and handoff gates, not substitute diagnostics or relax them.
5. Verify an actual deployed scheduled trigger after a quiet period, without an HTTP request waking the dispatcher. Capture two scheduled invocations, exact operation/attempt/run IDs, bounded lease/fence transitions, automatic outage recovery and duplicate-run refusal before payload retrieval. The local `dispatchScheduled` test exercises the durable engine with reconstructed stores, NOT deployed cron. The separate Worker tests exercise the exported scheduled handler, NOT Cloudflare's production timer delivery.
6. Inject GitHub 429/outage, accepted dispatch with response lost, duplicate run, DB outage before commit, confirmation crash, callback failure and late event. Persist exactly one acceptance/request for duplicates, no acknowledgment before both confirmations, and no non-owner payload/model/repo/deploy effects. Changed fingerprints fail. An unknown prior effect stays attention, never blind retry. Check private issue routing and absence of payload/PII in inputs, public job output and artifacts.
7. Correlate the actual GitHub run AND run attempt using authenticated claim and exact-attempt API observation. Compare stages with private evidence and selected client build SHA. GitHub success without authenticated post-gate handoff must be attention. Failed/cancelled runs retain their outcomes; unknown/estimated costs remain labeled. Unclaimed ambiguous sends have no invented run correlation and need operator attention.
8. Prove restore of synthetic accepted, running, attention and preview-ready records into a separate isolated target. Verify IDs, ownership, outbox fences, cost kinds, events and consent binding, then reconcile the corresponding DO reservation. Keep its dispatcher disabled: a restored DB must not redeliver active work. Record recovery point/time measurements and actual provider history window; a `pg_dump` alone is not a restore drill.
9. Browser-verify authenticated desktop/mobile operations list/detail and separate read-only Legacy History against that staging DB/API. Check authorization, privacy, ordering, attention reason, selected-build evidence, unknown costs and no operational mutation from legacy history. Existing mocked browser proof is only local UI evidence.
   The workspace bootstrap must advertise only `capabilities.operationsRead`, never DB details. With reads disabled, Operations navigation stays hidden and direct URLs fall back to Legacy History without an operations API call. With reads explicitly configured, navigation appears, but the capability itself grants no authorization and enables no configuration.
10. Obtain explicit admin sign-off on every evidence item below. Any unavailable target, claims, scheduler, correlation, provider price, restore or retention choice is a blocker, not a waiver.

### Retention and restore approval gates

No durations or deletion jobs are approved by this change. The operator must supply and approve the following matrix before staging activation with any retained information or production enablement. No automatic deletion is implemented or run by Task 7.

| Class | Authority and copies to account for | Required decision/evidence |
| --- | --- | --- |
| Private intake and consent | Postgres payload, normalized fingerprint, consent version; private runner temporary file | Purpose, retention period, lawful deletion/export owner, legal holds, consent evidence and verified deletion procedure; do not put payloads in logs. |
| Attempts, events, costs and operator audit | Postgres operational records and event/run correlation | Minimum recovery/audit window, currency/cost distinctions, redaction policy and dependency-safe deletion order preserving active ownership and idempotency. |
| Invite bindings, receipt and legacy outboxes | OnboardingInvites DO, provider receipt identifiers; legacy issue/DO sources | Preserve stable submission/routing binding through maximum retry/recovery window; prove deletion cannot free an invite or redeliver an accepted request. No legacy purge or bulk migration. |
| Client artifacts and assets | Private client Git repo, Pages, object stores, screenshots, signed review links, provider email | Destination privacy/access, independent retention and revocation/expiry rules; stock/client asset rights and removal dependencies. DB deletion does not delete these copies. |
| Workflow logs/artifacts and public history | Actions logs/cache/artifacts, public launch signature metadata | Verify no payload, client identity, signed link or secret in public surfaces; approved log lifetime and incident handling for exposure. Restrict permissions; do not simply rely on masking. |
| Backups, PITR, replicas and restored copies | Selected provider plan, exports and restore targets | Actual recovery window, backup expiry/deletion lag, RPO/RTO, encrypted access, isolated restore proof and who authorizes restore. Restoring deleted content must not re-enable delivery or violate deletion policy. |

Record approver, UTC timestamp, environment, evidence references, retention choices, restore result and remaining risks in the release record. Do not include secrets or raw intake content. Unresolved retention or unavailable provider restore access blocks activation.

## Production cutover checklist (separate explicit approval required)

- Verify the exact DB/roles/backup/restore/capacity and privacy destinations; staging proof above must be green. Record deployed workflow/Worker commits and frozen gate evidence. Keep revision/publication authorization, approved-SHA checks and visual/SEO gates unchanged.
- Classify or drain every in-flight legacy invite reservation, issue creation/dispatch and receipt outbox. Record stable submission IDs, persisted routing mode and owner/run/effect evidence in a restricted release record. Do not bulk-import history, rebind a legacy intake or replay an unknown dispatch.
- Choose and record a UTC cutover timestamp and named admin/operator. Only future unreserved submissions may select Postgres with the intake mode flag; each existing submission follows its DO-persisted mode. Never dual-write competing intake authorities. A transient DB error must not fall back to an issue payload.
- Separately approve operations admission, dispatch claim-gate, observation and real scheduler settings and credential scope. Inspect actual deployed configuration before each change; values mentioned in this document do not enable anything. No implicit configuration inheritance from local Wrangler environments.
- Monitor aged blocked/pending outbox, recovery alarms, repeated dispatch failures, expired/unknown owners, missing event streams, failed callbacks and DB failures with an operator present. Compare DB, dashboard and exact GitHub attempts. Silence or green Actions alone is not preview evidence.
- On any unexpected destination/privacy leak, ambiguous owner/effects, failed restore gate or missing scheduler/telemetry, stop new admissions and use the rollback sequence below. Do not weaken a release gate to get a green run.

## Stalled-intake and fenced-owner triage

1. Resolve the exact invite/submission and its persisted mode. In Postgres mode inspect the binding and `acceptance_state` plus DO-confirmed IDs/fingerprint through trusted operators, not browser DB access. A saved-but-unconfirmed intake remains blocked. Use the existing bounded acceptance recovery alarm to reconcile exact IDs; do not expire/release the reservation because a DB response was lost. A DB outage before commit must return retry with the same submission ID, never receipt confirmation.
2. For confirmed waiting work inspect outbox state, age, last sanitized error, next retry, fence and gate provenance. GitHub rate limits preserve waiting state/backoff; unknown outcomes are not proof no job exists. Verify scheduled health independently. Never manually flip a row to pending or upgrade old gate provenance.
3. For running/attention work inspect repository ID, run ID AND attempt, claim identity, stage keys, selected-build evidence and actual private repo/Pages/provider effects. `claimRun` is a one-time election, including same-run retries. A lost claim response is attention/escalation, not permission to repeat side effects. Fencing prevents a stale sender or another run from taking over.
4. Reconcile the exact GitHub attempt using the authenticated admin reconciliation endpoint and provider evidence. The implemented reviewed operator action is `retain_attention` with actor and evidence hash; it does NOT grant retry, ownership transfer, cancellation or deletion. No generic recovery control exists. If safe correlation or external effects are unknown, retain attention and escalate for a separately approved, effect-specific recovery procedure.
5. A failed stage callback must retry boundedly; the producer's incomplete marker blocks authenticated preview handoff. Do not clear the marker or fabricate an event to deliver a site. Provider observations may record failed/cancelled/unknown outcomes but cannot invent stage, cost or preview evidence. Audit actor, UTC time, checked run/effect evidence and decision without private payloads.

## Safe rollback while accepted Postgres attempts exist

1. Obtain incident/admin authorization. Stop **new admissions** to Postgres; retain its DB, role, API read path, OIDC ownership, recovery alarms and accepted records. Persisted Postgres submissions must keep retrying their original handshake/path even when the requested intake mode becomes legacy. Legacy retries likewise stay legacy after forward cutover.
2. Classify every already accepted Postgres operation as blocked, waiting, claimed/running or terminal. A mode flag change neither cancels it nor transfers ownership. Keep observation/read access. If dispatch must be paused, account for every lease and accepted/unknown GitHub send before any resume. Claimed/running attempts may finish under their existing owner; if unsafe, stop effects only via a separately approved exact recovery procedure and retain attention.
3. Reconcile active exact run attempts and external effects without deleting or reseeding records, issuing a new submission ID, resetting fences, clearing claims, re-running full workflows or writing competing legacy history. A restored snapshot must remain dispatch-disabled until post-snapshot effects and DO bindings are reconciled.
4. Future legacy admissions may resume ONLY after explicit approval of their actual private routing and recovery properties. There is no automatic fallback to public issue payloads; if privacy is not verified, pause intake instead. A single flag rollback is not sufficient evidence of a safe fallback.
5. Verify accepted IDs remain visible, non-owner reads/events remain denied and active attempts cannot redispatch. Preserve Legacy History separately. Record incident/cutover timestamps, actor, evidence and unresolved operations; do not mark the migration complete while accepted work is unaccounted for.

## Activation is not authorized

This implementation is disabled unless **both** `OPERATIONS_DISPATCH_MODE=claim-gated-v1`
and `OPERATIONS_CLAIM_GATE=verified-v1` are explicitly configured. Neither is enabled
in the root Worker configuration. There is **no production cron**. Do not enable,
deploy, run production migrations, or dispatch real generation as part of this task.

The `operations-dispatch-local` Wrangler environment records a one-minute UTC cron
(`* * * * *`) for local simulation only. It has no route, no public workers.dev
endpoint, no database binding/credential and disabled flags. **Never deploy this
environment.** A production schedule and target need separate approval after the
Task 4 authenticated workflow claim gate is implemented and verified end to end.

The eventual target must explicitly supply `OPERATIONS_DISPATCH_REPOSITORY`,
`OPERATIONS_DISPATCH_WORKFLOW`, `OPERATIONS_DISPATCH_REF`, the isolated operations
database connection, and a suitably scoped dispatch credential. There is no
fallback to the existing generation workflow or a guessed repository/ref. The
claim adapter must verify the expected repository ID, workflow/ref, audience,
expiry and operation/attempt ownership. IDs are not bearer credentials. A flag
asserts readiness; it cannot prove that the remote workflow contains a claim gate.

## Durable scheduling

Apply `001-operations.sql`, `002-acceptance-recovery.sql`, `003-dispatch.sql`, then
`004-run-ownership.sql` only to an approved isolated fixture/staging target as its
schema owner. Migration 003 grants only function execution to the pre-existing
operations service role; migration 004 adds identity-bound intake reads and stage
writes without provisioning a login or giving workflows direct database access.

Each tick handles at most ten entries. Each lease is a separate committed SQL
statement using `FOR UPDATE SKIP LOCKED`, explicit confirmed-intake eligibility,
and a monotonically increasing fence. The GitHub request runs **outside** the
database transaction with a 15-second timeout and no redirect following. A sender
lease lasts two minutes. The result writer checks both fence and lease expiry.
Claim election also increments the fence so a late sender cannot overwrite a
running owner's state. A database failure stops the tick, rather than sending
more work whose result cannot be persisted.

GitHub 200/204 records dispatch acceptance, **not** execution ownership or
success. The API is pinned to `2026-03-10`, whose 200 response supplies run
details; legacy 204 is accepted too. Response bodies are deliberately not
projected as owner identity: only a trusted workflow claim can elect the owner.
Only operation/request/attempt IDs are sent, never the intake payload.
No run ID is fabricated from a response that does not provide one. A first
authenticated claim binds the numeric GitHub repository ID, run ID and run
attempt; `workflow_repository` currently stores that repository **ID**, despite
its historical column name. The attempt remains waiting until that claim.

## Retry versus unknown

Automatic retry depends on what the response proved, never on an assumption
that a missing response means no run exists.

- HTTP 429 is an explicit non-acceptance: retain `waiting_to_start` and retry
  durably after at least 60, 120, 240, 480, 960, 1920, then 3600 seconds. The
  eighth rate-limited send goes to `attention` (`dispatch_retries_exhausted`). A
  429 never elects a run: `claimRun` rejects a pending entry that has only a
  `github_rate_limited` history.
- A rate-limited HTTP 403 is recognized only from validated signals: a numeric
  zero `x-ratelimit-remaining` together with a valid `x-ratelimit-reset`, or a
  valid `retry-after` (seconds or an RFC 7231 HTTP-date, including GitHub
  secondary limits). An HTTP-date is accepted only in IMF-fixdate, RFC 850 or
  asctime form, and its calendar date must exist: a day such as 31 February or
  29 February in a non-leap year is rejected instead of being normalized. An
  RFC 850 two-digit year follows the 50-year rule against the dispatcher clock
  on the full timestamp, so the date, not just the year, decides the century.
  The year with those digits resolves inside a 50-year window: it rolls back a
  century when the timestamp would be more than 50 years ahead and forward when
  it would be more than 50 years behind, so 00 in 2099 is 2100 rather than a
  stale 2000. The resolved year then drives the calendar check, which rejects a
  rolled-over 29 February in a non-leap year. ISO dates and other
  JavaScript-parseable strings are rejected.
  Empty, zero or malformed `retry-after` establishes nothing. `remaining: 0`
  without a valid reset establishes nothing. A 429 uses any valid retry-after
  or reset because its status already proves the limit; a 403 requires the
  validated signals above. When several valid signals exist, the longer delay
  wins. Valid delays are clamped to 1..3600 seconds, and the persisted
  exponential backoff is a floor: a zero or short header can never shorten the
  60, 120, 240, 480, 960, 1920 or 3600 second schedule. An ordinary 403 remains
  `attention` (`dispatch_rejected`); it is an authorization/configuration
  failure, not a temporary limit.
- HTTP 400/401/404/422 goes to attention (`dispatch_rejected`): fix the
  configuration through a reviewed recovery, not an endless loop.
- Network failure, timeout, unexpected response or HTTP 5xx is ambiguous. Even a
  5xx can follow acceptance. **Outside the verified gate** it records
  `dispatch_unknown` and goes to attention, and is never automatically
  redispatched.
- **Inside the verified gate only** (`OPERATIONS_DISPATCH_MODE=claim-gated-v1`
  and `OPERATIONS_CLAIM_GATE=verified-v1`) an ambiguous result or a crashed
  sender lease is re-queued as `waiting_to_start` with the same stable
  operation ID and a new fence. The gate provenance is captured durably before
  the **first** send (`verified-v1` or `unverified`) and is never upgraded. A
  historical unverified send can never become auto-replayable after an operator
  enables the flag later; that path fails closed to attention. The retry uses
  the same bounded 60, 120, 240, 480, 960, 1920, then 3600 second backoff. A
  gated replay is marked durably (`uncertain_replay`) so a genuine run from the
  earlier ambiguous send can win the atomic claim during backoff. After eight
  attempts the entry becomes visible `attention` (`dispatch_unknown` for an
  ambiguous send, `dispatch_retries_exhausted` for a limit); it never loops
  forever or hides the terminal state.
- The gate is what makes a duplicate dispatch safe: the workflow calls
  `claimRun` before any side effect, exactly one run becomes `claimed`, and all
  duplicates exit. Until Task 4 implements and independently verifies that
  pre-effect gate, both flags stay disabled and the conservative attention path
  above applies.
- A crashed sender's expired lease becomes `attention`
  (`dispatch_lease_expired`) outside the gate. Inside the gate it is requeued
  for automatic recovery, bounded as above. An accepted dispatch without a
  claim after ten minutes remains `attention` (`run_claim_missing`); that is an
  accepted run with unknown liveness, not an uncertain send, so it is not
  auto-replayed. Each sweep locks at most fifty rows.
- A first claim is granted only when the first send has persisted
  `gate_provenance = 'verified-v1'`. This applies to leased, dispatched, unknown
  attention and `uncertain_replay` rows. `NULL` provenance (including legacy
  rows) and `unverified` provenance fail closed for every such state, even when
  `uncertain_replay` is true and even when no side-effect evidence was recorded.
  The absence of recorded effects is not proof of safety. Those rows surface
  `attention` (`gate_provenance_unverified`) and require evidence-based operator
  reconciliation before execution; a never-sent pending row is simply denied and
  remains dispatchable. A delayed genuine run from an earlier **verified** send
  can still claim after later 429s, rejections or 429 exhaustion. Entries with
  only a rate-limit history (no uncertain evidence) never become claimable. This
  is not ownership transfer: the attempt must still be waiting and never owned.
  Same-run replay and rerun attempts receive `duplicate`; an attempt marked
  attention for unknown side effects receives `attention`.

## Ownership and operator recovery

`claimRun` is a one-time election. Exactly one caller gets `claimed`; all other
runs, including a replay of the same run or a GitHub rerun attempt, get
`duplicate` and **must exit before any intake read or external side effect**.
An attempt marked attention for unknown prior side effects returns `attention`.
A claimed/running attempt is never taken over: its run ID is already bound, so a
lease expiry or a late sender cannot replace it. The only additional claimable
pre-owner state is a verified-gated uncertain replay (`pending`/`attention` plus
`uncertain_replay` and `gate_provenance = 'verified-v1'`), where a real run from
the ambiguous send may still be the first owner. Unowned waiting attempts that
already carry prior-effect evidence (`started_at`, `finished_at`,
`terminal_reason`, artifact references or stage events) are never leased or
claimed: both paths lock the attempt row and surface `attention`
(`prior_effects_unexplained`). One trusted run identity cannot own two
operations.

Lease and claim both lock the outbox row and then the attempt row with
`FOR UPDATE`; the prior-effect check runs in a separate statement under that
lock, not from a precommitted snapshot. A stage-event insert takes a foreign-key
key-share lock on the attempt row. An uncommitted insert therefore makes the
lease skip the candidate (`SKIP LOCKED`, no send) or blocks the claim until the
insert commits; an insert that starts after the lock is not prior evidence.


A lost claim response also fails closed: retrying the election cannot give a
second permission to execute. The workflow must stop and escalate, not retry
side effects. Task 4 must implement this gate before intake retrieval, model
calls, repository/Pages creation or deployment, and fence all later callbacks
to the elected identity. Task 5 must reconcile missing/expired owners; this task
does not infer liveness or undo external effects.

For attention, an authorized operator must check GitHub run identity/status and
the actual external-effect evidence. Record actor, timestamp and evidence before
any reviewed resolution. Do not clear state or use a generic retry button while
liveness or effects are unknown. No such resolution mutation is implemented here.

## Local verification

Worker boundary tests (including the actual exported scheduled handler) run with:

```sh
npx vitest run --config vitest.worker.config.ts worker/test/operations-dispatch.test.ts
npm run check:worker
```

Real SQL tests require an **already disposable loopback**
`launchloom_operations_test[_suffix]` database with migrations 001-007 and the
operations service role. Set `OPERATIONS_TEST_DISPOSABLE=1` and the private
`OPERATIONS_TEST_DATABASE_URL` in the test process environment, then run:

```sh
npx vitest run tests/operations-dispatch-postgres.test.ts
```

Task 7's whole-path test applies migrations 001-007 to its isolated fixture and
uses the service role for application calls. Run it on a separate fresh fixture:

```sh
npx vitest run tests/operations-integration.test.ts
```

Its two workflow-shell cases run without a database; the two Postgres cases
(including desktop/mobile Chromium against the actual dashboard API/store) skip
without the guarded target. A skipped case is not transaction or browser proof.
The migration suite requires its own fresh fixture with the preconfigured test
operations/membership roles, not a reused staging or application database.

These tests use `psql` and service-role SQL for application calls. Assertions
cover locks/fences, retained confirmed state, fresh scheduled-handler store
instances after a quiet period, concurrent run claims, unknown outcomes and
bounded backoff. They also exercise an outage followed by recovery, a lost
accepted response with a duplicate job, a crashed sender lease, exact retry
exhaustion, first-send gate provenance that cannot be upgraded, unverified and
`NULL` provenance claim denial in every state (including a `NULL` uncertainty
marker), unverified and verified racing claims, claims after a later 429
exhaustion, retry-after floors and strict HTTP-date formats, prior-effect
lease/claim refusal, and a concurrent stage-event insert against lease
insertion. They also cover the rule that a claimed/running attempt is never
re-leased or repeated. The restart proof reconstructs application stores on the same
persistent test database; it is a **simulated Worker restart**, not an actual
Cloudflare deployment/process eviction. The Neon HTTP transport and GitHub API
are synthetic in that test. Live OIDC/workflow, browser, deployment and production
verification remain separate gates.
