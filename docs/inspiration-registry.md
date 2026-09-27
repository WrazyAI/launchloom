# Inspiration registry

The inspiration registry is the route-selection index. Production candidates resolve to complete dossier folders in `data/reference-library/dossiers`; each chosen route receives one authoritative screenshot-backed design capsule. The curated Local SEO Core contains exactly 84 unique references across 14 niches, six per niche, defined in `data/reference-library/core-collection.json`. Every generation samples three structurally independent references from the matching six-reference niche.

## Permission-cleared dossier library

Every core reference has its own directory with a structured manifest, a
detailed implementation prompt, and full-page desktop and mobile captures:

```text
data/reference-library/dossiers/<reference-id>/
  manifest.json
  design-prompt.md
  screenshots/
    desktop.png
    mobile.png
```

The manifest binds reference and renderer-family identities, provenance and
rights evidence, both capture viewports, full Reference DNA, business-kind fit,
and curation status. The prompt describes transferable composition,
typography, section rhythm, responsive translation, signature mechanics,
prohibited patterns, and local-business conversion/SEO constraints. It is not
source-site copy.

The active core niches are home services/trades, dental, home care, fitness,
restaurants, lodging, architecture/interior design, law, beauty/grooming,
accounting, auto repair, HVAC, roofing, and painting. The test suite verifies
six unique dossiers per niche, unique first-party source URLs, and seeded
variety across every niche. The selector uses only business-compatible
production dossiers and fails closed when it cannot supply three independent
matches; it does not fill with unrelated industries. The licensed Spicer
roofing template remains catalogued in its dossier but is deliberately not
counted as one of the six real roofing business websites.
An empty or generic business kind such as `all`, `general`, or `small-business`
also fails closed instead of mixing references from multiple niches.

Historical LaunchLoom studies, rejected captures, and discovery-only records
remain outside the production core and are never fallback candidates. The
runtime selector restricts production to IDs listed in `core-collection.json`.
An out-of-core record cannot influence the production choice even if it remains
in the broader registry for traceability.

Rights evidence is explicit. The CC BY/MIT dossiers include source licenses
and image credits. Direct-site dossiers record the requester’s attestation for
retaining captures and using them as model visual references. No source-owner
grant was uploaded for those direct sites; this limitation is recorded rather
than presented as independently verified permission. A1 Gallery, Lapa Ninja,
MotionSites, Norrly, Godly, Awwwards, and other galleries remain discovery
sources unless the exact screenshot/prompt rights permit persistent storage.

`scripts/materialize-owned-reference-dossiers.mjs` is the one-time seed helper
for the existing owned screenshots. It runs as a dry-run by default and refuses
to overwrite an existing folder:

```sh
node scripts/materialize-owned-reference-dossiers.mjs
node scripts/materialize-owned-reference-dossiers.mjs --write
```

The loader rejects missing prompts, non-full-page captures, missing desktop or
mobile evidence, uncleared rights, out-of-folder paths, mismatched viewport
metadata, and a dossier image that differs from the registry's source capture.
The production compiler requires three independent valid matching dossiers; it
cannot quietly substitute prose-only, backup, or reference-only records.
Licensed and permission-cleared records also require a local clearance artifact
in the dossier. The dossier digest binds both screenshot bytes and that proof.

## A1 Gallery evidence

`data/a1-reference-library.json` remains a supplemental discovery cache built
from the A1 Gallery MCP. Six curated A1/Kokoro captures also have complete,
archive-only dossiers in `data/reference-library/dossiers` and are listed in
`data/reference-library/archive-index.json`. Each includes full-page desktop and
mobile evidence, a detailed mechanics prompt, and a requester-attestation file.
They are excluded from the 84-reference Local SEO production core because they
are cross-industry design studies, not verified niche business references.
Their screenshots are internal visual evidence only, never client assets.

The production workflow does not load this cache by default. It can be read
explicitly for local discovery/testing, but route selection remains restricted
to dossier-backed, rights-cleared records:

```sh
npm run compile:inspiration -- \
  --config templates/client-site/src/site.config.json \
  --a1-library data/a1-reference-library.json \
  --out .launchloom/inspiration-pack.json
```

The six archive dossiers record the requester's 2026-09-26 attestation that
these exact captures may be retained internally and sent to the pipeline model.
No independent source-owner grant was attached or verified. This limitation is
written into each dossier and the captures remain outside production selection.
Use `scripts/materialize-a1-archive-dossiers.mjs` to validate or refresh those
six dossiers from their recorded captures; it validates the staged screenshots,
rights note, structured DNA, and prompt before writing.

## Interface

Call `buildInspirationPack(request, registry)` for selection tests. The
production compiler calls `buildInspirationPack(request, registry, {
repositoryRoot, requireDossiers: true })`. Its pack is deterministic for the
same seed, eligible dossier library, style context, and recent-launch history.
The selector evaluates structurally independent trios, avoids the last twelve
exact trios when alternatives exist, minimizes per-reference exposure over the
latest 30 launches for that niche, then rotates deterministically among equally
exposed trios. Style terms order those trios without narrowing the eligible set.
Among the lowest-exposure trios, renderer-family variety gets a bounded extra
turn in the deterministic rotation. Pools of 13 to 20 trios use a 24-slot ring
whose repeated trios are twelve slots apart; smaller pools give one varied trio
an extra slot. The previous twelve exact trios stay excluded while alternatives
exist, preserving consecutive-launch freshness even as exposure changes. All
structurally independent combinations remain eligible, including same-family
trios; family variety never overrides lower per-reference exposure.
`selectionReceipt` records the eligible pool, selected IDs, combination count,
exposure score, history fallback mode, selected renderer family IDs and count,
whether a multi-family trio is feasible, and the maximum feasible renderer
family count. Renderer families use the same `familyForRoute` resolution as the
compiled routes, not dossier `referenceFamilyId` labels.
The CLI passes `site.config.businessKind` when present, ahead of the broader
display `industry`. Site-config generation derives specific kinds from the
submitted business facts (for example, dental vs. wellness or restaurant vs.
hotel) so broad intake categories do not mix unrelated visual journeys.

The module owns normalization, rights validation, dossier loading, screenshot
identity checks, relevance scoring, deterministic tie-breaking, structural
separation, soft recent-exposure balancing, bounded exact-trio freshness, and
evidence shaping. Callers never receive download locations. Recently used route
trios are avoided while feasible, but individual references are never
hard-banned: exposure only lowers their score so every design can recur and all
six remain reachable even under repeated traffic. Style relevance orders
equally exposed choices; renderer-family variety is a bounded frequency
preference and never an eligibility rule.

Each route must differ in navigation, hero geometry, service presentation, and
typography category. References cannot be reused across routes within a pack;
broad family labels may repeat if the actual structural mechanics differ. If
the full registry cannot supply three independent routes, compilation stops
with an explicit error.

## Screenshot and family identity

For a production route, the dossier's paired screenshots are the visual source
of truth and the selected Markdown design prompt is passed to both Reference
DNA analysis and every creative authoring stage. `referenceFamilyId`
selects the matching Reference DNA profile; the compiled `familyId` remains the
creative renderer family. Keep those identities separate when a screenshot is
an owned design-family demo. The analyzer receives the screenshot and may
correct descriptive hints from its pixels, but it must not inherit another
family's geometry merely because that family has a familiar label.

Owned design-family screenshots are captured from the exact `design.variantId`
listed in `scripts/build-design-family-demos.mjs`. Their registry names and
mechanics must describe the rendered page, not a hoped-for future reference.
When an entry is renamed, its former ID stays in `aliases` so recent-launch
history still excludes that visual family. Unsupported mappings belong in
`retiredRecords`, not in the active selection pool. Add a production route only
after its owned or permission-cleared full-page desktop and mobile captures,
detailed prompt, and complete contract are present and validated in its dossier.
Both screenshots are mandatory for this curated library.

The A1 cache uses each A1 record's `familyId` as its reference-family identity.
Every such ID must have a matching Reference DNA profile so an A1 screenshot
cannot silently inherit the unrelated Kokoro defaults.

## Cached ingestion

`data/inspiration-registry.json` is the route-selection index. Dossiers are the
production reference source. A1 Gallery, Lapa Ninja, MotionSites, Norrly, Godly,
Awwwards, and other sources can be researched outside the customer-generation
critical path; proprietary screenshots and prompts enter persistent storage
only when the exact material is permission-cleared. Structured observations
without retained source assets can be used to create original owned studies.

External imagery, branding, copy, source code, and trade dress must not be copied into generated sites. `reference-only` records can inform composition and art direction only. `owned` or separately licensed site assets still require the normal LaunchLoom asset pipeline.

## Selection evidence

Run:

```sh
npm run compile:inspiration -- --config templates/client-site/src/site.config.json --out .launchloom/inspiration-pack.json
```

Initial-generation workflows also preserve the resulting pack as an artifact and copy it into the private client repository.

## Phase 2 shadow authorship

The generation workflow now passes the three routes to the production authorship compiler. Each route independently produces:

```text
.launchloom/generated-experiences/
  content-manifest.json
  creative-run.json
  candidate-a/
    contract.json
    Experience.jsx
    styles.css
    motion.js
    metadata.json
  candidate-b/
  candidate-c/
```

Run it directly with:

```sh
npm run author:experiences -- \
  --config src/site.config.json \
  --inspiration .launchloom/inspiration-pack.json \
  --out .launchloom/generated-experiences
```

The model may author composition and motion, but visitor-facing business content remains in `content-manifest.json`. Generated JSX can reference only its immutable `content.*` tokens. The compiler rejects remote URLs, arbitrary network access, unsafe code, unapproved imports, hardcoded marketing copy, missing navigation or conversion markers, and motion without a reduced-motion path.

Phase 2 runs in shadow mode: candidate source and usage evidence are retained, while the existing reviewed Astro experience remains the deployed preview. Rendering, screenshot gates, repair, and creative winner promotion belong to Phase 3.

`data/recent-launch-signatures.json` records generated previews: the selected pack and variant, the layout fingerprint, the stage, and the reference IDs and route signatures that informed the design. Launch history is bounded to 30 entries per business kind (and 500 total); generation attempts receive unique seeds while intake IDs remain available for stable business context. The selector avoids the previous twelve exact reference trios where alternatives exist; route-signature recency remains five launches. Per-reference exposure balances repeated usage, while every individual reference remains eligible. Model-authored winner promotion still belongs to Phase 3.
