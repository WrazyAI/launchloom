# Legacy evidence consolidation (2026-09-26)

The former `data/inspiration-evidence/` tree was removed after reference
screenshots and supplemental source assets were verified and either moved
into their canonical dossiers or identified as generated-only test fixtures.
Three generated architecture canary images were moved to
`data/creative-assets/architecture-canary`; they are not source-site
references. No file was removed before its canonical destination and active
pointers were checked.

## Existing full-page screenshot pairs

These 22 PNGs were byte-for-byte duplicates of the canonical `screenshots/`
files. The dossier-local `rights/provenance.md` records the original path,
dimensions, and SHA-256.

| Former desktop/mobile path stem | Canonical dossier |
|---|---|
| `a1-design-showcase/screenshots/clear-counsel-{desktop,mobile}.png` | `dossiers/clear-counsel-ledger/` |
| `a1-design-showcase/screenshots/kinetic-club-{desktop,mobile}.png` | `dossiers/kinetic-club-program-bands/` |
| `a1-design-showcase/screenshots/neighborhood-table-{desktop,mobile}.png` | `dossiers/neighborhood-table-collage/` |
| `a1-design-showcase/screenshots/quiet-practice-{desktop,mobile}.png` | `dossiers/quiet-care-consultation/` |
| `a1-design-showcase/screenshots/rapid-response-{desktop,mobile}.png` | `dossiers/urgent-trade-service-poster/` |
| `design-family-demos/screenshots/atmospheric-editorial-{desktop,mobile}.png` | `dossiers/care-wellness-journal/` |
| `design-family-demos/screenshots/cinematic-premium-{desktop,mobile}.png` | `dossiers/care-concierge-cinematic/` |
| `design-family-demos/screenshots/image-mosaic-{desktop,mobile}.png` | `dossiers/care-image-mosaic/` |
| `design-family-demos/screenshots/project-showcase-{desktop,mobile}.png` | `dossiers/trade-project-showcase/` |
| `design-family-demos/screenshots/studio-minimal-{desktop,mobile}.png` | `dossiers/trades-field-report/` |
| `nightjar/qa/{desktop-full-page,mobile-full-page}.png` | `dossiers/nightjar-cinematic-salon/` |

## Supplemental files moved into dossiers

| Former file | Canonical destination | Hash record |
|---|---|---|
| `a1-gallery/craft-2025/desktop.avif` | `dossiers/a1-craft-collage-field/screenshots/gallery-preview.avif` | `dossiers/a1-craft-collage-field/rights/gallery-preview-provenance.md` |
| `a1-gallery/ethan-suero/desktop.avif` | `dossiers/a1-ethan-cinematic-3d/screenshots/gallery-preview.avif` | `dossiers/a1-ethan-cinematic-3d/rights/gallery-preview-provenance.md` |
| `a1-gallery/mckp/desktop.webp` | `dossiers/a1-mckp-object-stage/screenshots/gallery-preview.webp` | `dossiers/a1-mckp-object-stage/rights/gallery-preview-provenance.md` |
| `a1-gallery/scs/desktop.webp` | `dossiers/a1-scs-kinetic-command/screenshots/gallery-preview.webp` | `dossiers/a1-scs-kinetic-command/rights/gallery-preview-provenance.md` |
| `a1-gallery/the-uncommon-founder/desktop.avif` | `dossiers/a1-uncommon-founder-atlas/screenshots/gallery-preview.avif` | `dossiers/a1-uncommon-founder-atlas/rights/gallery-preview-provenance.md` |
| `creative-probe-kokoro/reference/kokoro-template-for-framer.webp` | `dossiers/kokoro-spatial-editorial/screenshots/superseded-gallery-desktop.webp` | `dossiers/kokoro-spatial-editorial/rights/migration-provenance.md` |
| `neighborhood-table/assets/bread-detail.webp` | `dossiers/neighborhood-table-collage/assets/bread-detail.webp` | `dossiers/neighborhood-table-collage/rights/migration-provenance.md` |
| `neighborhood-table/assets/market-table.webp` | `dossiers/neighborhood-table-collage/assets/market-table.webp` | `dossiers/neighborhood-table-collage/rights/migration-provenance.md` |
| `neighborhood-table/assets/pastry-shelf.webp` | `dossiers/neighborhood-table-collage/assets/pastry-shelf.webp` | `dossiers/neighborhood-table-collage/rights/migration-provenance.md` |
| `neighborhood-table/assets/provenance.json` | `dossiers/neighborhood-table-collage/assets/provenance.json` | `dossiers/neighborhood-table-collage/rights/migration-provenance.md` |

The three generated architecture-canary fixtures are byte-identical to their
copies in `data/creative-assets/architecture-canary/`. That folder's
`PROVENANCE.md` records their limited test-only use and notes that the original
generation prompt and provider receipt are unavailable. The deterministic
renderer canary reads those canonical creative-asset paths; they are not part
of production reference selection.

| Former file | Canonical creative asset | SHA-256 |
|---|---|---|
| `creative-probe-kokoro/assets/hero-atrium.webp` | `data/creative-assets/architecture-canary/hero-atrium.webp` | `5bd31a2fac9e0184a39fc43b8a9eb02c909a6fa28739b7824a53c00beb57f85c` |
| `creative-probe-kokoro/assets/project-mosaic.webp` | `data/creative-assets/architecture-canary/project-mosaic.webp` | `8ab93d26b39e87e4d3d25cddeceaf6bab4b9f47b018ff9312c482104a600bbfb` |
| `creative-probe-kokoro/assets/ridge-house.webp` | `data/creative-assets/architecture-canary/ridge-house.webp` | `602f41b19097011715ab8715325fc713bd2d2ed094ef97da61faa04a392d933a` |

The legacy directory is absent from the working tree. Historical source paths
remain in provenance only so the stored hashes can be traced to the former
locations; runtime and registry code must not read from those locations.
