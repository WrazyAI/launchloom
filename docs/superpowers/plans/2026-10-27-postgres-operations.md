# Postgres Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store new private intakes and generation operations in Postgres, with durable dispatch, authenticated execution tracking and separately accessible legacy history.

**Architecture:** The Worker is the authenticated boundary around a Postgres operations store. The invitation Durable Object and Postgres use a fail-closed acceptance handshake; a scheduled outbox dispatcher and fenced run claims coordinate GitHub Actions, while existing revision/publication DOs and private client Git repositories remain authoritative in their domains. New and legacy records have separate dashboard views.

**Tech Stack:** Cloudflare Worker and SQLite Durable Objects, existing `@neondatabase/serverless` 1.2.0, Postgres, GitHub Actions OIDC, TypeScript, React, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-27-postgres-operations-design.md`

## Global Constraints

- This plan authorizes neither implementation nor production deployment by itself. Obtain plan and execution approval; production activation is a separate approval.
- Postgres is authoritative only for new intake/request/attempt/stage records; no bulk history migration or competing dual-write authority.
- Preserve invitation semantics, existing receipt outbox, private client repositories, reviewed SHA, revision/publication DO coordination, and all quality and release gates.
- Never expose intake payloads, signed URLs or credentials in public GitHub inputs, job names, logs or artifacts. GitHub workflows never receive a database credential.
- DB unavailable before commit means no acceptance; GitHub unavailable after acceptance means `waiting_to_start`; uncertain ownership or effects mean `attention`, not blind retry.
- Validate migrations against an isolated, explicitly identified non-production Postgres database. Never infer production project identity or print connection strings.
- No production fallback to issue payloads without explicit confirmation that the destination and recovery path are private and safe.

## Review Focus

1. DB commit succeeds but DO confirmation or its response fails: retry returns the same intake and dispatch remains blocked until confirmation (Task 2).
2. GitHub accepts a dispatch but the response is lost: duplicate runs must not both pass claim or repeat side effects (Tasks 3–4).
3. A different public-repo workflow or untrusted ref obtains an OIDC token: it cannot read or claim an intake (Task 4).
4. A terminal attempt receives a late event, retry or cancellation observation: no false success or status regression (Task 5).
5. A legacy request remains in flight during cutover or rollback: it keeps its original routing and remains visible without writing legacy history (Tasks 6–7).

## File map and boundaries

- `db/operations/001-operations.sql`: relational schema, constraints, controlled grants and transaction functions, following `db/admin/001-membership.sql` conventions.
- `worker/src/operations/{contracts,store,acceptance,dispatch,github-auth,reconcile}.ts`: typed domain, DB boundary, cross-store handshake, scheduled dispatch, OIDC verification and GitHub reconciliation respectively.
- `worker/src/onboarding-invites.ts`, `worker/src/index.ts`, `wrangler.jsonc`: preserve the legacy mode and add explicit versioned routing, DO handshake and a scheduled entry point.
- `.github/workflows/generate-client.yml`, `scripts/operations-client.mjs`, intake-reading scripts and tracking scripts: authenticate, claim, fetch and emit events for new mode while retaining legacy behavior.
- `worker/src/admin/workspace-api.ts`, `src/lib/admin-contracts.ts`, `src/admin/`: current operations and read-only legacy UI.
- `worker/test/operations-*.test.ts`, `tests/operations-*.test.ts`, plus existing onboarding, workflow, revision and publication suites: focused and regression coverage.

## Task 1: Relational store and role boundary

**Files:** Create `db/operations/001-operations.sql`, `worker/src/operations/contracts.ts`, `worker/src/operations/store.ts`, `tests/operations-migration.test.ts`, `worker/test/operations-store.test.ts`.

**Interfaces:** Export `OperationsStore` with `createAcceptance(input: AcceptanceInput): Promise<AcceptanceResult>`, `confirmAcceptance(intakeId: string): Promise<void>`, `getIntake(intakeId: string): Promise<IntakeRecord | null>`; `AcceptanceResult` includes `intakeId`, `requestId`, `attemptId`, `operationId`, and `created`. Define these records and `CostKind = 'actual' | 'estimated' | 'unreported'` in `contracts.ts`. Inject the SQL transport as in `worker/src/admin/membership-store.ts`.

- [ ] Write tests asserting same invite/submission/fingerprint returns identical IDs and `created: false`; a changed fingerprint fails; concurrent creates yield exactly one row set; inserted outbox state is `blocked_unconfirmed`; `unreported` cannot have a made-up amount.
- [ ] Run `npx vitest run tests/operations-migration.test.ts` and `npx vitest run --config vitest.worker.config.ts worker/test/operations-store.test.ts`; expect failure because the new schema/store are absent.
- [ ] Add clients, intakes, requests, attempts, events and outbox tables with uniqueness, foreign keys, deterministic indexes, decimal cost and explicitly scoped operations role. Implement the store using a single DB transaction for acceptance; confirmation changes the acceptance and outbox eligibility atomically. Never include network calls inside SQL transactions.
- [ ] Repeat both commands and `npm run check:worker`; expect zero failures. Run the SQL integration cases against a disposable non-production Postgres DB and explicitly report whether those cases ran; mocked tests alone do not prove transaction semantics.
- [ ] Commit the named files with `git add db/operations/001-operations.sql worker/src/operations/contracts.ts worker/src/operations/store.ts tests/operations-migration.test.ts worker/test/operations-store.test.ts` and `git commit -m "feat: add operational postgres store"`.

## Task 2: Invite-to-Postgres acceptance handshake

**Files:** Create `worker/src/operations/acceptance.ts`, `worker/test/operations-acceptance.test.ts`; modify `worker/src/onboarding-invites.ts`, `worker/src/index.ts`, `worker/test/onboarding-invites.test.ts`.

**Interfaces:** Export `acceptIntake(input: AcceptanceInput, deps: AcceptanceDependencies): Promise<AcceptanceResult>` using Task 1 `OperationsStore`; dependencies include a typed invite reservation/confirmation adapter. Persist a routing mode at reservation so retries do not switch paths across flag changes.

- [ ] Write tests for DB failure before commit (no success or consumed invite), lost DB response, committed intake with failed DO confirmation (outbox blocked), DO success followed by failed Postgres confirmation, expired reservation with unknown DB state (fail closed), duplicate retry (same IDs), and changed submission (409). Assert a confirmed new intake queues the existing idempotent receipt separately and never creates a GitHub intake issue.
- [ ] Run `npx vitest run --config vitest.worker.config.ts worker/test/operations-acceptance.test.ts`; expect failure.
- [ ] Implement reserve → Postgres commit → exact-ID/fingerprint DO confirmation → Postgres eligibility confirmation. Add bounded recovery of unconfirmed handshakes, including after lease expiry, without releasing uncertain ownership. Keep legacy route for already-reserved legacy submissions; new path defaults off.
- [ ] Run the new test and `npx vitest run --config vitest.worker.config.ts worker/test/onboarding-invites.test.ts`; expect all pass. Test concurrent requests against real non-production Postgres, not only fake SQL.
- [ ] Commit only Task 2 files as `feat: persist accepted intakes safely`.

## Task 3: Durable dispatch and run ownership

**Files:** Create `worker/src/operations/dispatch.ts`, `worker/test/operations-dispatch.test.ts`; modify `worker/src/operations/store.ts`, `worker/src/index.ts`, `wrangler.jsonc`.

**Interfaces:** Add `leaseDispatch(now: number): Promise<LeasedDispatch | null>`, `recordDispatchResult(operationId: string, fence: number, result: DispatchResult): Promise<void>` and `claimRun(operationId: string, run: RunIdentity): Promise<'claimed' | 'duplicate' | 'attention'>` to `OperationsStore`; `RunIdentity` consists of trusted `repositoryId`, `runId`, and `runAttempt`.

- [ ] Write tests for blocked items never leased, GitHub outage yielding `waiting_to_start`, scheduled wakeup after a restart, lease fencing, lost accepted response, two duplicate runs racing to claim (one winner), and unknown prior side effects (attention; no takeover).
- [ ] Run `npx vitest run --config vitest.worker.config.ts worker/test/operations-dispatch.test.ts`; expect failure.
- [ ] Implement a scheduled Worker trigger that leases only confirmed entries and retries safely. Use DB locks and fencing; make the GitHub API call outside the DB transaction. On an ambiguous dispatch, preserve unknown state and permit duplicate dispatch only with Task 4 claim gate before side effects. Do not infer run identity from a dispatch response that does not supply one.
- [ ] Repeat the test and `npm run check:worker`; expect pass. Simulate cron invocation and worker restart with a persistent test DB. Document the chosen cron interval and bounded backoff in `docs/operations-recovery.md`.
- [ ] Commit Task 3 files and recovery documentation as `feat: schedule and fence generation dispatch`.

## Task 4: OIDC claims and new-mode workflow

**Files:** Create `worker/src/operations/github-auth.ts`, `scripts/operations-client.mjs`, `worker/test/operations-github-auth.test.ts`, `tests/operations-workflow.test.ts`; modify `.github/workflows/generate-client.yml` and the intake-loading code identified in Task 7 inventory.

**Interfaces:** Export `verifyRunIdentity(token: string, policy: WorkflowPolicy): Promise<RunIdentity>` and provide `POST /api/internal/operations/claim` and `GET /api/internal/operations/intakes/:id`; claim binds the verified run to the outbox operation; intake access requires the winning claim. The client script exposes `claim`, `intake`, and `event` commands without printing intake content.

- [ ] Write tests denying invalid signature, issuer, audience, expiration, repository ID, workflow path/ref, event type, stale run attempt and forged body run ID; allow only the configured trusted main workflow/event and matching claimed operation. Assert duplicate claims exit before model calls, client repository creation, deployment or payload fetch; assert public run names/payload contain opaque IDs only.
- [ ] Run `npx vitest run tests/operations-workflow.test.ts` and `npx vitest run --config vitest.worker.config.ts worker/test/operations-github-auth.test.ts`; expect failure.
- [ ] Implement JWT verification against GitHub's current published OIDC keys, allowlist the deployment's actual immutable repository ID and approved workflow/ref/event, validate standard time/audience/issuer claims and derive run identity exclusively from verified claims. Add `id-token: write` only to the necessary job. Fail closed when keys/claims are unavailable. Legacy issue-driven workflows keep existing path; new mode claims before side effects and retrieves the payload through the Worker.
- [ ] Repeat both tests and `npm run check:worker`; expect pass. Verify claims against a synthetic non-production workflow token before enabling staging; never print the token. GitHub claim reference: https://docs.github.com/en/actions/reference/security/oidc.
- [ ] Commit Task 4 files as `feat: authorize postgres generation runs`.

## Task 5: Stage events, terminal reconciliation and operator recovery

**Files:** Create `worker/src/operations/reconcile.ts`, `worker/test/operations-reconcile.test.ts`, `tests/operations-events.test.ts`; modify `worker/src/operations/store.ts`, `scripts/operations-client.mjs`, `scripts/record-generation-event.mjs`, `.github/workflows/generate-client.yml`.

**Interfaces:** Add `appendEvent(attemptId: string, run: RunIdentity, event: StageEvent): Promise<'inserted' | 'duplicate'>` and `reconcileAttempt(attemptId: string): Promise<'updated' | 'unchanged' | 'attention'>`. The server derives the run identity from Task 4 authentication; event IDs are stable per attempt/stage/transition/occurrence.

- [ ] Write tests for duplicate events, late stage update after terminal outcome, wrong-run callbacks, lost terminal callback, GitHub cancellation/failure, successful GitHub run without preview handoff (not preview-ready), authenticated valid handoff, and estimated/unreported cost rollups. Verify unknown dispatch correlation stays attention.
- [ ] Run `npx vitest run tests/operations-events.test.ts` and `npx vitest run --config vitest.worker.config.ts worker/test/operations-reconcile.test.ts`; expect failure.
- [ ] Implement sanitized event ingestion, scoped owner fencing, non-regressing terminal state, scheduled GitHub reconciliation and audited authorized-admin resolution. Only allow retry/ownership transfer when prior run termination and relevant side effects are proven. Emit alerts for aging, failed or incomplete attempts and never infer success from missing evidence.
- [ ] Repeat both tests; verify no PII or tokens in simulated logs, failure details or public event payloads. Run `npm run check:worker`; expect pass.
- [ ] Commit Task 5 files as `feat: reconcile generation operations`.

## Task 6: Current dashboard and separate legacy view

**Files:** Modify `worker/src/admin/workspace-api.ts`, `src/lib/admin-contracts.ts`, relevant components under `src/admin/`; create `worker/test/operations-dashboard.test.ts`, `tests/operations-dashboard.test.ts`.

**Interfaces:** Add authenticated, paginated new-operations list/detail API backed by Task 1 store; keep existing ledger endpoints behind an explicitly read-only legacy endpoint/view. Responses include stable IDs, status, last observation time, cost kind and `telemetryIncomplete`.

- [ ] Write tests for current records versus separately labelled legacy records; stable pagination; no legacy writes; no private data to unauthenticated/unauthorized callers; waiting/attention versus verified preview; unknown cost; active legacy request routed to legacy backend after mode switch.
- [ ] Run `npx vitest run tests/operations-dashboard.test.ts` and `npx vitest run --config vitest.worker.config.ts worker/test/operations-dashboard.test.ts`; expect failure.
- [ ] Implement the new view and a dedicated Legacy History page without changing existing revision or publication controls. Use existing admin sessions and authorization; no direct browser-to-DB connection. Surface recovery reason and audited operator action only to authorized admins.
- [ ] Repeat both tests, `npm run build:admin` and `npm run check:worker`; expect pass. Verify desktop and mobile dashboard with synthetic data and record screenshots, status transitions, authorization and overflow results.
- [ ] Commit Task 6 files as `feat: show operational and legacy history`.

## Task 7: Issue-independent integration and controlled cutover

**Files:** Modify exact issue-dependent modules identified below, `docs/operations-recovery.md`, `docs/generation-tracking.md`; create `tests/operations-integration.test.ts`.

**Interfaces:** New-mode scripts consume `{ intakeId, requestId, attemptId, operationId }`; legacy mode retains its existing numeric issue interface. Never invent an issue number. APIs and DB operations use the preceding task contracts.

- [ ] Inventory dependencies with `rg -n 'issueNumber|ISSUE_NUMBER|client_payload.issue|inputs.issue|FEEDBACK_ISSUE' .github/workflows scripts worker/src`; trace intake, client repo creation, review links, notification, stage events and recovery. Record each exact module and legacy/new-mode owner in `docs/operations-recovery.md` before changing it.
- [ ] Write a synthetic end-to-end integration test: accepted new intake → scheduled dispatch → authenticated winning claim → stage events → verified preview handoff → dashboard; assert no issue payload/PII in public workflow inputs, no double execution under ambiguous dispatch, and old legacy requests continue using their stored mode. Include DB/GitHub outages and rollback with an active attempt.
- [ ] Run `npx vitest run tests/operations-integration.test.ts`; expect failure. Adapt every inventoried dependency for the new ID-based contract and retain legacy compatibility; no external effects before claim. Add runbook for stalled intake, fencing, provider reconciliation, safe rollback and explicit admin approval.
- [ ] Run focused new tests, `npm run test:worker`, `npm test`, `npm run check:worker`, `npm run check`, `npm run build`, and existing revision/publication suites. Record exact output, plus synthetic staging/browser evidence; do not claim production verification from local tests.
- [ ] In an isolated non-production environment, exercise actual scheduler, OIDC identity, DB restore and GitHub run correlation with synthetic data. If project credentials, retention policy, staging target, actual scheduler or safe correlation are not verified, stop with an exact blocker; do not provision or call paid providers without authorization.
- [ ] Commit Task 7 files as `feat: integrate postgres intake workflow`. Obtain a separate explicit approval before any production migration, flag change or deployment. Before activation verify backup/restore and retention, classify/drain legacy in-flight work, and confirm a rollback that preserves accepted new records. Do not push `main` merely to publish this plan.

## Self-review and handoff

The seven tasks cover the approved spec's storage, cross-store handshake, dispatch/claim, authentication, events/reconciliation, legacy UI and cutover. Fault cases are assigned above. No task authorizes changing release gates, purging data, real client intake, paid generation or production rollout. Review Task 4 OIDC and Task 7 all issue-based consumers against actual code at implementation time; if assumptions do not hold, stop rather than inventing compatibility.
