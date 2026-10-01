# Creative compiler

The creative compiler is the production seam for model-authored website
experiences. It separates verified business truth from visual composition so a
new design can be ambitious without being allowed to invent facts, bypass the
lead endpoint, or ship an unverified layout.

## Permission-cleared reference dossiers

Production references are stored as canonical dossiers in
`data/reference-library/dossiers/`, indexed by
`data/reference-library/core-collection.json`. Each dossier folder contains a
full-page desktop capture, a full-page mobile capture, a local rights record,
a business/source manifest, and a detailed `design-prompt.md`. The current core
contains six eligible references for each of sixteen supported niches. The
selector draws three pairwise-distinct references from the matching niche; a
niche without three eligible dossiers above the structural-distance floor
fails closed. Unrelated designs are never used as filler.

When at least nine structurally valid trios can each use three different
visual families, cover every eligible dossier, and keep any one dossier at or
below 70% of that choice pool, the selector requires that family spread.
Otherwise it keeps the broader seeded exposure-balanced pool so a one-off
family is not pinned into every generation. Style-matching tokens come only
from affirmative visual-direction clauses; negative instructions and factual
disclaimers remain in author context but are never scored as positive
inspiration terms. The selector widens a lexical style-fit band as needed to
preserve at least nine seeded choices while covering every structurally
eligible dossier in the niche; brand vocabulary must not starve other valid
references.

`reference-dossier.mjs` verifies the screenshots, capture dimensions, prompt,
rights evidence, registered paths, and content digest. Production packs bind
exactly one authoritative dossier to each route. The Reference DNA analyzer
receives its screenshots and design prompt, derives measured geometry from the
pixels, and the author receives the same evidence and prompt at every stage.
The analyzer adds measured ratios and a pixel-analysis note without replacing
the dossier's curated section order, service treatment, conversion placement,
signatures, or mobile strategy.
Direct-site references carry requester-attested permission; the repository
does not misrepresent those attestations as independently verified owner
grants. Reference screenshots and source imagery are evidence only and never
become client-site assets.

## Pipeline

1. `generate-site-config.mjs` and `seo-research.mjs` produce the sealed truth
   layer: business facts, SEO vocabulary, FAQs, service decisions, contact
   details, structured data, and approved assets.
2. `compile-inspiration-pack.mjs` selects three independent route contracts with
   one authoritative, business-matched dossier per route from the canonical
   core. It does not select from discovery-only A1 records or fall back to an
   unrelated historical registry. `analyze-reference-dna.mjs` inspects the
   actual desktop/mobile evidence and enriches Reference DNA
   with measured headline occupancy, image occupancy, navigation and CTA
   coordinates, content-column width, section-height rhythm, aspect ratios,
   overlap relationships, surface transitions, and mobile geometry. Family
   defaults are fallback vocabulary only; screenshot-derived measurements are
   required in the new-intake workflow. A missing required desktop screenshot
   fails creative compilation; prose-only inspiration cannot reach Luna.
   Full-page reference captures retain their source pixel dimensions in the
   evidence record. Their section-height fractions describe the captured page,
   not CSS viewport units; the adapted desktop header and hero must still fit
   inside the 1536x864 browser viewport.
3. `author-production-experiences.mjs` asks the visual author for three
   independent `Experience.jsx`, `ServicePage.jsx`, `LocationPage.jsx`,
   `ServicesIndexPage.jsx`, `styles.css`, and `motion.js` candidates. The
   author receives the complete Reference DNA and its desktop/mobile evidence,
   plus a bounded client visual brief containing the resolved palette, tone,
   style preference, visual direction, and submitted art direction. The visual
   brief remains available to rendered repair and reference judging so a repair
   cannot silently converge on a LaunchLoom house palette or reverse an explicit
   light/dark direction. The author must expose the contract's signatures and
   geometry markers in the rendered DOM. It can use React, the shared runtime,
   GSAP, and ScrollTrigger, but not network access, remote code, canvas, or
   Three.js by default. Model stages are globally limited to two in-flight
   requests so a three-candidate bakeoff does not exhaust the provider budget.
   Source validation permits telephone links only when they are prefixed from
   the sealed phone token, including a const local alias and the two narrowly
   allowlisted digit/plus normalizers. Every contact href still fails closed if
   it contains any other dynamic or remote value. Sealed hero and supporting
   image tokens may be empty; when an image is optional, its `<img>` must be
   rendered only under a direct truthiness guard for that same token. A
   populated token must still resolve to a safe local or LaunchLoom-hosted
   asset. Invalid authored output gets bounded source-validation retries with
   the exact validator finding before the candidate is rejected.
   The authoring budget defaults to 85 minutes and can be bounded with
   `CREATIVE_EXPERIENCE_AUTHOR_TIMEOUT_MS`; it never turns an expired author
   run into a legacy renderer. Completion ceilings are stage-specific: 24k
   tokens for the design contract, 48k for JSX, 32k for the service and
   location pages, 24k for the services index, 40k for CSS, and 24k for motion,
   with up to 5 minutes for contract/motion/services-index, 6 minutes for the
   service and location pages, and 8 minutes for JSX/CSS. These are upper
   bounds, not reserved spend. The author logs finish reason,
   completion/reasoning token usage, and returned content length on every
   response so output truncation is distinguishable from input-context errors.
   A failed reference-fidelity check gets at most two author-owned repairs and
   then fails closed.
   The inner-page companions are authored against the same sealed content, the
   same Reference DNA, and the same design contract as the homepage.
   `ServicePage.jsx` renders `/services/<slug>/` with one service record
   (name, slug, description, decision support, related services, process,
   FAQs, imagery). `LocationPage.jsx` renders `/locations/<slug>/` for
   home-service intakes that list service areas, with the location name,
   description, coverage note, confirmed services, and other listed areas.
   `ServicesIndexPage.jsx` renders `/services/` from the sealed services list,
   heading, and introduction. Each page must reuse the homepage class
   vocabulary, render exactly one H1, keep its page markers, link real
   `/services/<slug>/` routes, and render the single shared LeadForm. The
   styles stage receives every authored source file and must style them all
   from one stylesheet.
4. `run-creative-bakeoff.mjs` promotes each candidate into the real Astro
   shell, builds it, renders 1536x864 desktop, 1366x768 compact desktop, and
   390x844 mobile viewports, and records the evidence. Structural contract
   compliance remains a cheap safety preflight for sealed content and isolated
   CSS. Reference geometry and signature markers remain diagnostic evidence,
   while promotion fidelity comes from `rendered-reference-fidelity.mjs`, which
   judges true first-viewport captures against the assigned reference screenshots,
   with a separate labeled full-page overview for section order and rhythm,
   across hero geometry, typography, spatial rhythm, imagery, service
   presentation, navigation, CTA placement, mobile recomposition, interaction
   evidence, palette adherence, and client art direction. Palette adherence and
   art direction are independent hard-threshold scores; a candidate cannot pass
   by compensating for a wrong client palette with stronger reference mechanics.
   Screenshot-to-screenshot candidate distance is
   recorded for preview and is a hard production-promotion gate; different
   metadata, colors, or copy do not count as visual diversity.
   When a candidate carries authored inner pages, the bakeoff also builds and
   renders one `/services/<slug>/` route, one `/locations/<slug>/` route when
   the intake lists home-service areas, and `/services/` at desktop and mobile.
   Each authored page must expose its page, hero, region, and listing markers,
   the shared LeadForm, and no overflow, broken imagery, unnamed controls, or
   em dashes. The rendered canvas background, heading typeface, and heading
   weight must match the same candidate's homepage; drifting back to the
   generic inner template is a hard candidate failure. Inner-page screenshots
   are retained as private evidence beside the homepage captures. Legacy
   candidates without authored inner pages keep the deterministic inner
   template and are reported without those gates.
5. Route fingerprints remain an early compiler diagnostic so independently
   authored routes do not collapse before rendering. Explicitly named reference
   intent is carried into candidate metadata and is compared before aggregate
   score among otherwise eligible preview candidates. Recent creative families receive a bounded
   rotation penalty unless the intake explicitly requested that reference,
   which reduces cross-client repetition without overriding client direction.
   Inspiration attempts record their selected route families as well as
   reference IDs and signatures, so a failed attempt rotates away from sibling
   references in the same family when alternatives exist. The workflow reserves
   the pack against the latest main history before reference analysis; if a
   concurrent intake wins the history push, the losing run reselects from the
   updated history before retrying instead of authoring a stale overlapping
   pack. For version-two
   candidates, production diversity authority comes from rendered screenshot
   comparison only; fingerprint distance and unique-dimension counts are
   retained in the report for diagnosis and do not veto a pixel-diverse
   candidate. Legacy candidates keep the structural diversity fallback.
6. `run-rendered-creative-repair.mjs` owns the bounded rendered repair loop.
   Each round runs the real Astro bakeoff, keeps browser-scale viewport captures
   and full-page overviews, applies the screenshot-to-reference judge, and then
   runs `visual-quality-gate.mjs` against the selected rendered candidate.
   Repairable findings are returned to Luna with the current source, Reference
   DNA, and available screenshots. When pairwise diversity fails, the repair
   also receives the closest failed sibling's desktop and mobile first-viewport
   captures, labeled as comparison-only evidence with an explicit do-not-copy
   instruction. The loop repairs one candidate per render round, then rerenders
   the full candidate set before choosing another target, so subsequent repairs
   compare against current rendered output rather than a stale pre-repair batch.
   The repaired candidate is never trusted on its own claim: it must rebuild,
   rerender, and pass the judges on the next round. The authored inner page
   sources are included in every repair context, and automatic rendered repairs
   may return corrected inner-page sources or bounded edits naming them so
   service, location, and services-index findings are fixed in their own page;
   scoped human repairs stay restricted to the homepage files because their
   section scope is declared against Experience.jsx. Inner pages are preserved
   through repairs so a repair cannot silently drop or break them. Each repair response has a
   48k completion ceiling and records its
   finish reason plus completion/reasoning token counts without logging source
   content. When the combined authored source exceeds 20,000 characters, repair
   is split into sequential JSX, CSS, and motion responses to keep each returned
   bundle within the provider ceiling. Every file-scoped call reuses the same
   frozen reasoning effort and creative session identity. Each candidate gets
   at most two repair cycles. Production promotion
   still requires `promotionReady`, including rendered candidate diversity, plus a
   passing final visual gate. The loop never falls back to a legacy renderer.

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

For a manual internal canary, `workflow_dispatch` also accepts
`preview_only=true`. That mode skips the neutral production-branch certificate
bootstrap and still runs the normal authoring, SEO, visual, and promotion gates.
Only the review or diagnostic preview branches may receive generated site
content in this mode.

Authoring failures stop before rendering and deployment with the provider
error attached to the run. The workflow never turns an empty candidate set into
a legacy preview.

The model is independently configurable with `CREATIVE_EXPERIENCE_MODEL`. The
truth/configuration lane remains on GLM-5.3-Flash, while the rendered creative
lane defaults to `openai/gpt-6-luna`.

After Reference DNA is complete and before the first Luna request, the
production workflow runs the adaptive reasoning preflight described in
[`docs/adaptive-reasoning-preflight.md`](./adaptive-reasoning-preflight.md).
It writes one frozen creative-session decision for the complete author/repair
lifecycle. The workflow defaults to `shadow` mode: Jev records whether the
deterministic policy would choose `xhigh` or `max`, while the actual session
continues at `xhigh`. In `enforce` mode, the selected session effort is
`xhigh` or `max`.

Once an adaptive session exists, every contract, JSX, CSS, motion, validation
repair, and rendered creative repair uses that exact reasoning effort and the
same creative session identity. The author must not downgrade from `xhigh` or
`max` to another effort inside that session because doing so would split the
session's reasoning/cache family. Direct legacy developer invocations without a
reasoning-preflight artifact may still use the bounded static-effort recovery
ladder for compatibility; the production workflow does not.

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

## Scoped revision workflows

Client and developer feedback revisions capture the checked-out client commit
before applying edits. A preflight rejects dirty checkouts and symlinks at any
possible write destination before feedback processing starts. After typed
revision operations and any required creative repair complete, the workflow
creates an exact-path manifest outside the client repository. It includes the
template files selected by `revisionTemplatePaths`, deterministic migration
destinations, `src/site.config.json`, only the guideline files actually
written, and the three selected creative source files only when source repair
was required.

`scripts/revision-scope.mjs` compares the checkout with that base SHA and
rejects out-of-scope staged, unstaged, untracked, deleted, renamed, or
symlink-reached paths. Staging uses only the validated literal path list. Both
feedback workflows repeat validation before every commit and push and again
immediately before deploying a review preview. The manifest and creative
repair artifacts stay outside the client repository unless a path is
explicitly part of the bounded revision contract.
