# Visual finish audit: premium feel, empty pages, and repeated patterns

Research date: 2026-10-26

## Scope

Inspected the two most recent creative-only candidates that reached a
deployable preview, plus the current reference-selection and asset-review code:

- `llqa-185-creative-40000927110-1`: Case Study Coffee Roasters concept,
  selected `candidate-a` / `route-01` (Zuni Café, cinematic-stage).
- `llqa-179-creative-39806327237-1`: Kestrel & Rye Coffee Roasters demo,
  selected `candidate-b` / `route-02` (Tavola, archive-rail).
- `scripts/generate-contextual-assets.mjs`,
  `scripts/run-creative-bakeoff.mjs`, `scripts/run-pipeline-test.mjs`,
  `scripts/inspiration-registry.mjs`, and the dossier manifests.
- `llqa-134-creative-39672973338-1` stopped before screenshots and is not used
  as visual evidence.

## Finding 1: the image pipeline is rejecting most of the imagery

Both runs requested nine images. Almost all were rejected before they reached
the site:

| Run | Accepted | Rejected | Unavailable | Result |
| --- | --- | --- | --- | --- |
| Case Study café | 2 | 7 | 0 | Selected route had zero accepted images |
| Kestrel & Rye | 1 | 7 | 1 | Selected route had zero accepted images |

The dominant rejection reason is `visible_text`; `not_standalone_image` and a
generic `review_rejected` also appear. The review prompt currently rejects
"readable text, text-like marks" in one boolean
(`containsVisibleTextOrTextLikeMarks`) and approves only a single standalone
image. That is strict enough to reject ordinary editorial photography with
incidental signage, labels, or texture.

The accepted images were not on the routes the selector chose:

- Café: `route-02` had an approved hero, but the site selected `route-01`,
  which had none.
- Kestrel: `route-03` had an approved tertiary, but the site selected
  `route-02`, which had none.

This is why the rendered pages have empty image fields and why the Kestrel hero
is a large dark band with four circles and no photograph. The pages are not
empty because the copy model failed first; they are empty because the selected
composition expected imagery that was rejected or left unbound.

## Finding 2: candidate selection ignores image coverage

The bakeoff winner sort is:

1. explicit reference match,
2. rendered hero distinctiveness,
3. score,
4. intake fit,
5. candidate ID.

It never considers whether the candidate's route has an approved hero image.
When the bakeoff fails, the pipeline's fallback tries `candidate-a`,
`candidate-b`, `candidate-c` in order and takes the first source-safe
candidate, again ignoring visual score and image coverage. That is how the
café selected a zero-image route over a route with an approved hero, and how
Kestrel selected a zero-image route over one with an accepted tertiary.

## Finding 3: the per-niche corpus is narrower than the dossier count suggests

There are 131 dossier directories, but the core selection contract uses six
business-matched references per niche across 16 niches. The hero archetype
distribution is uneven:

| Niche | References | Dominant archetype |
| --- | --- | --- |
| Architecture and interiors | 6 | 5 image-overlay |
| Accountants and bookkeepers | 6 | 5 image-overlay |
| Gyms and fitness | 6 | 4 image-overlay |
| Hotels and lodging | 6 | 4 image-overlay |
| Restaurants and cafes | 6 | 4 image-overlay |
| Painting contractors | 6 | 4 split-form |
| Dental practices | 6 | 3 image-overlay |
| Auto repair shops | 6 | 3 text-led-editorial, lowest pair distances (72-81) |

The selection contract already enforces family and hero variety, but it cannot
invent archetypes that are not in the niche. For restaurants, four of six
references are `image-overlay`; the selector can only produce two distinct
hero archetypes in a trio. That is a corpus problem, not a ranking bug.

The anti-repetition memory is also inactive in these test runs:
`recentTrioCount: 0` and `recentReferenceIds: []` in both inspiration packs.
The selector's history balancing only works when the launch history is
populated, and the creative-only test runs do not populate it.

## Finding 4: creative-only reduces copy depth

The creative-only profile deliberately skips SEO research
(`scripts/run-pipeline-test.mjs` lines 931-948) and writes a context-only
research artifact with an empty page map. The copy lane still runs, but it has
less route-specific evidence and fewer fan-out questions. This supports the
suspicion that creative-only copy is thinner, but it is a secondary cause of
the visual emptiness. The primary cause is the missing imagery and the
image-dependent compositions.

## Finding 5: the premium gap is real but layered

The café candidate is coherent and editorial, but its hero is a large paper
field with type and no visual anchor. The Kestrel candidate is structurally
broken because its image-dependent hero has no image. A craft contract for
type scale, spacing, line breaks, hierarchy, states, and motion will help the
coherent candidates feel more finished, but it cannot fix an empty hero or a
corpus that keeps returning the same archetype.

## Recommended fix order

1. **Restore imagery first.** Calibrate the asset review so incidental,
   non-readable texture is allowed while readable text, fake UI, logos,
   watermarks, and people still fail. Improve the retry prompt to remove
   signage, labels, packaging text, and lettering. Add a reviewed café and
   restaurant stock fallback so a rejected hero never leaves an empty stage.
2. **Make selection image-aware.** Add approved-hero coverage to the bakeoff
   winner sort and rank the fallback candidates by image coverage and visual
   score. A candidate with a strong composition and no hero image should not
   beat a comparable candidate with an approved hero.
3. **Persist and use selection history.** Write the selected reference trio
   into the launch history for test runs as well as production, so the
   anti-repetition memory actually rotates the existing pool.
4. **Expand the narrowest niches.** Add structurally distinct,
   rights-cleared references to architecture, accounting, gyms, hotels,
   restaurants, painting, and auto repair. Target at least three distinct
   hero archetypes per niche and no single archetype above half the pool.
5. **Add the premium craft contract.** Apply the scoped type, spacing,
   hierarchy, line-break, state, and motion rules where Reference DNA is
   silent, then run a gated creative-only candidate and compare rendered
   desktop and mobile output.

## Phase 2 implementation (2026-10-26)

- The asset reviewer now rejects readable words, fake interface copy, prominent
  signage, logos, watermarks, interfaces, and people. It allows incidental
  unreadable texture, blurry background marks, photographic grain, and
  multi-object still lifes. The retry prompt names signage, labels, packaging
  lettering, and logos.
- String boolean review checks are normalized instead of being reported as
  `invalid_checks`. The default request budget rose from 9 to 15 in the script,
  the workflow, and the pipeline test profile, so a rejected hero can be
  retried.
- `scripts/creative-compiler.mjs` now exposes `creativeImageCoverage`,
  `routeRequiresHeroImage`, `imageCompletenessScore`, and
  `rankFallbackCandidates`.
- The creative bakeoff winner sort prefers an image-complete candidate when the
  assigned hero composition needs an image, before rendered hero distinctiveness
  and score. The failed-bakeoff fallback ranks source-safe candidates by image
  completeness, then preference, then visual score.
- Live single-route café test with `z-ai/glm-5.3` as the asset reviewer:
  two accepted placements (hero and secondary), one rejected, five requests.
  The accepted hero is a premium dusk café interior with an incidental small
  package mark. The same route previously had no accepted hero. The
  GLM-5.3-Flash reviewer produced 0-1 accepted placements and several
  malformed or unavailable checks on the same route; the OpenRouter Flash path
  produced 0 accepted placements. The stronger visual judge is now the default
  `FAL_IMAGE_REVIEW_MODEL`.
- Validation so far: 44 contextual/creative-compiler tests and 56
  pipeline-test-runner tests passed; `npm run check` reported 0 errors and 0
  warnings across 427 files. A gated creative-only run is still required
  before claiming a full visual improvement.

## Evidence limits

This audit inspected two recent creative-only runs and the selection/review
code. It did not re-run the image review with a labeled calibration set, and
it did not measure a premium-score delta. The image rejection counts and the
zero-image selected routes are direct evidence; the premium craft effect is a
judgment to validate with a gated rendered run.
