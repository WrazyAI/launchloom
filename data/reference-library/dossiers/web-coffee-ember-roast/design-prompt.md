# Reference implementation brief

## Visual hierarchy
Lead with a single featured coffee or blend as the hero. Use a high-contrast serif display for the opening headline against a clean neutral sans body on warm cream surfaces with deep espresso ink and one warm accent. Keep a single primary action visible in the opening and repeat one secondary action only at useful decision points.

## Page sequence
Open with the featured product hero, then a roastery-story band built as a small labeled value grid (sourcing, roasting, specialty coffee, brewing, goods). Follow with a recurring-delivery band, a locations band, a testimonial band, and a community or newsletter close. Each band should carry one clear action rather than several competing links.

## Responsive translation
At mobile width, stack the editorial bands into vertical chapters. Preserve the opening hierarchy, keep the hero image subject-safe, make every action touch-safe, and avoid horizontal overflow. Do not collapse the value grid into an indistinct wall of identical cards.

## Signature elements
Carry the single-feature editorial hero, the labeled value grid, and the recurring-delivery band as the reference's visible signatures. Translate each with new-client content and original presentation; do not copy the source's words, imagery, or trade dress.

## Prohibited patterns
Do not reuse the source brand, copy, logo, photographs, testimonials, or trade dress. Do not invent awards, prices, locations, staff, or outcomes. Avoid generic repeated cards that erase the editorial rhythm and low-contrast or inaccessible mobile actions.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **Ember Roast Coffee Co.: editorial single-coffee hero on warm cream**; family: `web-coffee-ember-roast-family`; subject fit: coffee-shop, cafe, specialty-coffee, coffee-roaster. Production eligibility is unchanged.
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

1. **featured-coffee hero**
2. **roastery story grid**
3. **subscription band**
4. **locations band**
5. **testimonials**
6. **community newsletter close**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: high-contrast serif display for headings. Body character: clean neutral sans for body. Hierarchy: large editorial opening with clear section titles and comfortable measure. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: warm cream; white. Contrast intent: legible body and actions on warm surfaces. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: large single-feature photograph with supporting product and lifestyle images. Crop guidance: subject-safe hero crop with a product grid below. Focal role: keep faces and text clear of each other. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: story-led bands each with one primary action (shop, subscribe, visit). Early action: near the opening promise. Primary placement: shop the featured coffee. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **stack editorial bands into vertical chapters with outlined actions**. keep the first action visible and touch-safe; use subject-safe image crops; avoid horizontal overflow and collapsed hierarchy.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: restrained fade or static-first. Reduced-motion contract: all content visible without scroll-dependent reveal. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **featured-coffee-hero** ([data-reference-signature=featured-coffee-hero]): Translate the single-feature editorial hero with client-cleared content. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **roastery-story-grid** ([data-reference-signature=roastery-story-grid]): Translate the labeled value grid with new-client content. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **subscription-band** ([data-reference-signature=subscription-band]): Translate the recurring-delivery band with a single clear action. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
