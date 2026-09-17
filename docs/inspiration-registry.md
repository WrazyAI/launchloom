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

Initial-generation workflows also preserve the resulting pack as an artifact and copy it into the private client repository. Phase 1 does not change the production renderer. Later phases will use these routes as independent model-authoring briefs.

`data/recent-launch-signatures.json` defines the file-adapter schema for recently used reference IDs and route signatures. It is intentionally empty until the model-authored winner can be recorded truthfully in the later production phase.
