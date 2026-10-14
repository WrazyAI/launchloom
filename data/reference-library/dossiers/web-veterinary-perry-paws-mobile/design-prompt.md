# Visual hierarchy

Design for a confirmed independent practice or house-call veterinarian with an approachable, personal voice. Put the actual service model first, then a concise sentence about who is served, a booking action, and only then a large image. A balanced two-column desktop opening can use a large rounded documentary crop, but the image should not delay the promise. Use warm neutrals, one client-appropriate dark color, restrained soft accents, and humanist sans-serif type. Exact hues, logo, source animal images, reviews, certification, and copy are not transferable.

# Page sequence

Open with service model and visit request; add a short trust or logistics statement; present the available services as a ruled list; provide authentic proof or explain the visit process; show a small client-approved pet image group if available; and close with coverage and contact details. Pricing can appear only when supplied by the client and kept current. Separate service explanations rather than repeating a single reassurance in each section. The visitor should understand whether the clinic travels, sees patients at a location, or provides telehealth before reaching an action.

# Responsive translation

Desktop uses breathing room and a copy-before-photo balance. Mobile stacks the heading, service sentence, primary action, image, and service rows in that order. Rows should wrap and remain touch-safe, with a short distinct description and real link. Do not shrink service text or use two columns on a narrow viewport. Put eligibility and travel-area details beside the relevant action. Reflow testimonials as readable excerpts and use a still image fallback for any interactive content.

# Signature elements

Carry forward a visit-first promise, a ruled service index with directional links, and a clear service-area confirmation step. Do not interpret the reference as permission to make a business mobile. Link the area check to a real form or verified contact route; never ask a person to submit sensitive pet or health information in an unsupported channel. Use a real image of the client practice or an approved image generated from the verified service context.

# Prohibited patterns

Do not reuse the source's visual identity, name, photos, testimonials, fear-free badge, service area, hours, prices, medical scope, or exact prose. Do not invent travel ranges, urgent slots, qualifications, or clinical outcomes. Avoid a fixed bottom action bar that obscures content, repetitive service cards, fake star reviews, and house-call language when the client runs a clinic-only business. A home photograph must not be presented as the client's premises.

# Local SEO and conversion

Use the confirmed service mode, species, and neighborhoods served in title, H1, service pages, and contact route. Clearly distinguish service area from office address. Link each core service to a substantive explanation with one useful next step. Keep phone and booking details identical in the page, footer, and structured data. Do not make thin city pages by mechanically swapping location names.

# Verification

At 1536 by 864, verify that the opening headline, action, and image fit without requiring browser zoom. At 390 by 844, verify that the same order is preserved and descriptions wrap without horizontal scroll. Test all service links, contact actions, menu state, contrast, keyboard focus, and reduced-motion behavior. Audit proof, home-visit claims, area, price, hours, and credentials against client-supplied facts.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **Independent mobile veterinarian with service rows and at-home visit emphasis**; family: `veterinary-mobile-house-call`; subject fit: mobile veterinarian, house-call veterinary service, in-home pet care, independent veterinary practice, veterinary. Production eligibility is unchanged.
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

**mobile: type-led-statement / copy-leads-opening**

```text
[ navigation ]
[ dominant typographic statement ]
[ supporting detail + action ]
```

Typography carries the opening. Preserve scale contrast and deliberate line breaks; do not add a stock-photo hero merely because image tokens exist.

These are relationship diagrams, not pixel specifications. Resolve alignment, proportions, whitespace and focal crop from the paired captures and original Visual hierarchy. Desktop header plus complete hero must fit 1536 x 864 at normal zoom, even if the source was captured at a taller viewport. Mobile may be content-height driven.

### Page rhythm and content mapping

Keep these assigned chapters in order; the numbers below describe actual page sequence, not decorative labels to add to the site:

1. **promise and visit action**
2. **care reassurance**
3. **ruled service index**
4. **client-proof chapter**
5. **paired pet imagery**
6. **service-area and contact footer**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: humanist sans with moderate weight. Body character: high-legibility sans. Hierarchy: fluid but restrained heading and short row labels. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: warm ivory; soft blush; pale mint; deep green. Contrast intent: calm surfaces, readable paragraphs, and dark text on every button. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: one personal home-visit photo and a small pair of pet portraits. Crop guidance: rounded large desktop crop with subject-centered mobile placement. Focal role: keep the pet and caregiver together without overlaying service text. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: two-column ruled service index on desktop, full-width labeled service rows on mobile. Early action: primary action sits alongside the opening promise. Primary placement: request an at-home visit. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **move headline, promise, and action first, then stack the hero image and thin service rows**. show service-area qualifications near the action; allow service descriptions to wrap without truncation; keep pet imagery after the promise rather than before it; do not pin an overlapping action rail.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: quiet link feedback and responsive menu disclosure. Reduced-motion contract: keep content fully visible and remove nonessential transitions. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **visit-first-promise** ([data-reference-signature=visit-first-promise]): A clear at-home or in-clinic service promise precedes the hero image and identifies who the practice helps. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **ruled-service-index** ([data-reference-signature=ruled-service-index]): Core services appear as clean rows with a short scope statement and useful destination. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **service-area-confirmation** ([data-reference-signature=service-area-confirmation]): Coverage is stated accurately and the next step clarifies how an address or service-area fit is confirmed. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
