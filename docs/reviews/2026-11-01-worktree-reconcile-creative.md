# Creative and reference worktree reconciliation: Phase 1 audit

Date: 2026-11-01 (UTC)
Baseline: `origin/main` `65cae06486ff49d2c2380f37e1837e1792099050`
Task branch: `codex/launchloom-reconcile-creative-20261101`
Task worktree: `/home/maigreeks/projects/.worktrees/launchloom-reconcile-creative-20261101`
Work OS parent: `0205cc25-97ff-4a09-a872-8e915a0a214b`
Work OS subtask: `0e95d2d1-2a08-4f58-99ea-29487f155113`

## Scope and method

This phase audited exactly eight source worktrees:

1. `launchloom-automated-seo-integration`
2. `launchloom-source-first`
3. `launchloom-juniper-blockers`
4. `launchloom-dossier-coffee`
5. `launchloom-dossier-preview`
6. `launchloom-design-craft`
7. `launchloom-source-foundation`
8. `launchloom-real-intake-20261023`

The excluded `launchloom-reliability-phase3` worktree was not inspected, and no command was run in it. The shared checkout `/home/maigreeks/projects/launchloom` was read only for PR and ref state; its unrelated untracked `skills/` directory was not modified. No source worktree was modified, no branch was deleted, no process was stopped, no dependency was installed or changed, no generation was run, and no push, merge, deployment, or production write occurred.

Evidence used: exact HEADs and branch refs, staged and unstaged diffs, untracked and ignored file inventories, commit ancestry and patch IDs, three-dot diffs against current `origin/main`, `git merge-tree` conflict probes, current-main symbol and file searches, PR metadata and check state, and private artifact preservation.

Everything below distinguishes local filesystem evidence from GitHub state. A preserved snapshot is not proof that the work is integrated into `main`.

## Executive disposition matrix

| Source | HEAD / branch state | Unique commits | Dirty state | Disposition | Primary reason |
| --- | --- | --- | --- | --- | --- |
| `launchloom-automated-seo-integration` | `6190c466`; local branch is an ancestor of `origin/main`; remote head `df9e6b4a` also an ancestor; PR #157 merged | 0 | 3 modified, 1 untracked | **Integrated, remove-ready after preservation approval** | Code and tests in the dirty diff are patch-identical to merged commit `6d1fe8a3`; the substantive progress sections are present in main |
| `launchloom-source-first` | `49500e21`; 5 commits, 4 substantive; PR #168 open, draft, `CONFLICTING` | 5 | 2 modified, 1 untracked | **Do not merge; product decision required** | Large unmerged implementation from Oct 12; current main has a different shipped source approach (`foundation` renderer, #196) |
| `launchloom-juniper-blockers` | `4d77edc1`; 1 commit, 22 files | 1 | 1 modified | **Highest-value targeted salvage** | Several safety, evidence, containment, and interaction fixes are absent from current main, but the branch is too old to merge directly |
| `launchloom-dossier-coffee` | `b51eb48a`; 10 commits, 468 files | 10 | 1 modified | **Valuable data port with rights and registry blockers** | 17 licensed or asserted-owned reference dossiers plus supplemental registration are absent, but the old registry removes two newer landscaping records |
| `launchloom-dossier-preview` | `f25479b0`; ancestor of `main`; no PR | 0 | 1 modified, 5 untracked | **Archive-only local tooling and evidence** | Unique preview builder, server, verification report, and ledgers are uncommitted; their source-review premise is largely superseded by the foundation renderer |
| `launchloom-design-craft` | `086720eb`; 3 docs commits | 3 | clean | **Archive-only research and plan** | Main has an independent evaluation and a shipped narrative spine; the 598-line craft-layer plan is unimplemented and needs a product decision |
| `launchloom-source-foundation` | `a18e6a49`; 1 docs commit | 1 | clean | **Content integrated, remove-ready after ref decision** | The plan and spec are byte-identical to current main; only a short historical progress section is unique |
| `launchloom-real-intake-20261023` | `6b7ec852`; 1 docs commit | 1 | clean | **Archive-only historical evidence** | A 35-line ledger file records failed intakes #183/#184; main has a different add/add file for the same date |

No source is ready for a blind merge. Two sources are effectively integrated at the content level, one is a priority salvage source, one is a data port, and four are documentation or tooling archives that require owner decisions.

## Private preservation ledger

Dirty tracked diffs, untracked files, and ignored non-rebuild user artifacts were preserved before any cleanup proposal. Directories are mode `0700`; files are mode `0600`; manifests are standard `sha256sum` format with a separate `sizes.tsv`. No symlinks were followed or copied. Rebuildable `.git`, `node_modules`, `dist`, `dist-*`, and `.astro` paths were excluded and recorded in each `excluded-paths.txt`.

Root: `/home/zahemen/worktree-reconciliation-2026-11-01/creative/`

| Source snapshot | Files | Bytes | `manifest.sha256` SHA-256 |
| --- | ---: | ---: | --- |
| `launchloom-automated-seo-integration` | 561 | 58,159,793 | `59c72c5f25249127f23e47a570ab1ed172ed5f5c4f1ecb5632da59a9ad159720` |
| `launchloom-source-first` | 988 | 36,046,000 | `05b33b2b53ffe5a75f48f80b72c6a460f35ab27c549decf4d2c9c06fda45ef40` |
| `launchloom-juniper-blockers` | 1,271 | 394,428,405 | `3e9f76a6f5b69d9a7281d4f06d12dede7898587edc32c3289df4fa6453589f03` |
| `launchloom-dossier-coffee` | 4 | 3,109 | `745d220a85bbb702df9321bedc5e870dec8f042857ba3003847f046437b5ec79` |
| `launchloom-dossier-preview` | 229 | 41,295,246 | `207fb4f65495d4725bbe7fad781cd0eb4279a969ffc852f99b1bfc8272c4205a` |
| `launchloom-design-craft` | 4 | 127 | `9a4ac8c7e1d0280747eda698364984ccf9f02aeb14d5da73fae6a91e53d7130d` |
| `launchloom-source-foundation` | 4 | 127 | `9a4ac8c7e1d0280747eda698364984ccf9f02aeb14d5da73fae6a91e53d7130d` |
| `launchloom-real-intake-20261023` | 4 | 127 | `9a4ac8c7e1d0280747eda698364984ccf9f02aeb14d5da73fae6a91e53d7130d` |

Total private snapshot size is approximately 516 MiB on disk, with 529,932,934 bytes across 3,065 manifest-listed files (plus eight per-source size lists). Every snapshot was verified with `sha256sum -c manifest.sha256 --quiet`. The clean four-file snapshots contain empty staged and unstaged patches, the status listing, and a summary, plus the manifest itself, confirming clean worktrees. The coffee snapshot contains its one-line task receipt diff. No private file content is reproduced in this report.

All eight named branches were left in place, so every committed HEAD remains reachable without new tags. Remote state was also recorded:

- `codex/launchloom-automated-seo-integration`: remote `df9e6b4a`, merged by PR #157.
- `codex/launchloom-source-first`: remote `49500e21`, PR #168 open.
- `codex/launchloom-juniper-blockers`: remote `4d77edc1`.
- `codex/launchloom-real-intake-20261023`: remote `6b7ec852`.
- `launchloom-dossier-coffee`, `launchloom-dossier-preview`, `launchloom-design-craft`, and `launchloom-source-foundation` have no matching remote branch.

## Per-source findings

### 1. `launchloom-automated-seo-integration`

**State**

- HEAD: `6190c466d8926aefd6e75a7066a5f2ae67de60a3`, `fix(assets): visually review generated imagery`, 2026-10-11.
- Local branch is an ancestor of `origin/main`. The remote branch head `df9e6b4a` is also an ancestor of `origin/main`.
- PR #157, "feat(pipeline): automated SEO-first creative generation", merged 2026-10-12 at `df9e6b4a`.
- Dirty: `scripts/generate-contextual-assets.mjs`, `tests/contextual-assets.test.ts`, `.github/agents/progress-update/UPDATE-2026-10-11.md`, plus untracked `UPDATE-2026-10-12.md`.

**Unique versus current main**

Nothing remains unique at the code level. The dirty code and test diff has stable patch ID `bb16f75790aefd90fe4d3ac8c74664074a5feb94`, identical to merged commit `6d1fe8a3` (`fix(assets): preserve FAL retry prompt limit and classify provider diagnostics`, PR #166). That merged commit is in `origin/main`.

Current main contains and extends the same behavior: `GENERATED_ASSET_REVIEW_FAILURE_CODES`, `FAL_VALIDATION_FIELDS`, `retryPromptFor`, `falRequestFailure`, `generationBlockedByFailure`, and `unavailableAssetReview`, plus the corresponding regression tests. Main has since replaced the reviewer model default with the approved production visual gate and strengthened the no-text and no-people directive. That later evolution is intentional; the old worktree version should not overwrite it.

The dirty and untracked progress text is present in main's dated ledger. The full-diff patch ID differs only because the progress files are not patch-identical after later ledger edits, not because code behavior is missing.

**Integration recommendation**

None. Do not reapply the dirty patch. If an audit trail is desired, commit the duplicate progress text to the old branch before removal; otherwise the snapshot is sufficient evidence.

**Tests if anything is re-run**

No product test is required for disposition. If the old branch is revived for any reason, run `tests/contextual-assets.test.ts`, `npm run check`, and the production build, but expect the current main versions to be newer.

**Removal conditions**

1. Keep the verified snapshot.
2. Obtain owner approval to discard the duplicate dirty and untracked files, or commit them to the old branch.
3. Confirm `git status --porcelain` is clean.
4. Confirm the remote merged head is still an ancestor of `origin/main`.
5. Remove the worktree, then delete the local branch and merged remote branch only after the above checks.

The local branch points at the older `6190c466`, while the remote and PR are at the merged `df9e6b4a`. Cleanup must not imply that `6190c466` was the merged head; both are integrated ancestors.

### 2. `launchloom-source-first`

**State**

- HEAD: `49500e217324cd99dc619cf143403dea9d9de1db`, 2026-10-12.
- Commit chain: merge `1ad2bc57`, feature `9f6d4398`, docs `81750906`, fixes `febe541c` and `49500e21`.
- PR #168, "Source-first creative authoring from qualified dossier templates", is open and draft. GitHub reports `mergeStateStatus: DIRTY`, `mergeable: CONFLICTING`, and no review decision. The last update was 2026-10-12T20:50:12Z.
- Old check run `38306752316`: `classify` passed; `validate` and `route-fixtures` failed at 10 minutes. CodeRabbit skipped because the PR is a draft.
- Dirty: `tests/source-first-rendered.test.ts` adds local-only copying of the built fixture into ignored `artifacts/source-first-verification/site`; `UPDATE-2026-10-12.md` is modified; `UPDATE-2026-10-13.md` is untracked.

**Unique versus current main**

The branch changes 26 files. Its new source-first modules and tests do not exist in current main:

- `scripts/source-first-authoring.mjs`
- `scripts/source-attribution-evidence.mjs`
- `scripts/source-starter-baseline.mjs`
- `scripts/audit-source-starters.mjs`
- `docs/source-first-authoring.md`
- `templates/client-site/src/components/SourceAttribution.astro`
- `templates/client-site/src/lib/source-attribution.mjs`
- `tests/source-first-authoring.test.ts`
- `tests/source-first-rendered.test.ts`
- `tests/source-attribution-evidence.test.ts`

The branch also modifies the authoring orchestrator, production author, bakeoff, promotion, revision template paths, package files, site types, and service/location pages. It adds `parse5` at `8.0.0` for real DOM parsing.

Ten files are changed on both sides of the merge base, including `package.json`, `package-lock.json`, `docs/site-generation-guidelines.md`, `scripts/author-production-experiences.mjs`, `scripts/production-experience-author.mjs`, `scripts/run-creative-bakeoff.mjs`, `templates/client-site/src/lib/site.ts`, and `templates/client-site/src/pages/services/[slug].astro`. A blind merge is not safe.

Current main shipped a different source-derived direction: commit `f532fc11`, "Source-foundation generation: all dossiers, generic renderer, workflow path (#196)", on 2026-10-27. It adds the foundation compiler, foundation renderer, foundation index, per-dossier foundation bundles, workflow `renderer: foundation`, and host-rendered `ReferencePackCredit`. That implementation covers source-derived generation and visible licensing credit, but it is not patch-equivalent to source-first's bounded model-edit mechanism. Source-first's exact `find`/`replace` source-edit contract and its attribution evidence tests remain unimplemented.

The proof in the branch is mixed and should not be restated as a success: the progress ledger records real provider-authored dossier outputs, but every real provider source-first attempt failed (fragment limits or unreadable provider output), and the local previews were diagnostics, not accepted design. The dirty test change merely retains a fixture build for local review.

**Integration recommendation**

Do not merge PR #168. Two bounded options require owner direction:

1. **Supersede and close.** Treat the shipped foundation renderer as the current product direction. Preserve the branch and snapshot as historical evidence, and close the draft PR only with explicit authorization.
2. **Revive a narrow subset.** Start a fresh worktree from current main and port only the still-needed capability, likely source attribution evidence or the bounded edit contract, not the whole branch. Rebuild against current authoring seams and current model defaults. Do not resurrect the old prompt or dependency shape.

If revived, required tests are `tests/source-first-authoring.test.ts`, `tests/source-first-rendered.test.ts`, `tests/source-attribution-evidence.test.ts`, `tests/production-experience-author.test.ts`, Astro check, and a production build. Rendered desktop and mobile verification is mandatory because the feature changes authored pages. No paid generation is needed to prove the port; fixture and provider-free paths suffice.

**Removal conditions**

Keep the worktree and branch until the product decision is recorded. The branch has unique unmerged commits, the PR is conflicting, and the worktree has dirty and untracked files. Even after a snapshot, AGENTS worktree-preservation rules require the dirty files to be committed, stashed, or explicitly discarded with owner approval before removal. If the PR is closed as superseded, record that decision, retain the branch, then clean the dirty files and remove the worktree.

### 3. `launchloom-juniper-blockers`

**State**

- HEAD: `4d77edc1b2840011bb39e17d9d6ce96c1350eb94`, "fix(creative): preserve safe reference-directed preview behavior", 2026-10-15.
- One commit, 22 files: 17 modified and 5 added, including a new plan, two new tests, and a new client-image snapshot module.
- Dirty: `UPDATE-2026-10-15.md` appends a 33-line "Approved additional C artwork and decision-support content" section that is not in the commit. It records the additional artwork, the failed Codex image attempts, the successful later Codex image, final local checks, and the remaining C hero/action acceptance gap.
- Ignored artifacts: about 398 MiB under `artifacts/juniper-replay` and `artifacts/juniper-care-scene`, including screenshots, contrast and interaction receipts, retained candidate sources, and sealed asset bytes. They were preserved privately.

**Unique versus current main**

The commit predates substantial main rewrites, so it cannot be merged. Current main has since rewritten `scripts/rendered-interaction-evidence.mjs` (commit `1372fd50`, "recover bounded runtime interaction evidence") and continued evolving `scripts/rendered-contrast.mjs`, the creative repair loop, and the judge path.

The following behaviors or files were not found in current main by symbol or phrase search, and are therefore credible salvage candidates:

- Sealed client-image snapshot module `scripts/client-image-snapshots.mjs` and tests. Current main has no `snapshotClientImages`, `isClientImageSnapshotUrl`, `retainedImages`, or equivalent bakeoff wiring. The branch added exact-host and exact-path validation, raster-only content types, redirect refusal, 5 MiB per-image and 20 MiB per-set limits, byte reuse, and interaction evidence digests.
- Network-free interaction capture that fulfills only exact sealed asset URLs from retained bytes and records URL and content digests. Current main still blocks all image hosts in its captured CSP.
- Exclusive pressed-button selector restoration. Current main's rewritten control path has no `declaredSelector` handling and clicks the selected control twice to restore, which can fail on an exclusive group.
- Judge-build banner suppression. Current `SiteLayout.astro` still renders the test/demo aside when `testPreview` is true even if `judgePreview` is true, despite the nearby comment saying judge previews must show only the authored candidate.
- Creative host containment. Current `[data-creative-host="true"]` CSS lacks `position: relative`, so an authored absolute header can overlap platform notices.
- Palette-guard recognition of string findings. Current `findingsRequirePaletteChange` handles category objects but not the exact `contrast fail:` or `contrast unresolved:` strings forwarded by the bakeoff.
- Outward-ring contrast measurement and the identical-partial-plate exception. Current main has later contrast logic but no `allowIdenticalPartialPlate`, `outsideBg`, or four-strip square-outline audit. This requires revalidation against the current auditor before porting.
- `RENDERED_DESIGN_CORRECTION_CONTRACT`, the related authoring prompt insertions, and the four guideline paragraphs about reference-led transitions, useful selectors, `data-ll-action` semantics, and media-overlay composition. Current main has a shorter `data-ll-action` instruction but not these contracts.
- Tests `tests/client-image-snapshots.test.ts` and `tests/creative-runtime-containment.test.ts`, both absent from main.

**Integration recommendation**

Do not merge `4d77edc1`. Extract a focused salvage branch from current `origin/main`, in this order:

1. Client-image snapshots plus interaction-evidence fulfillment and provenance tests. This is the clearest security and evidence improvement.
2. Judge banner suppression plus creative-host containment, each with a rendered regression.
3. Exclusive pressed-selector restoration and the string palette guard, each with a test built from the actual candidate markup pattern.
4. Authoring and guideline contracts, which are low-risk prompt and documentation changes.
5. Contrast ring geometry only after reproducing the current bug against the current auditor. Skip it if the current code path no longer applies.

Required tests: the two new test files plus `tests/rendered-interaction-evidence.test.ts`, `tests/pipeline-test-rendered.test.ts`, `tests/rendered-contrast.test.ts`, `tests/rendered-creative-repair.test.ts`, `npm run check`, and a production build. Rendered desktop, compact, and mobile checks are needed for containment and judge preview. No paid model call is required for any of these fixes.

**Removal conditions**

Keep the worktree and branch. The commit is unique and the worktree has a dirty progress file. After the salvage branch lands, confirm `git diff --quiet origin/main HEAD` or record the salvage mapping, commit or discard the progress append with approval, then remove. The ignored artifacts are preserved but remain only in the private snapshot, not in git.

### 4. `launchloom-dossier-coffee`

**State**

- HEAD: `b51eb48a0bd8859c552dbd71d7a801407a51b41f`, "Add replacements for rejected thin-category references", 2026-10-23.
- Ten commits, based on `1ee7f304` (2026-10-23), which predates current main's landscaping expansion #191.
- The diff is large: 468 files changed, about 157,028 insertions and 122 deletions. It adds 17 dossier directories and modifies five existing care manifests.
- Dirty: one appended line in `.collab/task-complete.log`.

**Unique versus current main**

Seventeen dossier roots are absent from current main:

`html5up-editorial`, `html5up-paradigm-shift`, `html5up-prologue`, `html5up-read-only`, `html5up-tessellate`, `startbootstrap-agency`, `startbootstrap-business-casual`, `startbootstrap-clean-blog`, `startbootstrap-creative`, `startbootstrap-grayscale`, `startbootstrap-landing-page`, `startbootstrap-small-business`, `templatemo-finance-business`, `templatemo-medic-care`, `templatemo-training-studio`, `web-coffee-ember-roast`, and `web-coffee-marigold`.

All 17 manifests declare `productionEligible: true` and contain reference DNA. None has a `foundation/` directory, so they would work in the creative/reference lane but would need foundation compilation before the `foundation` renderer could use them.

The branch also adds supplemental registration logic that current main lacks. Current `scripts/sync-reference-library.mjs` is 304 lines; the branch version is 399 and adds `makeSupplementalRecord` plus automatic discovery of production-eligible supplemental dossiers. Current main's `scripts/inspiration-registry.mjs` does have business-matched filtering, but it still depends on registry records existing. Without the supplemental registration change, merely dropping in the new dossiers would not make them selectable.

The five existing manifests remove the broad `healthcare` business kind and tag from `care-concierge-cinematic`, `care-image-mosaic`, `care-wellness-journal`, `colorlib-meridian-clinic`, and `quiet-care-consultation`. That may be a desirable classification cleanup, but it changes selection eligibility and needs a deliberate review, not a silent merge.

**Critical conflict and rights findings**

The branch's `data/inspiration-registry.json` is not mergeable as a file. It has 144 records versus current main's 129. It adds the 17 new IDs but removes two records added by #191: `htmlcodex-gardener-garden-services` and `orgarden-gardening-services`. The branch's `template-index.json` has the same stale-base problem. A file-level merge would silently delete current landscaping coverage.

Two live-site coffee dossiers assert `source.rights: "owned"` and their `business-verification.md` files state that the sites are owned and operated by LaunchLoom. There is no independent domain-ownership evidence in the repository beyond that assertion. Because production eligibility depends on it, the owner must confirm this claim before these two dossiers are registered. This is a rights blocker, not a technical blocker.

The template dossiers carry HTML5 UP CC BY 3.0, Start Bootstrap, or TemplateMo license evidence. Those still need hash and license validation against the current library policy.

**Integration recommendation**

Create a fresh data-port task from current `main`. Do not merge or cherry-pick the branch wholesale.

1. Add the 17 dossier directories as data, preserving their manifests, rights files, screenshots, template sources, and extraction manifests.
2. Hold back the two `web-coffee-*` dossiers until ownership is confirmed.
3. Port the supplemental registration logic only after diffing it against current main's #191 changes. Reconcile by regenerating the registry and template index from the merged dossier set, never by replacing the files with the branch versions.
4. Review the five `healthcare` tag removals separately.
5. Recompute screenshot and extraction hashes as part of the existing verifier rather than trusting the old manifest alone.
6. If the new dossiers must support the `foundation` renderer, compile their foundations and update the foundation index. Otherwise document them as creative-lane-only references.

Required tests: `node scripts/verify-reference-templates.mjs`, `npx vitest run tests/inspiration-registry.test.ts tests/reference-dossier.test.ts`, `npm run check`, and a production build. A provider-free pack-selection dry run for coffee, finance, medic, and training categories should prove that at least six eligible business-matched references are available. Do not run paid generation.

**Removal conditions**

Keep the worktree and branch until the data port is complete or the owner explicitly archives it. The branch has unique unmerged commits and a dirty receipt. After integration, verify that every dossier and script delta is either present in main or intentionally rejected, then remove. If only the two coffee dossiers are rejected on rights grounds, record that explicitly; the remaining 15 can still be ported.

### 5. `launchloom-dossier-preview`

**State**

- HEAD: `f25479b0c2cb0bb85b4eb5c4edf45a8128760ae4`, an ancestor of current main.
- No PR and no unique commits.
- Dirty: `.collab/task-complete.log` plus five untracked files:
  - `scripts/build-dossier-source-previews.mjs`
  - `scripts/serve-dossier-source-previews.py`
  - `docs/verification/dossier-source-previews-2026-10-11.md`
  - `.github/agents/progress-update/UPDATE-2026-10-11.md`
  - `.github/agents/progress-update/UPDATE-2026-10-12.md`
- Ignored artifacts: about 41 MiB of six rendered original-source preview bundles under `artifacts/dossier-source-previews`.

**Unique versus current main**

The builder verifies extraction file sizes and SHA-256 hashes, copies original source and dossier evidence, and writes a local gallery. The Python server binds loopback only and adds `form-action 'none'`, `connect-src 'none'`, `frame-ancestors 'none'`, and noindex headers. The verification report documents six previews, desktop and mobile Playwright checks, and known source defects: Caseworth and Tavola mobile overflow at 718 px, and a plumbing hero contrast concern. The progress entries record the failed server restart and the six-preview expansion.

Current main has no equivalent `build-dossier-source-previews` or `serve-dossier-source-previews` script. However, the later October 12 investigation note that retained source is not injected into authoring is now obsolete: the foundation renderer from #196 does use compiled source foundations. The preview tool remains a useful local review utility, but it is not part of the production path, and it hardcodes six dossier IDs.

**Integration recommendation**

Archive only. If a repeatable source-review gallery is still wanted, port the builder and server as verification tooling with a generic ID argument and current dossier-schema validation. Do not present the 41 MiB output as product evidence or commit it. The verification report is historical; its preview-specific observations should not be treated as current quality claims.

**Removal conditions**

The worktree has unique untracked files, so it is not removable under AGENTS until those files are committed to the branch, stashed, or explicitly discarded with owner approval. Keep the snapshot. If the owner chooses archive-only, commit the five untracked files and the receipt to the branch for audit, then remove the worktree. If the owner wants the tool, port it first and record the mapping.

### 6. `launchloom-design-craft`

**State**

- HEAD: `086720ebebe56515ba60f9047b2c046792ed4f0b`.
- Three docs-only commits:
  - `5ad3dd14`, assessment of `ai-design-skills`
  - `ce8fe58f`, recipe-specific craft profiles
  - `086720eb`, 598-line craft-layer implementation plan
- Clean, no ignored artifacts, no process, no dependency install.

**Unique versus current main**

The branch adds `docs/ai-design-skills-assessment.md` (423 lines) and `docs/superpowers/plans/2026-10-26-design-craft-layer.md` (598 lines, six tasks), plus a progress section. Current main does not have either file and has no `DESIGN_CRAFT_LAYER` flag, craft profile module, or paired bakeoff.

Current main does have an independent, shorter evaluation at `docs/research/2026-10-26-ai-design-skills-evaluation.md` (240 lines), and it shipped the narrative spine and specificity guard at `b3b6b264`. The branch's assessment is not identical; it goes further into three recipe profiles and a gated craft layer. The main research decision favors reference material plus a narrative spine, not a full craft-prompt layer. The two directions overlap but do not conflict at the file level.

The branch plan pins `opencode-go/deepseek-v4.1-flash`, which is the current approved default, so it is not an old-model resurrection. It is still a new authoring mode and must be evaluated against the current pack and foundation directions.

**Integration recommendation**

Archive the assessment and plan, or make a product decision to pursue the craft layer. Do not implement it in this reconciliation. If pursued, re-scope from current main because the plan's file paths and authoring seams have moved. The paired three-recipe bakeoff is the right proof, but it requires paid generation and is outside this task.

**Removal conditions**

The worktree is clean and the commits are reachable from the local branch. It can be removed after the owner approves archive-only disposition, with the branch retained or a tag created. Do not delete the branch while the craft-layer decision is open.

### 7. `launchloom-source-foundation`

**State**

- HEAD: `a18e6a4949eec1e812917e93ec53628fbec2a98d`, "docs(foundation): add source-foundation design and plan", 2026-10-26.
- One commit, three files, 1,128 insertions, clean.
- No remote branch, no PR, no process, no dependency install.

**Unique versus current main**

The two substantive documents are byte-identical to current main:

- `docs/superpowers/plans/2026-10-26-source-foundation-generation.md`
- `docs/superpowers/specs/2026-10-26-pack-first-landscaping-design.md`

The implementation those documents describe shipped in `f532fc11` (#196) on 2026-10-27, including the foundation compiler, foundation renderer, per-dossier foundation bundles, and the `foundation` workflow path. The branch's only unique content is a short progress section recording the design and plan approval context and the OpenCode Go quota constraint. That section is not in main's later `UPDATE-2026-10-26.md`.

**Integration recommendation**

No product integration is needed. If ledger completeness matters, append the approval context to main's October 26 progress file in a docs-only change. Otherwise treat the branch as content-integrated.

**Removal conditions**

The worktree is clean, but the commit is not an ancestor of main and a content diff is not empty because of the progress section. Do not delete the branch yet. Retain the branch or a tag, obtain owner approval for archive-only disposition, then remove the clean worktree. This is the lowest-risk cleanup after the fully merged automated-seo source.

### 8. `launchloom-real-intake-20261023`

**State**

- HEAD: `6b7ec852f3097d7cd1e9a26515d20ceaec39efd0`, "docs(progress): record blocked real-intake pipeline trial", 2026-10-23.
- One commit, one new file, 35 lines, clean.
- No remote branch and no PR.
- Base: `498792fa`.

**Unique versus current main**

The commit adds `.github/agents/progress-update/UPDATE-2026-10-23.md` with the Harbor & Pine Landscape Co. and Ridgeline Plumbing & Drain Co. trials. Main has a different October 23 ledger file with cafe intake #185, workflow cleanup, and other workstreams. It does not contain the branch's #183/#184 trial record.

The record is historical and partly stale: the landscaping shortage that blocked #183 was addressed by #191, which raised eligible landscaping references from one to three. The second intake still records useful authoring rejections: forbidden inline styles, missing sealed image token, and unsafe template-literal `href`. Those details are evidence about that run, not proof of current main behavior. The branch also records cleanup of a synthetic verifier account and leaves demo issues #183/#184 in place.

**Integration recommendation**

Archive, or append the section to main's October 23 ledger manually. Do not cherry-pick the file as an add/add replacement; it would overwrite or conflict with the existing same-date file. No code, tests, or deployment are involved.

**Removal conditions**

The worktree is clean. Keep it until the owner decides whether the historical record belongs in main. If archived, retain the branch or tag and remove the clean worktree. Completing the archived Work OS/Nifty references is separate and must not be inferred from this audit.

## Cross-cutting findings

### Process and dependency references

No running process or listening port matched any of the eight worktrees at audit time. No dependency installation, upgrade, or removal was performed.

Two worktrees depend on another worktree's dependencies through symlinks:

- `launchloom-dossier-coffee/node_modules` points to `launchloom-juniper-blockers/node_modules`.
- `launchloom-real-intake-20261023/node_modules` points to `launchloom-admin-redesign/node_modules`.

Removing `launchloom-juniper-blockers` before coffee is retired would break the coffee worktree's local commands. The reverse order is safe. The admin-redesign target is outside this audit's ownership and must not be altered. The source-first ignored candidate sites also contain local `node_modules` symlinks; those were excluded from the snapshot and are not product dependencies.

### No em dash or generated-site changes

This phase made no generated-site, template, prompt, or creative output change. `docs/site-generation-guidelines.md` was read for direction. Any later generated-site integration must re-read it and preserve the care-editorial and local-trades recipe separation, verified facts, client asset precedence, and the no-em-dash rule.

### Security and privacy

The preserved snapshots contain private evidence such as model prompts, usage records, screenshots, and retained client asset bytes. They are outside git, under `0700` directories with `0600` files. No secret values, tokens, API keys, private prompts, or private client content are reproduced in this report. No symlink was followed. The two coffee ownership assertions are the only rights claims that need explicit owner confirmation; this report does not validate or repeat them as fact.

## Blockers requiring user decision

1. **Source-first product direction.** Close PR #168 as superseded by the foundation renderer, or authorize a fresh narrow port. It cannot merge as-is.
2. **Coffee dossier ownership.** Confirm whether `emberroastcoffee.com` and `marigoldcoffee.com` are truly LaunchLoom-owned before registering those two as production-eligible. Confirm whether to port the other 15 dossiers.
3. **Juniper salvage scope.** Approve a focused safety and evidence salvage branch, or archive the commit as historical. The branch's contrast changes need reproduction against current main before inclusion.
4. **Design-craft direction.** Archive the craft-layer plan, or authorize a current-main re-scope and paid paired bakeoff later.
5. **Historical ledger integration.** Decide whether the real-intake #183/#184 trial, the source-foundation approval note, and the dossier-preview tooling report belong in main's ledger or only in the private archive.
6. **Dirty-source disposal.** For automated-seo duplicate changes, source-first test/progress changes, juniper progress append, coffee receipt line, and preview untracked tooling, approve commit-to-branch or discard after snapshot. A snapshot alone does not satisfy the AGENTS preservation definition for dirty files.

## Proposed next actions for the controller

1. Integrate nothing in this phase; this report is audit evidence, not an integration claim.
2. Assign a focused salvage task for juniper's client-image snapshot and judge/containment fixes first, because they are bounded and do not require paid generation.
3. Assign a separate data-port task for the coffee dossiers, with the rights and registry constraints above, and exclude the two owned-site dossiers until confirmed.
4. Decide source-first at the product level before touching PR #168. Preserve the branch either way.
5. Treat automated-seo and source-foundation as cleanup candidates only after snapshot verification and owner approval. Their content is integrated or identical, but their dirty or historical refs still need an explicit disposition.
6. Keep dossier-preview, design-craft, and real-intake as archives unless a concrete follow-up need appears. They contain useful evidence but no required product behavior.
7. Remove worktrees only after each source has a recorded disposition, the snapshot is verified, no process or dependency consumer remains, and the branch or tag is retained as required. Do not delete `launchloom-juniper-blockers` while coffee still symlinks its dependencies.

## Verification performed for this report

- Audited all eight HEADs, branches, statuses, ignored files, and process references.
- Confirmed no source worktree changed during the audit by re-running `git status --porcelain` and comparing it with the initial inventory.
- Confirmed current main lacks the unique files and symbols claimed above by direct file and symbol searches.
- Confirmed automated-seo code and test patch equivalence with merged commit `6d1fe8a3` using stable patch IDs.
- Confirmed PR #157 merged and PR #168's current conflicting state through `gh`.
- Confirmed coffee's registry divergence removes two current main landscaping records.
- Preserved and hash-verified every dirty, untracked, and ignored non-rebuild file in the private snapshot.
- Confirmed snapshot permissions and absence of copied symlinks.
- Did not run application tests, install dependencies, start processes, generate content, push, merge, deploy, or write to production.

Remaining work is reconciliation and integration, not audit. This report does not prove that any preserved work is accepted, deployed, or visually verified in its target pipeline.
