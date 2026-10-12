# Visual hierarchy

Use the paired homepage screenshots and Reference DNA as evidence for the order, spacing, image relationship, and conversion rhythm of a local homecare experience. Build in the calm, personal care recipe: warm neutral surfaces, readable type, generous space, authentic context, and a low-pressure first conversation. Open with a concise statement of the client's verified service beside one dignified homecare image. Keep one primary consultation action and one useful secondary contact option near that promise. A small proof strip may follow only when the client supplied verifiable facts. Use contrast and headline scale for fast scanning; do not borrow the source's saturated yellow, logo, type, exact language, photographs, caregiver identities, review content, awards, or graphic details.

# Page sequence

Translate the source's decision path into: opening promise and contact actions; a compact trust or service-area statement based on verified facts; an easy-to-scan service index; a human explanation of the provider's approach; practical support about how an initial conversation works; relevant family questions; and a direct contact close. Keep each section distinct. Do not repeat one care claim through the hero, proof strip, provider story, and CTA. Reviews, staff profiles, credentials, awards, client outcomes, service areas, hours, and accreditations appear only when the client has supplied or independently verified them. A source-style video or carousel is optional and must never delay the useful page content.

# Responsive translation

On desktop, balance a short text field and one broad image in the opening, then shift to a readable service index and alternating editorial chapters. At mobile widths, place the promise and primary action before long supporting text, stack the image without awkward crops, and convert service choices into clear rows with generous touch targets. Keep contact actions available at meaningful decision points. Use static images by default; any carousel needs visible controls and a still fallback. Ensure the full page remains inside the viewport width and that headings, form labels, and button text retain strong contrast.

# Signature elements

Preserve a warm first impression, an early conversation action, a clearly grouped set of care options, and a later decision-support chapter before the closing contact band. The source alternates human imagery and concise information, but a client page should use only the photographs it supplied or separately cleared. Replace the source's award, review, and news rows with real client evidence or omit those chapters. Make the visitor's next step understandable without requiring a video, carousel, or account.

# Prohibited patterns

Do not reproduce source copy, identity, wordmark, exact palette, photographs, people, reviews, award marks, locations, claims, service availability, or page trade dress. Never invent caregivers, qualifications, outcomes, response times, prices, guarantees, or coverage. Do not describe service areas as physical offices. Avoid a wall of repeated cards, duplicated reassurance, unreadable text over images, autoplay media, and decorative number labels. Keep homecare language distinct from clinical treatment. Generated content must contain no em dash.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **Kingsway Care homecare service story**; family: `attested-kingsway-care-home-care`; subject fit: home care, homecare, in-home care services, home-care. Production eligibility is unchanged.
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

1. **utility and navigation**
2. **split care promise**
3. **trust and award strip**
4. **service index**
5. **provider story**
6. **family conversation action**
7. **client proof**
8. **film and specialist topics**
9. **awards and news**
10. **closing action and footer**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: friendly bold sans headline. Body character: compact neutral sans. Hierarchy: short stacked promise, small utility labels, centered section titles. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: saturated golden yellow; white; cool light gray. Contrast intent: clear dark text on bright brand fields with separate neutral information chapters. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: documentary caregiver, client, founder, and community photographs. Crop guidance: wide hero crop followed by contained landscape chapter images. Focal role: keep care recipient and caregiver faces readable and dignified. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: short linked service tiles followed by a plain specialist-topic index. Early action: repeat after the family decision-support chapter and in the closing band. Primary placement: consultation action in the opening promise. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **single-column care chapters**. keep the promise and contact actions before the first long scroll; stack the service index as readable rows; keep photographs adjacent to their supporting copy; make all rails touch controlled; avoid horizontal overflow.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: user-controlled review and award rails with optional embedded film. Reduced-motion contract: keep all content visible in static rows and show a film still without autoplay. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **split-care-promise** ([data-reference-signature=split-care-promise]): short service promise paired with an adjacent human-scale care image and early action. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **care-service-index** ([data-reference-signature=care-service-index]): scannable service choices with direct next steps. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **family-decision-band** ([data-reference-signature=family-decision-band]): reassuring conversation prompt after explanatory content. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **care-chapter-close** ([data-reference-signature=care-chapter-close]): clear closing contact region before the footer. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
