# Remaining worktree reconciliation checkpoint

## Goal and boundaries

Recover and reconcile useful work from the 15 remaining extra LaunchLoom worktrees, then delete their directories only when preserved and verified. Leave the shared checkout and `launchloom-reliability-phase3` completely untouched. Do not resurrect obsolete implementations, historical provider/model defaults, or stale instructions merely to record a merge.

## Workers

| Worker | Dedicated worktree | Source worktrees (all `launchloom-*` under `/home/maigreeks/projects/.worktrees/`) |
| --- | --- | --- |
| DeepSeek V4.1 Flash max | `launchloom-reconcile-creative-20261101` | `automated-seo-integration`, `source-first`, `juniper-blockers`, `dossier-coffee`, `dossier-preview`, `design-craft`, `source-foundation`, `real-intake-20261023` |
| GPT-6.1 Sol medium | `launchloom-reconcile-ops-20261101` | `pipeline-observability`, `pr169-review`, `project-assessment-20261027`, `rate-limit-lead-coverage`, `live-dashboard`, `visual-followup`; also detached `/home/zahemen/.local/share/opencode/worktree/1582b5/happy-engine` |

## Ordered gates

- [ ] Each worker reads current instructions and relevant history; captures per-source HEAD, status, unique commits/patches, ignored user artifacts, and runtime/dependency references without modifying originals.
- [ ] Preserve unique committed and dirty/untracked work in retained refs and private verified snapshots before any integration/removal. No secrets/private assets enter reports or commits.
- [ ] Produce one reviewed disposition for every source: integrate bounded changes, document exact current-main equivalent, or flag genuine unresolved behavior for a decision. Never label incomplete work merged merely because an archive exists.
- [ ] Reconcile independent changes in worker branches after audit review; controller handles overlap and canonical ledger entries. No workers push or merge main.
- [ ] Test changed behavior with RED/GREEN evidence where applicable; run full relevant application/Worker/config/recipe/build checks and rendered desktop/mobile checks for generated-site changes. Do not weaken gates or use paid generation without permission.
- [ ] Fetch latest main, preserve concurrent entries, review final diff and merge only passing final-head checks. Verify deployment and exact SHA.
- [ ] Recheck each removal target for new activity/status changes and dependent symlinks. Preserve any required dependency for the excluded worktree. Remove eligible worktrees from outside their directories and prune; retain unresolved sources with exact blockers rather than discard work.
- [ ] Verify excluded source remains untouched, final inventory, retained refs/snapshots and measured disk recovery. Close subtasks/parent with readback and remove all completed task worktrees.

## Review focus

1. Dirty files and ignored evidence that a branch merge does not preserve.
2. Squash/cherry-pick history that ancestry alone cannot classify.
3. Ancient branch code that would regress current rendering, model policy or operational architecture.
4. Running watchers and incoming dependency symlinks, especially anything needed by the excluded worktree.
5. Concurrent main/ledger updates and claims of integration unsupported by tests or rendered evidence.

## Recovery pointers

- Work OS parent: `0205cc25-97ff-4a09-a872-8e915a0a214b`.
- Base at start: `65cae064`.
- Creative report: `docs/reviews/2026-11-01-worktree-reconcile-creative.md` on the creative branch.
- Operations report: `docs/reviews/2026-11-01-worktree-reconcile-ops.md` on the operations branch.
- Private preservation root: `/home/zahemen/worktree-reconciliation-2026-11-01/`; separate `creative` and `ops` subdirectories.
