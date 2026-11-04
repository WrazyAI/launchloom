# Observe-only Generation Activity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Repository instructions select one main implementer; do not dispatch implementers per task.

**Goal:** Make running generations inspectable inside the existing admin attempt inspector with honest stage, model, action, output and usage evidence.

**Architecture:** Add a private, bounded append-only trace alongside, not inside, authoritative lifecycle records. Instrument real model/orchestration boundaries, ingest with verified workflow ownership, and incrementally poll the existing inspector. Keep legacy and operation identities explicit and retain completed-response output semantics.

**Tech Stack:** Existing Node ESM scripts, TypeScript Cloudflare Worker, operations PostgreSQL with the existing parameterized Neon HTTP query interface, React admin, Vitest and Playwright. No new service or framework.

**Spec:** `docs/superpowers/specs/2026-11-03-generation-observability-design.md` (owner approved).

## Global Constraints

- Observe-only; no pause, stop, steering, approval controls, provider/model changes or new generation retries.
- Keep diagnostic trace events separate from lifecycle/cost authority; existing mandatory telemetry/handoff gates remain unchanged.
- Explicit identity namespace (`legacy` or `operations`) plus canonical attempt ID; never guess cross-store associations.
- Current transport is non-streaming: show “Waiting for model response”; output appears on response completion, never with fake streaming.
- Flush every 1s or 20 events; 3s request deadline; at most two transient-delivery retries; no fallback after authentication/validation rejection.
- Queue 1 MiB; batch 128 KiB; event 16 KiB; sanitized text 8 KiB; per attempt 10,000 events or 10 MiB before verbose-content cutoff.
- Visible active detail polling every 2s; up to 100 events/page; 500 entries in the feed window; no overlapping polls.
- Producer heartbeat approximately every 10s; warning after 30s; incomplete warning after 60s; silence does not fail generation.
- Diagnostic retention 30 days; actual deletion restricted to the new trace tables. Existing accounting/lifecycle retention unchanged.
- Positive payload allowlists and redaction before spool/transmission/storage; raw prompts, credentials, private contacts, reasoning and unrestricted logs/URLs excluded.
- Existing admin inspector only; no new top-level surface, renderer, intake field or client-facing artifact during convergence freeze.
- Beautiful UI informs scoped component styling, not a global dashboard restyle; honor keyboard, reduced motion, contrast and mobile requirements.
- No paid generation, production migration, merge or deployment is authorized by this plan. Obtain the relevant approval before those gates.

## Review Focus

- A delayed old-run packet must not attach to a rerun or the other namespace; verify at HTTP and database boundaries (Task 3).
- A process can die after a successful poll or before its flush; retain explicit producer-quiet/incomplete state, never imply work progressed (Tasks 4, 7).
- A secret after the display cutoff or inside model-produced code must not bypass redaction; oversize/unclassified content is withheld before truncation (Task 1).
- Concurrent append transactions can commit out of cursor order and lose events during catch-up; serialize partition cursor allocation with insertion (Task 2).
- Older-history loading and incoming events can evict selected evidence or double-count usage; stable identity, separate rollup and non-forcing follow behavior are required (Tasks 2, 7).

## File structure and shared interfaces

New focused modules:
- `src/lib/generation-activity.ts`: public-to-admin wire types only; no secrets or dependencies on Worker runtime.
- `scripts/generation-activity-contract.mjs` and `.d.mts`: runtime validation, bounded safe payload construction, shared constants and explicit ESM types.
- `scripts/generation-activity-client.mjs`: runner queue, sanitized spool, OIDC delivery and heartbeat.
- `scripts/generation-activity-context.mjs`: validated environment/semantic context and no-op disabled producer.
- `worker/src/generation-activity/{store,http}.ts`: SQL adapter and HTTP authorization/routing.
- `db/operations/008-generation-activity.sql`: additive tables and privileged atomic functions; recheck unused number before implementation.
- `src/admin/{GenerationActivity,ActivityInspector}.tsx`, `generation-activity.css`, `useGenerationActivity.ts`: scoped UI, evidence, incremental lifecycle.
- `data/generation-activity-coverage.json`: reviewed boundary inventory, including unsupported and branch-specific actions.
- `docs/generation-activity.md`: rollout, coverage, limits, privacy and replay operational instructions.

`TraceIdentity = {namespace: 'legacy'|'operations'; attemptId: string}`. `TraceContext`
extends it with `producerId`, verified workflow identifiers, `stage`, optional
`substep`, `taskId`, `parentTaskId`, candidate/repair IDs and actor `{kind:
'model'|'orchestrator'|'process', role: string}`. The server never trusts these
workflow identifiers as authorization; it derives actual ownership from OIDC.

`TraceEvent` has `schemaVersion: 1`, stable UUID `eventId`, context, positive
producer `sequence`, UTC `emittedAt`, kind and a discriminated allowlisted payload.
Kinds: `task_started`, `task_finished`, `model_started`, `model_finished`,
`action_started`, `action_finished`, `output`, `usage`, `retry`, `error`,
`coverage`, `heartbeat`, `producer_finished`. A model dispatch gets a local UUID
`callId`; use that for exactly-once usage even if the provider has no response ID.
All token categories are `number|null`, cost is a decimal string or null with
`actual|estimated|unreported`; cached/reasoning tokens are subsets, not added twice.

`TracePage = {items: StoredTraceEvent[]; nextCursor: string; hasMore: boolean;
observedAt: number; lastHeartbeatAt: number|null; recording:
'disabled'|'not_recorded'|'recording'|'complete'|'incomplete'|'expired';
coverage: CoverageSummary; usage: TraceUsageSummary}`. Each stored event adds
decimal-string `cursor` and numeric `receivedAt`. Cursors are opaque,
identity-bound encodings of partition sequence; reject cross-identity reuse.
Summary reflects all retained responses, not just the 500 visible rows.

## Task 0: Execution readiness without production changes

**Files:** append only the existing daily progress record; no application changes.
**Interfaces:** produces a recorded readiness decision for the exact task branch,
existing operations storage target, isolated test database and workload identity.

- [ ] **Step 1: Re-read ledger, progress and branch state.** Fetch `origin`, inspect concurrent work and retain the dedicated task worktree. Reconcile changed main interfaces without resetting or discarding local documentation; record exact source/base commits. Reuse the approved Work OS task and record fresh start success-rate report.
- [ ] **Step 2: Confirm storage readiness read-only.** Resolve the actual deployed operations store and isolated Worker role through existing approved configuration. Verify connectivity/schema version and OIDC settings without printing secrets or modifying schemas. Do not guess a Neon project, expose credentials, or run a migration. If storage is unavailable or access/target ambiguous, record the exact blocker and stop application implementation rather than creating a temporary store. Production migration and trace-data deletion remain separately gated.
- [ ] **Step 3: Establish a safe local baseline.** Resolve the existing Node toolchain and compatible isolated dependencies; run affected existing root/admin/Worker tests and type checks. Verify a disposable loopback PostgreSQL test target is available under the existing explicit safety guard. A skipped PostgreSQL suite cannot satisfy Tasks 2/8. Record failures and obtain a decision before working through a broken baseline.
- [ ] **Step 4: Record the readiness outcome** in both ledgers before Task 1. This is a prerequisite, not approval to modify live storage or run a generation.

## Task 1: Safe trace contract and coverage inventory

**Files:** create the shared types/contract files above, `tests/generation-activity-contract.test.ts`, `tests/fixtures/generation-activity.ts`, coverage inventory. Reuse existing tracking redaction as defense-in-depth without changing its contract.

**Interfaces:** `buildTraceEvent(raw: unknown, policy: TracePrivacyPolicy): TraceEvent`;
`validateTraceBatch(raw: unknown): TraceEvent[]`; `TRACE_LIMITS` exports the spec's
byte/count/time constants. `TracePrivacyPolicy` has explicit allowed field/projector
IDs and a runner-local sensitive-value collection that is never serialized.
Fixture export `traceEvent(overrides = {}): TraceEvent` creates a benign event.

- [ ] **Step 1: Write contract tests** using `traceEvent`. Assert `validateTraceBatch([event,event])[0].eventId === event.eventId`; malformed kinds, raw prompt/header/env keys and noncanonical identities throw; zero usage stays `0`, missing stays `null`. Assert an 8-KiB UTF-8 multibyte sample respects byte limits, depth >8/nodes >500 is rejected, and a secret beyond byte 8192 is removed/withheld before truncation. A benign supported output projection remains readable; unclassified source, contact fields and token-bearing errors yield a typed withheld reason and contain none of the original sensitive strings.

```ts
it('keeps a stable event ID across delivery replay', () => {
  const event = traceEvent();
  expect(validateTraceBatch([event, event]).map(e => e.eventId))
    .toEqual([event.eventId, event.eventId]);
});
```
- [ ] **Step 2: Run RED:** `npm test -- tests/generation-activity-contract.test.ts --maxWorkers=1`; expect missing-module/export failures initially, then behavioral failures for new privacy cases.
- [ ] **Step 3: Implement the contract.** Use deterministic bounded traversal and UTF-8 byte counting. For raw input >1 MiB withhold without retaining or recursively processing it. Prefer per-boundary structured output projectors to arbitrary string dumps; fail closed on unclassified source. Cover known runtime secret/contact values plus structural suppression; never claim regex alone is a privacy proof. Populate the inventory from actual provider calls, process launches, writes and stage emitters; initial state `unsupported` until each is wired in Task 5/6.
- [ ] **Step 4: Run GREEN** with the same command; expect all tests pass and no raw sensitive fixture values in serialized output.
- [ ] **Step 5: Commit** explicit contract/types/inventory/test paths as `feat(activity): define bounded private trace contract`.

## Task 2: Atomic persistence, rollups and retention

**Files:** create migration, `worker/src/generation-activity/store.ts`, `tests/generation-activity-postgres.test.ts`, `worker/test/generation-activity-store.test.ts`; reuse the disposable-loopback guard from `tests/operations-events-postgres.test.ts` without weakening it.

**Interfaces:** `createGenerationActivityStore(sql: OperationsSql): TraceStore`;
`TraceStore.append(owner: VerifiedTraceOwner, events: TraceEvent[]): Promise<AppendAck>`;
`read(identity: TraceIdentity, {after?, before?, limit}): Promise<TracePage>`;
`pruneExpired({now, limit}): Promise<{deleted: number; hasMore: boolean}>`.
`VerifiedTraceOwner` contains identity, repository ID, run ID and run attempt proven
in Task 3. No public method trusts an identity alone for write ownership.

- [ ] **Step 1: Write database tests.** Assert two concurrent appends produce unique increasing committed cursors; duplicate ID/payload is acknowledged without changing totals, conflicting payload is rejected atomically, and a cursor read between commits cannot skip a later-visible event. Verify namespace isolation, wrong owner and integer overflow rejection, 100-page bound, `before` history paging, and unknown/zero/cached usage. Assert changing `limit`/feed window never changes deduplicated rollups. Seed a 31-day trace plus fresh trace, prune, and assert old content is deleted, fresh content/lifecycle/cost rows unchanged, and old identity reads `expired`.
- [ ] **Step 2: Run RED:** `npm test -- tests/generation-activity-postgres.test.ts --maxWorkers=1` with an explicitly disposable `OPERATIONS_TEST_DATABASE_URL` and `OPERATIONS_TEST_DISPOSABLE=1` configured privately. A skipped suite is not database evidence; stop this gate if no safe target exists. Run adapter tests separately with `npm run test:worker -- worker/test/generation-activity-store.test.ts --maxWorkers=1`.
- [ ] **Step 3: Implement schema/functions and adapter.** Partition key is `(namespace,attempt_id)` with immutable run ownership, locked sequence/counters, recording/coverage/heartbeat state and expiry. Trace rows use unique partition/event ID and partition/cursor. Use a stored atomic append function called in one parameterized query; separate HTTP `BEGIN` and `COMMIT` calls do not share a transaction. Revoke public/table access and grant only necessary functions to the existing isolated Worker role. For operation identities check current claimed-run ownership in SQL; legacy ownership is checked via DO before creating the immutable partition. Enforce all caps at the server as well as producer. Reserve 32 metadata-only control slots within 10,000-event/10-MiB totals; once verbose cap reached acknowledge suppression with an explicit coverage marker, no runaway retries. Roll up usage idempotently by local dispatch ID. Keep a content-free expired marker (identity and expiry only) so expired differs from never recorded; no old trace metadata survives in it.
- [ ] **Step 4: Run GREEN** commands from Step 2 plus `npm test -- tests/operations-events-postgres.test.ts --maxWorkers=1`; existing ownership/handoff tests must pass against the disposable database.
- [ ] **Step 5: Commit** migration/store/tests as `feat(activity): persist replayable bounded generation traces`.

## Task 3: Authorized ingestion and private admin reads

**Files:** create `worker/src/generation-activity/http.ts`, `worker/test/generation-activity-http.test.ts`; modify `worker/src/{index,generation-attempts}.ts`, `worker/src/operations/github-auth.ts`, `worker/src/admin/{workspace-api,workspace-capabilities}.ts`, `src/lib/admin-contracts.ts`.

**Interfaces:** `generationActivityIngest(request, env, dependencies?): Promise<Response>`
at `POST /api/internal/generation-activity`; `generationActivityRead(request, env,
principal, dependencies?): Promise<Response>` for explicit legacy and operation
routes below. Export a narrow reusable `trustedWorkflowRun(request, env, policy?)`
around the existing verifier, preserving all old route tests. Add DO read-only
`getActivityOwner(attemptId): {repository,runId,runAttempt}|null` with no payload.

- [ ] **Step 1: Write route tests.** For the same numeric run, wrong repository ID, workflow, event, ref, run attempt, namespace or canonical attempt gets 401/403/404 without writes. Bearer authentication failure cannot retry through legacy tracking secret. Valid OIDC plus exact legacy DO binding succeeds; operation identity requires the existing claimed run. An absent/unbound legacy owner denies, not creates an attempt. Admin viewer/removed membership gets denied on every cursor page. Expired session does not return cached trace text. Test body streaming beyond 128 KiB, missing capability/database, malformed/cross-identity cursors, GET-only reads and `Cache-Control: no-store`.
- [ ] **Step 2: Run RED:** `npm run test:worker -- worker/test/generation-activity-http.test.ts --maxWorkers=1`; expect new-route/missing-export failures.
- [ ] **Step 3: Implement routes and capability.** Use verified GitHub OIDC for both namespaces; do not rely on the legacy shared tracking secret. Never mutate or claim lifecycle state from diagnostic ingest. Revalidate batch/owner before SQL. Add `GENERATION_ACTIVITY_ENABLED` default false and an additive `generationActivityRead` workspace capability requiring configured storage/policy. GET paths: `/api/admin/onboarding-invites/workspace/legacy/attempts/:id/activity` and `/api/admin/onboarding-invites/workspace/operations/records/:id/activity`. Intercept the activity subroutes before existing greedy detail matching. Reuse current owner/admin session and record authorization; resolve the canonical attempt in its original store before trace reads. Return disabled, not empty healthy data, if dependencies are unavailable. No new database role or credentials provisioning.
- [ ] **Step 4: Run GREEN:** new route tests plus `worker/test/operations-github-auth.test.ts`, `worker/test/admin-workspace-api.test.ts`, `worker/test/admin-tracking-ingest.test.ts` with `npm run test:worker -- <paths> --maxWorkers=1`. Existing trust and legacy detail contracts stay unchanged.
- [ ] **Step 5: Commit** as `feat(activity): bind trace endpoints to trusted run and admin identity`.

## Task 4: Bounded runner producer and heartbeat

**Files:** create runner client/context modules, `tests/generation-activity-client.test.ts`, `tests/generation-activity-context.test.ts`; reuse OIDC acquisition in `scripts/operations-client.mjs` without logging tokens.

**Interfaces:** `createActivityProducer({context,privacy,transport,spoolDir,clock}): ActivityProducer`;
methods `emit(kind,payload): void`, `flush(): Promise<void>`, `close(): Promise<void>`;
`activityFromEnv(env, semanticContext, dependencies?): ActivityProducer` returns a
no-op unless the explicit enable flag and complete valid identity exist. Transport
`send(events, signal): Promise<AppendAck>` obtains current OIDC per delivery cycle.

- [ ] **Step 1: Write fake-clock tests.** At 999ms no scheduled send, at 1000ms flush; 20 events flush immediately; heartbeat at 10s; queue stays ≤1 MiB; batches/events respect limits. Lost ACK retries reuse IDs; transient failure makes ≤3 total attempts with 3s deadline each; 400/401/403 never fall back or retry. Drop/suppression creates explicit gap on recovery. Serialized spool never contains policy secrets. `close()` clears timers and has a 10s overall ceiling; kill before flush cannot mark `complete`. Duplicate close is harmless. No-op preserves return/throw behavior of wrapped work.
- [ ] **Step 2: Run RED:** `npm test -- tests/generation-activity-client.test.ts tests/generation-activity-context.test.ts --maxWorkers=1`.
- [ ] **Step 3: Implement the queue.** Sanitize synchronously before queue/spool. Use stable producer/event/call IDs, bounded spool files mode 0600 under runner temp, and one in-flight flush. Use 250ms/500ms retry delays within the bound; do not make generation retry decisions. Final `producer_finished` means only this producer finished; server completeness also needs coverage and known lifecycle state. Heartbeats are explicit producer evidence, not browser polling. Ensure exceptions cannot echo raw request/provider diagnostics or change wrapped generation result.
- [ ] **Step 4: Run GREEN** with Step 2 command; check event-loop/timer cleanup in every failure case.
- [ ] **Step 5: Commit** as `feat(activity): add bounded runner delivery and producer signals`.

## Task 5: Model request/output/usage instrumentation

**Files:** modify `scripts/{generation-inference,creative-lane-inference,author-inference-adapter,author-production-experiences,generate-site-config}.mjs`; add `scripts/generation-activity-model.mjs`, `tests/generation-activity-model.test.ts`; update boundary inventory and any actual bypassing provider caller it identifies (research, reference analyzer, visual judges and repair).

**Interfaces:** `observeModelCall({producer,context,callId,provider,model,invoke,projectOutput}): Promise<Completion>` preserves `invoke()` result/errors. Optional activity context is additive to `completeGeneration({openRouter,inference,activity?})`; disabled behavior is byte/semantic compatible with existing callers. Output projection uses Task 1 policies, never raw prompt/provider envelopes.

- [ ] **Step 1: Write delayed-provider tests.** Hold the fake response unresolved; assert persisted `model_started` exists and no completion/usage is invented. Resolve it and assert output is emitted before the overall generation finishes. Missing usage stays null; reported zero is zero; provider response without an ID uses local call ID. Separately billed retry dispatches get distinct call IDs; delivery retry does not increase usage. Refused/incomplete/transport-error results preserve current parse gates and safe error codes. Both OpenRouter and neutral paths emit once, not twice through nested wrappers. Withheld output has a reason; supported benign output remains inspectable.
- [ ] **Step 2: Run RED:** `npm test -- tests/generation-activity-model.test.ts --maxWorkers=1`.
- [ ] **Step 3: Instrument the model boundary and semantic callers.** Capture start immediately before existing dispatch; completed visible output/usage immediately after normalized response. Never change transport mode, request budgets, prompts, provider fallback or retry policies. Attach real stage/role/candidate/repair context at caller. Wire bypasses explicitly or retain truthful unsupported inventory entries. Normalize cost labels without substituting estimates for reported values; authoritative accounting remains unchanged.
- [ ] **Step 4: Run GREEN:** new tests plus `tests/{generation-inference,inference-client,opencode-go,reference-dna,creative-repair-loop}.test.ts` with `npm test -- <paths> --maxWorkers=1`.
- [ ] **Step 5: Commit** as `feat(activity): expose real model dispatch output and usage events`.

## Task 6: Pipeline actions, branch coverage and expiry wiring

**Files:** modify `.github/workflows/generate-client.yml`, `scripts/{record-generation-stage,run-rendered-creative-repair,generate-contextual-assets,production-experience-author}.mjs`, `worker/src/index.ts`; add `scripts/generation-activity-action.mjs`, `tests/generation-activity-pipeline.test.ts`, `worker/test/generation-activity-retention.test.ts`; update inventory/docs.

**Interfaces:** `observePipelineAction({producer,context,actionId,name,input,invoke,projectResult}): Promise<T>`; explicit stage/substep start/end records. Expiry uses Task 2 `pruneExpired` from the existing scheduled Worker handler with independent error handling and `limit: 100` (at most five batches/invocation).

- [ ] **Step 1: Write branch tests.** Synthetic full workflows for creative, pack and foundation produce applicable stage/action states without fictional agents or 100% progress; repair loops preserve pass numbers, retry reasons and bounded budgets. Actual write/process/browser failures never emit successful results. Fixture raw command/stdout/private URL never reaches events. Disabled flag leaves workflows/gates semantically unchanged. Expiry test deletes only the new trace content, leaves tombstone and lifecycle/accounting intact; retention failure cannot block existing scheduled reconciliation.
- [ ] **Step 2: Run RED:** `npm test -- tests/generation-activity-pipeline.test.ts --maxWorkers=1` and `npm run test:worker -- worker/test/generation-activity-retention.test.ts --maxWorkers=1`.
- [ ] **Step 3: Wire actual boundaries.** Persist action start before launch/write and finish after real success/failure. Producer context must be passed to subprocesses through validated environment, never echoed. Existing claim gate still precedes all effects. Enable diagnostics only after normal workflow attempt binding; unbound early setup is reported unsupported. Add final bounded producer close in `finally`/workflow always paths and retain existing failure semantics. Complete the inventory with exact source boundary pointers, supported profiles and safe output projector IDs; CI checks pointers and prohibits unclassified “instrumented” entries. Retention only runs when capability enabled and schema ready; do not apply the migration or delete production data during implementation.
- [ ] **Step 4: Run GREEN** Step 2 commands plus `npm test -- tests/operations-workflow.test.ts tests/operations-telemetry.test.ts tests/admin-generation-tracking.test.ts --maxWorkers=1`. Confirm no existing mandatory gate is removed.
- [ ] **Step 5: Commit** as `feat(activity): trace real pipeline actions and expire diagnostic content`.

## Task 7: Existing inspector activity workspace and polling

**Files:** create UI/hook/style files from structure map and `src/admin/generation-activity-format.ts`; modify `src/admin/api.ts`, `src/admin/GenerationsView.tsx`, `src/admin/AttemptInspector.tsx`, `src/lib/admin-contracts.ts`; add `tests/{generation-activity-view,generation-activity-polling}.test.ts`, extend `tests/admin-workspace-browser.test.ts` and fixtures.

**Interfaces:** `api.getGenerationActivity(identity,{after?,before?,limit},signal?): Promise<TracePage>`;
`useGenerationActivity({identity,enabled,active,api}): {page,events,selection,
loadOlder,jumpToLatest,connectionState}`; `GenerationActivity` consumes this state,
existing canonical stage history, lifecycle status and verified artifact links.
`ActivityInspector` receives selected `StoredTraceEvent|null`, not raw provider data.

- [ ] **Step 1: Write view/polling tests.** After 2s visible active detail polls once; a slow response prevents overlap; hide/unmount/switch identity aborts requests and ignores late results. At 30/60s from last server-received heartbeat show exact spec warnings even if reads succeed. Use server `observedAt` to avoid client clock skew. Terminal status drains known buffered traces until final producer end or a 30s bounded grace expires; absent ends then remain incomplete. Failed polls show disconnected separately. 401 triggers existing expired-session flow. Cursor catch-up fetches ≤3 pages/tick then yields; the committed cursor advances only after validated merge.
- [ ] **Step 2: Write browser tests.** Assert stage/action/model distinctions, selected safe evidence, real filters, expandable output, 500-row limit, older-history paging, unchanged usage totals, and “Jump to latest” without stealing scroll while reading. Historical no trace/expired/disabled states have distinct copy. `<script>` and JSX render as text. Desktop 1512/compact 1024/mobile 390 have no document overflow, readable content and reachable action details; Escape/focus restoration in existing panel works. No new navigation item or mutation control exists.
- [ ] **Step 3: Run RED:** `npm test -- tests/generation-activity-view.test.ts tests/generation-activity-polling.test.ts tests/admin-workspace-browser.test.ts --maxWorkers=1`.
- [ ] **Step 4: Implement scoped components and hook.** Route by explicit record source; do not repurpose operation IDs as legacy IDs. Keep list polling at current 15s/30s, independent of 2s detail polling. Use identity-scoped reset, stable ID merge and server rollups. Keep selected evidence in a separately bounded slot when its row leaves the feed window. Preserve UI expansion/filter state; truthful waiting states instead of animations. Style from the supplied reference using existing CSS conventions, original adapted markup and accessible native controls.
- [ ] **Step 5: Run GREEN** Step 3 plus `npm run check` and `npm run build:admin`; inspect rendered desktop/mobile output, not just HTML markers. Load React quality-check skill after multi-component edits.
- [ ] **Step 6: Commit** as `feat(admin): show observe-only generation activity in the attempt inspector`.

## Task 8: End-to-end evidence, review and shipping handoff

**Files:** add `tests/generation-activity-e2e.test.ts` with local fixture harness; complete `docs/generation-activity.md`; append daily progress and preserve verification artifact paths. No new public/demo production route.

**Interfaces:** real runner producer → authenticated Worker ingest → disposable persistence → private admin read → rendered inspector, with delayed fake provider and synthetic OIDC keys. No mocked trace HTTP response in this end-to-end test.

- [ ] **Step 1: Write/run RED** `npm test -- tests/generation-activity-e2e.test.ts --maxWorkers=1`; assert browser shows a pending model call before releasing fake response, then completed output/usage, reload replay without duplicates, and a producer-kill warning without falsely failing the run. A fixture that only ends green without observing intermediate states is insufficient.
- [ ] **Step 2: Implement missing fixture/wiring and run GREEN** with the same command. Record emission/ingestion/browser timestamps and under-5s healthy-path latency evidence; distinguish fixture timing from production SLA.
- [ ] **Step 3: Run full local gates** `npm test -- --maxWorkers=1`, `npm run test:worker -- --maxWorkers=1`, `npm run check`, `npm run check:worker`, `npm run build:admin`, `npm run build`. Use compatible isolated dependencies, never modify a running shared server's tree. Run existing configuration/recipe tests and `npm run verify:site-route-fixtures`; then `npm run verify:local-release -- --config artifacts/stage4/care-static/src/site.config.json --build` using the generated synthetic config. Any missing synthetic asset must be fixed within the fixture setup, not bypassed or replaced with client assets. Run start/end generation-success report. Record actual counts/results, skipped database gates and rendered captures honestly.
- [ ] **Step 4: Independent bounded review** of the original spec, exact final diff and evidence, focusing on identity/authorization, raw-output privacy, ordered replay/duplicates, retention and unchanged lifecycle gates. Use one reviewer, no recursive delegation; fix findings RED→GREEN and rerun affected checks. Do not duplicate a completed independent review without changed risk.
- [ ] **Step 5: Prepare rollout evidence** without production writes: schema/version/role-readiness checklist, flag-off deployment ordering, readback checks for legacy and operation identity paths, disable procedure, and pending ordinary-generation proof. Confirm deployed database readiness via authorized read-only checks; unavailable/ambiguous target blocks rollout rather than adding a temporary store. Do not print connection strings, environment secrets or admin credentials.
- [ ] **Step 6: Commit** documentation and verified local outcome. Re-read/update Work OS task and daily progress. Ask for shipping and ordinary paid-run authorization separately; leave production proof open when not authorized. Only after authorized shipping, CI/release/deployment gates and the real invitation→intake→live activity→retained replay proof pass may work be called live-verified. Then run `bash ./task_complete "<verified outcome>"`, confirm ledger completion readback, integrate records, and remove only this task's clean fully preserved/integrated worktree per AGENTS.md. Otherwise retain exact branch/path and pending-proof blocker in both ledgers.

## Execution checkpoint

- [x] Full description approved by owner, 2026-11-03.
- [x] Implementation plan written; source interfaces checked and self-reviewed.
- [ ] Owner reviews this plan before implementation.
- [ ] Task 0 storage, worktree and test readiness.
- [ ] Tasks 1–8 implemented and locally verified.
- [ ] Separate shipping authorization, deployed storage readiness and live-generation proof.

Current plan is documentation only. Test commands above are future gates, not
claims that they were executed. Existing design worktree remains active on
`codex/launchloom-agent-observability-design`; continue inline after plan review.
