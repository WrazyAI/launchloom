# Postgres operational records design

**Status:** User approved on 2026-10-27. Design only; no production migration is authorized.

## Purpose and decisions

LaunchLoom needs private, queryable operational records for new client intakes and generation activity, not a faster build system. Use Postgres as the authority for new intakes, generation requests, attempts, stage events and costs. The user accepts starting fresh without a bulk history migration, retaining existing records on a separate, clearly marked read-only Legacy History page. Retain GitHub Actions for execution, private client Git repositories for artifacts, Cloudflare Pages for deployments, existing assets storage, and Durable Objects (DOs) for revision and publication coordination. Intake acceptance must survive a GitHub outage: acknowledge only a durably saved intake, display waiting-to-start, and retry dispatch safely.

Default design choices below are proposed by the designer, not additional user decisions. No live project, database connection or deployed configuration was inspected as part of this design. Existing source includes Neon-backed admin membership (`worker/src/admin/membership-store.ts`), a SQLite DO ledger (`worker/src/generation-ledger.ts`, `worker/src/generation-attempts.ts`), invite and dispatch outboxes (`worker/src/onboarding-invites.ts`) and a GitHub issue intake adapter (`worker/src/index.ts`, `worker/src/intake-recovery.ts`). Confirm deployed configuration and actual private/public issue routing before cutover; do not infer exposure from source alone.

## Boundary and authority

| Concern | First-release authority | Change |
| --- | --- | --- |
| Admin authentication and authorization | Existing admin auth and membership | Reuse; no auth migration. Verify production database and roles before selecting a target. |
| New clients, submissions, attempts, stages, costs, dispatch | Postgres | New relational operational store. |
| Legacy intake, generation and dashboard history | Existing DO/issue sources | Separate read-only legacy view. No bulk import or automatic redelivery. |
| Invite token, lifecycle, rate limits | Existing `OnboardingInvites` DO | Keep, with explicit cross-store acceptance handshake. |
| Execution outcome | GitHub Actions, observed and projected into Postgres | Postgres is authority for recorded operational state, not proof that unobserved GitHub activity did not occur. |
| Client source, approvals, revision/publication ordering | Private client Git repo and existing revision/publication DO | Unchanged. Postgres stores links and observations, not release authorization. |
| Assets and screenshots | Existing asset/object stores | Store references and metadata, not asset bytes, in Postgres. Existing legacy thumbnail remains accessible in legacy view. |

No GitHub issue is needed for **new** intake payloads. Workflows pass opaque identifiers and obtain details via a protected Worker API. Existing issue-dependent scripts, recovery, client creation, email, audit, review links and dashboard routes must be adapted to an intake reference; they must not fabricate an issue number or silently assume one exists. No client PII, signed links, raw payloads, or credentials in public workflow inputs, job names, logs, or public artifacts.

## Model and contract

Create an application-owned operations schema in the existing managed Postgres project only after confirming the correct environment, access, recovery policy and capacity. Use migration files, least-privilege roles and an isolated development branch/database; no production credentials in workflow code. Suggested entities:

- `clients`: opaque client ID and minimal identity metadata; explicitly linked to submissions, with no email-as-unique-identity assumption.
- `intakes`: ID, client ID, invite ID and submission ID, normalized versioned private payload, payload fingerprint, consent/rights fields and received timestamp. Uniqueness on invite/submission binding; same ID and fingerprint returns the original result, changed payload is rejected.
- `generation_requests`: ID, intake ID, profile, request/idempotency key, current dispatch state and attribution. A new retry has its own request or explicit attempt; duplicate requests must not create accidental new work.
- `generation_attempts`: attempt ID, request ID, monotonically numbered logical attempt, workflow repository/run ID/run attempt when known, execution state, timestamps, terminal reason and reviewed artifact references. Unique keys for workflow identity and attempt number.
- `stage_events`: attempt ID, stable event ID/idempotency key, stage, transition, timestamps, sanitized detail, provider/model, currency and cost kind (`actual`, `estimated`, `unreported`) and amount when known. Unique per attempt/event. Use decimal money, never invent cost; retain revisions and out-of-order events without overwriting terminal outcomes.
- `dispatch_outbox`: operation ID, attempt ID, payload with opaque IDs, state, retry count, next attempt, lease/fencing version, and last sanitized error. Operations are uniquely keyed and transactional with their request.

Create indexes for client, request, status and recency, and event queries. Store controlled error classifications, not raw provider replies or client content in events. Define schema-versioned API contracts, ownership checks and validation before implementation. Admin pagination must be deterministic and access-controlled; users must not retrieve an intake by guessing its opaque ID.

## Acceptance and dispatch

1. The existing Worker validates the invitation, payload, bot and rights checks. The DO reserves the invite for the stable submission ID and normalized-payload fingerprint. An existing reservation is not consumed by unrelated submissions. Expiry never automatically frees an invite whose Postgres commit might have succeeded: reconcile the stable IDs first; if the DB cannot be checked or the outcome remains uncertain, fail closed and surface operator attention.
2. In **one Postgres transaction**, insert the private intake, request, initial attempt and a dispatch-outbox item in `blocked_unconfirmed` with stable IDs. A duplicate reservation reuses these records; a changed fingerprint fails. No network call occurs inside this transaction.
3. Confirm the DO reservation using the exact same IDs and fingerprint, then atomically mark the Postgres acceptance confirmed and the outbox eligible. The dispatcher selects only the explicit Postgres-confirmed state, never `blocked_unconfirmed`. This cross-store handshake is not atomic: persist enough information for a bounded, idempotent reconciler to finish a Postgres-committed but DO-unconfirmed acceptance and to unblock the outbox after DO confirmation. An unconfirmed reservation must not permit a second intake even after its lease expires; failures surface as operator attention rather than silently releasing ownership.
4. Only after DO confirmation and its durable Postgres confirmation may the Worker acknowledge acceptance. On an uncertain response, retry with the same submission ID and return the previously committed result after reconciling; while reconciliation is unresolved, return a safe retry/attention response without asking for a new submission. If Postgres is unavailable before commit, do not claim receipt or consume the invite. Do not dispatch until confirmation is durable in Postgres.
5. A durable scheduled dispatcher leases eligible outbox items from Postgres with bounded retry/backoff, fencing and operator-visible terminal attention. The runner must wake again after crashes and quiet periods; configure and test an actual scheduled trigger rather than relying on an incoming request. GitHub downtime leaves the record `waiting_to_start`. Do not hold a database transaction open during the GitHub API call.
6. A successful or ambiguous GitHub dispatch response does **not** establish exactly-once execution. Every workflow, including duplicates, calls a protected claim endpoint with operation ID, GitHub run ID and run attempt before any intake read, model call, repo/Pages creation, or other side effect. Only the elected owner proceeds. Duplicate dispatches exit safely; callbacks are fenced by owner/run identity. A missing or expired claim is reconciled against GitHub before retry or ownership transfer. Do not automatically take over an execution whose liveness or side effects are unknown; mark attention when safe ownership cannot be established.

Idempotency keys, authenticated caller identity, bounded leases, visibility of unknown dispatch outcomes and reconciliation are required even though the outbox itself is transactional. GitHub scheduling is not an ordering guarantee. Receipt email is a separate durable action with its existing deduplication semantics; acceptance must not promise an email was sent before provider confirmation.

## Workflow, updates and reconciliation

The workflow receives operation/request/attempt IDs only and authenticates to a Worker API using a narrowly scoped workload credential or verified GitHub identity. The API validates audience, expiry, workflow/repository and attempt ownership; identifiers are not bearer secrets. Use a bounded design compatible with GitHub's actual token claims and deployment environment, verified before implementation. Never give a public-repository workflow an unrestricted production database credential.

After claim, obtain the normalized payload over TLS and write stage events with stable keys. Restrict logs and artifacts, store only required details, and ensure a duplicate callback or late event cannot mutate a different attempt or regress terminal state. Stage write failures retry and alert; they cannot be silently presented as complete. Reconcile periodically against GitHub run/attempt state and stored run IDs, including dispatches whose response was lost, cancelled and failed jobs, and jobs that terminate before a final callback. Where no durable correlation can establish a unique run, display `attention`/unknown and require operator resolution rather than marking success or redispatching blindly. Reconciliation never bypasses release gates or invents stage evidence.

Existing Actions retries and manual creative-only dispatches need explicit classification: preserve distinct run attempts and input provenance, and keep internal diagnostics separate from real client requests. The dashboard shows receipt/dispatch, execution, stage progress and outcome separately, along with last-updated time and incomplete telemetry. For a full client generation, preview-ready requires the existing workflow's authenticated preview-ready/handoff event bound to the selected build and attempt after the existing build, deployment and verification gates. Missing handoff evidence remains unknown/attention even if GitHub reports success. Creative-only diagnostics use a separate outcome and cannot claim client preview delivery. Cost rollups preserve estimated/unreported distinctions.

## Security and operations

Use existing verified admin sessions and server-side authorization; the browser never connects directly to Postgres. Restrict operational DB permissions separately from the existing membership role, audit access and privileged changes, and avoid broad admin roles. Encrypt in transit and use the database provider's at-rest protections. Verify backup/restore and history windows for the selected plan; set retention/deletion policies for client payloads, logs and assets before production. Document what is retained in GitHub and private artifacts, and avoid copying intake contents into public issues or diagnostics. DB unavailability must fail intake safely, while an existing published site and unrelated revision/publication paths continue operating.

Alerts cover aged outbox entries, repeated failures, expired claims, unreconciled runs, DB failures, and incomplete event streams. Provide an authenticated operator view with reason, attempt/run correlation, last retry, safe retry/reconciliation controls and escalation instructions. Restrict resolution to an authorized admin and record the actor, timestamp, checked run/side-effect evidence and decision. Retry or ownership transfer requires evidence the prior execution is terminal and its external effects are reconciled, or an explicit safe recovery procedure for that exact effect; otherwise retain attention. Never offer a generic retry that can duplicate an in-flight build or release. Keep reporting access separate from the credentials that dispatch or deploy.

## Cutover and rollback

1. Inventory live source-to-destination dependencies and separately confirm production DB/role/backup readiness. Confirm which existing dashboard and downstream scripts require issue numbers and adapt contracts; verify actual intake routing without exposing private data.
2. Implement schema/API and tests in an isolated environment. Prove the DO-to-Postgres handshake, retries, reconciliation, authorization, legacy display, and existing release guarantees. No production state change at this step.
3. Enable new writes behind an explicit feature flag for a synthetic/staging intake. Use a non-production target and no real client dispatch. Compare DB state, UI and a controlled workflow; exercise outage and duplicate scenarios. Keep legacy reads separate and read-only.
4. Before production enablement obtain explicit authorization, snapshot/verify restore procedures, drain or classify in-flight legacy reservations and dispatches, and choose a cutover timestamp. Route each submission by its persisted creation mode; never switch ownership mid-submission. Legacy retries continue through the legacy path; new ones use Postgres. Do not dual-write competing authoritative state.
5. Monitor dispatch, callback and reconciliation health with an operator present. Retain old code and Legacy History. If rollback is needed, stop new admissions to the new path, reconcile already accepted Postgres requests and active workflows without discarding or duplicating them, then route future submissions to the approved fallback only after confirming its privacy and recovery properties. There is no automatic fallback to a public issue payload. Preserve new records and provide an operational read path throughout rollback.

## Acceptance evidence

- Same submission sent repeatedly, concurrent duplicates and changed payload: exactly one accepted intake/request and no mismatched invite consumption.
- Fault injection at every boundary: DB commit, DO confirmation, GitHub timeout before/after accepted dispatch, worker crash, lease expiry, duplicate run, failed callback and delayed event. Demonstrate no unsafe duplicate side effects; ambiguous outcomes enter attention.
- GitHub outage: accepted intake stays `waiting_to_start`, automatic dispatch resumes after recovery, no data loss; DB outage before commit does not falsely acknowledge.
- Cross-client authorization and credential misuse denied; tokens and intake payloads absent from public inputs, logs and artifacts. Test retention and restore.
- Real stage and terminal state match a controlled GitHub run, including failed and cancelled runs, missing callbacks and unreported costs. Success requires preview handoff evidence.
- New dashboard shows current records; separate legacy page remains readable and does not write to the old source. In-flight legacy runs remain recoverable.
- Existing client revision and publication order, approved-SHA checks and release/visual gates remain unchanged and tested. Production activation, user-visible browser verification and deployment require separate authorization.

## Open implementation discoveries

Identify the actual production Neon project and connectivity, scheduled dispatcher mechanism, supported run identity/claim mechanism and GitHub dispatch correlation, legacy issue-dependent interfaces, and required data retention with operators. Resolve these in the implementation plan and staging proof without assuming live system state. The design does not authorize database provisioning, credential changes, running generation, production cutover or deletion of history.
