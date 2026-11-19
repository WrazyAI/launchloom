# Dossier coverage and repeated-design audit

Audit snapshot: `15098b7b`, 2026-11-19 UTC. Work OS task `7385794e-0c0d-4511-acda-6a91a3b53aee`. No generation, publication, or renderer changes were made.

## What the recent runs actually exercised

| Run | Intake | Requested and selected | Evidence |
| --- | --- | --- | --- |
| [44395999236](https://github.com/WrazyAI/launchloom/actions/runs/44395999236) | 297, home care | Pack, `bold-utility` | Private config `f50a634`; preview ready, no reference reservation, analysis, or authoring |
| [44389590644](https://github.com/WrazyAI/launchloom/actions/runs/44389590644) | 307, home care | Pack, `bold-utility` | Private config `f9b244e`; preview ready, no reference reservation, analysis, or authoring |
| [44371743491](https://github.com/WrazyAI/launchloom/actions/runs/44371743491) | 146, painting | Pack, `bold-utility` | Private config `7696ed4`; preview ready, no reference reservation, analysis, or authoring |
| [44367943805](https://github.com/WrazyAI/launchloom/actions/runs/44367943805), [44367479095](https://github.com/WrazyAI/launchloom/actions/runs/44367479095) | 307 and 297, home care | Pack, `stage-index` | Explicit fixed-pack selection on both runs. The approved and later published 307 revision `b74c7d26` also used `stage-index`. |
| [44120901199](https://github.com/WrazyAI/launchloom/actions/runs/44120901199) | 297, home care | Creative requested, `kinetic-poster` selected | False `creative-reference-shortage`; no creative authoring; workflow failed, not a delivery |
| [44159137692](https://github.com/WrazyAI/launchloom/actions/runs/44159137692) | 146, painting | Creative requested, `bold-utility` fallback attempted | Three painting dossiers, analysis and candidate authoring succeeded; creative failed the render/repair step, then the fallback failed verification. |

The base compiler can save dossier selections even on a pack run, and the imagery step receives the inspiration file. That does not make the site composition dossier-authored. For example, #307's `76c82f6` contains Story, HP Homecare, and Ivy Homecare references, while the preview config at `f9b244e` explicitly selects `bold-utility`. `stage-index` is not a legacy generic pack: it is the promoted, credited HTML5 UP Dimension derivative. It is still a single fixed composition, not rotation through the home-care library.

### Verified defects

1. **Preflight uses the wrong field.** `compile-inspiration-pack.mjs:134–164` prefers `businessKind` and can refine it from the service focus. `.github/workflows/generate-client.yml:594–617` then independently probes `.industry` and can override that result. Run 44120901199's saved inputs at `c386150` show `industry=wellness`, `businessKind=home-care`, and three selected dossiers: Kingsway Care, Angels on Call, and Kome Care. The renderer warning says `wellness` was short, then the run selects `kinetic-poster` without calling the author. A local replay of `probeCreativeReferences` and `resolve-effective-renderer.mjs` with that run's config reproduced `wellness → 0 matches → pack / creative-reference-shortage`. Changing only the probed field reproduced `home-care → 3 selected routes → creative`. This verifies the routing defect, not that a new creative candidate would pass its later gates.
2. **Audit says reservation completed when it was skipped.** `generate-client.yml:623–690` gates reservation on the effective creative renderer, but unconditionally records `inspiration_selection=completed` with “Production reference routes reserved.” All three explicit pack deliveries above have `Reserve inspiration routes=skipped` and that same completion message. This does not distinguish proposed inputs from designs actually used.
3. **The independent probe is also late for a real shortage.** `generate-client.yml:538–543` runs the strict compiler before preflight. The real compiler on `{ "businessKind": "coffee-roaster", "industry": "coffee-roaster" }` exited 1 with two eligible dossiers; the standalone probe classifies that same input `reference-shortage`. The workflow cannot reach its advertised fallback for that early compiler error. This is a local control-flow repro, not the cause of the latest home-care deliveries.

The normal creative workflow currently compiles three reference routes but invokes `--candidate-count 1` with `--require-diversity false` in the repair loop. That is a latency trade-off, not assurance of three design alternatives. `npm run report:generation-success` at audit start and finish showed 4/61 creative-requested, 18/38 pack-requested, 22/100 overall. The report groups by requested renderer in the title and workflow conclusion; it is neither an effective-renderer report nor a representative delivery or diversity measure.

## Business cases

The [core manifest](../../data/reference-library/core-collection.json) lists all 98 reference IDs across 16 niches. A local probe against the current registry returned three usable routes for every core niche. The entry count is eight for home services and six each elsewhere.

| Core business case | Stable business kind | Example generation subject |
| --- | --- | --- |
| Home services and trades | `home-services` | Plumbing, electrical, landscaping, pest control |
| Dental practices | `dental` | General, family, cosmetic, or specialty practice |
| Home-care providers | `home-care` | Non-medical companionship, in-home support, respite |
| Gyms and fitness studios | `fitness` | Strength gym, class-led studio, personal training |
| Restaurants and cafes | `restaurant` | Neighborhood bistro, chef-led dining, café |
| Hotels and destination lodging | `hospitality` | Boutique hotel, destination inn |
| Architecture and interiors | `architecture` | Residential architect or interior design practice |
| Law firms | `legal-services` | Family law, business law, litigation |
| Beauty and grooming | `beauty` | Hair salon, barber, hair-art studio |
| Accountants and bookkeepers | `accounting` | Tax practice, bookkeeping firm, advisory accountant |
| Auto repair | `auto-repair` | Independent garage, diagnostics, maintenance |
| HVAC | `hvac` | Residential heating and cooling contractor |
| Roofing | `roofing` | Inspection, repair, replacement contractor |
| Painting | `painting` | Residential or commercial painter |
| Real estate and property | `real-estate` | Brokerage, property search, rental discovery, development, investment |
| Veterinary practices and animal hospitals | `veterinary` | General, emergency, mobile, feline, or end-of-life veterinary care |

The on-disk inventory is **150**: 98 core + 35 archive-only + 17 registered supplemental dossiers. The [library README](../../data/reference-library/README.md) describes the fixed core and archive, but the selector now has additional supplemental logic in `inspiration-registry.mjs:1069–1095`. The 17 supplemental entries have eligible manifests but are considered only for matching subjects if the core is short or a specific source is requested. They are not 17 additional niches:

- **HTML5 UP (5):** Editorial, Paradigm Shift, Prologue, Read Only, Tessellate.
- **Start Bootstrap (7):** Agency, Business Casual, Clean Blog, Creative, Grayscale, Landing Page, Small Business.
- **TemplateMo (3):** Finance Business, Medic Care, Training Studio.
- **Coffee (2):** Ember Roast and Marigold. On the literal business-kind probe, `cafe` works via the restaurant pool, `coffee-shop` has three matches, and `coffee-roaster` and `specialty-coffee` have two each. The latter three do not have independent production coverage.

The [archive index](../../data/reference-library/archive-index.json) names all 35 and their exclusion reasons. Archive-only subjects include product storytelling, creative portfolios and studios, interactive product showcases, founder-led editorial, event venues, general medical clinics, bicycle workshops, dealership sales, jewelry and independent retail, industrial contracting, and med-spa treatment menus. It also contains studies overlapping existing pools: architecture/hospitality design, personal training and gyms, care and wellness, salons, trades/plumbing/roofing, auto repair, dining, legal, and dental. None expands the production roster by itself. Nonclinical pet services, general graphic/digital design, and ambiguous intake buckets do not inherit coverage from adjacent core niches.

The [foundation index](../../data/reference-library/foundation-index.json) is a separate measure: only `startbootstrap-grayscale` and `web-painting-novak` are marked renderable by default, 146 need adaptation, and two are blocked. A dossier is design evidence, not a ready client template. The promoted and credited dossier-derived packs are `stage-index`, `editorial-ledger`, and `results-ledger`; their [rights policy](../reference-template-rights.md) still applies.

## Recommended next step, not implemented

1. Select once using the canonical business kind/focus and let renderer policy consume that same validated selection or typed shortage. Do not independently re-probe the broad taxonomy. Route only known shortages to fallback, not corrupt rights or other invalid evidence. Add a regression covering the captured home-care shape and a true shortage.
2. Record one design receipt from selection through delivery: input business kind, requested/effective renderer, dossier IDs and candidate actually used, fallback reason, and final rendered layout fingerprint. Record reservation as skipped for pack runs. Track private-preview delivery and dossier-led design coverage separately. Auditability should apply equally to both paths, not require a particular renderer.
3. Run a bounded private creative comparison after the fix: home care as the regression control, then a property brokerage, an emergency or mobile vet, and a boutique hotel or interiors studio. Choose different hero structures, page sequences, and mobile behavior, not just different palettes. Add two-candidate comparisons selectively if needed; do not make every full run a three-candidate bakeoff. Preserve copy, rights, contrast, form, and publication gates.

The prior fixed-pack batch is not a variation benchmark or a verified 20-real-intake cohort. The local cohort log resolves two dispatch IDs and has no active runner at audit time. Issue 307 is explicitly fictional in the 2026-11-19 progress record despite its plain intake title; do not infer cohort eligibility from titles. The direct unsigned live preview URLs returned HTTP 403 during this audit; renderer provenance above is from Actions records and immutable private config revisions, not a new visual walkthrough.
