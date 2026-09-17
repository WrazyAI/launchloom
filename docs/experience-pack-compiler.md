# Experience-pack compiler

LaunchLoom's experience-pack compiler is the seam between verified site data and structurally independent page renderers.

## Interface

Call `compileExperiencePack(site, recipe, options)` and render the returned immutable version-two blueprint and normalized content model. The caller does not choose CSS classes, DOM fragments, animation functions, or renderer internals.

The compiled program owns these structural decisions:

- navigation grammar
- hero composition
- immediate post-hero conversion mechanic
- service presentation
- page rhythm
- bounded motion profile
- section sequence
- structural fingerprint

The compiler normalizes verified content and feature eligibility. SEO metadata, form submission, map rendering, review controls, conversion-widget behavior, and release gates remain shared implementations outside the visual adapters.

`compileExperienceCandidates(site, recipe)` returns every compatible reviewed
adapter with its fingerprint, compatibility score, and diagnostics. The initial
generation workflow renders each candidate at 1536 by 864, 1366 by 768, and
390 by 844. It records screenshots and failures, persists the strongest valid
candidate, and removes the experience opt-in to use the legacy renderer when no
candidate is safe.

## Included adapters

1. `cinematic-narrative`: image-led editorial opening, discovery ribbon, magazine service index, restrained narrative motion, and cinematic inquiry close.
2. `bold-utility`: pill navigation, asymmetric human opening, immediate guided qualifier, service chapters, quiet proof, and conversation handoff.
3. `kinetic-poster`: command-bar navigation, graphic split opening, quick-request strip, diagnostic service list, coverage, ordered process, and action-poster close.

Each adapter owns independent markup and mobile behavior. They are not CSS skins over `DesignFamilySections.astro`.

## Safety and fallback

The compiler accepts only registered pack IDs. Unknown IDs are replaced with a compatible registered pack and recorded in diagnostics. Every compiled program must include a hero, immediate conversion module, services, FAQs, and contact. Only one pinned scene is allowed, and the current production adapters use no third-party animation runtime.

Existing client sites do not migrate automatically. A site opts into the compiler only when `design.experience.packId` exists. New initial generations receive a deterministic pack selection based on verified intake context. Revisions preserve the selected pack unless a future supported operation changes it explicitly.

## Adding a pack

A new pack must add a registry definition and an independent adapter. Promotion requires:

- a unique structural fingerprint
- desktop and 390px mobile renders without overflow
- the desktop header and hero fit within a 1536 by 864 viewport at 100% zoom
- Services, FAQs, and Contact navigation
- conversion immediately after the hero
- one H1 and valid fragment links
- no em dashes or unsupported facts
- production build, Astro check, accessibility, SEO, and visual review evidence

Use GSAP only when the pack needs a sequenced, scrubbed, or pinned scene that native CSS and scroll behavior cannot express clearly. Motion is a pack capability, not a default dependency.

## Model-authored experience lab

`npm run generate:model-experiences` exercises the current pipeline models as full experience authors rather than asking the shared renderer to imitate a reference. Every model receives the same verified facts, local assets, visual reference, forbidden patterns, and release contract. It authors complete React and CSS files, then receives at most one constrained self-repair pass for build or release failures.

The deterministic layer may normalize local asset paths, remove prohibited em dash characters, and reject unsafe output. It does not choose the composition or rewrite a model's visual system. Promotion requires the desktop hero to fit at both 1536 by 864 and 1366 by 768, a recomposed 390 by 844 mobile layout, semantic navigation, immediate conversion, working assets and links, one H1, and no browser errors.

Generated canaries live in `artifacts/model-experience-lab`. A failed candidate remains evidence for model selection but must not enter the review gallery or production pack registry.
