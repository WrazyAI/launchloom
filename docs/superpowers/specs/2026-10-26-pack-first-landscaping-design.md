# Source-foundation generation for every dossier

Date: 2026-10-26
Status: Draft for approval
Nifty subtask: `eZc!DzxMni` (Evaluate source-scaffold generation architecture)

## Intent and why

LaunchLoom retains extracted source templates for 128 of its 131 reference
dossiers. The production new-intake path does not use them. It sends the
authoring model a design prompt, Reference DNA, and two screenshots, then asks
it to write a new JSX/CSS/motion experience from scratch. That is why the
plumbing run produced three candidates that all failed source validation, and
why a good reference can still yield a drifting design.

The user direction is broader than a single pilot pack:

- every dossier must be usable, not just the three promoted reference packs;
- every dossier is licensed for internal use and source-derived adaptation;
- the output must not be a verbatim copy of the source;
- the agent must start generation with the dossier's source code foundation
  intact, not from a blank file or a prose description.

This design replaces the one-pack pilot with a **source-foundation layer**.
Every extracted dossier gets a normalized foundation that preserves its actual
HTML, CSS, assets, section order, and interaction mechanics. Generation starts
from that foundation and adapts it to the client. A foundation that is complete
enough can also render deterministically as a pack, but the pack is an output of
the foundation, not a hand-built artifact.

## Goals

1. Build a deterministic source-foundation compiler that turns an extracted
   dossier template into a client-site-compatible foundation.
2. Compile every extracted dossier, not a selected subset. Report the technical
   blockers for the three failed and two pending extractions.
3. Attach the selected route's foundation to generation so the agent edits the
   actual source scaffold instead of inventing a composition.
4. Preserve the source's structure, section order, CSS system, asset roles, and
   interaction mechanics while replacing source copy, branding, demo facts, and
   imagery with sealed client content.
5. Render a foundation deterministically when it is complete enough, so a pack
   can be selected without a model call.
6. Add an explicit `foundation` renderer path to the generation workflow. The
   existing `creative` path remains available.
7. Prove the layer with the Spicer landscaping foundation and a fictional
   landscaping intake, including the preview, admin thumbnail, and stage
   timeline.
8. Produce a compatibility report across all dossiers so the next expansion is
   evidence-driven, not guesswork.

## Non-goals

- Copying any dossier verbatim into a client site.
- Removing the creative-candidate path.
- Hand-authoring 98 separate Astro adapters.
- Adding new onboarding questions for projects, plan tiers, seasonal dates, or
  price formulas.
- Publishing a real client site.
- Changing the admin workspace UI.

## Anti-goals

- A foundation that drops the source's structure and becomes a generic card
  wall.
- A foundation that keeps the source's demo names, copy, prices, reviews,
  project names, staff, imagery, fonts, or trade dress.
- A compiler that silently skips a dossier because its markup is inconvenient.
- A renderer switch that bypasses contrast, overflow, hero-fit, SEO, form, or
  attribution gates.
- A model adaptation that rewrites the whole page instead of editing the
  foundation.
- Treating the source's AI-generated hero or inline project illustrations as a
  client's completed work.

## The shift from the earlier one-pack pilot

The earlier design proposed one hand-ported `season-wheel` pack. That is still
the first proof, but it is not the architecture. The architecture is:

1. **Foundation compiler**: every extracted dossier becomes a source
   foundation.
2. **Foundation renderer**: a foundation can render with sealed content when it
   is complete.
3. **Foundation adaptation**: when the client needs changes, the agent edits
   the foundation files with bounded operations.
4. **Pack promotion**: a foundation that passes the full matrix becomes a
   selectable production pack.

The Spicer landscaping dossier is the pilot because it is static HTML/CSS, has
a complete source extraction, and is the reference that blocked the last
intake. It proves the compiler and renderer before the batch run.

## Architecture

### Foundation directory

For each dossier:

```text
data/reference-library/dossiers/<id>/
  template/                  # existing extracted source, unchanged
  foundation/
    foundation.json          # manifest
    source/                  # normalized HTML, CSS, JS, assets
    README.md                # usage, preservation contract, attribution
```

The existing `template/` stays untouched. The foundation is additive and
digest-bound to the template.

### Foundation manifest

`foundation.json` records:

- schema version, dossier ID, source digest, entrypoint;
- source class and license;
- section map with source selectors, order, and roles;
- content slots, each bound to a sealed content path or a required client fact;
- asset map, with local paths and provenance;
- interaction map, with the source primitive and a reduced-motion equivalent;
- preserved mechanics and prohibited source material;
- compatibility status: `renderable`, `needs-adaptation`, or `blocked`;
- blocker reason for `needs-adaptation` or `blocked`;
- attribution text, href, and license.

### Foundation compiler

The compiler is deterministic and dependency-light. It:

1. Loads the extracted template through `loadReferenceTemplate`.
2. Copies the entrypoint HTML, CSS, JS, and local assets into `foundation/source`.
3. Localizes asset paths and rejects remote images, fonts, and scripts.
4. Parses the DOM into a section map. It recognizes header, hero, services,
   proof, process, coverage, FAQ, contact, and footer by element, id, class, and
   heading text.
5. Replaces source text nodes with content slots. The mapping is heuristic and
   reviewable. It never invents a client fact.
6. Replaces source images with client image slots. It preserves the image role
   and crop, not the source asset.
7. Keeps the source CSS, scoped to the foundation root. It rewrites asset URLs
   and removes remote font imports.
8. Extracts inline event handlers and inline scripts into a local module when
   safe. If a script cannot be isolated, the foundation is marked
   `needs-adaptation`.
9. Adds the `data-foundation`, `data-foundation-dossier`, and
   `data-foundation-digest` markers.
10. Writes the manifest and a human-readable README.

The compiler does not rewrite the source composition. It prepares it for
content binding and review.

### Foundation renderer

The client-site shell gets a `FoundationExperience` renderer. It:

- loads the foundation source and manifest;
- binds the sealed `ExperienceContent` to the slots;
- renders the normalized HTML/CSS in the Astro page;
- preserves the source's section order and class vocabulary;
- adds the shared header, lead form, navigation, SEO, and attribution;
- exposes `data-experience-pack="<foundation-id>"` and the blueprint markers so
  the existing gates recognize it.

A foundation is `renderable` when every required slot has a sealed binding and
every interaction has a safe implementation. Otherwise it is
`needs-adaptation` and the agent must edit it before rendering.

### Agent adaptation

When a foundation is `needs-adaptation`, the generation agent receives:

- the foundation source files;
- the foundation manifest;
- the sealed client content;
- the client visual brief;
- the preservation contract and prohibited source material;
- the exact validation findings from any failed render.

The agent edits the foundation files. It does not receive a blank page. It must
preserve the section order, CSS system, and signature mechanics unless the
client brief or an accessibility finding requires a bounded change. The
validator compares the adapted output to the foundation manifest and rejects a
composition collapse.

The agent can also make client-specific changes to a `renderable` foundation,
such as palette, typography, and section-level copy. Those changes are bounded
and reviewed, not a full rewrite.

### Selection

The existing reference selector continues to choose three structurally
independent routes from the matching niche. Each route carries its dossier's
foundation.

For a generation run:

- `foundation` renderer: the workflow requests a specific foundation for the
  pilot, or lets the selector choose among renderable foundations.
- `creative` renderer: unchanged.
- If the selected foundation is `needs-adaptation`, the workflow runs the
  adaptation stage before rendering.
- If the foundation is `blocked`, the workflow fails with the exact blocker and
  does not fall back to a generic renderer.

Every production dossier is eligible. The three failed and two pending
extractions are tracked as technical blockers, not rights blockers. The
compiler reports them by ID and reason. A screenshot-only foundation is not
silently substituted for a missing source template.

### Workflow

Add an explicit renderer input:

- `renderer`: `creative` (default) or `foundation`.
- `foundationId`: optional explicit foundation request.
- `foundationPolicy`: `renderable-only` or `allow-adaptation`.

For `renderer=foundation`:

1. Run intake, config, SEO, reference selection/analysis, imagery, client
   repository, and review branch steps.
2. Attach the selected foundation to the run.
3. If `renderable-only` and the foundation is not renderable, fail with the
   blocker.
4. If `allow-adaptation`, run the bounded foundation adaptation stage.
5. Set `design.experience` to the foundation renderer, pack ID, variant,
   blueprint version, selection mode, and fingerprint.
6. Build the client site.
7. Assert the foundation markers and reject creative-candidate or legacy
   markers.
8. Run the existing technical, contrast, overflow, hero-fit, SEO, lead-form,
   and attribution gates.
9. Capture screenshots and upload the hero through the existing preview-ready
   path.
10. Deploy the review preview and record the launch signature.
11. Record stages: `foundation_select`, `foundation_adapt` when used,
    `foundation_render`, `preview_deploy`, `preview_ready`.

For `renderer=creative`, every existing step and gate remains unchanged.

### Fingerprint and launch history

The foundation manifest includes a stable structural fingerprint computed from
the section order, class vocabulary, hero topology, service presentation, and
interaction primitive. The workflow writes it to
`design.experience.fingerprint`. `record-launch.mjs` reads it as it does for
existing packs. A foundation without a fingerprint cannot be recorded as a
preview.

### Rights and attribution

The user has confirmed that every dossier is licensed for internal use and
source-derived adaptation, and that no client site will use a dossier verbatim.
The implementation must still:

- record the source license and attribution per dossier;
- keep the existing per-dossier rights evidence;
- render the license-required credit for sources that require one;
- state in the foundation README that the source is a design foundation, not a
  client asset;
- reject a foundation whose rights record is missing or contradictory.

Update `docs/reference-template-rights.md` to distinguish:

- verbatim source transfer, which remains prohibited;
- source-derived adaptation with sealed content, which is allowed under the
  recorded license and attribution;
- attribution-required sources, which must keep a visible credit.

## Content safety

The foundation preserves structure and mechanics, not source facts. The
compiler and validator enforce:

- every visitor-facing business sentence comes from sealed content;
- source names, prices, reviews, project names, staff, locations, guarantees,
  and dates are removed or replaced;
- source images are never published as client assets;
- generated or stock imagery is used only under the existing asset policy and
  is never described as completed client work;
- the source's demo forms and endpoints are removed;
- the shared lead endpoint is the only conversion path;
- no em dashes in rendered copy.

## Section mapping

The compiler recognizes these source roles and maps them to the sealed content
model:

| Source role | Sealed content | Fallback |
| --- | --- | --- |
| Header and navigation | `brand.name`, `brand.phone`, route links | Wordmark and section links |
| Hero promise | `hero.heading`, `hero.body`, `hero.kicker` | Required client fact |
| Hero media | `hero.image`, `secondaryImage`, `tertiaryImage` | Deliberate graphic field |
| Service index | `services` | Required client fact |
| Project or portfolio grid | `services`, approved images | Service-led scope examples, no project claims |
| Proof and reviews | `proof`, `hasSocialProof` | Omit |
| Process | `process` | Omit |
| Coverage | `locations`, `business.serviceAreas` | Omit |
| FAQ | `faqs` | Contact prompt |
| Contact and form | `brand`, `copy`, shared `LeadForm` | Always render |
| Footer | `brand`, attribution | Always render |

## Testing and verification

Compiler:

- Compile all 128 extracted dossiers in a dry-run matrix.
- Assert every foundation has a manifest, source digest, section map, content
  slots, asset map, and attribution record.
- Assert no remote asset, font, or script remains.
- Assert the three failed and two pending dossiers are reported with exact
  blockers.
- Assert the source `template/` bytes are unchanged.

Renderer:

- Render the Spicer foundation at 1536x864, 1366x768, 390x844, and 320px.
- Check hero fit, contrast, overflow, one H1, navigation, services, FAQs,
  contact, lead form, attribution, and no em dashes.
- Check the season selector, filter, plan comparison, and estimator in a real
  browser, including reduced motion.
- Inspect desktop, compact, and mobile screenshots directly.
- Render a sample of foundations from different niches to prove the renderer is
  not landscaping-specific.

Workflow:

- `renderer=foundation` with a renderable foundation.
- `renderer=foundation` with a needs-adaptation foundation and a passing
  adaptation.
- `renderer=foundation` with a blocked foundation fails closed.
- `renderer=creative` is unchanged.
- Stage events include foundation select, adapt, render, preview deploy, and
  preview ready.
- The preview asserts foundation markers and rejects creative-candidate and
  legacy markers.

Live:

- One fictional landscaping intake through the foundation renderer.
- Admin Ledger, Gallery, and side sheet show the hero thumbnail.
- Attempt timeline shows the foundation stages.
- Preview loads the foundation with attribution and a working lead form.
- No production publication.

## Rollout

1. Implement the compiler, manifest, and renderer for the Spicer foundation.
2. Render the Spicer foundation and inspect it against the source captures.
3. Compile all extracted dossiers in a compatibility matrix. Fix common
   compiler gaps. Report the remaining blockers.
4. Add the foundation renderer path to the workflow and test both renderers.
5. Run the fictional landscaping intake on the foundation path.
6. Inspect the live preview, admin thumbnail, and stage timeline.
7. Promote the Spicer foundation to a selectable pack.
8. Expand the production pack library from the compatibility report.
9. Keep the creative path available until the foundation library covers the
   niches the business needs.

## What is left to the builder

- Exact foundation file format and compiler implementation.
- Exact heuristic for section detection and content-slot mapping.
- Exact scoping strategy for source CSS.
- Exact interaction extraction strategy.
- Exact fingerprint inputs.
- Exact workflow job boundaries.
- Exact test fixtures for the batch matrix.
- Whether to use a DOM parser dependency or the existing HTML parser stack.

## Open questions for the human partner

The user has already confirmed that every dossier is licensed for internal use
and source-derived adaptation, that no client site will use a dossier verbatim,
and that the agent must start from the source foundation. The remaining
questions are about rollout, not direction.

1. Confirm that the first live proof should still be the Spicer landscaping
   foundation, with the batch compilation of all dossiers immediately after.
2. Confirm that the foundation renderer stays opt-in until the batch
   compatibility matrix is green, then becomes the default for new intakes.
3. Confirm that the agent may make bounded structural changes when the client
   brief or an accessibility finding requires them, not only content, palette,
   and typography changes.
