# Creative compiler

The creative compiler is the production seam for model-authored website
experiences. It separates verified business truth from visual composition so a
new design can be ambitious without being allowed to invent facts, bypass the
lead endpoint, or ship an unverified layout.

## Pipeline

1. `generate-site-config.mjs` and `seo-research.mjs` produce the sealed truth
   layer: business facts, SEO vocabulary, FAQs, service decisions, contact
   details, structured data, and approved assets.
2. `compile-inspiration-pack.mjs` selects three independent route contracts.
   Each route has a family, navigation grammar, hero geometry, service
   presentation, section rhythm, typography category, motion opportunity,
   mobile behavior, prohibited patterns, and screenshot evidence when
   available.
3. `author-production-experiences.mjs` asks the visual author for three
   independent `Experience.jsx`, `styles.css`, and `motion.js` candidates. The
   author can use React, the shared runtime, GSAP, and ScrollTrigger, but not
   network access, remote code, canvas, or Three.js by default.
4. `run-creative-bakeoff.mjs` promotes each candidate into the real Astro
   shell, builds it, renders desktop and mobile viewports, and records the
   evidence. A candidate must expose one hero, one early conversion surface,
   Services, FAQs, Contact, usable fragment targets, no horizontal overflow,
   no broken images, no em dashes, and no browser errors.
5. The diversity gate compares route fingerprints. It rejects a bakeoff where
   the candidates differ only in copy or color. Promotion is possible only
   after the pairwise distance and unique-dimension thresholds pass.
6. `visual-quality-gate.mjs` remains the final screenshot-level review. A
   creative candidate is repaired by its author or rejected; the visual gate
   does not rewrite it into a shared renderer.

## Safe rollout

The workflow variable `CREATIVE_EXPERIENCE_MODE` has three values:

- `legacy`: skip creative rendering and use the reviewed experience pack.
- `shadow` (default): author and render candidates, keep the public preview on
  the existing renderer, and attach the candidate report and screenshots.
- `promote`: require a passing creative bakeoff report before deployment and
  copy the selected candidate into `src/generated-experiences/selected`.

The model is independently configurable with `CREATIVE_EXPERIENCE_MODEL`.
Keep the reliable copy/configuration model for the truth layer. Benchmark a
stronger visual model behind the creative flag before changing the default.

## Shared runtime contract

Creative candidates receive `content` and `runtime` from
`CreativeExperience.astro`. `src/lib/creative-runtime.tsx` provides the
production seams for lead submission, FAQ disclosure, contact links, map data,
chat launch, asset resolution, and reduced-motion detection. Candidates may
compose these primitives into a new visual language, but they must not create a
second lead API or fetch untrusted content.

## Image generation

`generate-contextual-assets.mjs` fills missing client image slots only. It
routes the prompt through the selected inspiration family, service vocabulary,
customer questions, and crop-safe placement brief. FAL output is downloaded,
validated as an image, resized to WebP, capped at 2.5 MB, and recorded in
`.launchloom/generated-assets.json` with a prompt hash, request ID, dimensions,
and provider metadata. If `FAL_KEY` is absent or generation fails, the site
keeps its reviewed fallback and records the reason instead of blocking an
otherwise truthful preview.

## Adding a new family

Add a family to `scripts/creative-compiler.mjs` only when it has a distinct
navigation grammar, hero geometry, service treatment, typography category,
mobile recomposition, and motion opportunity. Add a registry record with
reference rights and a screenshot path. Add a focused compiler test and run a
shadow bakeoff before enabling promotion. Do not add a family that is merely a
new color palette or a renamed split hero.
