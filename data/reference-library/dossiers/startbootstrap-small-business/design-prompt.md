# Reference implementation brief

## Visual hierarchy
Lead with a split opening: a wide, subject-safe image slot on one side and a short business promise, a compact supporting paragraph, and one primary action on the other. Keep the heading scale modest and the body measure generous. Use a neutral sans, white and light gray surfaces, a charcoal navigation and footer, and one clear blue action color. The primary action must be visible without scrolling.

## Page sequence
Open with a dark top bar and the split hero. Follow with a single full-width callout band carrying one sentence. Then present three equal service cards, each with a title, a short paragraph, and one small action. Close with a dark footer. Do not add extra bands between these sections; the reference works because the sequence is short and decisive.

## Responsive translation
At mobile width, stack the image slot, the promise, the action, the callout, and the three cards in that order. Keep the primary action above the fold, preserve card order, and make every control touch-safe. The layout must not introduce horizontal overflow. The desktop split becomes a vertical editorial stack rather than a squeezed two-column grid.

## Signature elements
Carry the split image-and-copy opening, the single full-width callout band, and the three-card service row. Translate each with new-client content and original presentation. The image slot is a placement instruction only; use client-cleared photography, not the source placeholder graphic. Keep one action per card and one primary action in the opening.

## Prohibited patterns
Do not reuse the Start Bootstrap demo copy, placeholder graphics, or source code. Do not invent services, prices, guarantees, locations, staff, or outcomes. Avoid replacing the split opening with an unrelated full-bleed carousel, avoid a generic wall of identical cards, and avoid low-contrast or inaccessible actions.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **Start Bootstrap Small Business: split image-and-copy business page**; family: `startbootstrap-small-business-family`; subject fit: home-services, local-trades, landscaping, contractor, small-business. Production eligibility is unchanged.
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

**mobile: editorial-stack / vertical-copy-media-stack**

```text
[ navigation ]
[ copy + action ]
[ distinct media chapter ]
```

Keep the vertical copy/media relationship and chapter boundaries. Do not collapse the stacked narrative into a conventional split hero.

These are relationship diagrams, not pixel specifications. Resolve alignment, proportions, whitespace and focal crop from the paired captures and original Visual hierarchy. Desktop header plus complete hero must fit 1536 x 864 at normal zoom, even if the source was captured at a taller viewport. Mobile may be content-height driven.

### Page rhythm and content mapping

Keep these assigned chapters in order; the numbers below describe actual page sequence, not decorative labels to add to the site:

1. **dark top navigation**
2. **split image-and-copy hero**
3. **full-width callout band**
4. **three service cards**
5. **dark footer**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: Bootstrap default neutral sans, semibold headings. Body character: same neutral sans. Hierarchy: compact heading scale with generous body measure. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: white; light gray; charcoal. Contrast intent: plain high-contrast business readability. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: wide rectangular image slot. Crop guidance: landscape 3:2 slot. Focal role: subject-safe; replace the slot with client photography. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: three equal service cards. Early action: in the opening field. Primary placement: hero button. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **stack image, copy, callout, then cards in one column**. keep the primary action above the fold; preserve card order; avoid horizontal overflow.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: static-first. Reduced-motion contract: no scroll-dependent reveal. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **split-image-hero** ([data-reference-signature=split-image-hero]): wide image slot beside a short promise and one primary action. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **callout-band** ([data-reference-signature=callout-band]): single full-width statement band between hero and services. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **service-card-row** ([data-reference-signature=service-card-row]): three equal service cards with short copy and one action each. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
