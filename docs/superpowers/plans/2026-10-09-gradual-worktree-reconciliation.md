# Gradual LaunchLoom worktree reconciliation

**Goal:** Review all 30 source worktrees; hold work updated within the last 24 hours; integrate useful compatible older work in verified batches; archive and remove resolved stale worktrees.

**Authority:** User explicitly authorized review, gradual main merges and deployments, and discarding irrelevant work. Preserve source snapshots, branch refs, provenance, private client assets, and current contracts. Paid client authoring, live client approval/publication, and future feature scope are not implied.

**Execution:** Continue in this clean worktree. Review base-to-tip and local changes against current main; copy useful deltas rather than wholesale-merging old histories. Existing unit, type, build, CI, review, and rendered gates apply to the affected behavior.

1. [x] Snapshot and review every older worktree, including staged/unstaged changes and unique untracked evidence; record per-worktree disposition and exact useful delta. Hold the seven worktrees with updates since the cutoff.
2. [x] Batch 1: integrate independently useful older source/test changes after semantic overlap review. Run affected regressions, static checks/builds, and independent CodeRabbit review. Read current main again before merge; verify CI and deployment source/version.
3. [x] Continue subsequent useful batches until every older source change is either integrated, proven superseded, or explicitly blocked with evidence. Do not import experiment/site payloads as production defaults.
4. [x] Preserve progress and meaningful documentation; archive exact source/evidence with SHA-256 verification. Remove resolved stale linked worktrees individually after final activity checks. Preserve the primary shared checkout until its local source state is accounted for.
5. [x] Record final dispositions, remaining active worktrees, deployed SHAs, actual validation, and blockers; complete known subtasks then parent only when their scope is done.

**Review focus:** Avoid reverting later rights/redaction fixes, replacing the expanded canonical reference library with a historical smaller one, importing fictional/private canaries as production config, weakening promotion/research/accessibility gates, or losing source/receipts when removing a directory.
