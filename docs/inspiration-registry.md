# Inspiration registry

The inspiration registry is LaunchLoom's cached, reference-only design research library. It converts curated external and owned references into three structurally independent creative routes for each intake.

## A1 Gallery evidence

`data/a1-reference-library.json` is a supplemental, reference-only cache built from
the A1 Gallery MCP. It stores local desktop screenshot evidence, source URLs,
visual mechanics, safe typography hints, and measured token calibration. The
screenshots are prompt and verification evidence only. They are never emitted as
client assets, and their source copy, branding, imagery, and trade dress must not
be reproduced.

The compiler merges this cache automatically when it exists:

```sh
npm run compile:inspiration -- \
  --config src/site.config.json \
  --a1-library data/a1-reference-library.json \
  --out .launchloom/inspiration-pack.json
```

Each A1 route remains a single authoritative capsule. A route receives its
source screenshot, family mechanics, and any measured token evidence; it is not
averaged with another A1 site. If a cached screenshot is missing, compilation
fails closed rather than falling back to a prose-only reference.

## Interface

Call `buildInspirationPack(request, registry)`. The returned pack is deterministic for the same seed, registry, style context, and recent-launch history.

The module owns normalization, rights validation, relevance scoring, deterministic tie-breaking, structural separation, recency-aware ranking, bounded fallback, and evidence shaping. Callers never receive source assets or download locations. Recent exact trios are excluded only when another valid trio exists. Recent reference exposure, family reuse, and route-signature reuse are soft ranking signals; they do not silently remove references from the candidate pool. `freshnessFallback` reports reference-ID overlap only (`fresh`, `history-balanced`, or `history-relaxed`), while `selectionHistory.selectedPatternExposure` reports family/signature overlap.

The selector requires every route pair to differ by at least 65 points on the 0-100 Reference DNA structural-distance measure and to have distinct normalized values for all four structural fields: navigation, hero geometry, service presentation, and typography. References cannot be reused. Route-family labels are not a hard gate because curated DNA can show meaningful differences within one broad family. When at least two hero topologies are available, every selected trio must include at least two of them. If the niche cannot supply three routes meeting these structural requirements, compilation stops with an explicit error. Rendered screenshot diversity remains a separate and stricter promotion gate.

Among structurally eligible trios, the selector starts with an eight-point style-fit band and widens it as needed to retain a seeded choice set of at least nine trios (or every available trio when fewer exist), coverage of every reference in the business-specific pool, and balanced reference share. It enables three-family selection only if at least nine fully family-distinct choices still cover the pool without letting any reference exceed the configured share. From that fit set, it avoids a recent exact trio when possible, then minimizes total reference exposure, overlap with the latest trio, and family/signature reuse before applying a stable seeded pick. This keeps style relevant without collapsing every generation onto one “best” reference. The same seed and input history always produce the same routes.

## Cached ingestion

`data/inspiration-registry.json` is the production cache. A1 Gallery, Lapa Ninja, MotionSites, and other sources are researched outside the customer-generation critical path. Only structured observations, source attribution, rights status, and approved local evidence paths enter the cache.

External imagery, branding, copy, source code, and trade dress must not be copied into generated sites. `reference-only` records can inform composition and art direction only. `owned` or separately licensed site assets still require the normal LaunchLoom asset pipeline.

## Selection evidence

Run:

```sh
npm run compile:inspiration -- --config src/site.config.json --out .launchloom/inspiration-pack.json
```

Initial-generation workflows also preserve the resulting pack as an artifact and copy it into the private client repository.

## Authored candidates and preview

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

The model may author composition and motion, but visitor-facing business content remains in `content-manifest.json`. Generated JSX can reference only its immutable `content.*` tokens. The compiler rejects remote URLs, arbitrary network access, unsafe code, unapproved imports, hardcoded marketing copy, missing navigation or conversion markers, and motion without a reduced-motion path. Reference signatures and art direction must be visibly realized in the rendered design; marker-only compliance is insufficient.

The current intake workflow renders authored candidates in the production Astro shell, captures desktop and mobile viewports, runs the rendered reference and visual-quality gates, and allows up to three applied author-owned repair cycles per candidate. Rejected responses have a separately bounded retry budget; regressions restore the best measured candidate state and require rerendering. A passing authored candidate is selected for the review preview. If none passes, the intake fails closed; the workflow does not substitute the legacy experience renderer. Production promotion has additional strict diversity and release checks. See [`creative-compiler.md`](./creative-compiler.md) for the full stage-by-stage contract.

`data/recent-launch-signatures.json` records generated previews: the selected pack and variant, the layout fingerprint, the stage, and the reference IDs and route signatures that informed the design. `generate-client.yml` writes an entry after a successful preview deployment, and the inspiration compiler uses launch history as a soft exposure-balancing signal when selecting future references. The same seed and history reproduce the same selection; new seeds and accumulated history rotate among valid trios without weakening structural or rendered promotion gates.

The production core keeps six eligible, business-matched references per supported niche. Selection fails closed below that floor rather than filling a niche with unrelated designs. History is stored as version 2 with a global diagnostic window and independent bounded windows per canonical business kind; version 1 history is migrated on read. The intake config selector, inspiration compiler, and both bakeoffs consume only the matching niche's recent records, so activity in one business category cannot evict or suppress another category's rotation.
