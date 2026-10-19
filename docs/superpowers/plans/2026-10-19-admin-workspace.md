# LaunchLoom Admin Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved forest/ivory Operations studio with shared clients, immutable generation-attempt history, verified admin attribution, persistent accounts and truthful GHL placeholders.

**Architecture:** Preserve the Cloudflare Worker, existing invitation/outbox and generation Durable Objects. Add attempt-aware operational tables, independent GitHub reconciliation, Neon-backed admin identity/membership, and a same-origin React admin bundle; migrate auth only after staged proof. Deliver the three linked subplans in order, then perform the controlled rollout below.

**Tech Stack:** Existing TypeScript, Astro/React, Cloudflare Workers/SQLite Durable Objects, Vitest and Playwright; planned additions are `@neondatabase/auth`, `@neondatabase/serverless`, and direct build-only `esbuild`, pinned to versions verified at execution.

**Spec:** `docs/superpowers/specs/2026-10-19-admin-workspace-design.md` (read first).

## Global Constraints

- All authorized admins see all clients, invitations and generation attempts.
- Invitation creator and generation initiator are separate attributions.
- No failed attempt disappearing because a later attempt succeeds.
- No invented historical actors, failure reasons, costs or progress.
- No public signup granting admin access; no browser-supplied identity treated as attribution.
- No new one-click generation/rerun controls.
- No Access policy weakened before replacement auth is proved, and no double-login flow presented as the final account experience.
- No public-site redesign/recoloring, generated-client template changes, creative-gate recalibration, model/provider changes or client regeneration.
- Forest `#10251f`, muted `#587069`, canvas `#f4f2ea`, paper `#fffefa`, sage `#bad8c8`, lime `#d9f06b`, divider `#d9ddd1`; Manrope headings/Source Sans 3 data, scoped to admin.
- GHL displays **Not connected / Planned**. No provider calls, active connect action or fake sync timestamps.
- Additive operational migrations only; do not drop legacy rows, replace R2 `ASSETS`, or move operational storage to Neon.
- This document authorizes no live provisioning, Access changes, real client actions or deployment by itself. Execution follows user review/choice; production checkpoints require explicit operator approval.

## Review Focus

1. Late/replayed callbacks after terminal reconciliation must not revive an old attempt or duplicate costs; pin in Tracking Tasks 1/3.
2. Concurrent owner deactivation and session reuse after revocation must never leave zero owners or authorize a disabled admin; pin in Accounts Task 2.
3. Auth email verification/reset redirects, Unicode names and provider outages must neither open-redirect nor leak account state/private records; pin in Accounts Tasks 1/3.
4. Duplicate names/emails, queued intakes and histories beyond 200/100 rows must not merge clients or hide records; pin in Tracking Tasks 1/2 and UI Task 2.
5. Bundled shell/assets, stale selection and near-miss previews must not leak data, lose keyboard focus or imply production approval; pin in UI Tasks 1/2 and rollout.

## Scope and execution order

These are coupled product slices, not unrelated projects. Separate plans make each independently reviewable/testable without shipping a mock backend:

1. [Tracking and history](2026-10-19-admin-tracking.md): three tasks; preserve legacy APIs while adding attempt/client APIs and recovery of missed events.
2. [Admin accounts](2026-10-19-admin-accounts.md): three tasks; prove Neon compatibility, durable membership/profiles and server authorization behind the existing boundary.
3. [Dashboard UI](2026-10-19-admin-ui.md): three tasks; same-origin protected application with the selected A layout, real APIs and no fictional production data.
4. Master Tasks 10/11 below: staged acceptance, historical backfill and controlled production cutover.

Use the current dedicated worktree if still clean/owned. Before runtime edits, fetch/review current main and new progress entries, reconcile this branch intentionally, verify a compatible lockfile before dependency reuse, re-read Nifty `ti9WNOpGL2`, and add returned subtask IDs through the canonical VPS logger. Never reset/stash another workstream. Checkboxes are the execution checklist; do not mark them from mockup evidence.

## File/dependency ownership

| Boundary | Owner/files |
| --- | --- |
| Shared wire types | Tracking Task 1: `src/lib/admin-contracts.ts` (pure TS, no runtime dependencies) |
| Operational persistence | Tracking Tasks 1/2: `worker/src/generation-attempts.ts`, `worker/src/generation-ledger.ts`, `worker/src/onboarding-invites.ts`, `worker/src/admin/workspace-api.ts` |
| Callback/reconciliation | Tracking Task 3: `scripts/record-generation-event.mjs`, `scripts/reconcile-generation-history.mjs`, generation workflows and a new reconciliation workflow |
| Admin identity | Accounts Tasks 1–3: `worker/src/admin/{auth,neon-auth,membership-store,accounts-api}.ts`, `db/admin/001-membership.sql` |
| Client application | UI Tasks 1–3: `src/admin/**`, `scripts/build-admin-workspace.mjs`, `worker/src/admin/{asset-handler,router}.ts` |
| Integration points | `worker/src/index.ts` (admin routes only), `package.json`, lockfile, `wrangler.jsonc`, generated Worker types, `.github/workflows/{validate,deploy-platform}.yml` |
| Tests/acceptance | `worker/test/admin-*.test.ts`, `tests/admin-*.test.ts`, `scripts/verify-admin-workspace.mjs`, `docs/verification/admin-workspace-2026-10-19.md` |

Cross-plan changes to `index.ts`, shared types or config are sequential. Do not let independent agents edit them concurrently.

## Shared contract conventions

- All client-facing timestamps are integer epoch milliseconds; unknown fields are `null`, never a made-up empty value.
- `ActorSnapshot`: `{kind:'admin'|'client'|'github'|'system'|'unknown',id:string|null,name:string|null,email:string|null,source:'neon'|'cloudflare-access'|'intake'|'github'|'system'|'legacy'}`. Server creates actors; frontend only renders them.
- `AdminPrincipal`: `{id:string,email:string,displayName:string,role:'owner'|'admin',authSource:'neon'|'cloudflare-access'}`. Authorization additionally requires live session and active membership, not just these display fields.
- `ExecutionStatus`: `queued|running|succeeded|failed|cancelled|skipped|unknown`; `stale:boolean` is separate. `DeliveryStatus`: `none|diagnostic|attention|preview_ready|published`.
- `Page<T>`: `{items:T[],nextCursor:string|null,total:number}`. `AttemptFilters`: `{search?:string,executionStatus?:ExecutionStatus,initiatorId?:string,creatorId?:string,profile?:GenerationProfile,clientId?:string,from?:number,to?:number,cursor?:string,limit?:number}`. Profiles: `full|full-preview|creative-only|seo-only`. Shared limit default 50/max 100; cursor is opaque and bound to normalized filters.
- `Health`: `{lastSyncAt:number|null,coverageStart:number|null,partial:boolean,lastError:string|null,pendingProjectionCount:number}`. This contract is owned by Tracking, not invented by the UI. `CheckResult`: `{name:string,passed:boolean,detail:string}` for acceptance reports; detail is redacted.
- The immutable list-order timestamp is `createdAt`; `startedAt` stays null while queued and may be filled by verified execution. `requestId` identifies a dispatch, not every rerun: multiple executed attempts can refer to the same request. A separate dispatch binding points to its initial attempt.
- Prefix all new operational API routes `/api/admin/onboarding-invites/workspace` during transition. Browser view deep links stay on `/admin/onboarding-invites?view=generations&attempt=<id>` (or `view=clients&client=<id>`), avoiding a premature Access wildcard change.
- APIs return JSON `{error:{code,message}}` on errors with no private upstream body; 401 signed out, 403 forbidden/inactive, 400 invalid input, 404 unknown ID, 409 conflict, 503 dependency unavailable. Existing legacy response contracts remain unchanged.

## Task 10: Staged acceptance and deployment readiness

**Files:** Create `scripts/verify-admin-workspace.mjs`, `docs/verification/admin-workspace-2026-10-19.md`, `docs/admin-workspace-operations.md`; modify `.github/workflows/validate.yml` and `deploy-platform.yml` to build/test admin assets; test `tests/admin-release-policy.test.ts`.

**Interfaces:** Consumes all three subplans. Produces a private JSON/browser evidence report with source SHA, environment, test actors, database branch identity (not credentials), zero-client-side-effect counters, screenshots and explicit pass/fail checks. No production release from this verifier.

- [ ] **Step 1: Write failing release/acceptance tests.** In `tests/admin-release-policy.test.ts`, assert `admin assets build < Worker deploy`, `run_worker_first === true`, R2 `ASSETS` remains separate, `ADMIN_AUTH_MODE` does not auto-fallback, and a missing Neon deployment configuration fails the neon-mode readiness check without printing secrets.

```ts
it('builds admin assets before deploying the Worker', async () => {
  const deploy = await fs.readFile('.github/workflows/deploy-platform.yml','utf8');
  expect(deploy).toContain('npm run build:admin');
  expect(deploy.indexOf('npm run build:admin')).toBeLessThan(deploy.indexOf('npx wrangler deploy'));
});
```
- [ ] **Step 2: Run** `npx vitest run tests/admin-release-policy.test.ts`; expect policy tests to fail before wiring exists.
- [ ] **Step 3: Implement** `verifyAdminWorkspace({baseUrl,outputDir,expectedSha,syntheticOnly:true}):Promise<{passed:boolean,checks:CheckResult[]}>` in the verifier. Build assets in CI and deploy; use only synthetic clients and operator-approved test mailboxes. Test two real Neon test accounts on the isolated branch, revoked/non-member sessions, invite consumption, queue/history/errors, both role permissions, and existing recovery. Route/stub downstream dispatch/mail at the test boundary and assert zero model/client/CRM actions.
- [ ] **Step 4: Run full gates.** `npm test`, `npm run test:worker`, `npm run check`, `npm run check:worker`, `npm run build`, `npm run verify:site-route-fixtures`, and the staged verifier at desktop 1512/1024 and mobile 390/320. Inspect actual screenshots, keyboard focus, measured text/control contrast and missing-data states. Record actual commands/results; app tests/builds cannot be replaced by the earlier mockup script. Run required CodeRabbit/repository reviews; keep blockers explicit.
- [ ] **Step 5: Commit** only verified code/docs with `git commit -m "test(admin): verify the integrated shared workspace"`; do not add private traces, cookies, signed links or account credentials.

## Task 11: Backfill, auth cutover and shipment

**Files:** Modify `docs/admin-workspace-operations.md`, the current UTC progress entry and `.collab/task-complete.log` only after verified completion; retain scripts/config from earlier tasks. Any config changes follow reviewed deployment scope.

**Interfaces:** Consumes reconciliation CLI dry-run report, verified staging acceptance and operator-selected Neon/owner/Access configuration. Produces exact production deployed-SHA evidence, explicit history coverage, a tested recovery procedure and completed task readbacks.

- [ ] **Step 1: Review a read-only backfill dry run.** `node scripts/reconcile-generation-history.mjs --mode backfill --from <confirmed-retention-start> --dry-run --out <private-report>`; read every pagination/association warning, missing older history and legacy cost ambiguity before authorizing writes. No inferred actor mappings or time-based queue associations.
- [ ] **Step 2: Confirm operator checkpoints.** Intended Neon project/branch, production sender, initial owner/other approved admins, trusted production domains, secrets delivery, Access route policy diff and rollback procedure. Enroll/verify at least two intended admins including the owner before removing their old normal entry. If any required provider/cutover privilege is unavailable, retain legacy Access and mark rollout blocked; do not claim migration complete.
- [ ] **Step 3: Integrate and deploy within authorized scope.** Fetch/reconcile latest main, rerun affected gates and merge only reviewed green work. Keep the new UI gated/legacy-compatible until production readiness passes. Validate new server auth with both authorized and unauthorized users before changing Access. Then execute the explicit Access/`ADMIN_AUTH_MODE=neon` cutover; normal login must not prompt for Access OTP as well. Verify expired/deactivated users, direct API/asset paths, old deep links and protected non-admin client routes.
- [ ] **Step 4: Run the approved bounded backfill.** Resume by checkpoint until all retained pages are exhausted. Read back attempt counts, duplicate absence, legacy coverage/provenance, accurate cost classification, retained earlier failures and queue states. Reconciliation health remains visible on an intentional simulated callback failure. Confirm zero dispatches, client mail/model/CRM actions. Rehearse rollback to the restricted Access path without deleting data.
- [ ] **Step 5: Verify and close.** Check deploy workflow conclusion AND platform/Worker deployed commit; run authenticated desktop/mobile production read-only smoke with the operator. Record exact evidence/remaining follow-up. Only then run `bash ./task_complete "<verified outcome>"`, complete known Nifty subtasks before `ti9WNOpGL2` with current-state reads/readback, include receipts in this workstream, and remove only clean fully integrated task worktrees. Unfinished resource/auth/history acceptance stays open.

## Self-review and execution handoff

- Spec coverage: shell/UI → UI 1–3; attempts/costs/pagination/failures/backfill → Tracking 1–3 + Task 11; accounts/roles/enrollment/cutover → Accounts 1–3 + Tasks 10/11; existing brand/GHL/accessibility → UI 1–3 + Task 10; operational compatibility/side effects → all subplan regression steps.
- Signature/enum ownership is centralized above and in Tracking Task 1. Shared-file edits are sequential; no task may invent a second status/actor vocabulary.
- External setup gates are real blockers, not implicit permissions. This plan contains no claimed completed runtime tests.
- Self-review fixes applied: use the actual `onboarding-invites.test.ts` path; keep projection tasks in a new outbox table instead of violating the existing SQLite workflow/receipt CHECK constraint; avoid a unique request-ID constraint that would collapse reruns; use immutable created-time cursors; make reconciliation correlation recoverable from non-sensitive workflow run metadata; build assets before configuring their Worker test binding.
- Recommend **subagent-driven execution**: auth, run identity and rollout have distinct high-impact failure modes, so a fresh implementation/review gate per task is worth the extra context. Native execution remains available if the user prefers.
