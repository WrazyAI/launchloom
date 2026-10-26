# Reference implementation brief: Orgarden split garden services

## Visual hierarchy

A deep green navigation sits over a large garden photograph, with the promise and actions held on the right side of the opening. Use a large but compact statement, a short supporting line and a clear primary contact action. The next chapter uses a centered editorial about block, followed by a six-card service grid, a four-person team row, a full-width contact form over imagery, testimonial cards and a dark green footer. The visual language is calm and botanical: white and pale surfaces, saturated green actions, simple line icons and generous photographic proof. Demo people, project imagery, phone numbers and claims are source-only and must not be presented as client facts.

## Page sequence

Keep the observed chapter order: navigation, split garden hero, about, service grid, team row, contact form, testimonial, footer. The opening must explain the service and make the next step obvious. Services should be grounded in the client's verified list. The team row may use only approved owner or staff imagery; never use template people as client staff. The contact form must connect to the real approved lead path and request only useful information.

## Responsive translation

At 390px, keep the wordmark and menu control visible, stack the promise and actions over or before the image, collapse navigation into a deliberate menu, turn the service grid into readable single-column or two-column cells, and keep the contact form reachable. Preserve image crops inside their containers and avoid page-level horizontal overflow at 390px and 320px. Do not use a fixed-height clipping box for the hero. Keep all controls keyboard reachable and preserve a reduced-motion equivalent.

## Signature elements

- A split garden opening with the promise and primary contact action visible.
- A service grid whose items map to verified client services.
- A team row using only approved people imagery, or a truthful non-person treatment.
- A contact close with a real lead path.

## Prohibited patterns

- Copying the Orgarden brand, source copy, demo people, phone numbers, prices, reviews, project names or claims.
- Presenting stock or template people as the client's staff, customers or completed work.
- Using garden photography as proof of a client project.
- Inventing guarantees, service windows, licenses, reviews or coverage.
- Turning every chapter into an identical rounded card.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **Orgarden split garden services**; family: `orgarden-gardening-services`; subject fit: landscaping, garden-design, lawn-care, property-maintenance, local-trades, home-services. Production eligibility is unchanged.
- Open the paired full-page captures: desktop: `screenshots/desktop.png`, captured viewport 1440 x 1000; mobile: `screenshots/mobile.png`, captured viewport 390 x 844. Read the opening at its captured viewport and then inspect the whole page. A full-page image's total height is not CSS vh.
- Use this dossier alone for its route, not an average of the other candidates. Verified client facts, sealed content, accessibility, client font/palette choices and host runtime rules constrain the adaptation. Preserve the assigned composition, section order and signatures; if evidence and prose disagree, identify the conflict rather than silently rewriting the curated contract.
- Separate observed design from proposed client treatment. Do not claim an exact font, hex value, spacing measurement, interaction or animation was observed unless retained evidence supports it. Static captures do not prove scroll, hover or click behavior.

### Opening layout contract

**desktop: split-media / side-by-side-fields**

```text
[ navigation ]
[ copy + action | separate media field ]
```

Keep copy and the focal media region as distinct adjacent fields on desktop. Match their hierarchy and relative occupancy to the capture; do not default to equal-width columns, a boxed copy card or centered copy over the focal subject. The original observations clarify any background image extending beyond its focal region.

**mobile: media-overlay / copy-over-media**

```text
[ navigation ]
[ media field: copy + action over image ]
```

Keep copy inside the media field, not in a separate adjacent card. Choose a quiet crop, a proving foreground color, or a soft scrim; never box text lines to fix contrast, and do not move copy outside the image.

These are relationship diagrams, not pixel specifications. Resolve alignment, proportions, whitespace and focal crop from the paired captures and original Visual hierarchy. Desktop header plus complete hero must fit 1536 x 864 at normal zoom, even if the source was captured at a taller viewport. Mobile may be content-height driven. The existing topology is medium-confidence: inspect the documented hybrid composition before applying the label rigidly.

### Page rhythm and content mapping

Keep these assigned chapters in order; the numbers below describe actual page sequence, not decorative labels to add to the site:

1. **navigation**
2. **split-opening**
3. **who-we-are**
4. **service-offerings**
5. **people**
6. **enquiry-form**
7. **client-voices**
8. **footer**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: large clean sans heading with a calm local-service voice. Body character: readable neutral sans. Hierarchy: compact opening statement, clear section labels and readable service metadata. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: white; pale garden neutral; deep forest green. Contrast intent: dark green actions on light surfaces with legible body copy. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: split garden photography with contained service imagery. Crop guidance: split opening image; contained service and team images. Focal role: gardens and planting detail; source people are never client staff. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: service grid followed by a clear contact close. Early action: inside the split opening panel. Primary placement: contact action in the opening and contact close. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **stack the split opening, service offerings and enquiry form while keeping the primary action visible**. keep the promise and contact action before long service detail; collapse the navigation into a readable menu; stack service cards without horizontal page overflow; preserve image crops inside their containers.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: native menu, hover and image reveal. Reduced-motion contract: all services, contact details and imagery remain visible without transitions. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **split-garden-hero** ([data-reference-signature=split-garden-hero]): a garden photograph shares the opening with the promise and actions. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **service-card-grid** ([data-reference-signature=service-card-grid]): services are presented as a clear grid with concise factual descriptions. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **team-row** ([data-reference-signature=team-row]): approved team or owner imagery is shown as a readable row, never as stock clients. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
