# Visual hierarchy

Study Novak Painting Group Phoenix as a painting contractor reference. The opening is a warm-ivory editorial column with serif-style promise and embedded form is paired with a large refined living-room photograph. Its navigation is thin black and gold utility navigation with a small estimate control. The source uses high-contrast serif display paired with restrained readable sans, with warm ivory, near-black, white surfaces and muted gold and sage and warm terracotta accents. Translate the hierarchy into a new page for the client's verified services: one specific promise, one primary request a free estimate action, and one secondary call the Phoenix team action. A warm serif voice and paint-layer palette strip turn preparation into the central visual story. Use high-contrast text, a real business context image supplied by the client or an approved matching source, and enough open space for the service choice to register.

# Page sequence

Preserve the source's pacing as a sequence of split interior and estimate hero; layered finish-method chapter; dark company statement; painting service cards; project photo row; Greater Phoenix area; dark contact form; FAQ; gold closing statement. The service presentation is quiet bordered service cards after a color-layer preparation explanation. Explain the customer problem, work scope, what happens next, and how to prepare before asking for details. Move from opening promise to service choice, then process and verified evidence, then contact. Repeat request a free estimate only where the visitor has gained enough context. Use the client's actual services and locations; a service area is not an office. Avoid repeating the same claim in every chapter.

# Responsive translation

At 1440 pixels, keep the source's major image, headline, and first action in one coherent first-screen composition. At 390 pixels, place the form before the hero image, stack service cards, and preserve contrast across black and ivory chapters. Let type wrap naturally and place forms below the promise when space is tight. Use touch-sized controls, maintain clear focus and labels, avoid horizontal overflow, and make all calls and form destinations work. Images must keep the relevant subject visible without burying copy. A reduced-motion reader must receive the complete page.

# Signature elements

Carry across the transferable mechanics represented by ivory-interior-form-hero, paint-layer-method, dark-project-photo-row. calm residential interiors, project thumbnails, and paint sample-like color strips. subtle project hover and FAQ disclosure; static color-layer rows convey the method The exact source layout is a reference, not a stencil: use different client imagery, wording, and identity. If there is no verified testimonial, replace the review position with a useful process or preparation explanation. If a featured visual interaction cannot be implemented accessibly, present its content as labeled stills or links.

# Prohibited patterns

Do not copy Novak identity, home photography, reviews, gold-and-black trade dress, licensed claims, project names, or response-time claims. Do not invent licenses, ratings, reviews, locations, staff, prices, guarantees, response times, project outcomes, or supplier endorsements. Do not import source assets, copy, CSS, icon shapes, trade dress, or exact composition. Avoid a generic card wall that erases the reference's a warm serif voice and paint-layer palette strip turn preparation into the central visual story. Keep one page recipe appropriate to the client's business and do not use em dashes in generated copy.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **Novak Painting Group Phoenix homepage**; family: `web-painting-novak`; subject fit: painting contractor, residential painting, commercial painting, painting. Production eligibility is unchanged.
- Open the paired full-page captures: desktop: `screenshots/desktop.png`, captured viewport 1440 x 900; mobile: `screenshots/mobile.png`, captured viewport 390 x 844. Read the opening at its captured viewport and then inspect the whole page. A full-page image's total height is not CSS vh.
- Use this dossier alone for its route, not an average of the other candidates. Verified client facts, sealed content, accessibility, client font/palette choices and host runtime rules constrain the adaptation. Preserve the assigned composition, section order and signatures; if evidence and prose disagree, identify the conflict rather than silently rewriting the curated contract.
- Separate observed design from proposed client treatment. Do not claim an exact font, hex value, spacing measurement, interaction or animation was observed unless retained evidence supports it. Static captures do not prove scroll, hover or click behavior.

### Opening layout contract

**desktop: split-media / side-by-side-fields**

```text
[ navigation ]
[ copy + action | separate media field ]
```

Keep copy and the focal media region as distinct adjacent fields on desktop. Match their hierarchy and relative occupancy to the capture; do not default to equal-width columns, a boxed copy card or centered copy over the focal subject. The original observations clarify any background image extending beyond its focal region.

**mobile: utility-panel / task-panel-in-opening**

```text
[ navigation ]
[ promise / media | actionable task panel ]
```

The task panel is part of the opening, not a decorative proof card. Preserve the assigned task and its visible controls; use the host's single-form placement contract when this is a lead-form panel.

These are relationship diagrams, not pixel specifications. Resolve alignment, proportions, whitespace and focal crop from the paired captures and original Visual hierarchy. Desktop header plus complete hero must fit 1536 x 864 at normal zoom, even if the source was captured at a taller viewport. Mobile may be content-height driven.

### Page rhythm and content mapping

Keep these assigned chapters in order; the numbers below describe actual page sequence, not decorative labels to add to the site:

1. **split interior and estimate hero**
2. **layered finish-method chapter**
3. **dark company statement**
4. **painting service cards**
5. **project photo row**
6. **Greater Phoenix area**
7. **dark contact form**
8. **FAQ**
9. **gold closing statement**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: high-contrast serif display paired with restrained readable sans. Body character: readable supporting sans text. Hierarchy: prominent service opening, clear section headings, compact practical details. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: warm ivory; near-black; white. Contrast intent: high-contrast action and legible body copy across light and dark fields. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: calm residential interiors, project thumbnails, and paint sample-like color strips. Crop guidance: contextual wide opening followed by contained service and proof images. Focal role: protect roof, property, technician, or finished-work subject from text overlap. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: quiet bordered service cards after a color-layer preparation explanation. Early action: primary and secondary actions appear close to the opening promise. Primary placement: request a free estimate. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **place the form before the hero image, stack service cards, and preserve contrast across black and ivory chapters**. keep first action and service promise early; stack image and service chapters in reading order; make controls touch sized and maintain readable contrast; avoid horizontal overflow.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: subtle project hover and FAQ disclosure; static color-layer rows convey the method. Reduced-motion contract: show all service, proof, and contact content without animation. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **ivory-interior-form-hero** ([data-reference-signature=ivory-interior-form-hero]): ivory interior form hero translated with client-specific content. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **paint-layer-method** ([data-reference-signature=paint-layer-method]): paint layer method translated with client-specific content. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **dark-project-photo-row** ([data-reference-signature=dark-project-photo-row]): dark project photo row translated with client-specific content. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
