# LaunchLoom reference dossiers

This directory stores canonical production and archive-only reference dossiers.
`core-collection.json` is the source of truth for the curated local
SEO set: exactly 96 unique references across 16 business niches, six per
niche. The production selector samples three structurally independent routes
from the matching niche with seeded recent-exposure balancing. It fails closed
rather than filling with unrelated businesses. Production compilation keys
selection from the generated specific
`businessKind` ahead of broad intake buckets such as wellness or professional
services.

Preview the 96 opening compositions in
[`core-collection-hero-contact-sheet.png`](core-collection-hero-contact-sheet.png).
It is a thumbnail index only; each dossier's full-page desktop/mobile captures
and `design-prompt.md` are the authoritative references.

## Current inventory

Every dossier has:

- `manifest.json`: provenance, rights, full-page capture metadata, complete
  Reference DNA, supported business kinds, and curation status.
- `design-prompt.md`: an implementation brief describing the visual mechanics
  and how to translate them without copying source branding, copy, or assets.
- `screenshots/desktop.png` and `screenshots/mobile.png`: full-page captures
  at the viewport widths recorded in that dossier's manifest (desktop and
  compact mobile).

The original ten niche pools contain 46 direct business-site captures and 14
licensed sector-specific template demos. Those demos are useful visual
references, but they are not real operating businesses and their example
claims, prices, reviews, and locations must never be treated as client facts.
The licensed-demo slots are: home services (2), dental (1), home care (1),
fitness (3), restaurants (1), architecture (1), law (2), beauty (2), and
accounting (1). Hotels have six direct site captures. The auto-repair, HVAC,
roofing, and painting pools each contain six direct business-site captures;
those four pools do not use licensed templates.

The 96 core IDs are enumerated in `core-collection.json`. The core includes
home services, dental, home care, fitness, restaurants, lodging,
architecture/interior design, law firms, beauty/grooming, accounting, auto
repair, HVAC, roofing, painting, real estate/property, and veterinary/pet care.
The new real-estate and veterinary pools each contain six permission-cleared
direct-business captures with paired full-page desktop/mobile evidence and
their own source-specific design prompts. The licensed Spicer roofing template
remains in the dossier library but is not counted as one of the six real
roofing businesses or selected for that niche. The archive index contains 35
complete non-core dossiers: 33 cross-industry, legacy, and A1/Kokoro studies,
plus two permission-cleared dental alternatives retained outside the fixed
six-reference dental pool. They have full-page captures and prompts, but remain
archive-only and cannot enter production selection. Screenshot-only fragments
must be completed as a dossier or explicitly catalogued as incomplete; they are
not valid model references.

Each archive-index entry explicitly records `productionEligible: false`, its
`coreNicheFit`, `sourceKind`, `rightsBasis`, and an `exclusion` with reason codes,
a short explanation, and the manifest fields supporting that explanation.
`coreNicheFit` describes subject overlap only; it does not grant selection.
The reason codes describe recorded curation or subject facts, not inferred
quality rankings. Grlica Law and Khufu's are retained as archive-only studies
because their own reviews record visual or mobile-reference quality holds; the
index does not infer defects for other archived dossiers.
`requester-attestation` identifies
the requester's stated clearance for internal screenshot and prompt use; its
`sourceOwnerGrantAttached: false` and `independentlyVerified: false` are explicit.
`local-license` points to a retained license; `registry-recorded-owned` points
to the historical owned-study provenance record, not an asset-by-asset audit.

## Coverage boundaries

The 16 core niches above are the only production reference pools in this
collection. Descriptive or adjacent tags such as garage door, plumbing,
landscaping, electrician, family dentistry, bistro, grooming, and tax adviser
are aliases or service specialties, not independent pools; they may route to a
core niche only when the business itself fits that niche. Broad onboarding
categories such as wellness and professional services are intake buckets, not
reference families. A skin-aesthetics intake left at the broad wellness kind
has no production reference pool and fails closed.

These distinct subjects have archive examples but no complete, production-
supported reference pool: event/wedding venues, medical clinics, bicycle
workshops, auto dealerships, jewelry, independent retail, and industrial
contractors. The event invitation, medical clinic, dealership, and industrial
contractor examples are licensed templates, not verified real-business sites.
The bicycle workshop, jewelry, and independent retail examples include direct
site captures. None of these subjects has six selected, verified business
references. Architecture, fitness, auto repair, roofing, and plumbing also
have archive entries, but these are adjacent to or within existing core niches;
their archive status does not create a new production pool.

Real estate/property and veterinary/pet care now each have six curated
production reference dossiers. Generic "other" remains intentionally
uncovered, rather than being filled with visually unrelated references. Keep
that broad kind fail-closed until a specific business niche receives its own
six verified, permission-cleared references and passes the dossier checks.

Licensed references retain the applicable license and asset credits. Direct
site references retain a requester attestation for screenshot retention,
derived prompts, and model-reference use. For those attestations, no
source-owner grant was uploaded; the repository records the requester’s claim
and does not represent it as independently verified. Reference screenshots
are internal visual evidence, never client imagery or copy.

## Retention rule

Only owned, licensed, or explicitly permission-cleared references may be
materialized here. A1 Gallery, Lapa Ninja, MotionSites, Norrly, Godly, and
Awwwards remain discovery/research sources unless rights for the exact
screenshots and prompts allow persistent storage. The six A1/Kokoro archive
dossiers carry requester-attested clearance for internal retention and model
reference; no source-owner grant was attached or independently verified. These
captures stay archive-only. Do not copy gallery assets, source code, or source
prompts into the production core. Prompts extract
transferable layout and interaction mechanics; client sites use their own
verified facts and assets.

For licensed or permission-cleared references, include a local rights record
and point to it with `source.rightsEvidencePath`. Keep evidence categories
separate: `source.assetEvidencePaths` is only for licenses/credits covering
retained source assets, while `source.provenanceEvidencePaths` records
supporting capture or business-verification files. A screenshot-only reference
does not need a fake asset-license entry; its permission record and screenshot
hashes are validated directly. The loader refuses a dossier with only a
descriptive rights claim and includes both rights and declared provenance in
the dossier digest.

## Consolidated legacy evidence

`data/inspiration-evidence/` was a parallel, uncurated tree and is no longer
retained. Its 32 tracked files were either verified byte-for-byte duplicates
of canonical dossier evidence or were moved into canonical dossiers with a
local provenance record. The source-to-destination map and retained hashes are
in [`MIGRATION-2026-09-26.md`](MIGRATION-2026-09-26.md). References to old paths
inside provenance records are historical lineage only; active registry,
selection, screenshot, and asset paths must point inside this library.

## Add a dossier

1. Confirm the exact screenshot and prompt rights before storing them.
2. Capture the entire desktop page and entire mobile page. Keep capture
   viewport dimensions in `manifest.json` and use the matching local files.
3. Write a `design-prompt.md` with visual hierarchy, page sequence, interaction,
  responsive translation, signature elements, prohibited patterns, and
  local-SEO/conversion constraints.
4. Add complete Reference DNA, provenance, rights evidence, business kinds, and
   the dossier path to `data/inspiration-registry.json`. Run
   `npm run sync:reference-library -- --write` to register core dossiers and
   bind business/capture evidence paths. Add a source to the 96-entry
   collection only if it genuinely matches a niche; do not fill gaps with
   unrelated business types.
5. Run the tests and compile a production-style pack:

   ```sh
   npm test
   npm run compile:inspiration -- --config templates/client-site/src/site.config.json --out /tmp/inspiration-pack.json
   ```

   The compiler fails closed when a registered dossier is incomplete or its
   evidence differs from the registry source. Production selection also fails
   closed when fewer than three matching references are available.

`scripts/materialize-owned-reference-dossiers.mjs` is a migration helper for
those historical internal studies. It defaults to dry-run and never overwrites
existing dossier folders. New production references must be added separately,
with source license or explicit permission evidence recorded in the manifest
and its local rights folder. A requester attestation must be labeled as such;
do not imply it is an independently verified owner grant.

`scripts/materialize-a1-archive-dossiers.mjs` validates or refreshes the six
archive-only A1/Kokoro dossiers from saved full-page captures. It defaults to a
non-writing validation pass and only updates files with `--write`:

```sh
node scripts/materialize-a1-archive-dossiers.mjs
node scripts/materialize-a1-archive-dossiers.mjs --write
```

`scripts/capture-reference-screenshots.mjs` creates paired 1440px desktop and
390px mobile captures and records the viewport, scroll root, final URL,
broken-image, and page-error diagnostics.
