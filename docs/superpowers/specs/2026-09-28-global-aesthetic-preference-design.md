# Global Creative Aesthetic Preference

## Goal

Persist the user's design preference as a trusted, reusable creative policy and
carry it through LaunchLoom's authored-site pipeline so generated sites favor
business clarity, purposeful imagery, and sophisticated visual execution
without converging on one layout.

## Approved preference

Across business types, create work that feels considered, polished, and
specific to the business rather than assembled from a familiar page formula.
The opening viewport should make the core offering and intended audience easy
to understand, while also establishing a recognizable visual point of view.
Distinctiveness should come from a coherent relationship between composition,
typography, color, imagery, material, and interaction, not from novelty or
animation volume alone.

Give each opening a clear focal point and a legible order of attention. Use
scale, contrast, spacing, alignment, cropping, and negative space deliberately.
Choose imagery and graphic devices because they explain or enrich the actual
business, its work, its process, or its customer context. Prefer visual
evidence and details that could not be casually swapped with those of an
unrelated business. Motion should reveal, guide, or clarify; it should not
obscure content or exist solely to signal that a page is animated.

Abstract graphics, atmospheric scenes, and geometric forms may be used when
they have a clear conceptual relationship to the business or assigned design
family and are executed with restraint and craft. Do not use them as a generic
substitute for business-relevant imagery or as unsupported decoration. Do not
force every site into photography, a split hero, an editorial serif, card
grids, or any other universal composition. Preserve meaningful differences in
layout and visual language across industries and generations.

For architecture and interior-design businesses, make the discipline legible
near the opening. Favor visual evidence of space, built form, material, light,
structure, or design process, such as verified project photography, a clearly
identified concept visualization, a model, a drawing, or a purposeful material
study. The hero should feel spatially convincing and art-directed, and should
help visitors understand that the business shapes buildings or interiors.
Abstract geometry is appropriate when it expresses a recognizable architectural
idea, such as massing, proportion, circulation, structure, light, or material;
its connection to the practice should be apparent from the composition and
surrounding content. Avoid generic floating shapes and decorative geometry
that could represent any company, especially when they displace the clearest
evidence of the studio's work. Never imply that generated concept imagery is a
completed client project.

These same principles adapt to other industries: use business-specific visual
clues, meaningful focal imagery or graphic treatment, confident hierarchy, and
careful execution without copying the architecture-specific direction.

## Precedence and boundaries

- Verified business facts, client-provided assets, explicit client brand
  direction, accessibility, safety, and functional requirements remain binding.
- The assigned permission-cleared Reference DNA remains the visual source
  contract. The global preference guides choices that can satisfy both the
  reference and the business; it must not silently replace the assigned family.
- This policy is a cross-industry art-direction preference, not a universal
  hero template. It does not require photography, a split hero, editorial type,
  or any single composition for every business.
- The preference must not enter the sealed factual/SEO content model as a
  business claim or keyword.
- Existing reference-fidelity, accessibility, safety, viewport, diversity,
  and promotion thresholds are unchanged.

## Architecture

Store the approved preference in a versioned, structured data artifact under
`data/creative-preferences.json`. A small helper in `scripts/` validates the
artifact and creates a stable, bounded prompt block plus a digest and active
preference IDs. A missing or malformed artifact fails early rather than
silently dropping the preference.

The shared preference block is supplied to:

1. Every creative-author stage (contract, JSX, CSS, and motion).
2. Contextual FAL image prompts when the client has no usable image for a
   placement.
3. Initial creative repairs and rendered repairs.
4. Rendered-reference and final visual QA, where preference fit is considered
   separately from reference fidelity.
5. Candidate ranking only after existing eligibility gates pass, as a
   secondary preference signal. It cannot make an ineligible candidate
   eligible, override reference fidelity, bypass diversity, or alter promotion
   readiness.

Reference selection remains driven by niche compatibility, reference quality,
and route diversity. The preference is not injected as a reference-selection
filter, which would bias all businesses toward one visual genre and reduce
variety.

### Image-generation ownership

Image generation is a separate automated workflow stage, not part of the Luna
site-authoring agent. The `Generate or reuse contextual imagery` step in
`.github/workflows/generate-client.yml` runs
`scripts/generate-contextual-assets.mjs`, which uses the `@fal-ai/client`
integration with the server-side `FAL_KEY` GitHub Actions secret. It runs
before `Author independent experience candidates`; FAL creates image files,
while Luna authors the site's JSX, CSS, and motion and consumes the resulting
sealed image slots. The key is never included in Luna prompts or site output.

The preference must be translated into FAL's route- and business-aware image
prompt only when a client image is missing. Keep client assets higher priority,
keep the image budget and safe fallback behavior intact, and record the
preference ID/digest in private generation evidence without recording secret
values. Implementation, configuration, local-use instructions, and failure
behavior are documented in
[`docs/contextual-image-generation.md`](../../contextual-image-generation.md).

Persist only preference IDs and the preference digest in run/prompt evidence;
do not duplicate raw business prompt content or place the preference in public
site output. The existing reference screenshots and sealed client-content
bindings retain their current handling.

## Evaluation behavior

The rendered visual evaluator records a preference-alignment signal separate
from its reference-fidelity score. It assesses business clarity, visual
intentionality, relevance, and craft as described above, while respecting the
assigned family and applicable industry direction. Selection may use that
signal only among candidates that already pass all current technical,
reference, and visual eligibility requirements. A lower-preference but valid
design remains eligible when no stronger-aligned candidate passes. Preference
alignment alone does not create a new hard gate. If the opening obscures the
business or uses plainly irrelevant imagery, existing conversion, hierarchy,
or industry-fit checks may still report a defect on their own evidence.
Legitimate abstraction required by the assigned reference is not a defect by
itself.

## Failure behavior

- Invalid preference data fails before paid authoring or asset-generation
  requests.
- A judge response missing the preference-alignment field is malformed and
  follows existing response-validation behavior; it is not silently treated
  as a perfect score.
- If a candidate violates the preference but passes current hard gates, the
  report records the low alignment. It remains eligible unless it also has an
  existing technical, reference, safety, visual, or accessibility blocker.
- Client assets continue to outrank generated assets, and no image-generation
  failure may route the site to a legacy renderer.

## Verification

Tests must prove the approved preference is present in each intended model
stage, that its digest/IDs are traceable without storing raw prompt text, and
that it cannot leak into business facts or SEO fields. Architecture-specific
direction must be conditional and must not force a photographic or project-led
hero on unrelated industries. Existing reference-fidelity and promotion gates
must remain unchanged, and preference alignment must never bypass them.

Run focused preference/prompt tests, the full `npm test`, Astro check, and a
production build. Then run a non-promoting architecture canary and one
non-architecture canary using different assigned reference families. Verify
prompt-evidence records, screenshots, the preference-alignment report, and
unchanged fail-closed promotion behavior. Do not deploy or promote either
canary as part of this change.
