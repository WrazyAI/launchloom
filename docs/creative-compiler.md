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
routes the prompt through the selected inspiration family, service vocabulary,
customer questions, and crop-safe placement brief. FAL output is downloaded,
validated as an image, resized to WebP, capped at 2.5 MB, and recorded in
`.launchloom/generated-assets.json` with a prompt hash, request ID, dimensions,
and provider metadata. If `FAL_KEY` is absent or generation fails, the site
keeps its reviewed image fallback and records the reason. Image fallback does
not authorize a return to the legacy page renderer.

## Adding a new family

Add a family to `scripts/creative-compiler.mjs` only when it has a distinct
navigation grammar, hero geometry, service treatment, typography category,
mobile recomposition, and motion opportunity. Add a registry record with
reference rights and a screenshot path. Add a focused compiler test and run a
preview bakeoff before enabling promotion. Do not add a family that is merely a
new color palette or a renamed split hero.
