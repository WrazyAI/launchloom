# Reference dossier worktree reconciliation

## Snapshot

- Reconciliation target: `origin/main` at `7fc34f0d3357d14b39aa607d293444293f554c08`, fetched on 2026-10-07.
- Source checkout: `/home/maigreeks/projects/launchloom`, branch `feat/reference-dossier-checkpoint`, HEAD `c91a103e87bfd4734fb19d2716032212a573f50f`.
- Source checkout is preserved untouched. It has 1,215 staged paths relative to its HEAD and four untracked files. Relative to current `origin/main`, its staged tree is 163 paths (`100 A`, `55 M`, `8 D`; +14,433/-4,042 text lines).
- The source branch has 13 commits not in current main and 442 current-main commits not in that branch. Its history must not be replayed wholesale.
- Current main already has the 96-reference/16-niche core. `node scripts/sync-reference-library.mjs` passed on the clean worktree: `reference_core_niches=16 reference_core_ids=96 registry_records=127 mode=check`.

## Reference evidence classification

| Source delta | Inspection result | Reconciliation decision |
|---|---|---|
| 35 additions under `data/inspiration-evidence/` | SHA-256 comparison found 32 byte-identical matches in canonical dossier evidence. The other three Kokoro-canary WebP files are byte-identical to `data/creative-assets/architecture-canary/`. No active registry/compiler consumer points at the parallel tree. | Do not port the parallel tree. The canonical copies already exist on main; the original checkout remains untouched. |
| 49 additions under three `html5up-*/render/` trees | Local rendered source, CSS, JS, and template images. None of the 49 paths is declared by its dossier manifest. Their full-page captures, prompts, and applicable license records are already on main. | Do not port template source or duplicate assets. The pipeline consumes dossier screenshots/prompts, not these source trees. |
| 15 added rights/provenance documents across 9 dossier folders | They provide capture/source observations, attribution details, or fuller requester-attested scope. None is currently declared by its manifest, so its bytes are not included in the dossier digest. Four `REQUESTER-ATTESTATION.md` files state the requester's scope and explicitly say that no independent source-owner grant is attached. | Port the 15 documents and declare each in the dossier manifest as either the primary `rightsEvidencePath` (the four detailed requester attestations) or `provenanceEvidencePaths`. Keep asset provenance in the provenance list, not the asset-license list. Do not present attestations as owner grants. |
| 96-entry core and its existing screenshots/prompts | Present and synchronized on current main; no new core record or missing screenshot/prompt was found in the 163-path net delta. | Do not duplicate or replace the core collection. |

The 15 documents are in `attested-future-fitness`, `colorlib-marigold-event-venue`, `colorlib-meridian-clinic`, `direct-brixton-cycles-community-workshop`, `independent-retail-beepy-bella-art-world`, `jewelry-panconesi-sculptural-luxury`, `jewelry-taya-memory-wearable`, `spicer-auto-repair-digital-inspection`, and `spicer-plumber-dispatch-console`.

Exact disposition for the 15 port candidates:

| Dossier | Path | Disposition |
|---|---|---|
| `attested-future-fitness` | `rights/source-observations.md` | Port as provenance |
| `colorlib-marigold-event-venue` | `rights/PROVENANCE.md` | Port as provenance |
| `colorlib-meridian-clinic` | `rights/PROVENANCE.md` | Port as provenance |
| `direct-brixton-cycles-community-workshop` | `rights/ASSET-PROVENANCE.md` | Port as provenance |
| `direct-brixton-cycles-community-workshop` | `rights/PROVENANCE.md` | Port as provenance |
| `direct-brixton-cycles-community-workshop` | `rights/REQUESTER-ATTESTATION.md` | Port as primary rights evidence, explicitly requester-attested |
| `independent-retail-beepy-bella-art-world` | `rights/ASSET-PROVENANCE.md` | Port as provenance |
| `independent-retail-beepy-bella-art-world` | `rights/REQUESTER-ATTESTATION.md` | Port as primary rights evidence, explicitly requester-attested |
| `jewelry-panconesi-sculptural-luxury` | `rights/ASSET-PROVENANCE.md` | Port as provenance |
| `jewelry-panconesi-sculptural-luxury` | `rights/REQUESTER-ATTESTATION.md` | Port as primary rights evidence, explicitly requester-attested |
| `jewelry-taya-memory-wearable` | `rights/ASSET-PROVENANCE.md` | Port as provenance |
| `jewelry-taya-memory-wearable` | `rights/REQUESTER-ATTESTATION.md` | Port as primary rights evidence, explicitly requester-attested |
| `spicer-auto-repair-digital-inspection` | `rights/ASSET-PROVENANCE.md` | Port as provenance |
| `spicer-auto-repair-digital-inspection` | `rights/SOURCE-README.md` | Port as provenance |
| `spicer-plumber-dispatch-console` | `rights/README.md` | Port as provenance |

Exact disposition for the 35 parallel evidence additions: all are excluded as byte-identical duplicates of already-canonical evidence. `a1-design-showcase/screenshots/{clear-counsel,kinetic-club,neighborhood-table,quiet-practice,rapid-response}-{desktop,mobile}.png` (10 files), `a1-gallery/{craft-2025/desktop.avif,ethan-suero/desktop.avif,mckp/desktop.webp,scs/desktop.webp,the-uncommon-founder/desktop.avif}` (5), `creative-probe-kokoro/assets/{hero-atrium,project-mosaic,ridge-house}.webp` plus `creative-probe-kokoro/reference/kokoro-template-for-framer.webp` (4), `design-family-demos/screenshots/{atmospheric-editorial,cinematic-premium,image-mosaic,project-showcase,studio-minimal}-{desktop,mobile}.png` (10), `neighborhood-table/assets/{bread-detail,market-table,pastry-shelf}.webp` and `neighborhood-table/assets/provenance.json` (4), and `nightjar/qa/{desktop-full-page,mobile-full-page}.png` (2). The three Kokoro generated assets match `data/creative-assets/architecture-canary/`; its template screenshot matches the canonical `kokoro-spatial-editorial` dossier's `screenshots/superseded-gallery-desktop.webp`. The other 31 match files already in canonical dossiers.

The remaining 49 reference-library additions are excluded as unregistered local source snapshots, grouped exactly under `dossiers/html5up-dental-dimension/render/` (9 files), `dossiers/html5up-fitness-big-picture/render/` (25 files), and `dossiers/html5up-home-care-story/render/` (15 files). The manifest for each dossier references its desktop/mobile captures and design prompt, not any `render/` descendant. Current main already holds the reference captures, prompts, and applicable source/license records; importing the snapshots would add unused third-party template implementation and imagery without improving the production reference contract.

## Code and history classification

- **Creative navigation validation:** the current-main author already requires visible native navigation for non-dossier routes, preserves reference-specific navigation geometry for dossier routes, rejects hidden/non-rendering anchors and unsafe href spreads, and has focused tests for hidden attributes, style spreads, and href overrides. The feature branch's older validator/test snapshot removes current-main test coverage (including 114 lines from `production-experience-author.test.ts`); do not port it.
- **Preview and repair workflows:** current main has the client dependency install before rendered repair and the preview-only/review-branch safeguards. The branch's workflow edits are stale relative to main and are not needed.
- **Diagnostic-release and lead-email changes:** these are separate review/release features, not reference-library work. Preserve them in the original checkout for their own current-main reconciliation; this task does not claim they are merged or complete.
- **Onboarding, dashboard, and email/template changes:** unrelated to reference reconciliation and mixed with older code. Do not port them in this change set.
- **Recent-launch history:** the staged tree would replace `data/recent-launch-signatures.json` with a snapshot that removes 71 lines. Preserve current main's launch-rotation history; do not port this replacement.
- **Eight deletions against main:** preserve `.github/agents/progress-update/UPDATE-2026-10-06.md`, `.github/agents/progress-update/UPDATE-2026-10-07.md`, `docs/creative-quality-bar-review.md`, `templates/client-site/src/lib/quick-answers-layout.{mjs,d.mts}`, and tests `brand-conformance.test.ts`, `creative-lead-form-preview.test.ts`, and `quick-answers-layout.test.ts`. They are current-main files and are not required to integrate the provenance documents.
- **Untracked generated manifest:** `templates/client-site/src/generated-experiences/selected/manifest.json` identifies `model: "test/model"`, a Kokoro reference screenshot, and no mobile screenshot. It is a test artifact, not a valid generated candidate or complete reference dossier; keep it out of this branch.
- **Untracked plan and progress files in the source checkout:** retain them there; do not copy or overwrite them. This worktree has its own plan and progress entry.

## Decisions and follow-up

1. The clean reconciliation branch will contain only the 15 supplemental rights/provenance files, manifest links that cause those records to be validated and included in dossier digests, a focused regression test, and this report. It will not import the old core, duplicate evidence, source render trees, history snapshot, or unrelated UI/Worker/feedback/email changes.
2. The four detailed direct-site attestation files will become the manifest's primary `rightsEvidencePath`; existing lowercase attestation notes will remain declared as provenance. This keeps the clearer scope and preserves the prior record while remaining explicit that the clearance is requester-attested, not an independently verified owner grant.
3. No production pipeline gate, reference eligibility rule, visual threshold, or selection behavior will change.
4. A separate follow-up is needed to reconcile the branch's diagnostic-release and lead-email features against current main if they are still desired; this report does not discard them from the original checkout.

## Verification

- Current-main reference sync check: passed (96 core IDs, 16 niches, 127 registry records).
- SHA-256 duplicate audit: passed; all 35 parallel-evidence paths matched canonical dossier or architecture-canary assets byte-for-byte.
- Manifest-link audit: passed; all 64 added reference-library paths are currently unreferenced by their dossier manifests.
- The regression test was first run before the manifest updates and failed on the missing supplement link; after the port, `npm test -- tests/reference-dossier.test.ts` passed 17/17. The wider focused run `npm test -- tests/reference-dossier.test.ts tests/inspiration-registry.test.ts tests/creative-compiler.test.ts` passed 83/83.
- Full local verification: `npm test` passed 1,483 tests / 107 files; `npm run test:worker` passed 133 tests / 16 files; `npm run check` passed 310 files with 0 errors, 0 warnings, 5 hints; `npm run check:worker` passed; root `npm run build` passed (3 routes); client `npm run check --prefix templates/client-site` passed 55 files with 0 diagnostics; client `npm run build --prefix templates/client-site` passed (8 routes); the final focused dossier suite passed 17/17; and `node scripts/sync-reference-library.mjs` passed (96 IDs, 16 niches, 127 registry records). The full app/Worker suites and builds preceded a final test-only assertion rewrite to satisfy Astro's TypeScript checker; afterward the affected dossier test (17/17), root Astro check, and creative authoring/production-author/promotion/rendered-repair suites (175/175 across 4 files) were rerun successfully. No production data/code changed after the full suite.
- A production-style compile using the existing client config and a scoped auto-repair intake produced three unique references: `web-auto-repair-fallsbrook-motors`, `web-auto-repair-abees-hi-tech`, and `web-auto-repair-urban-autocare`. A post-compile assertion confirmed all three belong to the auto-repair niche and each has complete, full-page desktop and mobile evidence, with no cross-niche filler. The default client config on its own selects `wellness`, which currently has zero eligible dossier matches; that pre-existing pool mismatch correctly fails closed and is not changed by this reconciliation.
- `npx prettier --check` was also inspected and is not clean on the pre-existing manifest/test formatting style; the baseline manifests already have arrays Prettier would collapse. The new test block itself was aligned to Prettier output without reformatting baseline content.
- The final local change set is limited to the 15 supplemental rights/provenance files, nine dossier manifests, one dossier regression test, this report, the plan/progress ledger and the local task receipt. No image evidence, core records, candidate selection, production eligibility, visual/SEO gates, or release behavior changed. No generation, TestSprite run, push, merge, or deploy has occurred.
- Local review commit: `0683855` on `codex/launchloom-reference-reconciliation`; worktree remains local and unpushed.
