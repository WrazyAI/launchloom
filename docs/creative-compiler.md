# Creative compiler

The creative compiler is the production seam for model-authored website
experiences. It separates verified business truth from visual composition so a
new design can be ambitious without being allowed to invent facts, bypass the
lead endpoint, or ship an unverified layout.

## Pipeline

1. `generate-site-config.mjs` and `seo-research.mjs` produce the sealed truth
   layer: business facts, SEO vocabulary, FAQs, service decisions, contact
   details, structured data, and approved assets.
2. `compile-inspiration-pack.mjs` selects three independent route contracts with
   one authoritative visual capsule per route. `analyze-reference-dna.mjs`
   then inspects the actual desktop/mobile evidence and enriches Reference DNA
   with measured headline occupancy, image occupancy, navigation and CTA
   coordinates, content-column width, section-height rhythm, aspect ratios,
   overlap relationships, surface transitions, and mobile geometry. Family
   defaults are fallback vocabulary only; screenshot-derived measurements are
   required in the new-intake workflow. A missing required desktop screenshot
   fails creative compilation; prose-only inspiration cannot reach Luna.
   3. `author-production-experiences.mjs` asks the visual author for three
   independent `Experience.jsx`, `styles.css`, and `motion.js` candidates. The
   author receives the complete Reference DNA and its desktop/mobile evidence,
   then must expose the contract's signatures and geometry markers in the
   rendered DOM. It can use React, the shared runtime, GSAP, and ScrollTrigger,
   but not network access, remote code, canvas, or Three.js by default. Model
   stages are globally limited to two in-flight requests so a three-candidate
   bakeoff does not exhaust the provider budget. The authoring budget defaults
   to 20 minutes and can be bounded with
   `CREATIVE_EXPERIENCE_AUTHOR_TIMEOUT_MS`; it never turns an expired author
   run into a legacy renderer. A failed reference-fidelity
   check gets at most two author-owned repairs and then fails closed.
4. `run-creative-bakeoff.mjs` promotes each candidate into the real Astro
   shell, builds it, renders 1536x864 desktop, 1366x768 compact desktop, and
   390x844 mobile viewports, and records the evidence. Structural contract
   compliance remains a cheap safety preflight for sealed content and isolated
   CSS. Reference geometry and signature markers remain diagnostic evidence,
   while promotion fidelity comes from `rendered-reference-fidelity.mjs`, which
   judges the candidate screenshots against the assigned reference screenshots
   across hero geometry, typography, spatial rhythm, imagery, service
   presentation, navigation, CTA placement, mobile recomposition, and
   interaction evidence. Screenshot-to-screenshot candidate distance is
   recorded for preview and is a hard production-promotion gate; different
   metadata, colors, or copy do not count as visual diversity.
5. The diversity gate compares route fingerprints. It rejects a bakeoff where
   the candidates differ only in copy or color. Promotion is possible only
   after the pairwise distance and unique-dimension thresholds pass.
6. `visual-quality-gate.mjs` remains the final screenshot-level review. It
   receives the exact bakeoff screenshots, including compact desktop. A
   repairable finding is sent to `creative-repair-loop.mjs`, which returns the
   current source and Reference DNA to Luna, rerenders all viewports, and
   allows no more than two cycles. A creative candidate is repaired by its
   author or rejected; the visual gate does not rewrite it into a shared
   renderer.

## Safe rollout

Every new intake uses the authored pipeline. The workflow variable
`CREATIVE_EXPERIENCE_MODE` has only two supported outcomes:

- `preview` (default): author and render candidates, select the best authored
  candidate that passes the build, responsive, accessibility, and visual
  minimums, and deploy that candidate to the review preview. Diversity is
  still recorded and required for production promotion. If no authored
  candidate passes, the intake fails instead of silently showing a shared
  renderer.
- `promote`: require a passing creative bakeoff report before deployment and
  copy the selected candidate into `src/generated-experiences/selected`.

The workflow normalizes every other repository-variable value to `preview`.
There is no new-intake escape hatch for the legacy renderer. The deterministic
experience-pack renderer and its bakeoff remain only as migration support for
already-created client repositories and historical tests.

Authoring failures stop before rendering and deployment with the provider
error attached to the run. The workflow never turns an empty candidate set into
a legacy preview.

The model is independently configurable with `CREATIVE_EXPERIENCE_MODEL` and
`CREATIVE_EXPERIENCE_REASONING_EFFORT`. The truth/configuration lane remains on
GLM-5.3-Flash, while the rendered creative lane defaults to
`openai/gpt-5.6-luna` with maximum reasoning. A repository variable can select a
different visual author without changing SEO or business-fact generation. When
Luna exhausts the structured-output budget at maximum effort, the author retries
that stage at medium and then low effort; this is a format-recovery path, not a
legacy-renderer fallback.

## Shared runtime contract

Creative candidates receive `content` and `runtime` from
`CreativeExperience.astro`. `src/lib/creative-runtime.tsx` provides the
production seams for lead submission, FAQ disclosure, contact links, map data,
chat launch, asset resolution, and reduced-motion detection. Candidates may
compose these primitives into a new visual language, but they must not create a
second lead API or fetch untrusted content.

## Image generation

`generate-contextual-assets.mjs` fills missing client image slots only. It
routes each prompt through the selected inspiration family and Reference DNA,
including geometry, crop, palette intent, family-specific art direction,
service vocabulary, customer questions, and a crop-safe placement brief. The
stage keeps at most three route-directed images globally across all routes,
with a default six-request budget that permits one retry per image. It allocates
the remaining slots across routes and reuses matching route entries from the
aggregate manifest before making provider requests. FAL output is
downloaded, validated as an image, resized to WebP, capped at 2.5 MB, and
recorded in `.launchloom/generated-assets.json` with route provenance, a prompt
hash, request ID, dimensions, and provider metadata. If `FAL_KEY` is absent or
generation fails, the site keeps its reviewed image fallback and records the
reason. Image fallback does not authorize a return to the legacy page renderer.

## Adding a new family

Add a family to `scripts/creative-compiler.mjs` only when it has a distinct
navigation grammar, hero geometry, service treatment, typography category,
mobile recomposition, and motion opportunity. Add a registry record with
reference rights and a screenshot path. Add a focused compiler test and run a
preview bakeoff before enabling promotion. Do not add a family that is merely a
new color palette or a renamed split hero.

## Controlled canaries

`node scripts/run-creative-canary.mjs` is the creative-quality canary. It
derives Reference DNA from Kokoro evidence, asks Luna to author the controlled
Kokoro route, renders the authored candidate in the real Astro shell, compares
its pixels to the reference, runs final visual QA, and writes a promotion
report proving `creative-candidate` with no legacy fallback.

`node scripts/run-creative-renderer-canary.mjs` preserves the deterministic
hand-authored Kokoro fixture for renderer/runtime plumbing tests. Passing the
renderer fixture is not evidence that Luna can reproduce the reference
mechanics.
