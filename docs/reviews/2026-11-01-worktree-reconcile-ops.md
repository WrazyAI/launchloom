# Operational/evidence worktree reconciliation: phase 1

Audit date: 2026-11-01 UTC. Comparison baseline: `origin/main` =
`65cae064` (full object ID recorded in each private `audit.json`).
Worker branch: `codex/launchloom-reconcile-ops-20261101`.
Work OS parent: `0205cc25-97ff-4a09-a872-8e915a0a214b`;
subtask: `5d9f09d2-731c-4957-b835-47dbb6e3ac9b`, still open.

## Decision summary

- Four original HEADs are ancestors of main with no unique commits: PR169
  review, rate-limit coverage, live dashboard, visual follow-up.
- Pipeline observability has **two documentation/receipt commits only** outside
  main. Its application work is merged; open PR #193 is not a pending code fix.
- Project assessment has **one useful historical documentation commit** outside
  main, not unfinished product implementation.
- Detached `happy-engine` has **one genuinely unmerged, mixed application/test/
  documentation commit**. Preserve it and port selected hunks only after the
  controller reconciles overlap with the creative/reference worker.
- Ten untracked/ignored non-rebuildable files and the PR169 unstaged patch were
  copied privately and verified against original bytes. All originals remain
  unchanged. No source branch/worktree was deleted, merged, pushed, or reset.
- No matching process or incoming dependency symlink was observed in the
  bounded scan. This supersedes the earlier watcher observation, **not** the
  requirement to recheck dependencies and processes immediately before removal.
  The deliberately excluded worktree was never traversed or inspected.

This is an audit/preservation handoff, not reconciliation completion or
authorization to ship/close proof gates. No app tests, builds, browser session,
generation, deployment, dependency install, or production write occurred.

## Exact original inventory

For the six `launchloom-*` sources, full path is
`/home/maigreeks/projects/.worktrees/<source>` and retained existing branch is
`refs/heads/codex/<source>`. Detached source has its explicit path below.
All seven have **no staged changes**. Status is from read-only
`git --no-optional-locks status --porcelain=v1 --untracked-files=all`.

| Source | Exact HEAD | Tracked unstaged | Untracked | Unique commits versus main |
| --- | --- | --- | --- | --- |
| `launchloom-pipeline-observability` | `019b46a9e2ce679fab3cfdc53088a42fdfafe50e` | None | Two plan/spec files listed below | `75a491a51328ea96529fb672d42103bf427fd443`, `019b46a9e2ce679fab3cfdc53088a42fdfafe50e` |
| `launchloom-pr169-review` | `a66db71972cb6bd6b5038a692ea4473ca0cae685` | `.collab/task-complete.log` | Two review/progress files listed below | None; ancestor |
| `launchloom-project-assessment-20261027` | `a6a4be2d29ace50124e583e0bbbc88cfd4881476` | None | None | `a6a4be2d29ace50124e583e0bbbc88cfd4881476` |
| `launchloom-rate-limit-lead-coverage` | `791d73e927d574a1dc0f98cca5bc67ca180905de` | None | Two TestSprite files listed below | None; ancestor |
| `launchloom-live-dashboard` | `922149b907d60fa6f080672e093f5f72ecf949ce` | None | None | None; ancestor |
| `launchloom-visual-followup` | `05b53c336de0d108d8638a8e0491708056c104df` | None | None (four ignored evidence files preserved) | None; ancestor |
| `happy-engine` | `4d77edc1b2840011bb39e17d9d6ce96c1350eb94` | None | None | `4d77edc1b2840011bb39e17d9d6ce96c1350eb94` |

Detached original:
`/home/zahemen/.local/share/opencode/worktree/1582b5/happy-engine`.
New retained ref, verified at its exact HEAD:
`refs/heads/retained/worktree-reconciliation-20261101/happy-engine`.
No original symbolic HEAD or existing branch ref was changed.

### Comparison method and squash safety

Used `merge-base --is-ancestor`, `log origin/main..HEAD`, `git cherry
origin/main HEAD`, and per-file/per-hunk inspection against **current main**.
`git cherry` marks the four listed unmerged commits (two pipeline, one
assessment, one happy-engine) `+`; none is an exact patch-ID equivalent on main.
The other four sources have empty unique logs/cherry output and successful
ancestry checks. This is stronger evidence than assuming a merge-base diff
proves squash integration. Whole-tree diffs from old originals contain hundreds
of later-main files and must **not** be applied as reverse migrations.

## Per-source disposition

### 1. Pipeline observability: preserve missing historical receipt only

- PR #193 is still OPEN, non-draft, exact head `019b46a9…`; its title is
  “Record pipeline observability merge and deploy evidence.” Unique commit
  `75a491a5` adds nine lines to `UPDATE-2026-10-26.md`; `019b46a9` adds one
  historical completion-log line. Both additions are absent from current main.
- Read-only GitHub checks independently confirm PR #190 merged as `8de10d0b`,
  #191 as `23a41c5a`, and #192 as `b83a9155`; corresponding deploy runs
  `40358237807`, `40361246736`, `40366190432` all concluded success at those
  merge SHAs. The code is not waiting on #193.
- Untracked `docs/superpowers/plans/2026-10-26-source-foundation-generation.md`
  and `docs/superpowers/specs/2026-10-26-pack-first-landscaping-design.md`
  are **byte-identical** to current-main files at those same paths. No unique
  foundation implementation or plan remains in those dirty files.
- Suggested integration: append the missing historical receipt/log content
  without replacing later progress entries. Label the “no successful production
  intake” sentence as an **October 26 observation**, not a current conclusion.
  Main already records later green pack preview evidence (October 28 run
  `40737253021`), which does not itself prove the separate live-running creative
  thumbnail acceptance gate.
- Cleanup conditions: controller integrates/preserves the two receipt commits,
  coordinates #193 disposition, explicitly approves disposing of verified duplicate
  untracked copies, and checks processes/dependencies. Keep branch refs regardless.
  Do not mark a historical successful-intake outcome complete from deploy metadata.

### 2. PR169 review: archive the review, do not implement the old PR implicitly

- Unique artifacts: `docs/reviews/2026-10-16-pr169-merge-readiness.md`,
  `.github/agents/progress-update/UPDATE-2026-10-16.md`, and unstaged
  `.collab/task-complete.log` addition. The report/progress files are absent from
  this original's HEAD but preserved in the snapshot.
- Review describes head `6a304793fffa26411c5c67ef6fdc27dc36bcfac5`:
  provider environment lost across the proposed fresh authoring job and
  no-op restored-ancestor checkpoint rejection. It records historical offline
  reproductions, 21 focused tests plus 259 related tests, and an unproven full-path
  canary. Those are **historical author claims**, not tests rerun in this audit.
- Fresh read-only GitHub metadata: PR #169 remains OPEN/DRAFT at that exact head.
  Current-main workflow has no `creative_authoring:` job and defaults provider
  to OpenRouter. Therefore the provider-selection scenario must be reassessed
  against today's workflow before anyone acts on the old review.
- Suggested integration: import the review as dated historical evidence with an
  explicit supersession/current-baseline note, append only its historical ledger
  section to the now-existing October 16 file, and preserve the log addition.
  Do not replace the current progress file or treat the review as authority to
  merge the staged-actions PR. Controller chooses whether PR169 remains desirable;
  any revival needs fresh checkpoint/provider regressions and separately
  authorized full-path evidence. No paid canary is authorized by this audit.
- Cleanup conditions: archive/import the dirty records with controller approval
  and preserve branch/snapshot. Deleting a review workspace does not close PR169
  or establish staged-pipeline acceptance.

### 3. Project assessment: integrate as an explicitly historical assessment

- Unique commit `a6a4be2d` adds 95-line
  `docs/research/2026-10-27-project-assessment.md`, 20 progress lines, one receipt.
  Assessment path is absent from main; its progress/receipt additions are absent.
- Useful conclusions: managed local-business production positioning, release
  safety, need for whole-flow yield/cost measurements, public-intake storage
  concern, and caution against confusing diagnostic previews with reliability.
- Its baseline is `038c85a8`. Main has since gained Postgres operations work and
  later generation results; DO-only architecture descriptions, latest-run
  statements, line numbers, and public-storage deployment conclusions must not
  be promoted as current facts. No current production flag/storage/privacy audit
  was performed here. Preserve the original date/baseline and add a historical
  context notice rather than rewriting it into a fresh readiness certification.
- Suggested integration: documentation-only import of the three additions,
  resolving append-only ledger conflicts. Validate diff/formatting and that no
  private evidence/assets are included. No product fix belongs in that import.
- Cleanup conditions: controller integrates and verifies the record changes or
  explicitly accepts retention on the branch. No remaining unique application
  implementation exists here.

### 4. Rate-limit coverage: retain fixture as synthetic evidence, not app proof

- PR #162 is MERGED, exact final head `791d73e9…`, merge `1a53e481`;
  original HEAD is also an ancestor of current main. No rate-limit code remains
  to integrate from its committed branch.
- Untracked `.testsprite/fixtures/rate-limit-fixture.mjs` and
  `.testsprite/plans/rate-limit-lead-form.json` are unique preserved artifacts.
  Fixture is a standalone HTTP/HTML implementation with a forced quota switch,
  a synthetic token, and a counter that rejects after two leads; it does not
  execute the production Worker, Durable Object, or production LeadForm.
  The plan exercises that demonstration, including its “Trigger Rate Limit”
  control, and embeds an old project ID. It contains no run verdict.
- Suggested disposition: keep as archived/synthetic demonstration, or adapt into
  a **separate approved test change** that exercises the real UI/API plus durable
  limiter. Do not report this fixture as TestSprite verification of the deployed
  10/hour visitor or 50/hour project sliding-window implementation.
- Cleanup conditions: controller explicitly accepts archive-only preservation or
  integrates the useful fixture/test plan after real-app validation. No need to
  resurrect old production source. Preserve named ref and snapshot.

### 5. Live dashboard: code integrated; outcome still open

- Clean, no unique commits. Its code is already ancestor-integrated.
- Fresh Work OS readback of `7a9cf29a-5196-46f1-8a19-2fd8773db6d3` remains open:
  deployed at `a27ec01a`, live thumbnail verification awaits the next creative
  run with the new upload code. Its five implementation subtasks are complete.
- Current main retains running-poll/current-stage/candidate-capture code; this
  audit makes no signed-in browser or loaded-image claim.
- Suggested action: use an **already authorized existing suitable run** if one
  exists, prove exact-attempt thumbnail `naturalWidth > 0`, upload provenance and
  refresh behavior, and record screenshots plus matching run/attempt IDs. If none
  exists, keep proof open until ordinary authorized work supplies one. Do not
  dispatch a paid run just to release disk space.
- Cleanup conditions: controller either completes that proof or explicitly
  transfers the tracked follow-up/progress context to another retained workspace.
  Code ancestry alone does not satisfy the active-follow-up rule.

### 6. Visual follow-up: integrated code, preserved stale working evidence

- Clean HEAD `05b53c33` is ancestor-integrated. Four ignored non-rebuildable files
  preserved under `.superpowers/sdd/`: `.gitignore`, continuation `plan-path`,
  `progress.md`, and `review-37ab538f..88a8d61e.diff` in
  `2026-10-28-visual-content-pipeline-continuation/`.
- The ignored progress ledger stops while waiting for run `40722152486`; main's
  later October 28 entries record its author failure and later author fixes.
  That ignored ledger is historical evidence, not the latest task state.
- Fresh Work OS task `80327069-f5fa-487c-8f0f-c5d127dc6ac6` is open and still says
  run `40916150316` is validating the pipeline. Fresh GitHub readback shows that
  run completed with **failure** at `e5d0cdd8`, focused job
  `123597015378` failed; terminal tracking succeeded. Root cause/rendered
  acceptance was not re-investigated here. Do not close the task from stale
  “waiting” text or already-merged fixes.
- Earlier running-watch/dependency-provider evidence is not a current process
  observation. Current bounded scan found none; dependency ownership remains a
  pre-removal check, especially because the excluded worktree was not examined.
- Cleanup conditions: controller records the actual outstanding rendered outcome,
  transfers/completes/explicitly abandons tracked follow-up, approves ignored
  evidence preservation, then rechecks all allowed dependency users/processes.
  Do not infer safety merely from deletion of a previous admin consumer.

### 7. happy-engine: bounded port needed, not a wholesale cherry-pick

Commit `4d77edc1` changes 22 files, 726 insertions/20 deletions. Its parent is
the common ancestor `3d7961be`; no patch-ID equivalent exists on main. Each
changed path was compared against current main, not just against that parent.

| Candidate port | Exact useful files/hunks | Current-main evidence and caution |
| --- | --- | --- |
| Offline sealed image snapshots | New `scripts/client-image-snapshots.mjs`, `tests/client-image-snapshots.test.ts`; snapshot validation/fulfillment and retained digests in `scripts/rendered-interaction-evidence.mjs`; capture/cache wiring in `scripts/run-creative-bakeoff.mjs`; associated interaction tests | New helper/test absent on main; main interaction browser still blocks off-origin assets with no retained-byte path. Retains exact sealed URLs, raster MIME, limits, no redirects and browser network isolation. Security review needed; preserve no beacon/network effects, cache bounds and trusted-host policy. |
| Exclusive pressed selector restoration | Eligibility/restore-control additions in `scripts/rendered-interaction-evidence.mjs`, four selector/toggle tests in `tests/rendered-interaction-evidence.test.ts` | Main restores tabs but still clicks the same button again for pressed selectors. Port independently from image support; keep independent-toggle semantics. |
| Outward square logo focus-ring audit | `allowIdenticalPartialPlate` and four complete outside strips in `scripts/rendered-contrast.mjs`; six added cases in `tests/rendered-contrast.test.ts` | Those implementation markers are absent on main. Main has substantially newer contrast logic. Review against later pixel/occlusion/hero fixes; preserve rounded/inset/shadow/different-paint uncertainty. Do not transplant old file or blindly copy fixture-layout edits. |
| Deterministic contrast palette unlock | Exact-prefix string handling in `findingsRequirePaletteChange` in `scripts/run-rendered-creative-repair.mjs`; added test in `tests/rendered-creative-repair.test.ts` | Main recognizes object category contrast and hero-card structure, but lacks this exact-prefix string branch. Verify today's producer still emits these strings before adding permission to recolor. |
| Authored navigation containment | `position: relative` on `[data-creative-host="true"]` in `templates/client-site/src/styles/creative-runtime.css`; new `tests/creative-runtime-containment.test.ts` | Main root lacks positioning; test path absent. Bounded browser regression is valuable, but containing-block changes may affect fixed/sticky/absolute descendants. Check desktop/mobile notices/navigation against current shell. |
| Judge-only notice suppression | `!judgePreview` guards in `templates/client-site/src/layouts/SiteLayout.astro`; judge profiles/assertions in `tests/pipeline-test-rendered.test.ts` | Main still renders test/review notices in judge mode. Judge-only hiding must not remove public diagnostic provenance or submission-disabled behavior. Check intended current judge contract before port. |
| Durable design correction guidance | New `RENDERED_DESIGN_CORRECTION_CONTRACT` in `scripts/creative-authoring-output.mjs`, author/repair prompt wiring in `scripts/production-experience-author.mjs` and `scripts/creative-repair-loop.mjs`, associated prompt tests, four guideline paragraphs | Constant/wiring absent on main. Useful selector content and honest proof guidance overlap newer hero/mobile/contrast contracts. Old opaque-plate language can conflict with newer no-per-line/no-control-background directions; reconcile wording, not an unreviewed prompt append. |
| Historical-only records | October 14/15 progress additions; `docs/superpowers/plans/2026-10-15-juniper-design-corrections.md` | Exact added progress lines absent on main; plan path absent. Preserve dated evidence and unchecked status. Do not assert ignored corrected-candidate files or old screenshots are present: this original has no such ignored assets. |

**Controller overlap warning:** these files are central creative/rendered
infrastructure and may overlap the other worker's Juniper/design/source-first
findings. Agree file ownership and one combined patch before phase 2. Reading
the generation guidelines and current contracts is required before any such edit.

Proposed later validation by bounded group:

1. Snapshot/selector group: helper tests plus `rendered-interaction-evidence`,
   bakeoff/repair integration tests; prove denied beacons, redirects, oversized
   payloads, off-host paths, independent toggles and restored state. Independent
   security review for image/network handling.
2. Contrast group: rendered contrast, paint/pixel, contrast-sweep and rendered
   creative-repair suites; actual browser focus evidence including negative
   cases. Independent review that uncertainty/gates are not weakened.
3. Runtime/provenance group: containment and pipeline rendered tests, actual
   desktop/mobile output, notices, disabled forms, overflow and navigation.
4. Prompt group: authoring/repair/provider-free reference integration and existing
   mobile/FAQ/hero contracts; no paid generation to prove deterministic wiring.
5. Before any integration, affected recipe/config tests, Astro/Worker checks as
   appropriate, production build, required CI and desktop/mobile rendered review.
   New synthetic tests are not a substitute for outstanding product acceptance.

Cleanup requires explicit reconciliation/abandonment of this unique commit and
the retained ref. Do not treat `git cherry +` as permission to merge 22 stale
files or remove the detached source now.

## Private preservation and verification

Root: `/home/zahemen/worktree-reconciliation-2026-11-01/ops/`.
Each `<source>/` contains `staged.patch`, `unstaged.patch`, `files/` when
applicable, `manifest.json`, `manifest.sha256`, and `audit.json`. Directories
are private (0700), payload/manifest/patch files 0600. No private contents or
secrets are committed with this report. Rebuildable `node_modules`, `dist`,
`.astro`, and `.git` were excluded; symlinks were never followed for archival.
No unpreserved non-regular/escaping-parent file was reported.

All staged patches are empty. All unstaged patches are empty except PR169's
1,959-byte patch. Artifact counts below exclude patches and metadata.

| Snapshot subdirectory | Files / bytes | SHA-256 of `manifest.json` |
| --- | --- | --- |
| `launchloom-pipeline-observability` | 2 / 38,616 | `d5a34e2ca76108bbaab3e177e19895729e5e74812505f0d2e6cf16d3aed7e4bb` |
| `launchloom-pr169-review` | 2 / 7,486 | `7974bbcbdb35114effddffc1bbe08dd1974e0a6cfb1ce415bca910ccd018c7ba` |
| `launchloom-project-assessment-20261027` | 0 / 0 | `8050d4286be74a13ce4649a6232c2cce647376430dfc2fe0dac3a21021ebfaa5` |
| `launchloom-rate-limit-lead-coverage` | 2 / 10,099 | `bdbadefe6b551f7f6210794bfe51abd2c2e6f4c48faffb92b6431d748e0d6761` |
| `launchloom-live-dashboard` | 0 / 0 | `3b68def74979968090b89f7e27aaec584f55605bca5a05fa335355d495d60ba0` |
| `launchloom-visual-followup` | 4 / 61,699 | `4c433dea61ba53397090ee59e658c45c7941f310f1636cb60f1ccb95996f0f45` |
| `happy-engine` | 0 / 0 | `233d0e180c77a39428b97ac92f9e570e8d24b04f336935ae468d442e84f6f45d` |

Manifest entries contain per-file SHA-256 hashes. Verification reread archived
bytes **and original bytes**, compared both with each entry hash, re-exported
both Git patches, and rechecked all seven HEAD/status pairs against initial
snapshots. All matched. Named refs preserve committed work; the snapshot does
not itself grant permission to discard dirty original files.

Root evidence:

- `verification.json`: `5cbb788f2973f7de9801fb9ca10257aee21e0166db5fc19e3e6132c268ee93a8`.
- `references.json`: `c6ffde3443aed1a1e645fa070f0d0ddb03f19459ce2965bee0a52da012a92581`.

### Process/dependency audit limits

At approximately 14:44-14:49 UTC, readable `/proc` command/cwd records showed
no references to the seven assigned source paths. The scan did not print raw
arguments. Incoming symlink scan covered project, OpenCode worktree and
`/tmp/opencode` roots, excluded the forbidden worktree entirely, did not follow
directory symlinks, and pruned rebuildable/cache directories. Immediate sibling
`node_modules` links were checked separately without reading their contents.
No incoming links to assigned originals were observed. This is not a whole-machine
or permission-complete proof, nor permission to touch excluded consumers.

| Source | Own dependency state |
| --- | --- |
| Pipeline, live dashboard, visual follow-up | Real `node_modules/` directories, unmodified |
| PR169 review | Symlink to `launchloom-juniper-blockers/node_modules`, not modified or followed |
| Assessment, rate-limit coverage | Symlink to shared checkout `node_modules`, not modified or followed |
| happy-engine | No `node_modules` |

## Controller next actions / retained blockers

1. Coordinate happy-engine hunks with the creative worker before source edits.
2. Approve historical docs imports (pipeline receipt, assessment, PR169 archive),
   decide synthetic fixture retention, and preserve all named refs/snapshots.
3. Re-read live-dashboard/visual Work OS tasks; update stale run state and choose
   explicit proof ownership or abandonment. No new paid proof run is implicit.
4. Integrate bounded approved work in a fresh/current task baseline with required
   checks and rendered review; controller alone merges/deploys/verifies.
5. Immediately before eventual original removal, recheck current status/HEAD,
   integration (including squash-safe evidence), private hashes, refs, processes
   and dependencies; obtain explicit dirty-artifact disposal approval. Remove
   none while unique work or untransferred tracked follow-up remains.

All seven exact source paths above are retained. Their blockers are respectively:
missing receipt/duplicate-copy decision; dirty review preservation; historical
assessment import; synthetic-fixture disposition; live-thumbnail proof/transfer;
visual-rendered proof/transfer and dependency recheck; unique mixed commit port.
This worker's own worktree is retained for controller review and phase 2, under
the open reconciliation subtask. No completion receipt or task completion is
issued for unfinished reconciliation.
