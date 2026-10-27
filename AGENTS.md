# LaunchLoom agent instructions

These instructions apply to the whole repository.

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

"Follow-up is active" means a tracked Nifty task and a progress-ledger entry.
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
progress ledger and the Nifty task. A worktree left behind without a recorded
blocker is an incomplete handoff.

## Work tracking

Create or reuse a Nifty task before user-requested investigation,
implementation, deployment, integration, or external action. Read existing
tasks first and reuse equivalent active work. Track LaunchLoom work in
**Tasks** (`czFZk9928z`), identifying LaunchLoom in the name or description.
If access fails, report the exact blocker and stop before changes; do not
silently do untracked work. Keep unfinished work open with a concise blocker.

The canonical creator is `/home/dev/agent-os/scripts/log-nifty-tasks.mjs` on
the VPS, not a local LaunchLoom script. Reach it through:

```bash
ssh -i /home/zahemen/.ssh/google_compute_engine dev@72.62.5.190
```

Resolve the VPS Node toolchain before running the logger. Keep credentials on
the VPS; never shell-source env files, print tokens, or automatically retry
with the stale refresh-token flow.

Re-read tasks immediately before writes. Retain returned subtask IDs; never
guess missing IDs. Complete known subtasks before their parent only after the
outcome and verification are done. Use the VPS-held Bearer token with
`POST https://openapi.niftypm.com/api/v1.0/tasks/{task_id}/complete` and
`{"completed":true}`; read back `name`, `completed`, and `archived`.
Partial task PUTs can reset completion: include the current `completed` value
when updating descriptions/blockers, and verify the resulting state.

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

## Repository progress and completion ledger

Before non-trivial work, inspect the branch/worktree and recent commits, read
relevant `.github/agents/progress-update/` entries, and verify historical claims
against current evidence. Preserve other agents' entries and unrelated work.

For every new substantive work item, create or append
`.github/agents/progress-update/UPDATE-YYYY-MM-DD.md` using the current UTC
date and a timestamped section. Never overwrite previous entries.

- At the start, record the task, intended outcome, branch/worktree, and Nifty ID.
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
The receipt supplements daily progress and Nifty completion/readback.
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
