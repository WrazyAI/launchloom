# Agent Runs Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin-only follow-up conversation to Agent runs, with evidence-grounded answers, validated `suggest_solution` cards, and one exact-preview private revision per chosen fix.

**Architecture:** The Worker classifies and answers follow-ups on OpenCode Go. The per-site `RevisionCoordinator` stores the thread, run evidence and preview receipts, and dispatches an agent-mode revision. The admin UI renders the thread above the existing composer and turns validated suggestion results into cards. No client email or publication is emitted.

**Tech Stack:** TypeScript React admin workspace, Cloudflare Worker and SQLite Durable Object, GitHub Actions, Cloudflare Pages, Vitest, Playwright browser fixtures.

**Spec:** `docs/superpowers/specs/2026-11-27-agent-follow-ups-design.md`

## Global Constraints

- Admin and owner workspace only. Legacy Access mode stays read-only.
- No client email, review-link delivery, publication or automatic dispatch from this path.
- One active revision per site. A second message may produce cards, but every card button stays disabled until the active request settles.
- A writable base must be `preview_ready`, have an immutable Pages deployment URL, and match the preview on screen.
- Questions may target any attempt. Improvements target only the latest verified preview.
- Never reconstruct a card or brief from prose. Only a validated `suggest_solution` result can produce a card.
- OpenCode Go is the only inference provider. Do not add OpenRouter or `OPENROUTER_API_KEY`.
- Classifier model defaults to `gpt-6-luna`. Answering model is DeepSeek V4.1 Flash.
- OpenCode Go output is JSON schema constrained. No native tool calling is assumed.
- `AGENT_FOLLOW_UPS_ENABLED` gates the capability. Leave it off in production until the convergence freeze clears and a hosted canary passes.
- Never use em dashes in generated content or rendered client pages.

## Review Focus

- A card shown while a different preview is on screen must navigate or disable, never start a revision from another base. Tested in Task 6.
- A double click, retry, or repeated POST must produce one revision. Tested in Tasks 4 and 5.
- Malformed or prose-only model output must produce no actionable card. Tested in Task 4.
- A revision that pushes but fails deployment must not wedge the next follow-up. Tested in Task 5.
- Threads and evidence must not cross site repositories. Tested in Task 3.

## File structure

- `src/lib/agent-follow-ups.ts`: shared thread, suggestion, evidence and request types.
- `worker/src/agent-follow-ups/`: HTTP routes, classification, answering, brief builder.
- `worker/src/revision-coordinator.ts`: thread storage, preview receipts, evidence, agent-mode queue.
- `src/admin/AgentFollowUpThread.tsx` and `src/admin/SuggestionCard.tsx`: conversation and cards.
- `scripts/pages-deployment.mjs`, `scripts/publish-preview-delivery.mjs`, `scripts/build-agent-run-evidence.mjs`, `scripts/publish-agent-run-evidence.mjs`: trusted delivery and evidence.
- `.github/workflows/generate-client.yml` and `.github/workflows/process-feedback.yml`: receipt capture and agent-mode revision.
- `tests/agent-run-evidence.test.ts`, `tests/agent-follow-up-workflow.test.ts`, `tests/agent-follow-ups-integration.test.ts`, `worker/test/agent-follow-ups-*.test.ts`, `tests/admin-workspace-browser.test.ts`: coverage.

---

### Task 1: Capture an immutable preview receipt

**Files:**
- Create: `scripts/pages-deployment.mjs`
- Create: `scripts/publish-preview-delivery.mjs`
- Create: `worker/src/agent-follow-ups/http.ts`
- Modify: `worker/src/revision-coordinator.ts`
- Modify: `worker/src/index.ts`
- Modify: `.github/workflows/generate-client.yml`
- Test: `tests/pages-deployment.test.ts`
- Test: `worker/test/agent-follow-ups-http.test.ts`

**Interfaces:**
- Consumes: none.
- Produces:
  - `pagesDeploymentUrl(output: string): string` and `pagesDeploymentId(url: string): string` in `scripts/pages-deployment.mjs`.
  - `buildPreviewDeliveryPayload(args: Record<string, string>, environment?: Record<string, string | undefined>): PreviewDeliveryPayload`.
  - `RevisionCoordinator.recordPreviewDelivery(input: PreviewDeliveryPayload): Promise<{ ok: true }>`.
  - `RevisionCoordinator.latestPreviewDelivery(repo: string): Promise<PreviewDelivery | null>`.
  - `POST /api/internal/agent-follow-ups/preview-deliveries` with `Authorization: Bearer $REVISION_COORDINATOR_SECRET`.
  - `PreviewDelivery` type with `{ repository, attemptId, project, pr, sha, deploymentId, previewUrl }`.

- [ ] **Step 1: Write the failing unit tests**

```ts
// tests/pages-deployment.test.ts
import { describe, expect, it } from "vitest";
import { pagesDeploymentId, pagesDeploymentUrl } from "../scripts/pages-deployment.mjs";

it("extracts the immutable deployment URL and rejects aliases", () => {
  const output = "✨ Deployment complete! Take a peek over at https://4c1e9a2b.launchloom-bhl.pages.dev";
  expect(pagesDeploymentUrl(output)).toBe("https://4c1e9a2b.launchloom-bhl.pages.dev");
  expect(pagesDeploymentId("https://4c1e9a2b.launchloom-bhl.pages.dev")).toBe("4c1e9a2b");
  expect(() => pagesDeploymentId("https://review-initial.launchloom-bhl.pages.dev")).toThrow(/alias/u);
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npm test -- tests/pages-deployment.test.ts`

Expected: FAIL because `scripts/pages-deployment.mjs` does not exist.

- [ ] **Step 3: Implement the URL helper and payload builder**

Move `pagesDeploymentUrl` from `scripts/run-pipeline-test.mjs` into `scripts/pages-deployment.mjs` and re-export it from `run-pipeline-test.mjs`. `pagesDeploymentId` must return the first hostname label and reject `review-initial`, `review-diagnostic`, `main` and any hostname without a `.pages.dev` suffix. `buildPreviewDeliveryPayload` returns `{ repository, attemptId, project, pr, sha, deploymentId, previewUrl }` and validates the deployment hostname starts with `deploymentId`.

- [ ] **Step 4: Add the failing Worker test**

```ts
// worker/test/agent-follow-ups-http.test.ts
it("rejects preview aliases and stores the immutable receipt", async () => {
  const unauthorized = await worker.fetch(new Request(`${origin}/api/internal/agent-follow-ups/preview-deliveries`, { method: "POST" }), bindings, context());
  expect(unauthorized.status).toBe(401);
  const alias = await postPreview({ previewUrl: "https://review-initial.example.pages.dev" }, secret);
  expect(alias.status).toBe(400);
  const accepted = await postPreview({
    repository: "WrazyAI/example-client",
    attemptId: "attempt-0001",
    project: "example",
    pr: 9,
    sha: "a".repeat(40),
    deploymentId: "4c1e9a2b",
    previewUrl: "https://4c1e9a2b.example.pages.dev",
  }, secret);
  expect(accepted.status).toBe(200);
  const latest = await env.REVISION_COORDINATOR.getByName("wrazyai/example-client").latestPreviewDelivery("WrazyAI/example-client");
  expect(latest?.deploymentId).toBe("4c1e9a2b");
});
```

- [ ] **Step 5: Run the Worker test and watch it fail**

Run: `npm run test:worker -- -t 'preview aliases'`

Expected: FAIL because the route and coordinator method are absent.

- [ ] **Step 6: Implement the route and coordinator storage**

Create the `preview_deliveries` table in the coordinator with primary key `(repo, attempt_id)`, columns for `pr`, `sha`, `project`, `deployment_id`, `preview_url`, `created_at`. Add `recordPreviewDelivery` and `latestPreviewDelivery`. Add the internal route in `worker/src/index.ts` before the public API routes, validating the bearer secret with `constantTimeEqual`, the repository shape, the SHA, the project, and the URL host.

- [ ] **Step 7: Capture the immutable URL in the generation workflow**

In `.github/workflows/generate-client.yml`, replace each `npx wrangler pages deploy ...` call with one that writes output to `$RUNNER_TEMP/pages-deploy.log`, then run `node scripts/publish-preview-delivery.mjs --log "$RUNNER_TEMP/pages-deploy.log" --project ... --repo ... --attempt ... --pr ... --sha "$FINAL_BUILD_SHA"`. Keep the existing branch-alias output for human links, but never use it as the receipt.

- [ ] **Step 8: Run tests and commit**

Run: `npm test -- tests/pages-deployment.test.ts && npm run test:worker -- -t 'preview aliases'`

Expected: both pass.

```bash
git add scripts/pages-deployment.mjs scripts/publish-preview-delivery.mjs scripts/run-pipeline-test.mjs worker/src/agent-follow-ups/http.ts worker/src/revision-coordinator.ts worker/src/index.ts .github/workflows/generate-client.yml tests/pages-deployment.test.ts worker/test/agent-follow-ups-http.test.ts
git commit -m "feat(follow-ups): record immutable preview receipts"
```

---

### Task 2: Store a bounded run evidence summary

**Files:**
- Create: `scripts/build-agent-run-evidence.mjs`
- Create: `scripts/publish-agent-run-evidence.mjs`
- Modify: `worker/src/agent-follow-ups/http.ts`
- Modify: `worker/src/revision-coordinator.ts`
- Modify: `.github/workflows/generate-client.yml`
- Test: `tests/agent-run-evidence.test.ts`
- Test: `worker/test/agent-follow-ups-http.test.ts`

**Interfaces:**
- Consumes: `PreviewDelivery` from Task 1.
- Produces:
  - `buildAgentRunEvidence(input: { report: unknown; creativeSummary?: unknown; assets?: unknown; routeReport?: unknown; preview: PreviewDelivery | null }): AgentRunEvidence`.
  - `POST /api/internal/agent-follow-ups/run-evidence` with coordinator secret.
  - `RevisionCoordinator.recordAgentRunEvidence(input): Promise<{ ok: true }>`.
  - `RevisionCoordinator.latestAgentRunEvidence(repo: string): Promise<AgentRunEvidence | null>`.

- [ ] **Step 1: Write the failing builder test**

```ts
// tests/agent-run-evidence.test.ts
import { buildAgentRunEvidence } from "../scripts/build-agent-run-evidence.mjs";

it("keeps the recorded outcome and marks missing evidence", () => {
  const evidence = buildAgentRunEvidence({
    report: {
      profile: "full-preview",
      verdict: "passed",
      candidateCount: 2,
      selectedCandidateId: "candidate-b",
      stages: { creative: { status: "passed" }, technical: { status: "failed", error: "Contrast failed." } },
      previewDelivered: true,
    },
    assets: { requested: 3, placed: 2, skipped: 1, providerFailure: null },
    preview: { repository: "WrazyAI/example", attemptId: "attempt-0001", project: "example", pr: 9, sha: "a".repeat(40), deploymentId: "4c1e9a2b", previewUrl: "https://4c1e9a2b.example.pages.dev" },
  });
  expect(evidence.verdict).toBe("passed");
  expect(evidence.candidates).toEqual([
    { id: "candidate-a", score: null, selected: false },
    { id: "candidate-b", score: null, selected: true },
  ]);
  expect(evidence.gates).toContainEqual({ name: "technical", status: "failed", summary: "Contrast failed." });
  expect(evidence.routeChecks).toEqual([]);
  expect(evidence.assets).toEqual({ requested: 3, placed: 2, skipped: 1, providerFailure: null });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- tests/agent-run-evidence.test.ts`

Expected: FAIL because the builder is absent.

- [ ] **Step 3: Implement the bounded builder**

Cap output at 12 candidates, 20 gates, 20 route checks, 8 failures. Cap every string at 240 characters. Read only the passed objects. Never invent a candidate score. Include `preview` exactly as supplied. Set `recordedAt` to the current epoch milliseconds only when `input.recordedAt` is absent.

- [ ] **Step 4: Add the failing ingest test**

```ts
it("stores run evidence for the exact repository", async () => {
  const response = await postEvidence(validEvidence, secret);
  expect(response.status).toBe(200);
  const stored = await env.REVISION_COORDINATOR.getByName("wrazyai/example").latestAgentRunEvidence("WrazyAI/example");
  expect(stored?.selectedCandidateId).toBe("candidate-b");
  expect(stored?.preview?.deploymentId).toBe("4c1e9a2b");
});
```

- [ ] **Step 5: Run it and watch it fail**

Run: `npm run test:worker -- -t 'stores run evidence'`

Expected: FAIL because the route and method are absent.

- [ ] **Step 6: Implement the evidence table, route and workflow call**

Store one row per `(repo, attempt_id)`. Validate the payload with the builder contract. Call `publish-agent-run-evidence.mjs` after the preview deploy step and before the completion event. Pass the report, creative summary, asset manifest and route report paths explicitly.

- [ ] **Step 7: Run both tests and commit**

Run: `npm test -- tests/agent-run-evidence.test.ts && npm run test:worker -- -t 'run evidence'`

Expected: both pass.

```bash
git add scripts/build-agent-run-evidence.mjs scripts/publish-agent-run-evidence.mjs worker/src/agent-follow-ups/http.ts worker/src/revision-coordinator.ts .github/workflows/generate-client.yml tests/agent-run-evidence.test.ts worker/test/agent-follow-ups-http.test.ts
git commit -m "feat(follow-ups): store bounded run evidence"
```

---

### Task 3: Add the site thread and authenticated read API

**Files:**
- Create: `src/lib/agent-follow-ups.ts`
- Create: `worker/src/agent-follow-ups/http.ts` (extend)
- Modify: `worker/src/revision-coordinator.ts`
- Modify: `worker/src/index.ts`
- Modify: `worker/src/admin/workspace-capabilities.ts`
- Modify: `src/lib/admin-contracts.ts`
- Modify: `src/admin/api.ts`
- Test: `worker/test/revision-coordinator.test.ts`
- Test: `worker/test/agent-follow-ups-http.test.ts`

**Interfaces:**
- Consumes: `AgentRunEvidence`, `PreviewDelivery`.
- Produces:
  - `AgentThread`, `AgentMessage`, `AgentSuggestion`, `AgentThreadPage` in `src/lib/agent-follow-ups.ts`.
  - `RevisionCoordinator.readAgentThread(repo: string, options: { cursor?: string | null; limit?: number }): Promise<AgentThreadPage>`.
  - `RevisionCoordinator.appendAgentExchange(input: AgentExchangeInput): Promise<AgentExchangeResult>`.
  - `GET /api/admin/onboarding-invites/workspace/attempts/:id/agent-follow-ups`.
  - `WorkspaceCapabilities.agentFollowUps: boolean`.
  - `AdminApi.getAgentThread(attemptId, options)`.

- [ ] **Step 1: Write the failing coordinator test**

```ts
it("keeps one thread per repository and separates sites", async () => {
  const first = env.REVISION_COORDINATOR.getByName("wrazyai/site-a");
  const second = env.REVISION_COORDINATOR.getByName("wrazyai/site-b");
  await first.appendAgentExchange({
    repo: "WrazyAI/site-a",
    attemptId: "attempt-a",
    adminText: "Why did the mobile check fail?",
    agentText: "The contact action fell below the fold.",
    intent: "question",
    suggestions: [],
    evidence: evidenceFor("attempt-a"),
  });
  expect((await first.readAgentThread("WrazyAI/site-a")).messages).toHaveLength(2);
  expect((await second.readAgentThread("WrazyAI/site-b")).messages).toHaveLength(0);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run test:worker -- -t 'one thread per repository'`

Expected: FAIL because the methods are absent.

- [ ] **Step 3: Implement thread tables and methods**

Add `agent_threads`, `agent_messages` and `agent_suggestions` tables. `AgentExchangeInput` is `{ repo, attemptId, adminText, agentText, intent, suggestions, evidence }`. Store the admin message and agent reply in one transaction. Each message records the attempt id. Order reads oldest to newest. Return `latestPreview` from Task 1, `latestEvidence` from Task 2, `activeRequestId`, and `writable` only when the latest preview is `preview_ready`, immutable and owned by the requested repository.

- [ ] **Step 4: Add the question-on-failed-attempt test**

```ts
it("reads a question thread for a failed attempt without a preview", async () => {
  const coordinator = env.REVISION_COORDINATOR.getByName("wrazyai/failed-site");
  await coordinator.appendAgentExchange({
    repo: "WrazyAI/failed-site",
    attemptId: "attempt-failed",
    adminText: "Why did the run fail?",
    agentText: "The render gate failed before deployment.",
    intent: "question",
    suggestions: [],
    evidence: null,
  });
  const thread = await coordinator.readAgentThread("WrazyAI/failed-site");
  expect(thread.latestPreview).toBeNull();
  expect(thread.writable).toBe(false);
  expect(thread.messages[0]?.text).toContain("Why did the run fail?");
});
```

- [ ] **Step 5: Write the failing API test**

```ts
it("requires admin access and resolves the thread from the attempt", async () => {
  const response = await worker.fetch(new Request(`${base}/attempts/attempt-0001/agent-follow-ups`, { headers: { Origin: origin } }), bindings, context());
  expect(response.status).toBe(403);
  const admin = await worker.fetch(new Request(`${base}/attempts/attempt-0001/agent-follow-ups`, { headers: { Origin: origin } }), bindings, context("admin@example.test"));
  expect(admin.status).toBe(200);
  const body = await admin.json();
  expect(body.thread.messages).toEqual([]);
});
```

- [ ] **Step 6: Run it and watch it fail**

Run: `npm run test:worker -- -t 'resolves the thread from the attempt'`

Expected: FAIL because the route is absent.

- [ ] **Step 7: Implement the route and capability**

Route the admin GET in `authenticatedWorkspace` before `workspaceApi`. Resolve the attempt through `GENERATION_LEDGER`, use its repository and issue number, and reject missing or foreign attempts. Add `agentFollowUps` to `WorkspaceCapabilities` only when `AGENT_FOLLOW_UPS_ENABLED === "true"`. Parse it in `src/admin/api.ts`.

- [ ] **Step 8: Run both tests and commit**

Run: `npm run test:worker -- -t 'one thread per repository|resolves the thread from the attempt'`

Expected: both pass.

```bash
git add src/lib/agent-follow-ups.ts worker/src/agent-follow-ups/http.ts worker/src/revision-coordinator.ts worker/src/index.ts worker/src/admin/workspace-capabilities.ts src/lib/admin-contracts.ts src/admin/api.ts worker/test/revision-coordinator.test.ts worker/test/agent-follow-ups-http.test.ts
git commit -m "feat(follow-ups): add site thread read API"
```

---

### Task 4: Classify and answer follow-up messages

**Files:**
- Create: `worker/src/agent-follow-ups/classify.ts`
- Create: `worker/src/agent-follow-ups/answer.ts`
- Create: `worker/src/agent-follow-ups/brief.ts`
- Modify: `worker/src/opencode-go.ts`
- Modify: `worker/src/agent-follow-ups/http.ts`
- Test: `worker/test/agent-follow-ups-model.test.ts`
- Test: `worker/test/agent-follow-ups-http.test.ts`

**Interfaces:**
- Consumes: `AgentRunEvidence`, thread types.
- Produces:
  - `opencodeGoCompletion({ apiKey, system, user, model, outputFormat, maxOutputTokens, signal, sessionId })`.
  - `classifyFollowUp(input): Promise<{ intent: "question" | "improvement" | "mixed" | "unsupported"; confidence: "high" | "medium" | "low"; edits: SuggestionEdit[]; reason: string }>`.
  - `answerFollowUp(input): Promise<{ answer: string; suggestions: RawSuggestion[] }>`.
  - `buildRevisionBrief(input): string`.
  - `POST /api/admin/onboarding-invites/workspace/attempts/:id/agent-follow-ups` with `{ requestId, text, mode, attemptId, baseDeploymentId }`, returning `{ ok: true; thread: AgentThread }` or `{ ok: true; fallback: "choose_mode" }`.
  - `RawSuggestion` with `{ issue, probableCause, causeStatus, suggestedFix, edits, checks, evidence, guardrails }`.

- [ ] **Step 1: Write the failing model tests**

```ts
it("rejects prose-only suggestions and keeps at most three cards", async () => {
  network.use(http.post("https://opencode.ai/inference/go/v1/responses", () => HttpResponse.json({ status: "completed", output: [{ content: [{ type: "output_text", text: JSON.stringify({ answer: "No action needed." }) }] }] })));
  const result = await answerFollowUp({ ...input, apiKey: "test" });
  expect(result.suggestions).toEqual([]);
  expect(result.answer).toBe("No action needed.");
});

it("classifies a question on the Go classifier model", async () => {
  network.use(http.post("https://opencode.ai/inference/go/v1/responses", async ({ request }) => {
    const body = await request.json();
    expect(body.model).toBe("gpt-6-luna");
    return HttpResponse.json({ status: "completed", output: [{ content: [{ type: "output_text", text: JSON.stringify({ intent: "question", confidence: "high", edits: [], reason: "Asks for evidence." }) }] }] });
  }));
  await expect(classifyFollowUp({ ...input, apiKey: "test" })).resolves.toMatchObject({ intent: "question" });
});

it("falls back to no card on malformed model JSON", async () => {
  network.use(http.post("https://opencode.ai/inference/go/v1/responses", () => HttpResponse.json({ status: "completed", output: [{ content: [{ type: "output_text", text: "I think you should fix the hero." }] }] })));
  await expect(answerFollowUp({ ...input, apiKey: "test" })).resolves.toEqual({ answer: "", suggestions: [] });
});

it("returns a choose-mode fallback when classification fails", async () => {
  network.use(http.post("https://opencode.ai/inference/go/v1/responses", () => new HttpResponse(null, { status: 503 })));
  const response = await postMessage({ requestId: "request-fallback", text: "Could the headline be clearer?", mode: "auto" });
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({ fallback: "choose_mode" });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npm run test:worker -- -t 'prose-only suggestions|classifies a question|malformed model JSON|choose-mode fallback'`

Expected: FAIL because the modules and model option are absent.

- [ ] **Step 3: Extend the Go helper**

Add an optional `model` and `outputFormat` to `opencodeGoCompletion`. Send `body.text.format` exactly as `scripts/inference-client.mjs` does for the Responses protocol. Default the model to `OPENCODE_GO_WORKER_MODEL` so existing callers do not change.

- [ ] **Step 4: Implement classification and answering**

Classification uses `gpt-6-luna` with a strict `json_schema` named `agent_follow_up_classification`. Answering uses `deepseek-v4.1-flash` with a strict schema containing `answer` and `suggestions`. Validate every suggestion through `buildRevisionBrief`. Reject unknown fields, empty edits, more than three suggestions, and suggestions without an issue or fix.

- [ ] **Step 5: Write the failing brief test**

```ts
it("includes cause, solution, edits, checks, evidence and base in the worker brief", () => {
  const brief = buildRevisionBrief({ ...suggestion, adminText: "The button is hidden.", preview });
  expect(brief).toContain("Probable cause");
  expect(brief).toContain("Suggested solution");
  expect(brief).toContain("Place the secondary action beside the primary action.");
  expect(brief).toContain("Render the home page at 390px");
  expect(brief).toContain("Mobile order check at 390px");
  expect(brief).toContain("Preserve verified facts and client assets.");
  expect(brief).toContain("4c1e9a2b.example.pages.dev");
  expect(brief).not.toContain("chain of thought");
});
```

- [ ] **Step 6: Add the POST route test**

```ts
it("stores the admin message and validated cards once", async () => {
  const first = await postMessage({ requestId: "request-1", text: "The button is hidden.", mode: "auto" });
  expect(first.status).toBe(202);
  const duplicate = await postMessage({ requestId: "request-1", text: "The button is hidden.", mode: "auto" });
  expect(duplicate.status).toBe(200);
  const thread = await getThread();
  expect(thread.messages).toHaveLength(2);
  expect(thread.messages[1].suggestions).toHaveLength(1);
});
```

- [ ] **Step 7: Implement the route, run tests, commit**

Run: `npm run test:worker -- -t 'prose-only suggestions|classifies a question|worker brief|validated cards once'`

Expected: all pass.

```bash
git add worker/src/opencode-go.ts worker/src/agent-follow-ups/classify.ts worker/src/agent-follow-ups/answer.ts worker/src/agent-follow-ups/brief.ts worker/src/agent-follow-ups/http.ts worker/test/agent-follow-ups-model.test.ts worker/test/agent-follow-ups-http.test.ts
git commit -m "feat(follow-ups): classify and answer admin messages"
```

---

### Task 5: Apply a suggestion as an exact-preview revision

**Files:**
- Modify: `worker/src/revision-coordinator.ts`
- Modify: `worker/src/agent-follow-ups/http.ts`
- Modify: `.github/workflows/process-feedback.yml`
- Modify: `scripts/revision-queue-client.mjs`
- Test: `worker/test/revision-coordinator.test.ts`
- Test: `tests/agent-follow-up-workflow.test.ts`

**Interfaces:**
- Consumes: thread, evidence and suggestion types.
- Produces:
  - `RevisionCoordinator.enqueueAgentFollowUp(input: AgentFollowUpRequest): Promise<EnqueueResult>`.
  - `RevisionCoordinator.complete(requestId: string, result?: { baseSha: string; preview: PreviewDelivery }): Promise<CompletionResult>`.
  - `POST /api/admin/onboarding-invites/workspace/attempts/:id/agent-follow-ups/:suggestionId/apply`.
  - `repository_dispatch` type `process-agent-follow-up`.
  - `AgentFollowUpRequest` with `{ requestId, repo, baseSha, baseDeploymentId, brief, suggestionId }`.

- [ ] **Step 1: Write the failing coordinator tests**

```ts
it("starts one revision from the exact base and rejects a moved base", async () => {
  const coordinator = env.REVISION_COORDINATOR.getByName("wrazyai/apply-test");
  const accepted = await coordinator.enqueueAgentFollowUp({ requestId: "agent-1", repo: "WrazyAI/apply-test", baseSha: "a".repeat(40), baseDeploymentId: "4c1e9a2b", brief: "brief", suggestionId: "suggestion-1" });
  expect(accepted).toMatchObject({ ok: true, queueStatus: "started" });
  const stale = await coordinator.enqueueAgentFollowUp({ requestId: "agent-2", repo: "WrazyAI/apply-test", baseSha: "b".repeat(40), baseDeploymentId: "old", brief: "brief", suggestionId: "suggestion-2" });
  expect(stale).toMatchObject({ ok: false, code: "preview_base_moved" });
  const duplicate = await coordinator.enqueueAgentFollowUp({ requestId: "agent-1", repo: "WrazyAI/apply-test", baseSha: "a".repeat(40), baseDeploymentId: "4c1e9a2b", brief: "brief", suggestionId: "suggestion-1" });
  expect(duplicate).toMatchObject({ ok: true, queueStatus: "duplicate" });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run test:worker -- -t 'exact base'`

Expected: FAIL because the method and code are absent.

- [ ] **Step 3: Implement agent-mode enqueue and completion**

Add `stage: "agent"` and `source: "agent_follow_up"` without overloading `developer` or `client`. `client_email` stores an empty string. `enqueueAgentFollowUp` checks the latest preview receipt, the suggestion status, duplicate request id, and one active request. `complete` records the result preview only after a verified receipt and advances the thread. Keep existing `complete(requestId)` behavior.

- [ ] **Step 4: Add the workflow test**

```ts
it("uses a request branch and skips email and publication", async () => {
  const workflow = await readFile(".github/workflows/process-feedback.yml", "utf8");
  expect(workflow).toContain("process-agent-follow-up");
  expect(workflow).toContain("agent-revision/$REVISION_REQUEST_ID");
  expect(workflow).toContain("if: github.event.client_payload.agentFollowUp != true");
  expect(workflow).not.toContain("send-preview-email.mjs --to \"$CLIENT_EMAIL\"");
});
```

- [ ] **Step 5: Implement the workflow mode**

Clone the exact base commit, verify the expected SHA, create `agent-revision/$REVISION_REQUEST_ID` from the base, apply the existing scope and rendered gates, deploy directly, and complete with the immutable receipt. Skip `review_delivery` and every publication step when `agentFollowUp` is true. Do not move the shared review branch.

- [ ] **Step 6: Add the apply route test**

```ts
it("uses the validated brief and rejects a mismatched preview", async () => {
  const wrong = await applySuggestion({ suggestionId: "suggestion-1", baseDeploymentId: "other" });
  expect(wrong.status).toBe(409);
  const accepted = await applySuggestion({ suggestionId: "suggestion-1", baseDeploymentId: "4c1e9a2b" });
  expect(accepted.status).toBe(202);
});
```

- [ ] **Step 7: Run tests and commit**

Run: `npm run test:worker -- -t 'exact base|validated brief' && npm test -- tests/agent-follow-up-workflow.test.ts`

Expected: all pass.

```bash
git add worker/src/revision-coordinator.ts worker/src/agent-follow-ups/http.ts .github/workflows/process-feedback.yml scripts/revision-queue-client.mjs worker/test/revision-coordinator.test.ts tests/agent-follow-up-workflow.test.ts
git commit -m "feat(follow-ups): apply suggestions as pinned revisions"
```

---

### Task 6: Render the thread, composer and suggestion cards

**Files:**
- Create: `src/admin/AgentFollowUpThread.tsx`
- Create: `src/admin/SuggestionCard.tsx`
- Modify: `src/admin/GenerationActivity.tsx`
- Modify: `src/admin/attempt-drawer.css`
- Modify: `src/admin/api.ts`
- Test: `tests/admin-workspace-browser.test.ts`

**Interfaces:**
- Consumes: `AdminApi.getAgentThread`, `submitAgentFollowUp`, `applyAgentSuggestion`.
- Produces:
  - `AgentFollowUpThread({ api, attemptId, enabled, activeRequestId, onOpenPreview })`.
  - `SuggestionCard({ suggestion, disabled, onApply, onOpenBase })`.

- [ ] **Step 1: Write the failing browser test**

```ts
it("answers a question, renders a suggestion card, and applies it in place", async () => {
  const { page } = await openPage({ path: `/admin/onboarding-invites?view=generations&attempt=attempt-0005` });
  const followUps = page.locator("#attempt-inspector");
  await followUps.getByPlaceholder("Ask about this run, or describe what to improve").fill("The contact button is below the fold. Any ideas?");
  await followUps.getByRole("button", { name: "Send" }).click();
  await visible(followUps.getByText("The contact action falls below the fold at 390px"));
  await followUps.getByRole("button", { name: "Fix in Agent runs" }).click();
  await visible(followUps.getByText("Revision running"));
  await visible(followUps.getByText("Mobile hero revised."));
});

it("does not create a suggestion when a run finishes without a follow-up", async () => {
  const { page } = await openPage({ path: `/admin/onboarding-invites?view=generations&attempt=attempt-0005` });
  const followUps = page.locator("#attempt-inspector");
  await expect.poll(() => followUps.getByRole("button", { name: "Fix in Agent runs" }).count()).toBe(0);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- tests/admin-workspace-browser.test.ts -t 'answers a question|without a follow-up'`

Expected: FAIL because the composer is still locked.

- [ ] **Step 3: Build the thread and card**

Render the site thread above the composer. The card shows the issue, the suggested fix and the button. Show the edit count in a small line. States are ready, working, delivered and needs review. A card whose base is not the open attempt changes the button to **Open latest preview**. A card for another preview must not call apply.

- [ ] **Step 4: Add the base and concurrency browser tests**

```ts
it("does not apply a card from another preview", async () => {
  await visible(followUps.getByRole("button", { name: "Open latest preview" }));
  expect(await followUps.getByRole("button", { name: "Fix in Agent runs" }).count()).toBe(0);
});

it("disables card buttons while a revision is active", async () => {
  await expect.poll(() => followUps.getByRole("button", { name: "Revision running" }).isDisabled()).toBe(true);
});

it("shows a needs-review card without an apply action", async () => {
  await visible(followUps.getByRole("button", { name: "Needs review" }));
  expect(await followUps.getByRole("button", { name: "Fix in Agent runs" }).count()).toBe(0);
});
```

- [ ] **Step 5: Run the tests and watch them fail or pass for the right reason**

Run: `npm test -- tests/admin-workspace-browser.test.ts -t 'answers a question|another preview|revision is active|needs-review'`

Expected: the new cases fail until the base and active-request states are wired.

- [ ] **Step 6: Implement the API client and capability gate**

Add `getAgentThread`, `submitAgentFollowUp` and `applyAgentSuggestion` to `src/admin/api.ts`. Keep the locked composer when `agentFollowUps` is false. While a revision is active, keep the composer draftable but disable every card button.

- [ ] **Step 7: Run desktop and mobile checks**

Run: `npm test -- tests/admin-workspace-browser.test.ts -t 'answers a question|another preview|revision is active'`

Expected: pass at both widths. Inspect the screenshots if `ADMIN_DESIGN_CAPTURE_DIR` is set.

```bash
git add src/admin/AgentFollowUpThread.tsx src/admin/SuggestionCard.tsx src/admin/GenerationActivity.tsx src/admin/attempt-drawer.css src/admin/api.ts tests/admin-workspace-browser.test.ts
git commit -m "feat(admin): add Agent runs follow-up thread"
```

---

### Task 7: Gate, document and verify the full flow

**Files:**
- Modify: `worker/src/admin/workspace-capabilities.ts`
- Modify: `tests/production-model-policy.test.ts`
- Create: `tests/agent-follow-ups-integration.test.ts`
- Modify: `.github/agents/progress-update/UPDATE-YYYY-MM-DD.md`
- Modify: `docs/superpowers/specs/2026-11-27-agent-follow-ups-design.md` only if a verified fact changes.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: an off-by-default capability and an end-to-end fixture.

- [ ] **Step 1: Add the policy test**

```ts
import { glob, readFile } from "node:fs/promises";

it("keeps follow-up inference on OpenCode Go", async () => {
  const files = await glob("worker/src/**/*.ts");
  for (const file of files) {
    const source = await readFile(file, "utf8");
    expect(source).not.toContain("openrouter.ai");
    expect(source).not.toContain("OPENROUTER_API_KEY");
  }
  expect(await readFile("worker/src/agent-follow-ups/classify.ts", "utf8")).toContain("gpt-6-luna");
});
```

- [ ] **Step 2: Add the integration fixture test**

```ts
it("does not email, publish, or cross sites during a follow-up revision", async () => {
  const flow = await runFollowUpFixture();
  expect(flow.emailCalls).toBe(0);
  expect(flow.publicationCalls).toBe(0);
  expect(flow.thread.siteId).toBe("site-a");
  expect(flow.thread.messages.every((message) => message.attemptId === "attempt-a")).toBe(true);
});
```

- [ ] **Step 3: Implement the gate and fixture**

Default `AGENT_FOLLOW_UPS_ENABLED` to false. The fixture covers one question, one suggestion, one apply, one completion, one failed revision, and a second site. Use MSW for Go and GitHub.

- [ ] **Step 4: Run the full checks**

Run:

```bash
npm run build:admin
npm test -- tests/agent-run-evidence.test.ts tests/agent-follow-up-workflow.test.ts tests/agent-follow-ups-integration.test.ts tests/admin-workspace-browser.test.ts
npm run test:worker
npm run check
npm run check:worker
npm run build
```

Expected: every command exits 0.

- [ ] **Step 5: Record the freeze and rollout state**

Run `npm run report:generation-success` at start and finish. Record the report, the capability state, the test results and the hosted verification gap in `.github/agents/progress-update/UPDATE-YYYY-MM-DD.md`. Do not enable the flag or deploy a client-facing change until the five consecutive `preview_ready` requirement is met or the owner records an override.

- [ ] **Step 6: Commit**

```bash
git add worker/src/admin/workspace-capabilities.ts tests/production-model-policy.test.ts tests/agent-follow-ups-integration.test.ts .github/agents/progress-update/UPDATE-YYYY-MM-DD.md
git commit -m "test(follow-ups): gate and verify the admin flow"
```
