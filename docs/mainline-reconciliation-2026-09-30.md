# LaunchLoom mainline reconciliation — 2026-09-30

## Scope and evidence

Started from remote main `07c27145775fe2b5902d316985f3b659e0cd2ead` in a clean
integration worktree. Audited all 27 pre-existing local branch refs and 16
worktree records (one missing/prunable), including dirty work. The comparison
uses ancestry, per-file behavior, merged/open PR state, patch overlap, current
contracts, and validation rather than treating squashed commits as new features.

Dirty tracked work and non-ignored untracked files were backed up under
`/tmp/launchloom-reconcile-20260930T230106Z`; each backup has a binary patch and
SHA-256 manifest for untracked content. Existing credentials/ignored dependency
and build directories were not copied. Originals remain in place.

## Resulting product behavior

1. **Creative inner pages:** service details, service-area/location pages, and
   the services index are authored alongside each candidate homepage and styled
   together. Their sealed content, page markers, lead forms, assets, overflow,
   and rendered canvas/heading identity are checked before candidate selection.
   Legacy candidates retain the deterministic fallback. The repair loop can
   address authored inner pages without loosening scoped human-feedback edits.
2. **Creative repair and art direction:** fix decorative-image alt handling,
   enforce client palette roles, pass missed fidelity dimensions into repair,
   repair the closest passing candidate first, and avoid decorative photo filler
   for image-independent references. Large homepage-only repairs can request
   bounded complete replacements for implicated files; authored inner pages and
   scoped human feedback keep bounded edits and candidate-specific schemas.
   Complete bundle validation and fresh rendered gates still control acceptance.
3. **Physical-location maps and service-link safety:** location runtime resolves
   provided physical addresses/place IDs/validated Maps URLs into maps and
   directions; service areas and placeholder addresses do not fabricate offices.
   Sealed service links support aliases while rejecting unsealed and shadowed
   service collections. Older homepage-reuse routing was not adopted.
4. **Existing main behavior preserved:** structured replacement-image/color
   feedback, readable review copy, wide forms/large attachment previews, expanded
   reference selection, per-niche history, and real citation-backed SEO fallback
   remain. SEO fallback stays bounded, qualitative, context-only, and production
   gated when measured research is incomplete. SEO source and platform review CSS
   were not replaced by older branches.
5. **Agent workflow:** the reviewed root instructions, isolated worktree/main
   integration rules, daily progress ledger, and completion helper now travel
   with the integrated branch rather than remaining dirty-only in an old checkout.

## Branch dispositions

“Superseded” means its represented behavior is already covered by the newer
mainline; it does not mean its branch/worktree was deleted. No local worktree or
branch is removed by this reconciliation.

| Local branch | Snapshot state | Disposition |
| --- | --- | --- |
| `chore/depot-github-runners` | Clean | Retained, not shipped: Depot runner allocation is blocked. PR100 is the newer migration; PR95 overlaps it. Keep existing GitHub runners so validation/deploy remain executable. |
| `codex/launchloom-creative-pipeline-fix` | Clean | Selected three post-PR91 commits: gate/palette contracts, nearest-to-passing repair selection, and image-independent reference policy. |
| `codex/launchloom-depot-ci-migration` | Clean | Retained, not shipped: Depot runner allocation is blocked. PR100 is the newer migration; PR95 overlaps it. Keep existing GitHub runners so validation/deploy remain executable. |
| `codex/launchloom-service-page-identity` | Dirty; backed up | Selected eleven post-stack commits: authored service/location/services-index pages, shared styles, identity gates, and inner-page repair. |
| `feat/readable-feedback-copy` | Clean | Already integrated through the corresponding merged PR; preserve the newer main implementation rather than replaying the old branch tree. |
| `feat/reference-dossier-checkpoint` | Dirty; backed up | Reference/feedback implementation superseded by PR91 and later review PRs. Selected current dirty AGENTS.md and local ledger helpers; retained canary/default config and older source files. |
| `feat/reference-library-expansion` | Dirty; backed up | Older reference/authoring/repair/cache/diagnostic stack superseded by the PR91 mainline and preceding merged fixes. Retained locally; no wholesale historical merge. |
| `feat/structured-feedback` | Clean | Already integrated through the corresponding merged PR; preserve the newer main implementation rather than replaying the old branch tree. |
| `feature/creative-service-routes-maps` | Dirty; backed up | Selected dirty physical-location map resolver, runtime component, styling, and tests. Older homepage-reuse inner routing superseded by authored inner-page stack. |
| `feature/reference-goal-review` | Dirty; backed up | Older reference/authoring/repair/cache/diagnostic stack superseded by the PR91 mainline and preceding merged fixes. Retained locally; no wholesale historical merge. |
| `fix/author-reference-repair` | Dirty; backed up | Selected dirty changes: sealed service aliases and file-scoped large homepage repairs; retained bounded inner-page/human edits. |
| `fix/creative-author-diagnostics` | Clean | Older reference/authoring/repair/cache/diagnostic stack superseded by the PR91 mainline and preceding merged fixes. Retained locally; no wholesale historical merge. |
| `fix/creative-author-output-budget-resume` | Clean | Older reference/authoring/repair/cache/diagnostic stack superseded by the PR91 mainline and preceding merged fixes. Retained locally; no wholesale historical merge. |
| `fix/creative-experience-output-budget-20260922` | Clean | Older reference/authoring/repair/cache/diagnostic stack superseded by the PR91 mainline and preceding merged fixes. Retained locally; no wholesale historical merge. |
| `fix/diagnostic-preview-link` | Clean | Older reference/authoring/repair/cache/diagnostic stack superseded by the PR91 mainline and preceding merged fixes. Retained locally; no wholesale historical merge. |
| `fix/feedback-revision-scope` | Clean | Already integrated through the corresponding merged PR; preserve the newer main implementation rather than replaying the old branch tree. |
| `fix/image-intent-prefix` | Clean | Already integrated through the corresponding merged PR; preserve the newer main implementation rather than replaying the old branch tree. |
| `fix/pr42-cache-paths` | Clean | Older reference/authoring/repair/cache/diagnostic stack superseded by the PR91 mainline and preceding merged fixes. Retained locally; no wholesale historical merge. |
| `fix/pr91-repair-assertion` | Dirty; backed up | Dirty alias regression is covered by the stronger selected alias/shadowing tests; old stack superseded. |
| `fix/pulse-authoring-failures` | Clean | Older reference/authoring/repair/cache/diagnostic stack superseded by the PR91 mainline and preceding merged fixes. Retained locally; no wholesale historical merge. |
| `fix/reference-goal-guards` | Dirty; backed up | Six-per-niche guards and per-business-kind history already have newer canonical business-kind implementations in main; do not overwrite them. |
| `fix/rendered-reference-cache-prefix-40c937a` | Clean | Older reference/authoring/repair/cache/diagnostic stack superseded by the PR91 mainline and preceding merged fixes. Retained locally; no wholesale historical merge. |
| `fix/structured-image-intent` | Clean | Already integrated through the corresponding merged PR; preserve the newer main implementation rather than replaying the old branch tree. |
| `integration/reference-goal-main` | Dirty; backed up | Older reference/authoring/repair/cache/diagnostic stack superseded by the PR91 mainline and preceding merged fixes. Retained locally; no wholesale historical merge. |
| `main` | Clean | Advance to the final validated main tip after shipping. |
| `polish/review-forms` | Clean | Already integrated through the corresponding merged PR; preserve the newer main implementation rather than replaying the old branch tree. |
| `ui/wide-review-forms` | Clean | Already integrated through the corresponding merged PR; preserve the newer main implementation rather than replaying the old branch tree. |

## Artifacts and operational boundaries

Generated selected candidates and `selected.bakeoff-*` directories are canary
artifacts, not general production defaults. Retained dirty/detached worktrees
keep these files. The missing `/tmp/launchloom-pr65-canary-e8996b3` record is
recorded without pruning it. New integration and baseline worktrees are separate
from the original inventory. Dirty shared checkout remains on its original
branch so switching it cannot overwrite unrelated in-flight work.

The Depot migration is not merged: its CI jobs are queued without usable runner
allocation. Installing/access-enabling the Depot organization app is an external
administrative dependency; the current GitHub runner configuration is retained.

Runtime verification uses synthetic authored pages without provider/model calls
or form submissions. It proves routing, binding, rendering, form usability, and
responsive behavior; it does not certify a newly generated model design or
regenerate already deployed client sites. New generation can exercise the new
pipeline once integrated; existing client publication remains developer-gated.

## Validation and shipping receipts

- Fixed-snapshot main baseline: 105 focused tests passed.
- Initial integrated full run: 949 passed, one pre-existing 120-second reference
  rotation timeout during concurrent checks. Its unchanged suite passed all
  57 tests in isolation; neither timeout nor acceptance thresholds were changed.
- Worker: 76 tests passed and TypeScript checks passed.
- Root Astro: zero errors/warnings, one existing unused-import hint.
- Browser: synthetic authored routes at 1536×864 and 390×844; navigation, form
  input, marker presence, overflow, imagery, and copy integrity checked without
  submission. TestSprite run `c58345af-6769-4067-8953-41a78ca4e3a7` passed.
- CodeRabbit: first pass completed; three code findings reproduced and fixed.
  The minor request to date imported historic headings was declined to preserve
  the original append-only record rather than inventing event times.
- Final application partition, post-fix checks/build, CI/review, main identity,
  and deployment receipts are recorded in the progress ledger after completion.
