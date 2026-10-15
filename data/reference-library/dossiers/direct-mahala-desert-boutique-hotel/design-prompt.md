# Reference implementation brief: playful desert-boutique hospitality

## Scope and non-copy rule

Use the official source captures as visual evidence for color blocking, image choreography, graphic illustration, booking placement, and section rhythm only. Do not reproduce the Mahala name, sun logo, wordmark, proprietary illustration, hero video, property photos, room labels, amenities, rates, copy, address, products, or booking claims. The requester attested that this screenshot and derived-prompt use is cleared for LaunchLoom's internal pipeline, but source photographs and identity are not client assets. Use real client property imagery first, or separately licensed, subject-matched imagery. If the business does not own rooms or accommodation inventory, do not use the source room-card structure literally.

## Visual hierarchy

Create a compact wordmark header and one direct booking or inquiry action. Let a vivid but controlled atmospheric hero carry the first impression: botanical, architectural, or product-focused imagery can work when genuinely relevant, but it must have a static poster fallback, readable text contrast, and no audio. Pair a concise welcome promise with the scene instead of overlaying long paragraphs. Use one expressive brand graphic or illustration beside a short place story, followed by a tightly curated property-photo atlas with an energetic but deliberate rhythm. Saturated yellow, cream, tropical green, orange, and pool tones can create a playful retro mood, but the final palette must come from the client's identity and actual photography.

After the atlas, use one darker photographic pause and then a small, well-composed offering chapter. In lodging this could be real rooms, each with a photo, verified room name, a few confirmed amenities, and a working booking route. For a different hospitality business, replace the room grid with its actual services or experiences. A separate contact inquiry and optional shop can follow only when they have real, working business functions. The aim is an identifiable world, not a generic booking template or repeated card wall.

## Page sequence

Recommended sequence: expressive image/video hero; illustrated or graphic place story; curated property/photo atlas; one cinematic interior scene; verified room/service offering index; contact or booking inquiry; optional real shop or gift offer; footer. Keep the image atlas and room detail sections distinct. A boutique restaurant may replace the room index with a menu and private-dining offer; a spa may show treatment rooms and services. Do not add merchandise, facilities, pools, room types, or gift cards unless the business actually offers them.

## Interaction and motion

Use one muted, optional hero video or background loop only if it is provided or licensed for this client. Always ship a poster frame, respect reduced-motion and data-saving settings, avoid autoplay audio, and do not let a video block text or booking actions. The gallery must have a static/scrollable mode and usable keyboard/touch controls. Room or service actions should link to a real detail or inquiry path. Do not add parallax to every section, scroll-jacking, fake booking widgets, or a shop button without a real catalog and checkout.

## Responsive translation

At 1536 by 864, retain the succinct header, scene-led promise, and booking action in the opening. Keep the illustration/story and mosaic composition separate enough to understand. At 390 by 844, stack the illustration beside rather than underneath long paragraphs in a way that remains balanced; allow the photo atlas to become a vertical sequence of varied but appropriately sized tiles; stack each real room/service card; and keep booking accessible without an overlay blocking the page. Use readable text sizes over patterned surfaces, and use solid contrast backplates where needed. Do not force landscape orientation. Confirm there is no horizontal overflow.

## Signature elements

Preserve the contrast of a tiny functional wordmark header, atmospheric hero, custom graphic place vignette, dense but intentional photo atlas, dark cinematic image pause, and a concise set of real offerings. The pattern and illustration should be custom client identity, not traced from the reference. Make the page feel like a specific hospitality destination with brand color and image-led storytelling rather than a generic room-booking interface.

## Prohibited patterns

Do not copy the source logo, sun mark, illustration, foliage video, photographs, room or product names, amenity lists, rates, location, or page copy. Do not invent lodging details, price, capacity, policies, on-site amenities, or availability. Do not present generated/stock images as the client's actual property. Do not use autoplay-only content, unreadable over-patterned text, sticky booking UI that obscures content, an unrelated merchandise shop, or a uniform wall of rounded cards. Motion must never be necessary to read a room/service description or book.

## Local SEO and conversion

Use verified property name, lodging category, destination, address, phone, check-in/contact details, accessibility, rooms, amenities, and booking path. Keep visible facts consistent with Hotel/LocalBusiness structured data and canonical URL. Place one truthful booking/inquiry route in the opening and next to real room/service choices. Use descriptive headings for destination, rooms/services, contact, and FAQs. Never add em dashes.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **Mahala playful desert-resort visual world**; family: `direct-mahala-desert-resort-pop`; subject fit: boutique-hotel, resort, motel, lodging, hospitality. Production eligibility is unchanged.
- Open the paired full-page captures: desktop: `screenshots/desktop.png`, captured viewport 1536 x 864; mobile: `screenshots/mobile.png`, captured viewport 390 x 844. Read the opening at its captured viewport and then inspect the whole page. A full-page image's total height is not CSS vh.
- Use this dossier alone for its route, not an average of the other candidates. Verified client facts, sealed content, accessibility, client font/palette choices and host runtime rules constrain the adaptation. Preserve the assigned composition, section order and signatures; if evidence and prose disagree, identify the conflict rather than silently rewriting the curated contract.
- Separate observed design from proposed client treatment. Do not claim an exact font, hex value, spacing measurement, interaction or animation was observed unless retained evidence supports it. Static captures do not prove scroll, hover or click behavior.

### Opening layout contract

**desktop: media-overlay / copy-over-media**

```text
[ navigation ]
[ media field: copy + action over image ]
```

Keep copy inside the media field, not in a separate adjacent card. Choose a quiet crop, a proving foreground color, or a soft scrim; never box text lines to fix contrast, and do not move copy outside the image.

**mobile: modular-image-field / coordinated-image-windows**

```text
[ navigation ]
[ promise + coordinated media windows ]
```

Treat the image windows as one coordinated composition with distinct crops and spatial hierarchy, not as an interchangeable card grid.

These are relationship diagrams, not pixel specifications. Resolve alignment, proportions, whitespace and focal crop from the paired captures and original Visual hierarchy. Desktop header plus complete hero must fit 1536 x 864 at normal zoom, even if the source was captured at a taller viewport. Mobile may be content-height driven. The existing topology is medium-confidence: Screenshot shows overlapping layout mechanics; preserve the hybrid treatment rather than flattening it to this primary topology.

### Page rhythm and content mapping

Keep these assigned chapters in order; the numbers below describe actual page sequence, not decorative labels to add to the site:

1. **botanical-video-or-poster-hero**
2. **illustrated-place-introduction**
3. **dense-property-photo-atlas**
4. **cinematic-room-scene**
5. **room-or-service-offerings**
6. **contact-inquiry**
7. **optional-products-or-gift-shop**
8. **footer**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: rounded, friendly display sans or expressive wordmark treatment paired with compact neutral sans. Body character: clean sans with high readability against saturated patterned surfaces. Hierarchy: short central hero message, compact top navigation, clear room names, and readable amenity bullets. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: sunset ochre; warm pale yellow; deep tropical green; cream; dark foliage. Contrast intent: bold color blocking with readable foregrounds; avoid light text on busy patterns without a solid backing. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: muted looping botanical hero, illustrated place vignette, dense photo atlas, cinematic room still, and close-up interiors. Crop guidance: a mix of compact portrait tiles, landscape room stills, and full-bleed cinematic scenes. Focal role: maintain a clear subject inside each mosaic cell; use client-owned venue and room imagery, not source-site photography. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: room or hospitality offerings appear as a small grid of editorial cards with real photos, clear names, concise amenity facts, and a direct detail/booking action. Early action: make one real booking or inquiry action immediately findable without allowing the colorful identity to obscure it. Primary placement: direct booking route in the top navigation and repeated beside actual room or service decisions. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **long portrait sequence with the illustrated story, mosaic, cinematic room, room offerings, contact, and optional shop stacked in order**. keep the small brand and booking action readable at the top; stack illustration and narrative rather than shrinking them side by side; make the photo atlas scroll vertically with distinct tile sizing and no forced horizontal page movement; stack room/service cards with adequate text and touch target sizes; replace the hero video with a still on data saver or reduced motion and keep text legible.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: muted looping hero video paired with a still image and editorial scrolling chapters. Reduced-motion contract: replace video with a still poster, avoid parallax, and preserve the same booking and image content. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **botanical-poster-hero** ([data-reference-signature=botanical-poster-hero]): expressive atmospheric hero with static poster fallback and direct action. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **illustrated-place-card** ([data-reference-signature=illustrated-place-card]): custom illustration or graphic vignette paired with concise place narrative. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **property-photo-atlas** ([data-reference-signature=property-photo-atlas]): dense but intentionally paced client-property image composition. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **offering-detail-grid** ([data-reference-signature=offering-detail-grid]): small set of verified rooms, services, or offerings with direct actions. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
