# Gold Reference Library

The Gold Reference Library is the curated visual-evidence layer for LaunchLoom's authored creative pipeline. It stays separate from the production inspiration registry while references are still being researched, captured, analyzed, translated, and reviewed.

## Purpose

The current creative pipeline already has strong enforcement: screenshot-derived Reference DNA, direct reference images in Luna's authoring context, rendered screenshot judging, repair loops, client art-direction checks, and diversity gates. The remaining quality ceiling is often the evidence itself. A single desktop screenshot and a short prose description leave too much ambiguity about responsive behavior, asset requirements, interaction, crop logic, and section rhythm.

Gold references turn a design into a reviewed evidence pack instead of a loose moodboard entry.

## Lifecycle

A record moves through these states:

1. `candidate` - an external design worth researching. Never production-selectable.
2. `captured` - desktop, compact desktop, mobile, full-page, crop, and geometry evidence exist.
3. `analyzed` - measured Reference DNA has been derived from the evidence.
4. `reviewed` - design mechanics, mobile interpretation, rights metadata, and asset recipe have been checked.
5. `approved` - an owned LaunchLoom translation exists and has passed external-to-owned validation.
6. `rejected` - unsuitable, redundant, infeasible, legally unclear, or not strong enough for the Gold set.

`approved` alone is not sufficient. The admission code also requires all review flags, the owned translation ID, desktop/compact/mobile evidence, and a Reference DNA file to exist before a record can enter production selection.

## Evidence contract

Every Gold reference should ultimately contain:

```text
data/inspiration-evidence/gold/<reference-id>/
  desktop-viewport.png
  desktop-full.png
  compact-viewport.png
  compact-full.png
  mobile-viewport.png
  mobile-full.png
  crops/
    desktop/
    compact/
    mobile/
  evidence.json
  reference-dna.json
```

Viewport captures are the geometry authority. Full-page captures are for section order and rhythm, not CSS viewport-height inference.

### Capture command

Capture only a live source page that we are permitted to inspect for internal reference use. Do not treat third-party screenshots as owned assets or republish them as LaunchLoom creative work.

```bash
npm run capture:gold-reference -- \
  --id gold-skylift-local-trades \
  --acknowledge-reference-only true
```

The capture runner records 1536x864, 1366x768, and 390x844 evidence, full-page screenshots, semantic section crops where possible, and basic browser measurements.

## Asset recipes

Each candidate has an implementation-oriented asset recipe before it can become Gold. A recipe declares:

- minimum and preferred asset counts;
- asset types such as editorial photography, product cutouts, macro details, textures, or object renders;
- intended placement and composition;
- mobile crop and recomposition behavior;
- a cohesion rule so generated assets look like one art-directed set instead of unrelated stock images.

The metadata is also used for feasibility. A high-asset collage or 3D family should be penalized when an intake has weak imagery until contextual asset generation can supply the required ingredients.

## Compatibility metadata

Gold candidates describe more than industry. Selection can consider:

- business kind;
- conversion mode;
- content density;
- locality model;
- asset availability;
- asset demand;
- motion dependency.

This is additive. Explicit client reference intent still wins, and current registry records preserve their existing behavior when they have no compatibility metadata.

## Owned translation rule

External references provide novelty. They are not reusable client templates. Before admission, LaunchLoom creates an owned implementation that translates the mechanics without copying source branding, copy, imagery, proprietary fonts, code, or trade dress.

The owned translation should demonstrate:

- equivalent high-level hero geometry and visual hierarchy;
- equivalent service or content treatment;
- a reviewed mobile recomposition;
- an achievable asset recipe;
- an independent visual identity and client-safe implementation.

The external source and owned translation are then compared through the same screenshot-driven fidelity tooling used by the creative pipeline. The goal is recognizable mechanics, not pixel cloning.

## Frozen benchmark

`data/gold-reference-benchmark.json` contains 20 synthetic, stable business cases. Keep their inputs stable so library experiments can be compared against the same control group.

Run the zero-API coverage benchmark with:

```bash
npm run benchmark:gold-references -- \
  --out .launchloom/gold-reference-benchmark.json
```

It compares today's merged inspiration registry against the candidate Gold pool on selection coverage, direct-industry fit, family breadth, and asset-feasibility warnings. This is only the cheap first stage.

Before a Gold candidate is approved, run the full creative pipeline on the frozen benchmark subset relevant to that family and record rendered Reference DNA scores, repair count, cost, diversity, and human review. The zero-API benchmark must never be presented as proof of visual fidelity.

## Initial research tranche

The first tranche contains 20 reference-only candidates across home and trades, property, health, legal and professional services, food and hospitality, sport and fitness, transport and automotive, and beauty and wellness.

All 20 begin as `candidate`, so the foundation can merge without changing production design selection.

## Admission checklist

A candidate becomes production-selectable only when all are true:

- desktop capture reviewed;
- compact desktop capture reviewed;
- mobile capture reviewed;
- measured Reference DNA reviewed;
- asset recipe reviewed;
- owned LaunchLoom translation recorded;
- external-to-owned rendered validation passed;
- no unresolved rights or provenance concern;
- the family materially expands the library instead of adding a palette-only duplicate.
