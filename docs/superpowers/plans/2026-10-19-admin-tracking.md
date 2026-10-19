# Admin Tracking and History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve every retained generation execution and its verified actors, costs and failures without disrupting the current intake pipeline.

**Architecture:** Add attempt/client/event/query tables to existing SQLite Durable Objects, expose new paginated APIs beside legacy APIs, and correlate outbox requests with GitHub execution identity. Independent reconciliation recovers outcomes missed by best-effort callbacks. Existing generation summary and R2/hero contracts remain available.

**Tech Stack:** TypeScript, Cloudflare Durable Objects SQLite, existing Node ESM scripts, GitHub Actions REST APIs, Vitest Worker tests.

**Spec:** `docs/superpowers/specs/2026-10-19-admin-workspace-design.md`; execution/contract index `docs/superpowers/plans/2026-10-19-admin-workspace.md`.

## Global Constraints

- All authorized admins see all clients, invitations and generation attempts.
- Invitation creator and generation initiator are separate attributions.
- No failed attempt disappearing because a later attempt succeeds.
- No invented historical actors, failure reasons, costs or progress.
- No new one-click generation/rerun controls; reconciliation cannot dispatch work or send mail.
- Preserve legacy summaries/heroes, outbox idempotency and public/review security. Master Global Constraints and shared wire types apply verbatim.

## Review Focus

1. Duplicate/reordered callbacks must not change the immutable client/actor/workflow binding or revive a reconciled terminal execution (Tasks 1/3).
2. Rerun attempt two and reusable workflow callbacks must not become one row or two duplicate rows (Tasks 1/3).
3. Duplicate client emails/names and queued submissions with no issued preview must remain distinct and visible (Task 2).
4. More than 200 attempts/100 invitations, cursor ties and filter changes must not hide records or corrupt counts (Tasks 1/2).
5. Near-miss delivery, redacted failure reasons, missing historical costs and provider/API outages must remain honest, not zero/pass/diagnosis guesses (Tasks 1/3).

## Task 1: Add the attempt contract and persistent query model

**Files:** Create `src/lib/admin-contracts.ts`, `worker/src/generation-attempts.ts`, `worker/test/admin-attempts.test.ts`; modify `worker/src/generation-ledger.ts`; test existing `worker/test/generation-ledger.test.ts`.

**Interfaces:** Shared actor/status/query types are the exact master definitions. Add `AttemptInput` with `{attemptId,requestId,clientId,issueNumber,profile,initiator,invitationCreator,repository,runId,runAttempt,executionStatus,deliveryStatus,stale,createdAt,startedAt,completedAt,updatedAt,failure}`; IDs/bindings are nullable only before verified association. Times are numbers except nullable started/completed timestamps. `Failure` is `{category,stage,summary,evidenceUrl,nextStep}` with string|null fields. Produce ledger RPCs `upsertAttempt(input:AttemptInput):Promise<{attemptId:string,created:boolean}>`, `getAttempt(id:string):Promise<AttemptDetail|null>`, `listAttempts(filters:AttemptFilters):Promise<Page<AttemptSummary>>`, `recordAttemptEvents(id:string,events:AttemptEventInput[]):Promise<{recorded:number}>`, `getHealth():Promise<Health>`. `AttemptSummary` carries the attempt fields plus `costs:{actualUsd:number|null,estimatedUsd:number|null,unreportedCount:number}`; `AttemptDetail` adds first `events:AttemptEventRecord[]`, `eventsNextCursor:string|null` and `eventCount:number`. `AttemptEventInput` extends the legacy event shape with `observedAt:number`, `source:'callback'|'github-reconcile'|'legacy-import'`; `AttemptEventRecord` adds `attemptId:string,updatedAt:number`. Event pages default/max 50/100. `getAttemptEvents(id:string,cursor?:string,limit?:number):Promise<Page<AttemptEventRecord>>` avoids the old 400-event truncation.

- [ ] **Step 1: Write failing Worker tests.** Use a unique `env.GENERATION_LEDGER.getByName()` in each test. Define a local `attempt(overrides:Partial<AttemptInput>={}):AttemptInput` fixture with nullable queue bindings, explicit synthetic actors and all required fields; it is test support, not production inference. Core assertions:

```ts
it('retains a failed execution after a successful rerun', async () => {
await ledger.upsertAttempt(attempt({attemptId:'q-1',runId:'9001',runAttempt:1,executionStatus:'failed'}));
await ledger.upsertAttempt(attempt({attemptId:'q-2',runId:'9001',runAttempt:2,executionStatus:'succeeded'}));
expect((await ledger.listAttempts({})).total).toBe(2);
expect((await ledger.getAttempt('q-1'))?.executionStatus).toBe('failed');
});
```

Also add exact cases: repeated `(repository,runId,runAttempt)` returns one canonical ID; conflicting creator/client/workflow binding returns conflict; `failed+diagnostic` retains both fields; no costs yields `actualUsd:null`, not zero; duplicate same-attempt cost key updates once while different attempts each retain their own cost; late running callback after terminal GitHub result does not revive it; 251 attempts and 451 events are reachable once across cursor pages, including identical timestamps. Reject a cursor reused with different filters.
- [ ] **Step 2: Run** `npx vitest run --config vitest.worker.config.ts worker/test/admin-attempts.test.ts`; expect absent RPC/type/schema failures.
- [ ] **Step 3: Implement** pure contract types and additive tables/indexes owned by `GenerationLedger`. Tables: `generation_attempts`, `generation_dispatches`, `attempt_events`, `admin_sync_state`; unique executed identity on `(repository,run_id,run_attempt)` when bound, dispatch primary key `request_id` with immutable `initial_attempt_id`, nonunique request references on attempts, and indexes for client/date/status/actor. Keep explicit lifecycle/execution outcomes separate. Cursor order `(created_at DESC,attempt_id DESC)` is immutable; filters/counts use the same SQL predicates. Apply observations monotonically by per-source/version: authoritative GitHub terminal outcome wins over older callback progress; newer explicit delivery evidence may update delivery without changing execution. Reject immutable identity edits after their one-time binding; filling queued `startedAt` does not reorder the cursor. Preserve original legacy methods and tables untouched; migrations survive re-entry/restart.
- [ ] **Step 4: Run** the new and existing ledger suites, then `npm run check:worker`; expect all tests and checks green with no legacy behavior relaxed.
- [ ] **Step 5: Commit** these paths with `git commit -m "feat(admin): retain immutable generation attempts and costs"`.

## Task 2: Link accepted clients, creator attribution and durable queued work

**Files:** Create `worker/src/admin/workspace-api.ts`, `worker/test/admin-workspace-api.test.ts`; modify `worker/src/onboarding-invites.ts`, `worker/src/generation-attempts.ts`, `worker/src/index.ts`, `worker/test/onboarding-admin.test.ts`, `worker/test/onboarding-invites.test.ts` (existing outbox tests live here).

**Interfaces:** `InviteRegistration` gains optional immutable `creator:ActorSnapshot`; legacy absence becomes unknown. Produce coordinator RPCs `listPage({cursor?,limit?,search?,status?,creatorId?}):Promise<Page<InviteSummary>>` and `acceptedPage({cursor?,limit?}):Promise<Page<AcceptedIntake>>`; `AcceptedIntake` contains verified invitation/submission/issue/client/business references, creator, submission timestamp and outbox state. Produce ledger `upsertClient(input:ClientInput):Promise<ClientRecord>`, `listClients(query:ClientFilters):Promise<Page<ClientRecord>>`, `getClient(id):Promise<ClientRecord|null>`, and `registerDispatch(input:DispatchRequest):Promise<{attemptId,requestId}>`. `ClientRecord` has stable ID, exact invite/submission/issue bindings, verified display/contact fields, creator and lifecycle links; `ClientFilters` mirrors search/date/cursor/limit. Expose authenticated GET `/workspace/{attempts,clients,invites,health}` plus detail/event URLs `/workspace/attempts/:id[/events]` and `/workspace/clients/:id`; response detail uses `{attempt}`/`{client}`, list uses `Page<T>`. Existing invite mutation route remains unchanged.

- [ ] **Step 1: Write failing tests.** Assert a server Access-verified creator (not `body.creator`) is persisted; a client submission produces `initiator.kind==='client'` while retaining creator; two same-email submissions with different verified references yield distinct clients; accepted submission with failed/pending dispatch appears with no invented preview. Query as two allowed synthetic admins and assert equal unfiltered record IDs. Seed 151 invitations/251 clients and page/search beyond legacy limits. Test recovery actor/operation attribution without rewriting the original submitter or duplicating an existing outbox operation.

```ts
it('distinguishes client initiation from invitation creation', async () => {
  // Setup submits one invite through the real synthetic intake handler.
  const detail = await ledger.getAttempt(queuedAttemptId);
  expect(detail?.initiator.kind).toBe('client');
  expect(detail?.invitationCreator.id).toBe(verifiedInviter.id);
  expect(detail?.deliveryStatus).toBe('none');
});
```
- [ ] **Step 2: Run** `npx vitest run --config vitest.worker.config.ts worker/test/admin-workspace-api.test.ts`; expect missing actor/client/page behavior to fail.
- [ ] **Step 3: Implement** new queries and client snapshots/outbox fields additively. Capture verified business/contact snapshot at acceptance/recovery; existing records may require verified issue readback, never guessed business names. `clientId='submission:'+submissionId`; verified legacy unmatched issue uses `legacy-issue:<number>`, reconciled only by explicit references. Persist dispatch correlation on the same outbox operation before network send, carry `attempt_id`, `request_id`, `submission_id`, `invite_id` in repository dispatch, and project accepted client/queued attempt through a new `intake_projection_outbox` table. Do not add an unsupported task type to the existing workflow/receipt CHECK constraint or recreate/drop that table. Add the typed `GENERATION_LEDGER` binding to `OnboardingInvitesEnvironment`; schedule alarms across both outboxes without starving existing deliveries. Failure of projection does not prevent workflow/receipt tasks. Store projection health and independently reconcile accepted pages; while projections are incomplete, the client API/UI must mark coverage partial, never silently claim a complete/empty directory. Existing dispatch retries reuse request ID; verified workflow attempt >1 gets a new row. Ignore browser actor/role inputs. Until Accounts integration, centralize verified legacy principal creation from `accessAdminEmail`, with source-marked stable `access:<sha256(lowercase email)>` ID; no user-claimed owner role.
- [ ] **Step 4: Run** affected Worker suites and `npm run check:worker`; prove original invite create/copy-once/revoke/expiry, duplicate-intake protections, recovery confirmation and outbox retries still pass. Invalid/anonymous/cross-origin requests remain denied. Read-only new APIs must not create GitHub issues, dispatches or client emails.
- [ ] **Step 5: Commit** with `git commit -m "feat(admin): connect accepted clients and verified activity attribution"`.

## Task 3: Record all profiles and reconcile missing/terminal/history evidence

**Files:** Create `scripts/generation-tracking-contract.mjs`, `scripts/reconcile-generation-history.mjs`, `.github/workflows/reconcile-generation-history.yml`, `tests/admin-generation-tracking.test.ts`, `tests/admin-history-reconciliation.test.ts`; modify `scripts/record-generation-event.mjs`, `scripts/generation-cost-summary.mjs`, `scripts/run-pipeline-test.mjs`, `.github/workflows/{generate-client,test-generation,publish-site,process-client-feedback,process-feedback}.yml`, `worker/src/admin/workspace-api.ts`, `worker/src/index.ts`. Extend existing script tests rather than replacing them.

**Interfaces:** Produce `buildAttemptObservation({repository,runId,runAttempt,requestId?,profile,issueNumber?,triggeringActor,executionStatus,deliveryStatus,observedAt,failure?}):AttemptObservation` in the script contract; `AttemptObservation` contains those normalized wire fields with absent associations explicit null and `source:'callback'|'github-reconcile'|'legacy-import'`. Worker resolves authoritative client/creator/initiator bindings, producing Task 1 `AttemptInput`; it never accepts a caller-chosen profile role. Extend the existing tracking CLI with `--run-id`, `--run-attempt`, `--request-id`, `--attempt-id`, `--profile`, `--execution-status`, `--delivery-status`, `--triggering-actor`, `--observed-at`; no flag silently changes legacy semantics. New internal POST `/api/internal/generation-attempts` accepts `{observation,events}` behind the existing tracking secret, tight schema/size limits and immutable run binding. Reconcile endpoint `/api/internal/generation-reconciliation` accepts a verified page batch plus checkpoint/health. Produce `reconcileGenerationHistory({mode:'incremental'|'backfill',from,dryRun,pageBudget:10,deadlineMs:90000,fetchImpl,postImpl,checkpoint}):Promise<ReconcileReport>` exported for offline tests; `ReconcileReport={complete:boolean,nextCheckpoint:string|null,coverageStart:number|null,readCount:number,upsertCount:number,warnings:string[],errors:string[]}`. `--dry-run` performs no remote writes/checkpoint changes; writing its requested local report is allowed.

- [ ] **Step 1: Write failing fixture tests.** Input runs covering early setup failure, prerequisite failure, cancellation, attempt two, focused reusable workflow, duplicate pages, failed-with-diagnostic, expired evidence, API 403/429 and malformed/redacted job text. Assert one row per executed identity, proper terminal state, no invocation of a dispatch/mail API, unknown historical reason/cost/actor stays null/source-marked, and no signing token survives summaries/URLs. Two deterministic repeated runs produce identical totals/checkpoints with no duplicate events. Parent/reusable callbacks share one attempt. An unmapped GitHub login remains `kind:'github'`; it is not guessed into an admin.

```ts
it('keeps workflow failure separate from diagnostic delivery', () => {
  const observation = buildAttemptObservation({repository:'WrazyAI/launchloom',
    runId:'9001',runAttempt:2,profile:'creative-only',triggeringActor:'qa-operator',
    executionStatus:'failed',deliveryStatus:'diagnostic',observedAt:1000});
  expect(observation.executionStatus).toBe('failed');
  expect(observation.deliveryStatus).toBe('diagnostic');
  expect(observation.runAttempt).toBe(2);
});
```
- [ ] **Step 2: Run** `npx vitest run tests/admin-generation-tracking.test.ts tests/admin-history-reconciliation.test.ts`; expect the new contract/reconciler tests to fail before implementation.
- [ ] **Step 3: Implement** attempt observations for all generation profiles. Keep client lifecycle events in revision/publish workflows but never use them to rewrite attempt execution outcomes. Add a machine-parseable `run-name` to both entry workflows containing only validated numeric issue, known profile and optional random request correlation ID (no names/emails/tokens). This lets independent GitHub metadata reads recover routing even if checkout/setup fails; legacy runs without metadata remain unassociated unless verified evidence exists. Parse/cross-check this metadata against persisted request/issue/profile and known workflow/repository IDs; never match by elapsed time alone. Use per-attempt job/step summaries and structured pipeline report failures when available; do not scrape raw private logs into the dashboard. Reconcile `generate-client.yml` and `test-generation.yml` executions only, exclude access-only and avoid counting called workflows twice. Independent workflow uses `workflow_run: completed`, a 10-minute schedule and a manual backfill that defaults to dry-run, with `actions:read,contents:read`, checkout of trusted default-branch reconciliation code (never the triggering PR SHA), no client-repo code execution. POST only verified known repository/workflow IDs, use bounded retry for 429/5xx, persist cursor/health on real runs, and never advance a checkpoint past an unread page. Use overlap windows so updates older than the last poll are recovered. Keep scheduled writes disabled until master Task 11; permission to read history is not permission to run a generation.
- [ ] **Step 4: Run** all new/affected script and Worker suites, `npm run check`, `npm run check:worker`, and workflow syntax/contract tests. Run a fixture-only CLI dry run and verify zero POSTs/dispatch/mail/provider actions. A real retained-history read/backfill is reserved for master Task 11, not this test step.
- [ ] **Step 5: Commit** with `git commit -m "feat(admin): reconcile generation attempts and missed failures"`. This slice can be reviewed/deployed behind existing Access while legacy UI remains functional; do not enable scheduled real backfill before authorized rollout.
