# Inspiration registry

The inspiration registry is LaunchLoom's cached, reference-only design research library. It converts curated external and owned references into three structurally independent creative routes for each intake.

## Interface

Call `buildInspirationPack(request, registry)`. The returned pack is deterministic for the same seed, registry, style context, and recent-launch history.

The module owns normalization, rights validation, relevance scoring, deterministic tie-breaking, structural separation, recent-history exclusion, and evidence shaping. Callers never receive source assets or download locations.

Each route must differ in navigation, hero geometry, service presentation, and typography category. References cannot be reused across routes. If the registry cannot supply three independent routes, compilation stops with an explicit error.

## Cached ingestion

`data/inspiration-registry.json` is the production cache. A1 Gallery, Lapa Ninja, MotionSites, and other sources are researched outside the customer-generation critical path. Only structured observations, source attribution, rights status, and approved local evidence paths enter the cache.

External imagery, branding, copy, source code, and trade dress must not be copied into generated sites. `reference-only` records can inform composition and art direction only. `owned` or separately licensed site assets still require the normal LaunchLoom asset pipeline.

## Selection evidence

Run:

```sh
npm run compile:inspiration -- --config src/site.config.json --out .launchloom/inspiration-pack.json
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

`data/recent-launch-signatures.json` records approved launches: the selected pack and variant, the layout fingerprint, and the reference IDs and route signatures that informed the design. `publish-site.yml` writes an entry after a successful production deploy, and both the inspiration compiler and the experience bakeoff read it to exclude recently used references and layouts. Model-authored winner promotion still belongs to Phase 3.
