# LaunchLoom agent progress: 2026-10-23

## Real client intake and pipeline observability

- UTC started: 2026-10-23.
- Branch/worktree: `codex/launchloom-real-intake-20261023` at `/home/maigreeks/projects/.worktrees/launchloom-real-intake-20261023`, based on `origin/main` `498792fa`.
- Nifty: parent `zazUiD6h1E`; subtasks `hg30hdtc3o`, `kCmIth9o_M`, `coAp5D4CEz`.
- Intent: create a real single-use client invitation from the admin dashboard, submit a production onboarding brief through the client form, let the current full generation pipeline run, and verify the resulting site, thumbnail and dashboard stage timeline. A separate subagent audits PR #169’s thumbnail and stage-tracking implementation.

### Submission

- Created a real invitation via the production dashboard as a short-lived synthetic admin. Invitation link host: `launchloom-onboarding.pages.dev`; it is bound to the test client email and stored only in the private evidence directory.
- Submitted an explicitly fictional internal demo business, `Harbor & Pine Landscape Co.` (Portland, OR, home services), with a fictional contact, fake 555 phone number, test email, five services and a 20-mile service area. The form completed the real Google coverage lookup and confirmation; it did not use a fixture or test profile.
- Client-facing success state confirmed: “Your details are with us.” The intake created GitHub issue #183 and repository-dispatch run `39968388739` with `LLGEN issue=183 profile=full`.
- Dashboard dossier shows the accepted client, submission, issue 183 and one queued full-generation attempt. Initial attempt timeline was empty because the workflow had not yet recorded its first stage.
- Thumbnail/stage audit is delegated in a background subagent against PR #169; no edits are being made by that audit.

### First attempt and audit findings

- Landscaping intake created issue #183 and run `39968388739`; the run failed before reference selection. The production inspiration library has only one eligible `home-services`/`landscaping` dossier, where three are required. No preview or thumbnail was produced. The attempt failure path was real, not a test-profile bypass.
- Dashboard timeline for the failed attempt was empty at the start and the terminal tracking log recorded `events=0 hero=skipped`; this matches the subagent’s finding that current main emits execution/delivery outcomes and post-success cost aggregates, not live per-stage transitions.
- Subagent audit: PR #169 is still open and unrelated to the admin thumbnail/timeline work. It is a six-job workflow split with no real dispatch; it lacks current attempt tracking flags and has merge hazards. Thumbnail transport and authenticated read routes are wired in current main, but there is no live loaded-image proof yet. The admin timeline is not stage-by-stage, and failure details do not include stage/category.
- Second real intake submitted as the fictional `Ridgeline Plumbing & Drain Co.` (Portland, OR) because the registry has five plumbing-related references. Issue #184 and run `39971185509` were created; monitoring is in progress.

### Outcome: blocked before preview

- First real intake: `Harbor & Pine Landscape Co.` created issue #183 and run `39968388739`. Failed in `Read and generate from intake` because the production inspiration library has 1 eligible `home-services`/`landscaping` dossier, while 3 business-focused references are required. No preview, no hero.
- Second real intake: `Ridgeline Plumbing & Drain Co.` created issue #184 and run `39971185509`. It passed config, SEO, reference selection, private repo/Pages creation and imagery, then failed at `Author independent experience candidates` after 34 minutes. Every candidate was rejected:
  - route-01: forbidden inline styles
  - route-02: image source did not use a sealed image content token
  - route-03: unsafe template-literal `href` on `<a>`
- Admin attempt `3f2061c4-691a-4d47-ab4d-b90483ea8d9a` is failed with 2 events: an SEO research aggregate and an execution failure. Failure category/stage/next step are null; no stage-by-stage timeline despite the long Actions run. No thumbnail/hero exists to load.
- Subagent audit confirms PR #169 is open, unmerged and unrelated to the current admin thumbnail/timeline implementation. Thumbnail storage/read wiring exists and is tested only at transport/route level; there is no successful full generation image. Current attempt tracking is outcome/cost-aggregate based, not live per-stage.
- Synthetic verifier account and private credentials removed; member/user readback `0/0`. Demo issues #183/#184 and client records remain for inspection unless cleanup is requested.
- Nifty parent `zazUiD6h1E` and verification subtask `kCmIth9o_M` remain open with the blocker; audit and intake-creation subtasks are complete.
