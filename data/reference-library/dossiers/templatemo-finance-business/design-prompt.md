# Reference implementation brief

## Visual hierarchy
Open with a full-bleed office photograph under a dark overlay, a left-aligned white promise, a short supporting paragraph, and one lime action. Above it, keep a slim utility bar and a clean navigation row. Use a friendly geometric sans, white content surfaces, charcoal text, and lime as the single accent. The hero must feel corporate and calm, not salesy.

## Page sequence
Follow the hero with a lime callback strip, three bordered service cards with photographs, a large statistics band, a split about section, two testimonials, a lime callback form, a client-logo strip, and a dark footer. Each band should have one purpose: explain, prove, or convert. Do not repeat the same card treatment across every section.

## Responsive translation
At mobile width, stack the hero, strips, service cards, statistics, about, testimonials, and form in one column. Keep the hero action visible, preserve people-safe photo crops, and avoid horizontal overflow. The statistics band should remain scannable as a short list rather than a squeezed grid.

## Signature elements
Carry the full-bleed corporate photo hero, the statistics band, and the three-card service row. Translate them with client-cleared photography, verified numbers, and real service descriptions. Do not present the source statistics or client logos as the client's own.

## Prohibited patterns
Do not reuse source photography, copy, logos, statistics, or trade dress. Do not invent clients, numbers, awards, or outcomes. Do not copy source code into a client site. Avoid replacing the photo hero with a flat text banner, avoid low-contrast overlaid copy, and avoid a repetitive card wall.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **TemplateMo Finance Business: corporate photo hero with lime system**; family: `templatemo-finance-business-family`; subject fit: accounting, bookkeeping, financial-services, professional-services. Production eligibility is unchanged.
- Open the paired full-page captures: desktop: `screenshots/desktop.png`, captured viewport 1440 x 900; mobile: `screenshots/mobile.png`, captured viewport 390 x 844. Read the opening at its captured viewport and then inspect the whole page. A full-page image's total height is not CSS vh.
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

1. **utility top bar**
2. **inline navigation**
3. **full-bleed hero with overlay**
4. **lime callback strip**
5. **three service cards**
6. **statistics band**
7. **about split**
8. **testimonials**
9. **callback form**
10. **client logo strip**
11. **dark footer**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: bold geometric sans. Body character: same geometric sans. Hierarchy: large but compact corporate hierarchy. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: white; light gray; charcoal; lime green. Contrast intent: clear corporate contrast. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: full-bleed office hero and square service photographs. Crop guidance: cover. Focal role: people-safe and desk-safe. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: three bordered service cards with photographs. Early action: hero and callback strip. Primary placement: hero contact button. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **stack the hero, strips, cards, stats, about, proof, and form**. keep the hero action visible; preserve people-safe photo crops; avoid horizontal overflow.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: restrained. Reduced-motion contract: static. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **corporate-photo-hero** ([data-reference-signature=corporate-photo-hero]): full-bleed office photograph with left-aligned overlay copy and one action. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **statistics-band** ([data-reference-signature=statistics-band]): large-number proof band between services and about. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **service-card-row** ([data-reference-signature=service-card-row]): three bordered service cards with photographs and one action each. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
