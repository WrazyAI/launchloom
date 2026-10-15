# Reference implementation brief: Architecture project fieldbook

## Scope and non-copy rule

Use the paired captures to study an architecture studio's project-led editorial structure: a full-width opening image, compact site metadata, a restrained practice statement, measured project records, principles, capability rows, recognition, people, and a serious enquiry sheet. The template source is pinned and MIT licensed; every bundled photo is documented as CC0 or Public Domain in the retained credit file. Do not reuse the Drafthouse identity, source text, project names, places, award names, people, portraits, project images, design promises, fees or business claims. Build the page only from verified client facts and approved portfolio assets.

## Visual hierarchy

Make the studio's work the first evidence. Use a shallow paper-colored navigation strip, followed by a full-width architectural photograph with the project name and compact metadata anchored near its lower edge. Favor a warm limestone surface, disciplined charcoal typography, blue/ochre image tones, generous spacing and fine rules. Follow with an editorial statement in a narrow column beside quiet body copy. Projects should read like documented places, not promotional cards: image, title, area or project type, location only when public and verified, and stage only when supplied.

## Page sequence

1. Compact navigation for projects, practice, services, people and enquiry; keep the first action clear.
2. One featured project image with a concise, fact-backed title and only verified metadata.
3. Short practice statement describing the studio's actual work and decision process.
4. Project index with varied architectural image crops and project facts from client-approved materials.
5. A short principles or process ledger that explains how a project moves forward, without invented stages or schedules.
6. Service/capability rows, then awards or credentials only when documented.
7. Team section only for real people who have approved publication; otherwise replace it with a process, materials, or studio chapter.
8. Enquiry sheet that asks about project type, site, stage and contact details only where those fields are genuinely useful.

## Responsive translation

At 390px, keep navigation compact and let the featured image carry the opening before metadata becomes a short stacked list. Move the editorial statement into one readable column. Project records become sequential image-and-metadata chapters, not a tiny two-column gallery. Turn the principles ledger into full-width ruled rows. Keep service labels and descriptions adjacent, then stack enquiry fields in their natural order. Do not use horizontal scrolling as a substitute for a mobile layout. Verify at 390px and 320px with no overflow.

## Signature elements

- Full-width featured work with a quiet metadata strip anchored to the image.
- Brief editorial practice statement, not an oversized marketing essay.
- Project index with architectural imagery and useful project facts.
- Principles/process ledger rendered as ruled lines rather than rounded cards.
- A structured enquiry form that starts with project context and ends with contact.

Let the project photography change scale and crop across chapters, while typography, labels and rules keep a consistent archive-like system. The result should feel like a design practice's field record, not a luxury property sales page or an agency template.

## Prohibited patterns

- Copying Drafthouse's brand, wording, projects, people, awards, photos, architecture, or exact section content.
- Inventing architect credentials, planning approval, project area, construction status, client identity, budgets or outcomes.
- Using historical portraits or generic stock people as the client's actual team.
- Presenting an image of a place as a completed client project without source confirmation.
- Making a decorative map imply a studio address or service region.
- Replacing the project archive with a uniform grid of generic cards, repeated metrics or fabricated testimonials.

## Local SEO and conversion

Use the verified discipline and real service area in the page title, opening context and service explanations. Clarify whether the firm works on residential, commercial, interior, restoration or landscape projects using the client's actual scope. Describe project locations as portfolio locations, not branch offices. Link to substantive project pages only when the client provides approved content and assets. The primary action should invite a credible project enquiry; capture location, project type and current stage so the studio can respond usefully. Never promise planning approval, construction cost or delivery time without verified evidence.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **Drafthouse architectural project fieldbook**; family: `colorlib-drafthouse-atlas`; subject fit: architecture, architectural-design, interior-design, design-studio. Production eligibility is unchanged.
- Open the paired full-page captures: desktop: `screenshots/desktop.png`, captured viewport 1440 x 1000; mobile: `screenshots/mobile.png`, captured viewport 390 x 844. Read the opening at its captured viewport and then inspect the whole page. A full-page image's total height is not CSS vh.
- Use this dossier alone for its route, not an average of the other candidates. Verified client facts, sealed content, accessibility, client font/palette choices and host runtime rules constrain the adaptation. Preserve the assigned composition, section order and signatures; if evidence and prose disagree, identify the conflict rather than silently rewriting the curated contract.
- Separate observed design from proposed client treatment. Do not claim an exact font, hex value, spacing measurement, interaction or animation was observed unless retained evidence supports it. Static captures do not prove scroll, hover or click behavior.

### Opening layout contract

**desktop: media-overlay / copy-over-media**

```text
[ navigation ]
[ media field: copy + action over image ]
```

Keep copy inside the media field, not in a separate adjacent card. Choose a quiet crop, a proving foreground color, or a soft scrim; never box text lines to fix contrast, and do not move copy outside the image.

**mobile: media-overlay / copy-over-media**

```text
[ navigation ]
[ media field: copy + action over image ]
```

Keep copy inside the media field, not in a separate adjacent card. Choose a quiet crop, a proving foreground color, or a soft scrim; never box text lines to fix contrast, and do not move copy outside the image.

These are relationship diagrams, not pixel specifications. Resolve alignment, proportions, whitespace and focal crop from the paired captures and original Visual hierarchy. Desktop header plus complete hero must fit 1536 x 864 at normal zoom, even if the source was captured at a taller viewport. Mobile may be content-height driven.

### Page rhythm and content mapping

Keep these assigned chapters in order; the numbers below describe actual page sequence, not decorative labels to add to the site:

1. **navigation**
2. **project-hero**
3. **practice-statement**
4. **project-index**
5. **principles-ledger**
6. **services**
7. **recognition**
8. **team**
9. **enquiry**
10. **footer**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: restrained neutral grotesk. Body character: quiet editorial sans. Hierarchy: medium display statements, small uppercase metadata labels, concise body copy. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: warm paper; limestone; soft stone gray. Contrast intent: low-chroma architectural calm while preserving readable body and action contrast. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: archival architectural project photography. Crop guidance: wide featured project with repeated varied project crops. Focal role: building/site geometry remains legible and text sits in a quiet lower image zone. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: compact capability blocks after a project and principles archive. Early action: compact enquiry link near the featured project opening. Primary placement: project enquiry in navigation and structured closing form. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **single-column project archive**. preserve featured image before project metadata; stack project image and facts; turn principles into ruled rows; stack enquiry fields in reading order; never use page-level horizontal scrolling.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: active section indication while reading project chapters. Reduced-motion contract: static image chapters and direct anchor navigation. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **featured-project-tableau** ([data-reference-signature=featured-project-tableau]): full-width project image with restrained title and verified metadata. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **project-index** ([data-reference-signature=project-index]): portfolio presented as documented project records. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **principles-ledger** ([data-reference-signature=principles-ledger]): ruled process/principles list rather than repeated cards. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **project-enquiry-sheet** ([data-reference-signature=project-enquiry-sheet]): enquiry that begins with project context. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
