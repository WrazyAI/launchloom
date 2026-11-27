# Agent Runs Follow-ups and Suggested Fixes Design

**Date:** 2026-11-27

**Status:** Draft for owner review

**Work OS:** `407bf9ee-595b-4adc-ac8c-b7c4109994f1`

## Intent

Let an admin continue a finished LaunchLoom run in the same Agent runs view. They can ask what happened or request an improvement. The agent answers from recorded evidence and may offer a structured fix. Choosing that fix starts one bounded revision from the exact preview they are viewing.

The conversation is a way to understand and improve a preview. It is not a general chatbot, and it is not a publishing surface.

## Why this exists

A finished run currently ends the interaction. The admin can read the trace, but cannot ask why a choice was made or request a small correction without leaving the dashboard. The revision queue already supports bounded feedback, but it starts from the current review head rather than a specific preview, and its delivery path includes developer email.

This design connects the existing activity evidence to the existing revision machinery without weakening either one.

## Goals

- Answer follow-up questions from the latest recorded run, including its successes, gate findings, candidate differences and preview identity.
- Let DeepSeek suggest a fix through a declared `suggest_solution` tool result, not loose prose.
- Render every suggestion as a card with the issue, the proposed change and one action.
- Start a revision from the exact preview the admin selected, with all related edits in one request.
- Keep the previous preview available when a revision fails.
- Keep the admin in one site-level conversation across runs.
- Allow several related edits in one suggestion and one revision.
- Keep classification isolated from the generation path and on the same inference provider.

## Non-goals

- No client-facing chat or client-triggered revisions.
- No automatic publication, client email or review-link delivery from a follow-up.
- No general-purpose assistant for unrelated work.
- No unsolicited suggestion card when a run finishes.
- No re-use of a finished model session. Every improvement is a new bounded revision.
- No direct site mutation from a card without an explicit button press.
- No raw chain-of-thought in the answer, the brief or the thread.

## Anti-goals

The feature fails if any of these happen:

- A suggestion changes a site before the admin chooses it.
- A revision edits a different preview than the one shown.
- A failed revision replaces the last working preview.
- The agent invents a cause that the run did not record and presents it as fact.
- A question starts a paid revision.
- A thread crosses sites or leaks another client's run details.
- A suggestion card is produced by parsing prose.

## Owner decisions

These are settled:

1. The audience is the admin and owner workspace only.
2. The composer is enabled only after a follow-up message. Finished runs stay quiet.
3. The two actions are explicit: **Ask about this run** and **Request an improvement**.
4. One conversation is kept per site.
5. One improvement request may bundle several related edits.
6. The card shows the issue, the suggestion and the button. No separate header component.
7. An unconfirmed probable cause still offers **Fix in Agent runs**. Verification decides whether it worked.
8. **Needs review** is reserved for unsupported edits or a missing or moved preview base.
9. DeepSeek through OpenCode Go produces the answer and suggestions.
10. The classifier uses OpenCode Go with `gpt-6-luna`, in one isolated server-side module. There is no OpenRouter exception.
11. `openai/gpt-6-luna-decisions` is not in the public model catalog. The Go classifier model is configurable and defaults to `gpt-6-luna`. DeepSeek V4.1 Flash remains the answering and suggestion model.
12. The owning agent receives a complete brief: issue, probable cause, suggested solution, edits, checks, evidence, guardrails and base preview.

## Verified current state

- Agent runs already receives sanitized model output, actions, stage changes, gate activity and repair activity through authenticated cursor polling. Trace retention is 30 days.
- The Worker uses OpenCode Go for all Worker AI features. The previous OpenRouter calls were migrated to OpenCode Go, and `OPENROUTER_API_KEY` is no longer configured for the Worker.
- The reviewed OpenCode Go profile supports text, JSON and JSON schema output. It does not currently expose native tool calling. The Worker helper currently pins `deepseek-v4.1-flash`, so the plan must extend it to accept the classifier model.
- `deploy-platform.yml` already configures `OPENCODE_GO_API_KEY` for the API Worker, so the classifier and answering agent can run server-side without a new dispatch workflow or credential.
- `RevisionCoordinator` already queues, claims, retries and recovers revision requests. It deduplicates by request ID and fingerprint, enforces one active request, and interlocks with publication.
- The developer revision workflow currently starts from the current review PR head and may update a branch alias and send email. It does not yet provide an exact-base, preview-only mode.
- The run summary needed for grounding is not currently a single stored artifact. Attempt detail holds delivery, execution, stages and events, while candidate scores, gate findings, route checks and asset status live in the private pipeline report and activity trace. The design adds a bounded summary at completion rather than reconstructing it from prose.
- `AdminApi` and the workspace API expose repository-scoped revision reads. There is no admin-authenticated follow-up write path.

## Product flow

1. A run delivers a private preview.
2. The admin opens Agent runs and writes a follow-up.
3. The composer either runs automatic classification or uses the admin's explicit mode.
4. A question goes to the DeepSeek answering agent with the run context. An improvement goes to the same agent with the proposed edits as context.
5. The agent returns prose. It may also return zero or more `suggest_solution` tool results.
6. Each tool result becomes one card. The card shows the issue, the suggestion and the button.
7. The admin chooses a card. The Worker starts one revision from the stored brief and the pinned preview base.
8. Progress appears in the same thread. A verified result adds a new private preview and a receipt. A failure keeps the previous preview and explains what blocked it.

A question never starts a revision. A suggestion never starts a revision without the button. A request to improve does not skip the card: the admin sees the proposed edits before starting.

## Interaction model

### Composer

The composer keeps one active revision per site. The admin can draft the next message while a revision runs, but cannot send a second revision until the first settles. A question can be answered while a revision runs.

The mode selector has three options:

- **Decide automatically** uses the classifier.
- **Ask about this run** skips classification and answers from the selected attempt.
- **Request an improvement** skips intent classification. The answering agent still turns the request into one or more `suggest_solution` results, and the admin confirms through a card. There is no separate structured edit form.

Automatic classification is a convenience, not a gate. If the classifier is unavailable or returns low confidence, the UI shows both explicit actions.

### Thread

The thread is scoped to the normalized site repository and survives later generation runs. Each message records the attempt it was asked from.

Questions may be asked about any attempt, including failed or diagnostic runs with no preview. They answer from that attempt's recorded evidence and say what was not recorded.

Improvements are writable only when the thread's latest verified preview is `preview_ready`, has an immutable deployment URL, and matches the preview currently open. If the admin is viewing another attempt, the card's button becomes **Open latest preview**. It navigates first and does not start a revision from a different base.

Messages are role-tagged as **You**, **Agent**, **Question**, **Improvement** or **Suggested fix**. Answers cite the evidence they used, for example a mobile check or a gate finding. If the run did not record why a choice was made, the answer says so.

### Suggestion card

The card has three parts:

- the issue in one sentence
- the suggested change in one or two sentences
- the **Fix in Agent runs** button

A small line may say how many related edits are bundled. It is not a separate header block, and it does not repeat the brief.

States:

- **Ready:** issue, suggestion and active button.
- **Working:** button becomes **Revision running**, progress appears in place.
- **Delivered:** receipt appears under the card and the button becomes **Open revised preview**.
- **Needs review:** disabled button with the exact reason, used when the base is missing or moved, or when the requested pages and sections are clearly outside the supported edit vocabulary. An unknown structural request is attempted and can become **Needs review** only after verification fails.

The card settles in once over 280ms. Pressing the button uses a short press scale. Progress and the receipt do not close the card, so the thread keeps its history. Reduced motion removes the settle, the pulse and the press scale.

## Classification

The classifier has one job: turn the follow-up into a typed request and, for an improvement, a proposed edit list.

Input: the user message, the site name, the latest run summary and the currently selected preview identity. No source code, secrets, signed links or private reasoning.

Output:

```json
{
  "intent": "question" | "improvement" | "mixed" | "unsupported",
  "confidence": "high" | "medium" | "low",
  "edits": [
    { "page": "home", "section": "hero", "instruction": "..." }
  ],
  "reason": "Short explanation for the admin, never shown as a suggestion card."
}
```

The classifier does not dispatch, does not choose a preview and does not call `suggest_solution`.

The classifier returns `mixed` when the message asks a question and proposes a change. The thread answers the question first, then shows any suggestion cards. Nothing is dispatched automatically. If the classifier is unavailable, low confidence or `unsupported`, the admin chooses **Ask** or **Improve** and the request proceeds without classification.

The classifier runs on OpenCode Go with `gpt-6-luna`. It reuses the Worker's existing OpenCode Go credential and the reviewed Responses profile. The model ID is configuration, not client input. No OpenRouter credential or exception is introduced.

## Answering agent

DeepSeek V4.1 Flash through OpenCode Go receives:

- the site identity and the current preview identity
- a bounded run summary: renderer, candidates, selected candidate, scores, gates, failures, route checks and asset status
- the findings the run recorded, with evidence references
- the prior thread messages for this site
- the admin's current message
- the proposed edits when classification produced them

The run summary is a new bounded artifact written by the completion ingest, not inferred from prose. It carries the fields above plus the immutable preview deployment. If the summary is absent, the agent falls back to attempt detail and activity, and labels the missing evidence. It never fills a gap with a guess. Messages snapshot the summary they used so a question remains answerable after trace retention expires.

It returns prose plus zero or more `suggest_solution` results. It must not present an unrecorded cause as fact. It may label a cause as probable.

Because the reviewed Go profile has no native tool calling, the runtime request uses a strict JSON schema with a `tool_calls` array. The Worker validates it and records each entry as a `suggest_solution` tool result. The UI consumes only validated results. If the provider later exposes native tools, the same contract can be carried by real tool calls.

Limit: at most three suggestion cards per agent message, ordered by evidence strength. Duplicate issues are collapsed by a server-generated fingerprint.

## `suggest_solution` contract

```json
{
  "name": "suggest_solution",
  "arguments": {
    "issue": "The contact action falls below the fold at 390px",
    "probableCause": "The hero keeps its desktop height at the small breakpoint, so the secondary action lands outside the first viewport.",
    "causeStatus": "confirmed" | "probable" | "not_recorded",
    "suggestedFix": "Move the secondary contact action into the hero and reduce the image height at 390px.",
    "edits": [
      { "page": "home", "section": "hero", "instruction": "Place the secondary action beside the primary action." },
      { "page": "home", "section": "hero", "instruction": "Reduce the image height at the small breakpoint." }
    ],
    "checks": [
      "Render the home page at 390px and 768px.",
      "Confirm the contact action is visible without scrolling at 390px."
    ],
    "evidence": [
      { "label": "Mobile order check at 390px", "source": "route-browser-report" }
    ],
    "guardrails": [
      "Preserve verified facts and client assets.",
      "Do not change service copy, pricing or page order."
    ]
  }
}
```

The Worker turns this into a revision brief. The brief also includes the admin's original message and the pinned preview. The card renders only `issue`, `suggestedFix` and the edit count. The full brief is stored with the request and sent to the revision worker on click. It is never reconstructed from the card.

## Revision execution

A follow-up revision uses the existing coordinator and workflow with a new preview-only mode:

- The request records the site thread, message, attempt, actor, brief and exact base.
- The base is repository, PR, commit SHA and an immutable deployment URL captured at delivery. Mutable branch aliases are not accepted.
- The workflow checks out the exact base. It stops if the base has moved or is no longer available.
- All edits run as one bounded revision. Scope validation, rendered verification, contrast, SEO and content gates apply.
- The revision commits to a request-specific branch and deploys directly from that build. It never moves the shared review branch, so a failed deploy cannot wedge the next follow-up.
- A verified result records a new deployment-specific preview and a receipt. The thread advances to that commit.
- A failed edit keeps the previous preview selected. No partial preview replaces it.
- The mode skips developer and client email, review-link delivery and publication.
- Only one revision runs per site. A second improvement message is accepted and can produce cards, but every card's button stays disabled with **Revision running** until the active request settles. Nothing auto-dispatches.
- The existing `revision_requests.stage` constraint allows only `developer` and `client`. A follow-up needs a migration that adds a source or mode instead of overloading those stages.
- Existing delivered sites without an immutable deployment URL stay read-only until a new run records one. Diagnostic previews are not writable.

If the base cannot be proved, the card becomes **Needs review** and no revision starts.

## Data and storage

The per-repository `RevisionCoordinator` is the natural owner because it already holds revision state and already keys by repository.

Proposed records:

- `agent_threads`: repository, created, updated, latest preview reference.
- `agent_messages`: id, thread, role, text, attempt, created, status, request id.
- `agent_suggestions`: id, message, tool result JSON, brief, status, request id.
- `revision_requests`: extend with source `agent_follow_up`, brief, base preview and thread reference.

Reads are paged oldest to newest for display and newest to oldest for resumption. Writes are authenticated admin actions with an idempotency key. The thread survives trace expiry because it stores message text and briefs, not the whole trace.

## Security and privacy

- Admin and owner only, using the existing verified session. Legacy Access mode stays read-only.
- Same-origin checks on writes. Body size and message length limits.
- Per-admin rate limit and a daily revision cap.
- The classifier and answering agent receive only the latest run summary and the current thread, never secrets, cookies or signed URLs.
- No client email, no publication and no review-link delivery from this path.
- Suggestions are stored as structured data. Raw model prose cannot become a button.
- The base preview is pinned. A moved base stops the revision.

## Failure states

- **Classifier unavailable:** explicit Ask and Improve actions.
- **Answer model unavailable:** the message stays in the thread with a retry action. No suggestion card is invented.
- **Suggestion has no cause evidence:** card is still allowed, cause is marked probable.
- **Suggestion needs an unsupported structural change:** the card is allowed when the support is unknown. If verification fails, it becomes **Needs review** with the reason.
- **Preview base missing or moved:** card is disabled as **Needs review**; no revision starts.
- **Revision fails:** previous preview stays selected; the thread shows the failed check and the request ID.
- **Revision succeeds but the preview cannot be verified:** treat as failed. Do not advance the thread.
- **Site already has an active revision:** the message is accepted and can produce cards, but the buttons stay disabled until the active request settles.

## Rollout

The convergence freeze currently forbids new admin surfaces until five consecutive `preview_ready` runs across creative, foundation and pack. This design may be reviewed and planned now, but activation waits for the freeze to clear or for an explicit owner override recorded in the progress ledger.

Implementation should sit behind an admin capability flag. The flag stays off in production until:

- a synthetic site completes one question and one suggested-fix revision
- the previous preview remains available after a failed revision
- no email or publication is emitted
- The classifier and answering agent both use OpenCode Go. No OpenRouter credential or route is added.
- every writable preview has an immutable deployment URL and matches the preview on screen
- the admin-only authorization and base pinning have browser and Worker coverage

## Success criteria

- An admin asks a question and gets an answer grounded in the recorded run, with citations and explicit gaps.
- A finished run produces no suggestion until a follow-up arrives.
- A suggestion card is produced only from a validated `suggest_solution` result.
- Choosing a card starts one revision from the exact preview, with all related edits.
- A successful revision returns a new private preview and keeps the previous one.
- A failed revision leaves the previous preview selected and explains why.
- A question never starts a revision.
- No client email, publication or cross-site data occurs.

## Open decisions for review

1. The classifier uses OpenCode Go with `gpt-6-luna`. OpenRouter stays disabled in Worker AI. No policy exception is needed.
2. The proposal requires an immutable deployment URL. Existing delivered sites without one stay read-only until a new run records it.
3. The revision brief is stored but not shown by default. A **View brief** disclosure can be added without changing the card.
4. The classifier model is configurable and defaults to `gpt-6-luna` on OpenCode Go.
