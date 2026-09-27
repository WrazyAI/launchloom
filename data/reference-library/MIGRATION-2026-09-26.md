# Legacy evidence consolidation (2026-09-26)

The former `data/inspiration-evidence/` tree was removed after each file was
verified and either matched to its canonical dossier byte-for-byte or copied
into that dossier with a retained hash record. No file was removed before its
canonical destination and active pointers were checked.

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

The legacy directory is absent from the working tree. Historical source paths
remain in provenance only so the stored hashes can be traced to the former
locations; runtime and registry code must not read from those locations.
