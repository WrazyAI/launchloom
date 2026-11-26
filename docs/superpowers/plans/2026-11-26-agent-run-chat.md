# Agent Runs Streaming and Follow-up Requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for inline execution or superpowers:subagent-driven-development if explicitly selected. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make live activity easy to follow and let an authorized operator request a bounded revision from a finished run's exact private preview.

**Architecture:** Keep the existing activity event stream and cursor-based dashboard reads. Add a chat-specific entry to the existing per-repository revision coordinator and reuse the developer revision workflow behind a preview-only mode. The chat stays in the Agent runs drawer; revision requests and results survive refresh independently of trace retention.

**Tech Stack:** React/TypeScript admin workspace, Cloudflare Worker and SQLite Durable Object, GitHub Actions, Cloudflare Pages, Vitest and existing browser fixtures.

**Spec:** The accepted planning brief is the current conversation: improve live visibility, continue in the same chat after a run, and reuse the current setup where it fits. The behavior and interface decisions below are proposed for approval; there is no separately approved design.

## Verified on `origin/main` at `0d6cbf4a`

| What exists | What it means for the plan |
| --- | --- |
| `scripts/generation-activity-model.mjs` emits safe visible deltas and lifecycle events with a `callId`; `src/lib/generation-activity-contract.mjs` configures a 1s flush, 10s heartbeats and 30-day trace retention. `worker/src/generation-activity/http.ts` offers authenticated, read-only cursor pages. | The producer already streams. Improving the drawer does not need a new model integration or a push transport. Neither the screenshot nor the timings prove the cause of duplicate-looking rows. |
| `src/admin/useGenerationActivity.ts` polls active runs every 2s and inactive runs every 15s, deduplicates event IDs and acknowledges the last cursor. The immediate catch-up timer also falls through `finally` and schedules a second timer; older reads lack cleanup when the identity changes. | Fix these specific lifecycle problems first. Separate genuinely parallel calls from repeated records and keep the authenticated catch-up path. |
| `src/admin/generation-activity-format.ts` groups model events by `callId`, but an additional start for the same call creates another entry. `src/admin/GenerationActivity.tsx` renders a locked composer. `tests/admin-workspace-browser.test.ts` covers desktop/mobile incremental output, final output replacement and the locked composer. | Group on recorded identities and use real job/candidate labels only when present; otherwise use stable request distinctions. No claim that the screenshot shows an ingest duplicate. |
| `src/admin/AttemptInspector.tsx` already shows `RevisionTimeline`. `src/admin/api.ts` and `worker/src/admin/workspace-api.ts` expose a repository-scoped read of recent revisions. `worker/src/index.ts` accepts signed feedback and calls `RevisionCoordinator.enqueue`; `worker/src/revision-coordinator.ts` deduplicates requests, coordinates dispatch and recovery, and interlocks with publication. | Reuse the coordinator and verification machinery. The admin read and signed feedback path do not provide an authenticated Agent runs write or a full conversation contract. |
| `.github/workflows/process-feedback.yml` normally clones the current review PR head, pushes the revised commit to that branch, uses the Pages branch alias as its preview, and sends developer email. `src/lib/admin-contracts.ts` even allows a related preview URL to be refreshed by a later revision. The existing `RevisionSummary` has no immutable result reference. | Exact-base revision, stable previous preview links, and in-app-only delivery require explicit work. A successful Actions run, PR URL, branch alias, or another attempt's preview is insufficient evidence for revising the selected preview. |
| The 25 Nov progress entry records PR #368 local browser checks and deployment. Work OS `4c06b72e-d950-4586-b95a-e87be410e100` still has an open production live-run check. Work OS `407bf9ee-595b-4adc-ac8c-b7c4109994f1` already tracks follow-up prompts. | The plan uses repository and prior test evidence. It does not assume that current live latency or the screenshot's two requests were reproduced. |

## Global Constraints

- Plan only until reviewed. While the convergence freeze is active, scope live work to fixes in the existing trace. Defer the new write capability and any new client-facing artifact until the five consecutive `preview_ready` requirement across creative, foundation and pack is evidenced. The workflow-conclusion report alone cannot lift the freeze.
- Admin/owner with a persistent Neon admin identity first, inside the current Agent runs drawer. Keep legacy Access mode read-only for this feature. No new client chat, billing, automatic publication or client email. Chat-created revisions deliver in the drawer only; legacy feedback retains its existing behavior.
- Preserve the run history and the previous working preview. Start a new bounded revision, never resume a finished model session. Only a trusted preview for the selected site and run/thread may be edited.
- Preserve the page recipe, unrelated sections, verified facts and client assets; unsupported changes go to manual attention. Never claim success until the requested change is verified in a rendered private preview.
- Keep private reasoning, secrets, signed links and raw provider errors out of the thread. Respect activity redaction, admin authorization and the existing safe-preview access rules.

## Review Focus

- A burst of events followed by route or tab change must not double-poll or leak events into another attempt (Task 1).
- Two real model calls with identical labels must both survive, even when one start is repeated (Task 2).
- Retry after a lost response returns the original request; two different submissions cannot both start from the same version (Task 3).
- A result delivered late, a failed preview after a push, or a mutable alias must never advance the thread's selected preview (Task 4).
- Reopening the drawer on a different attempt or refreshing mid-revision must recover the correct thread and preview without replaying a write (Task 5).

---

## Phase 1: Improve the existing read-only trace

### Task 1: Make cursor catch-up and reconnect reliable

**Files:** Modify `src/admin/useGenerationActivity.ts`; test in `tests/admin-workspace-browser.test.ts`.

**Interface:** Keep `useGenerationActivity` and `AdminApi.getGenerationActivity(identity, { after, before, limit, signal })` unchanged. No Worker or event schema change.

- [ ] Add `catches up once and discards late activity from the previous attempt`: serve two incremental pages with `hasMore`, hold an older-page response, switch attempts, then release it. Assert cursor order, one next timer after the burst, and no old text or cursor in the new view. Test a disconnect/reconnect with replayed event IDs.
- [ ] Run `npm test -- tests/admin-workspace-browser.test.ts -t 'catches up once'`; confirm the new scheduling or stale response assertion fails.
- [ ] Schedule once per request from one exit path. Keep the existing 2s/15s intervals, 100-event page size and bounded catch-up. Abort and invalidate both latest and older requests on identity change. On visibility return, resume from the acknowledged cursor, with no overlapping read for that cursor.
- [ ] Run the new case and existing `streams Agent runs code across incremental polls` browser case. Verify desktop and mobile, including scroll hold and Jump to latest.
- [ ] Commit: `fix(admin): make activity catch-up single-flight`.

### Task 2: Make live status understandable

**Files:** Modify `src/admin/generation-activity-format.ts`, `src/admin/GenerationActivity.tsx`; test in `tests/generation-activity-format.test.ts` and `tests/admin-workspace-browser.test.ts`.

**Interface:** Preserve `groupActivity(events, includePartial?): ActivityEntry[]`. Use `callId` for model row identity; keep recorded diagnostics accessible in the timeline.

- [ ] Add `reconciles duplicate starts without merging parallel calls`: two IDs with the same visible label and one duplicated start produce exactly two model rows. Cover a partial row gaining its start, and a terminal row staying terminal after replay. In the browser, assert that progress-only data shows the last recorded step or elapsed time, never a visible answer; safe visible deltas and final recorded output retain existing behavior.
- [ ] Run `npm test -- tests/generation-activity-format.test.ts tests/admin-workspace-browser.test.ts -t 'reconciles duplicate starts|live status without visible output'`; confirm the new assertions fail.
- [ ] Reconcile each call into one row, retaining start, evidence and terminal status. Show one plain-language status per active task, with real candidate/route labels when present. Move counters into details. If telemetry goes quiet, describe the last update; do not infer a failure or fabricate progress. Preserve stage filters, scroll behavior and final output replacement.
- [ ] Run both suites and `npm run build:admin`. Measure emission-to-display in the fixture: a normal, already-connected update appears on the first poll after it is ingested. Only consider SSE from Worker to browser in a separate decision if measured latency or read load justifies it.
- [ ] Commit: `fix(admin): clarify live agent progress`.

## Phase 2: Continue from a finished preview

### Task 3: Create an authenticated, version-pinned request

**Files:** Modify `src/lib/admin-contracts.ts`, `worker/src/index.ts`, `worker/src/admin/workspace-capabilities.ts`, `worker/src/revision-coordinator.ts`; create `worker/src/admin/agent-follow-ups.ts`. Test in `worker/test/admin-workspace-api.test.ts` and `worker/test/revision-coordinator.test.ts`.

**Interfaces:**

- New `GET` and `POST /api/admin/onboarding-invites/workspace/attempts/:id/agent-follow-ups`. Route to a separate handler from `authenticatedWorkspace` under `guardedAdminRoute`; keep `workspaceApi` read-only. Require the existing verified session, admin/owner role and same-origin POST. The path uses the canonical workspace attempt ID. Resolve its site/issue to the normalized site repository server-side and keep one thread per repository; the browser does not supply a repo, PR, URL or dispatch payload. An eligible attempt can read that site's thread; if it has a different base than the thread's selected preview, explicitly show the selected preview before enabling send. Never silently switch the write target.
- `PreviewReference = { repository: string; pr: number; sha: string; deploymentId: string; previewUrl: string }`. Treat `previewUrl` as a deployment-specific, protected URL, never a signed review token or a branch alias.
- `SubmitAgentFollowUp = { requestId: string; expectedPreviewSha: string; text: string }`, with a UUID and 1–2,000 trimmed characters. `AgentFollowUp = { requestId: string; text: string; base: PreviewReference; status: "starting" | "running" | "preview_ready" | "manual_attention" | "failed"; result: PreviewReference | null; message: string | null; createdAt: number }`. GET returns `{ enabled: boolean; selectedPreview: PreviewReference | null; requests: AgentFollowUp[]; nextCursor: string | null }` and accepts a cursor for older requests.
- Add a chat-specific coordinator submission that persists origin attempt, stable site/thread key, authenticated actor and exact base in the revision row or an associated record in the same Durable Object. Reuse dispatch, claim and recovery. Same UUID and identical input returns the original request, even after selection has changed; changed input, stale base or a conflicting active operation returns `409` with a stable reason code. Scope replay to the authorized thread/actor.

- [ ] Add tests for unauthenticated/non-admin access, legacy Access mode, cross-origin POST, forged target inputs, ineligible attempts (failed, diagnostic-only, missing verified artifact, or borrowed preview), stale SHA, same-ID replay, changed prompt under the same ID, two different submits racing and publication or legacy feedback already in flight. Assert at most one eligible dispatch and no anonymous writes.
- [ ] Run `npm run test:worker -- -t 'agent follow-up'`; confirm new cases fail against the absent route.
- [ ] Resolve initial base from trusted delivery evidence and GitHub/Pages metadata; verify the exact deploy, repo, PR and SHA agree. Extend trusted delivery tracking if a supported flow does not record enough evidence. Leave historical or focused previews ineligible when the mapping or protected access cannot be proved. Inside the coordinator, check replay first and validate availability atomically with reservation; do not inherit the legacy waiting slot for chat writes.
- [ ] Run the targeted cases and full existing coordinator tests. Keep public submission disabled until Task 5 and the freeze gate are satisfied.
- [ ] Commit: `feat(revisions): record version-pinned agent follow-up requests`.

### Task 4: Deliver a private revision and record its exact result

**Files:** Modify `.github/workflows/process-feedback.yml`, `worker/src/revision-coordinator.ts`, `worker/src/index.ts`, `scripts/revision-queue-client.mjs`; test in `tests/revision-scope-workflows.test.ts`, `tests/revision-checkpoint.test.ts`, `worker/test/revision-coordinator.test.ts`.

**Interfaces:** The coordinator dispatches and the workflow claims by `requestId`. Add trusted `mode: "agent_follow_up"` and `expectedBaseSha` to the claimed request; completion accepts `{ requestId, baseSha, result: PreviewReference }`. The request text comes from that claimed request or its request-specific feedback record; never substitute the newest PR comment or the entire chat transcript.

- [ ] Add `agent follow-up pins the base and only selects a verified immutable result`: stale PR head stops before mutation; a head change before push does not overwrite another change; branch-alias and mismatched receipts are rejected; a failure after push keeps the old selection; a late completion cannot overwrite a newer selected result; replay resumes the existing request checkpoint without applying feedback twice. Assert that chat mode skips both success and failure emails, and normal developer feedback keeps its defaults.
- [ ] Run `npm test -- tests/revision-scope-workflows.test.ts tests/revision-checkpoint.test.ts` and the coordinator follow-up tests; confirm the new assertions fail.
- [ ] In chat mode, enforce the expected base at checkout and before a normal, non-force push. Reuse scope manifest, rendered revision, visual and SEO gates, and surface unsupported edits as manual attention. Capture the deployment-specific Pages receipt and verify SHA and private readiness. Never use the mutable branch alias as the retained reference. If deployment access or version retention cannot be proved, keep the feature disabled for that path.
- [ ] Record the result and advance the thread pointer in one coordinator transaction only after trusted success; make repeat outcomes idempotent. Keep prior receipts. If code was pushed but delivery failed, recover that request using its checkpoint; hold further writes for operator recovery if the branch head and last good preview no longer agree. Skip chat-mode publication and all email paths, including coordinator failure notices. Existing developer feedback still follows the normal path.
- [ ] Run the regression suites and canary-fixture local release checks (`npm run check`, `npm run build`, `npm run verify:local-release -- --config <fixture-site.config.json> --build`). Inspect rendered desktop and mobile for the requested change and unaffected content. Confirm both protected deployment URLs resolve to their own verified SHAs before accepting preservation of the old preview.
- [ ] Commit: `feat(revisions): deliver private revision receipts to Agent runs`.

### Task 5: Enable requests in the existing drawer

**Files:** Modify `src/admin/AttemptInspector.tsx`, `src/admin/GenerationActivity.tsx`, `src/admin/api.ts`; test in `tests/admin-workspace-browser.test.ts` and `worker/test/admin-workspace-api.test.ts`.

**Interface:** Add `AdminApi.getAgentFollowUps(attemptId, { cursor?, signal? })` and `submitAgentFollowUp(attemptId, input: SubmitAgentFollowUp, { signal? })`, backed by Task 3. Only `preview_ready` with a verified `result` shows an Open revised preview action. Preserve the original run trace.

- [ ] Add `reopens the thread during a revision without resubmitting`: submit once, lose the response, retry with the same UUID, reload during `running`, get the final result, then start another change from that result's SHA. Assert independent browsing of the previous preview and the new one; switching attempt cannot inherit another thread's draft. Add a stale-base case that preserves the draft and requires explicit reconfirmation after the newer preview is shown.
- [ ] Run `npm test -- tests/admin-workspace-browser.test.ts -t 'reopens the thread|retains a stale revision draft'`; confirm the locked composer or missing status fails the cases.
- [ ] Enable the composer only for an eligible preview and write-capable user. Use an explicit **Request a revision** action and keep one active revision per site; keep unsent text as a draft within the selected drawer, never dispatch it automatically. Show request text and status from the coordinator, and read it back on reopen. Keep the current trace and evidence available for questions about failures. A natural-language **Ask about this run** mode is a later read-only slice, separate from revision dispatch; this release has no general-purpose chat agent.
- [ ] Run admin browser cases at desktop and mobile, worker tests, type checks and admin build. Require bounded independent review of access, concurrent submissions and version selection. After freeze clearance and separate owner approval for a hosted run, demonstrate two sequential private revisions on a synthetic site, including no email or publication, a failed edit preserving the last successful preview, and reopening mid-run. Local fixtures do not prove hosted delivery.
- [ ] Commit: `feat(admin): request and follow private revisions in Agent runs`.

## Rollout and acceptance

Ship Phase 1 independently after its checks. Phase 2 is a proposal until the freeze clears; use admin-only capability gating and keep existing feedback as the fallback. Before declaring it seamless, verify an eligible operator can select a completed private preview, request a bounded edit once, watch it update in the same drawer, and open both the revised and previous versions. Any older attempt with only a mutable preview alias remains read-only until there is trusted version evidence.
