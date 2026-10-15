# Visual hierarchy

Study AV Painting Seattle as a painting contractor reference. The opening is a wide dusk house photograph carries centered white service copy and a green estimate button. Its navigation is cream logo strip over dark horizontal service navigation with a green appointment block. The source uses clear sans headings with warm gold accents and measured body copy, with white, soft gray, charcoal surfaces and forest green and muted gold accents. Translate the hierarchy into a new page for the client's verified services: one specific promise, one primary get a free estimate action, and one secondary call the local office action. Green calls to action, gold headings, and large house photographs create a warm residential path. Use high-contrast text, a real business context image supplied by the client or an approved matching source, and enough open space for the service choice to register.

# Page sequence

Preserve the source's pacing as a sequence of house-photo hero; split local-company introduction; tabbed exterior and interior showcase; three-step preparation process; financing image feature; three reasons to choose; residential case photo; review and footer. The service presentation is photo-led service selector with vertical tabs for exterior, interior, and cabinet work. Explain the customer problem, work scope, what happens next, and how to prepare before asking for details. Move from opening promise to service choice, then process and verified evidence, then contact. Repeat get a free estimate only where the visitor has gained enough context. Use the client's actual services and locations; a service area is not an office. Avoid repeating the same claim in every chapter.

# Responsive translation

At 1440 pixels, keep the source's major image, headline, and first action in one coherent first-screen composition. At 390 pixels, stack the tabs as labeled service choices, preserve the house image, and keep estimate prompts after each major decision point. Let type wrap naturally and place forms below the promise when space is tight. Use touch-sized controls, maintain clear focus and labels, avoid horizontal overflow, and make all calls and form destinations work. Images must keep the relevant subject visible without burying copy. A reduced-motion reader must receive the complete page.

# Signature elements

Carry across the transferable mechanics represented by dusk-house-hero, photo-service-selector, three-step-painting-process. finished residential exteriors, preparation close-ups, and lived-in rooms. service tab selection and review slider; first service and links must remain visible without interaction The exact source layout is a reference, not a stencil: use different client imagery, wording, and identity. If there is no verified testimonial, replace the review position with a useful process or preparation explanation. If a featured visual interaction cannot be implemented accessibly, present its content as labeled stills or links.

# Prohibited patterns

Do not copy AV Painting branding, home photos, warranty term, financing claims, customer quotes, awards, or certification marks. Do not invent licenses, ratings, reviews, locations, staff, prices, guarantees, response times, project outcomes, or supplier endorsements. Do not import source assets, copy, CSS, icon shapes, trade dress, or exact composition. Avoid a generic card wall that erases the reference's green calls to action, gold headings, and large house photographs create a warm residential path. Keep one page recipe appropriate to the client's business and do not use em dashes in generated copy.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **AV Painting Seattle homepage**; family: `web-painting-av`; subject fit: painting contractor, residential painting, painting. Production eligibility is unchanged.
- Open the paired full-page captures: desktop: `screenshots/desktop.png`, captured viewport 1440 x 1000; mobile: `screenshots/mobile.png`, captured viewport 390 x 844. Read the opening at its captured viewport and then inspect the whole page. A full-page image's total height is not CSS vh.
- Use this dossier alone for its route, not an average of the other candidates. Verified client facts, sealed content, accessibility, client font/palette choices and host runtime rules constrain the adaptation. Preserve the assigned composition, section order and signatures; if evidence and prose disagree, identify the conflict rather than silently rewriting the curated contract.
- Separate observed design from proposed client treatment. Do not claim an exact font, hex value, spacing measurement, interaction or animation was observed unless retained evidence supports it. Static captures do not prove scroll, hover or click behavior.

### Opening layout contract

**desktop: image-led-stage / media-leads-copy**

```text
[ navigation ]
[ dominant media stage ]
[ supporting promise + action ]
```

Let the media lead the opening. Keep supporting copy subordinate and maintain the source's visual pause before the next chapter; do not substitute equal-weight text/image columns.

**mobile: media-overlay / copy-over-media**

```text
[ navigation ]
[ media field: copy + action over image ]
```

Keep copy inside the media field, not in a separate adjacent card. Choose a quiet crop, a proving foreground color, or a soft scrim; never box text lines to fix contrast, and do not move copy outside the image.

These are relationship diagrams, not pixel specifications. Resolve alignment, proportions, whitespace and focal crop from the paired captures and original Visual hierarchy. Desktop header plus complete hero must fit 1536 x 864 at normal zoom, even if the source was captured at a taller viewport. Mobile may be content-height driven.

### Page rhythm and content mapping

Keep these assigned chapters in order; the numbers below describe actual page sequence, not decorative labels to add to the site:

1. **house-photo hero**
2. **split local-company introduction**
3. **tabbed exterior and interior showcase**
4. **three-step preparation process**
5. **financing image feature**
6. **three reasons to choose**
7. **residential case photo**
8. **review and footer**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: clear sans headings with warm gold accents and measured body copy. Body character: readable supporting sans text. Hierarchy: prominent service opening, clear section headings, compact practical details. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: white; soft gray; charcoal. Contrast intent: high-contrast action and legible body copy across light and dark fields. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: finished residential exteriors, preparation close-ups, and lived-in rooms. Crop guidance: contextual wide opening followed by contained service and proof images. Focal role: protect roof, property, technician, or finished-work subject from text overlap. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: photo-led service selector with vertical tabs for exterior, interior, and cabinet work. Early action: primary and secondary actions appear close to the opening promise. Primary placement: get a free estimate. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **stack the tabs as labeled service choices, preserve the house image, and keep estimate prompts after each major decision point**. keep first action and service promise early; stack image and service chapters in reading order; make controls touch sized and maintain readable contrast; avoid horizontal overflow.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: service tab selection and review slider; first service and links must remain visible without interaction. Reduced-motion contract: show all service, proof, and contact content without animation. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **dusk-house-hero** ([data-reference-signature=dusk-house-hero]): dusk house hero translated with client-specific content. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **photo-service-selector** ([data-reference-signature=photo-service-selector]): photo service selector translated with client-specific content. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **three-step-painting-process** ([data-reference-signature=three-step-painting-process]): three step painting process translated with client-specific content. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
