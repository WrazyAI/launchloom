# LaunchLoom agent instructions

These instructions apply to the whole repository.

## Execution strategy: Superpowers, delegation, and long-running tasks

**Default to one main agent executing the work.** Optimize for a correct,
verified result with minimal elapsed time, repeated exploration, and token cost.
Task duration or the number of plan steps alone is not a reason to delegate.

- **Small, clear change:** investigate, edit, and run focused checks directly.
  Avoid spawning agents merely to search files, write a plan, or run tests.
- **Long or multi-step but tightly coupled change:** keep a short, ordered plan
  and implement it inline with the main agent. When using Superpowers, prefer
  `superpowers:executing-plans` over a fresh implementer per step. Keep working
  through authorized steps; do not stop simply because a task takes many steps.
- **Genuinely independent workstreams:** consider
  `superpowers:subagent-driven-development` for substantial independent plan
  tasks, or `superpowers:dispatching-parallel-agents` for distinct investigations.
  Use these only when independence and expected quality/speed benefit justify
  fresh contexts, coordination, integration, and review overhead.
- **Independent scrutiny:** for risky architectural, security, authorization,
  concurrency, or data-integrity changes, use an independent, bounded review of
  the requirements, diff, and test evidence. Do not automatically dispatch a
  reviewer for each small edit or repeat a completed CodeRabbit review.
- **Delegation ceiling:** start with at most two concurrent workers and expand
  only for demonstrably independent, substantial work. Never run simultaneous
  implementers on overlapping files or shared mutable state; never allow
  workers to recursively spawn more agents by default.

Before dispatching, identify the exact outcome, file and interface boundaries,
known architectural facts, acceptance tests, and a concise handoff. Pass verified
context and pointers to relevant files, not the entire conversation or a vague
instruction to rediscover the repository. Give independent reviewers the
original requirements and evidence without preloading the implementer's verdict.
The main agent owns integration, test results, and the final claim of completion.

For work that spans many steps or context compactions, maintain one recoverable
plan/checkpoint in the existing project tracking mechanism. Record completed
steps, exact files and commits, verification results, decisions, blockers, and
the next action. Resume from that evidence instead of restarting discovery or
repeating completed work. Timebox uncertain exploration by an evidence-based
stopping condition; escalate only real blockers or decisions that require user
authorization. Never fabricate progress or skip a required gate to save tokens.

These guidelines select *whether* a Superpowers execution skill is appropriate;
once a skill is deliberately invoked, follow its required procedure. Explicit
user instructions and this repository's worktree, ledger, safety, review,
deployment, and release requirements remain in force. Avoid duplicate reviews
and verification, but never weaken the checks required for the affected change.

## Task synchronization and worktree isolation

Every agent must make changes in a dedicated git worktree and task branch
created from the latest `origin/main` before the first edit. Shared checkouts
are for inspection, reviewed convergence, integration, and deployment; never
use another agent's worktree or mix new work into unrelated dirty changes.

```bash
git fetch origin
git worktree add /home/maigreeks/projects/.worktrees/launchloom-<task-slug> -b codex/launchloom-<task-slug> origin/main
```

Do edits, tests, and commits in that worktree. Reuse dependencies only from a
compatible checkout; do not modify shared dependencies while its server runs.
Inspect recent commits and relevant progress entries before reconciling work.

When the task is fully validated and ready to ship, integrate its completed
work into `main` before starting unrelated follow-up work. Fetch the latest
`main`, reconcile concurrent changes, and resolve conflicts by reviewing the
intended behavior. Re-run affected checks after integration changes; required
tests, builds, reviews, and rendered/browser verification must pass before
merging. Never force-push or weaken a gate to make the task appear ready.

Use a clean integration worktree when the shared checkout is dirty. Preserve
other agents' branches and uncommitted work; do not reset or stash unrelated
changes to make a merge convenient. Keep genuinely incomplete work on its
task branch with an explicit blocker, rather than merging it as finished.

Explicit user boundaries such as `plan only`, `no edits`, `no merge`, or
`no deploy` override this default. A push to LaunchLoom `main` triggers
deployment, so push only within the authorized shipping scope. After shipping,
verify the deployment workflow and deployed commit before claiming it is live.
Remove the task worktree only after confirming its work is integrated and it
contains no dirty or unique work; retain it while follow-up is active.

### Worktree cleanup is part of the task

Cleanup is mandatory, not optional follow-up. Every agent must remove its own
task worktree after its changes are merged into `main` and the deployment is
verified, or after the owner explicitly abandons the task and its work is
preserved or intentionally discarded.

A worktree's work is preserved when every uncommitted or untracked file has
been committed, stashed, or intentionally discarded with owner approval, and
every commit is reachable from a retained local branch, remote branch, or tag.
"Unique unmerged work" means anything outside that definition. Keep the
worktree when unique unmerged work remains.

"Follow-up is active" means a tracked Work OS ledger task and a progress-ledger entry.
Remove the worktree when that follow-up ships or is explicitly abandoned.

Before removing a worktree:

1. Run `git status --porcelain` in it. Never remove a worktree with
   uncommitted or untracked changes unless the owner explicitly authorizes
   discarding them and the decision is recorded.
2. Fetch and confirm integration. Run `git fetch origin`. A branch is
   integrated when its pull request was merged into `main` at its final head
   and `git rev-parse HEAD` equals that merged head, when
   `git merge-base --is-ancestor HEAD origin/main` succeeds, or when its
   content is reconciled and `git diff --quiet origin/main HEAD` succeeds.
   Do not rely on a merge-base diff for squash merges. For a detached HEAD,
   create a branch or tag at HEAD before removal, or keep the worktree.
3. Remove the worktree with `git worktree remove <path>`, then run
   `git worktree prune` to clear stale registrations. Run steps 3 and 4 from
   the shared checkout or another worktree, never from the worktree being
   removed.
4. Delete the local task branch only after step 2 passes and the local HEAD
   matches the merged pull request head. Delete the remote branch only after
   the pull request is merged and the remote head matches the same merged
   head. For an abandoned task with unmerged work, keep the branch and do not
   delete it unless the owner explicitly authorizes discarding that work.
5. Never remove `/home/maigreeks/projects/launchloom`,
   `/home/maigreeks/projects/.worktrees/launchloom-main`, another agent's
   worktree, or any worktree with unique unmerged work, unless the owner
   explicitly authorizes a documented cleanup that preserves dirty files and
   refs and records that approval.

If cleanup cannot proceed, record the exact path, branch, and blocker in the
progress ledger and the Work OS ledger task. A worktree left behind without a recorded
blocker is an incomplete handoff.

## Work tracking

Create or reuse a Work OS ledger task before user-requested investigation,
implementation, deployment, integration, or external action. Read existing
tasks first and reuse equivalent active work. Track LaunchLoom work in
**TASKS** (the default progress project), identifying LaunchLoom in the name or description.
If access fails, report the exact blocker and stop before changes; do not
silently do untracked work. Keep unfinished work open with a concise blocker.

Use `scripts/work-os-ledger.mjs`, the canonical Work OS ledger tool mirrored at
`/home/dev/agent-os/scripts/work-os-ledger.mjs` on the VPS, not an ad-hoc
LaunchLoom helper or direct database writes. It writes to the work record through
the Work OS Agent API. Reach the canonical VPS copy through:

```bash
ssh -i /home/zahemen/.ssh/google_compute_engine dev@72.62.5.190
```

Resolve the VPS Node toolchain before running the tool. Keep the token on the
VPS as `WORK_OS_AGENT_TOKEN` in `/home/dev/agent-os/.env.local`; the tool reads
it there. Never copy, print, paste, or commit it, or shell-source env files.

Keep descriptions short (one to three sentences), without bullet-pointed
implementation detail; put that detail in subtasks with five-to-eight-word names.
Every task and subtask gets the `agent-ledger` label automatically, keeping agent
progress separable from the employee's own work. Do not remove that label.

Run these commands on the VPS with its resolved Node toolchain:

```bash
# List before creating; reuse an equivalent active task.
node /home/dev/agent-os/scripts/work-os-ledger.mjs list --query "LaunchLoom"
node /home/dev/agent-os/scripts/work-os-ledger.mjs create --json '{
  "tasks": [{
    "name": "LaunchLoom: fix the production bug",
    "description": "Restore checkout and verify the affected workflow.",
    "subtasks": ["Diagnose the affected checkout request path", "Verify checkout restoration with live evidence"]
  }]
}'
# Alternatively: create --file <tasks.json>; add --dry-run to validate only.
node /home/dev/agent-os/scripts/work-os-ledger.mjs get <TASK_ID>
node /home/dev/agent-os/scripts/work-os-ledger.mjs describe <TASK_ID> --description "Concise progress or blocker."
node /home/dev/agent-os/scripts/work-os-ledger.mjs complete <TASK_ID>
```

Re-read tasks immediately before writes. Retain returned task/subtask IDs;
never guess missing IDs or reuse historical provider IDs as Work OS IDs.
Complete each task/subtask as its outcome and verification finish, not in a
batch at the end. Completing a parent also closes its open subtasks, so do not
complete a parent with unfinished work. The tool posts completion and reads
`completed` back; confirm `completed=true` before reporting success. Use `get`
for additional readback when needed. Leave blocked work open with a concise
description using `describe`.

### Consolidating duplicate tasks

When asked to clean up the ledger, resolve the exact task ids first and group
them by outcome. Keep one clearly named canonical task per outcome and preserve
unrelated work even if it was created on the same day.

- Page through `list --include-completed --limit 100` and deduplicate by task id.
- Archive redundant tasks rather than deleting them, so the audit trail stays
  recoverable.
- Fold useful detail from the duplicates into the canonical task before
  archiving them.
- Mark a canonical task complete only when the represented outcome is done;
  leave genuine follow-up open.
- Treat exact-title duplicates from parallel agent threads as duplicates too,
  including the cleanup task itself.

Read back every canonical task and a sample of the archived ones, and state how
many were retained, archived, completed, and left open.

### EOD reports

**EOD Report** is a project, not a task. Confirm read access before drafting or
submitting; never create a test report. Submit only after explicit approval of
the final name and description, using `create --project-name "EOD Report"`
with the same JSON document shape. Name the task `<Full Name><MM/DD/YYYY>`.
Its description contains shift start/end times, completed/in-progress task
counts, a concise outcome-focused shift summary, and a blocker line only when
work remains open. Ask for missing or ambiguous values; disclose inferred
counts or summaries. A draft is read-only and never authorizes a ledger write.

## Sentry credentials and issue navigation

LaunchLoom's Sentry project uses organization slug `wrazyai` and project slug
`javascript-astro`. The Sentry display name may differ from the slug; always use
the slug for API requests and build configuration.

Credentials are stored in these locations:

- Local-only, ignored file: `/home/maigreeks/projects/launchloom/.env`.
- GitHub repository `WrazyAI/launchloom`: `SENTRY_AUTH_TOKEN` is an Actions
  secret; `PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, and `SENTRY_PROJECT` are Actions
  variables.
- `SENTRY_READ_TOKEN` is a separate local-only read token. Never add it to
  GitHub, a `PUBLIC_*` variable, a worktree, a commit, a progress log, or a
  command line that could be recorded.

Token roles:

- `SENTRY_AUTH_TOKEN` is the CI organization token. It is used by the production
  Astro build for release creation and source-map upload. It is not allowed to
  read or resolve issues.
- `SENTRY_READ_TOKEN` is for local Sentry API readback and must have `event:read`
  and `project:read` (plus `org:read` when organization metadata is needed).
  Resolving an issue additionally requires `event:write`.
- `PUBLIC_SENTRY_DSN` is intentionally public and is used by the browser SDK;
  it is not an API credential.

For issue navigation, use the Sentry API at `https://sentry.io/api/0` with a
`Bearer` token read from the private `.env` without printing it:

- List project issues: `GET /projects/{org}/{project}/issues/`
- Read an issue: `GET /issues/{issue_id}/`
- Read its latest event and stack: `GET /issues/{issue_id}/events/latest/`
- Resolve an issue: `PUT /issues/{issue_id}/` with JSON body
  `{ "status": "resolved" }` and a token with `event:write`.

The canonical UI is `https://wrazyai.sentry.io/issues/`. Production workflow
tags are controlled in `.github/workflows/deploy-platform.yml`: environment is
forced to `production` and release is the GitHub deployment SHA. Do not replace
those production values with local `.env` values such as `development` or
`local`.

## LaunchLoom dashboard test login

For live dashboard verification, use the owner's personal admin account stored
in the ignored local file `/home/maigreeks/projects/launchloom/.env`:

- `LAUNCHLOOM_ADMIN_USERNAME`
- `LAUNCHLOOM_ADMIN_PASSWORD`

Read these values only inside the verification process. Never print, paste,
screenshot, commit, or send them, and never copy the file into a worktree. Use
the account to sign in at `https://api.launchloom.wrazyos.com/admin/login` when
a live admin session is required. Prefer an existing signed-in browser tab; if
the session expired, sign in again and preserve the `returnTo` path.

The account is an owner identity. Use it for read-only dashboard verification
unless the user explicitly authorizes the write being tested.

## Repository progress and completion ledger

Before non-trivial work, inspect the branch/worktree and recent commits, read
relevant `.github/agents/progress-update/` entries, and verify historical claims
against current evidence. Preserve other agents' entries and unrelated work.

For every new substantive work item, create or append
`.github/agents/progress-update/UPDATE-YYYY-MM-DD.md` using the current UTC
date and a timestamped section. Never overwrite previous entries.

- At the start, record the task, intended outcome, branch/worktree, and Work OS ledger ID.
- After substantive progress or a direction change, record changes, relevant
  files/artifacts, and the evidence or decision behind them.
- At completion, record the outcome, important files, actual validation
  commands/results, and remaining follow-up. Log exact blockers for incomplete
  work. Distinguish local, browser/rendered, staging, and production evidence.

After the substantive outcome and verification are complete, run:

```bash
bash ./task_complete "<verified outcome>"
```

This appends UTC time, branch, and short HEAD hash to
`.collab/task-complete.log`. HEAD identifies checkout context, not proof that
uncommitted edits belong to that commit; state uncommitted work explicitly.
The receipt supplements daily progress and Work OS ledger completion/readback.
Never use it to mark unfinished work complete.

Include ledger updates in the same workstream. Logging does not authorize
additional actions or override read-only instructions. Keep secrets and
private client assets out of logs. Every handoff states actual verification,
remaining work, and exact dependencies; subprocess success is not proof of a
completed user-visible workflow.

## Generated-site direction

Read `docs/site-generation-guidelines.md` before changing the client-site
template, generation prompts, revision engine, fixtures, or visual quality
checks. `docs/local-business-design-direction.md` records the reference-site
research behind those rules.

Treat the configured page recipe as a coherent design language. Care and
consultation sites use the calm editorial recipe. Local trades use the direct,
problem-led recipe. Do not flatten both into the same generic card layout or
mix their vocabulary, imagery, form questions, and calls to action.

Preserve verified facts and client assets. Never invent reviews, credentials,
prices, guarantees, locations, timelines, staff, or business outcomes. A
service area is not a physical office. Stock imagery may only come from a
reviewed, licensed pack whose subject matches the business kind. Client assets
take precedence, and stock people must never be presented as employees or
customers.

Generated copy must help a visitor decide and act. Explain service scope,
customer concerns, process, preparation, and the next step without repeating
the same claim across sections. Keep one primary action and one secondary
action near the opening promise, then repeat actions only at useful decision
points.

Never use em dashes in generated content or rendered client pages.

## Revision safety

Apply feedback as a bounded change to the current approved site. Preserve the
page recipe and unrelated sections. Structural requests must use a supported,
verifiable operation or be flagged for manual attention. Never claim feedback
was addressed unless its requested artifact is present in the rendered build.

## Verification

For generated-site changes, run the relevant configuration and recipe tests,
Astro checks, and a production build. Inspect rendered desktop and mobile
output for the requested sections, contextual imagery, readable contrast,
working calls/forms, layout overflow, and em dashes. A successful workflow or
HTML marker alone does not prove the visual result is acceptable.

Run the release gates locally before dispatching a generation:

```bash
npm run verify:local-release -- --config <site.config.json> --build
```

This builds the client template with review mode and a synthetic lead origin,
then runs the rendered verifier and the SEO release gate. See
`docs/local-release-check.md`.

## Convergence freeze

Until the core generation path has five consecutive green runs across the
creative, foundation, and pack renderers, do not add new renderers, intake
fields, admin surfaces, or client-facing artifacts. Loop-shortening fixes and
gate repairs are allowed. Record the current success rate from
`npm run report:generation-success` when starting and finishing a task in this
period.

A green run means the workflow completes with `preview_ready`, not a diagnostic
or attention delivery. A diagnostic preview counts as a gate failure for the
freeze even though it is useful for review.
