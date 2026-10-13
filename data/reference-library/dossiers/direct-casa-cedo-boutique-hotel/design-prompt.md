# Reference implementation brief: Narrative boutique-house stay

## Scope and non-copy rule

Use the paired direct-site captures as design evidence for a boutique lodging experience presented as a layered house story: warm full-bleed interior opening, a compact editorial welcome, restoration details, a long-form hospitality story, alternating testimonial/image moments, a room-and-experience strip, and a warm footer that resolves into booking/contact. The captured source is Casa Cedo, a Porto hotel. Do not reuse its identity, photos, copy, address, quotes, review score, booking terms, property imagery, hotel names, awards, or exact section text. The requester's attestation permits retaining screenshots and submitting the screenshots to the model as visual reference, but no source-owner grant was attached. Source photography is never client media.

## Visual hierarchy

Open with one intimate, amber-lit room photograph instead of a generic hotel split layout. Keep the mark and booking action restrained at the top edge. Place a short promise in the image, then let the visitor breathe on a pale warm surface before revealing the fuller proposition and a single booking action. Use a high-contrast editorial serif for emotional statements and a neutral small sans for practical details. Build atmosphere through alternating quiet text fields and authentic interior imagery. Prefer complete room/house views, furniture or garden details, editorial pull-quotes only when verified, and elegant crops. The page's long silences and asymmetry are intentional, but each blank passage should retain a visible visual anchor.

## Page sequence

1. Compact wordmark, navigation to Rooms, Experiences, About, and Contact, plus one genuine booking link.
2. Full-bleed or near-full-bleed opening image with a concise hotel/place promise and static poster fallback if a video is used.
3. Short location-led introduction that says what kind of stay the property offers and where it is located.
4. A restoration/design chapter that uses confirmed property history or materials rather than invented heritage.
5. A story chapter about the actual place, hosts, neighborhood or approach, with concise text and one supporting image.
6. A few deliberate service chapters such as rooms, dining, garden, spa or activities, only where offered.
7. Rooms and experiences index with accurate categories, capacity, amenities, dates and booking routes.
8. FAQs answering check-in, booking, cancellation, accessibility, pets, transport and facilities from verified policy.
9. Contact/visit/footer with complete NAP, real hours and working booking links.

## Responsive translation

At 390px, maintain the opening's intimate imagery but scale the promise to fit a comfortable text-safe region. Convert the initial desktop imagery/text relationship to a clean mobile stack where text remains HTML and never relies on a photo's negative space alone. Alternate image and writing in a measured rhythm, but shorten interstitial blank space so the narrative remains coherent on a small screen. Collapse room rows to stacked, labeled options with prices only when confirmed. Any horizontal gallery must have visible controls, swipe support and accessible labels. Keep booking and contact actions reachable without an overlay covering essential content. Verify at 390px and 320px with no horizontal overflow.

## Signature elements

- Image-first hospitality opening, followed by a pale, quiet statement interval.
- Alternating interior, object, garden and story chapters with deliberately varied scale.
- Selective editorial quotations, only with source and permission.
- A tactile room/experience strip whose crops suggest a house rather than a generic inventory grid.
- Warm, low-contrast contact close that still presents legible booking details.

## Prohibited patterns

- Copying Casa Cedo brand, photography, words, restoration story, guest quotations, rating, location or booking details.
- Inventing a hotel history, architecture authorship, destination attribute, amenities, room capacity, availability, pricing, awards or travel time.
- Treating a service area as a physical hotel address or implying a property belongs to the client.
- Unbounded autoplay video or empty whitespace that conceals missing useful sections.
- Carousel-only room discovery, hover-only room details, fake availability timers, or booking buttons that do not link to a real channel.
- Reusing a source site's guest photos as client testimonials or presenting stock visitors as actual guests.

## Local SEO and conversion

Bind the H1/title to the verified accommodation type and actual destination. Use researched local-intent phrases around lodging, room types, nearby places, dining and experiences only when those offerings and location details are confirmed. Distinguish the hotel address from nearby destinations. Keep visible address, booking channel and contact data consistent with structured data and any business profile. Use one primary Book/Check availability route, with a secondary phone or enquiry path. Add location-specific context that helps a visitor plan a stay, not repetitive destination keywords. Every offer, cancellation condition, accessibility detail and amenity must be approved, current, and factual.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **Casa Cedo narrative boutique-house stay**; family: `direct-casa-cedo-boutique-house-story`; subject fit: boutique-hotel, design-hotel, guesthouse, lodging, hospitality. Production eligibility is unchanged.
- Open the paired full-page captures: desktop: `screenshots/desktop.png`, captured viewport 1440 x 900; mobile: `screenshots/mobile.png`, captured viewport 390 x 844. Read the opening at its captured viewport and then inspect the whole page. A full-page image's total height is not CSS vh.
- Use this dossier alone for its route, not an average of the other candidates. Verified client facts, sealed content, accessibility, client font/palette choices and host runtime rules constrain the adaptation. Preserve the assigned composition, section order and signatures; if evidence and prose disagree, identify the conflict rather than silently rewriting the curated contract.
- Separate observed design from proposed client treatment. Do not claim an exact font, hex value, spacing measurement, interaction or animation was observed unless retained evidence supports it. Static captures do not prove scroll, hover or click behavior.

### Opening layout contract

**desktop: media-overlay / copy-over-media**

```text
[ navigation ]
[ media field: copy + action over image ]
```

Keep copy inside the media field, not in a separate adjacent card. Choose a quiet crop or a local contrast plate/scrim; do not move copy outside the image to fix contrast.

**mobile: media-overlay / copy-over-media**

```text
[ navigation ]
[ media field: copy + action over image ]
```

Keep copy inside the media field, not in a separate adjacent card. Choose a quiet crop or a local contrast plate/scrim; do not move copy outside the image to fix contrast.

These are relationship diagrams, not pixel specifications. Resolve alignment, proportions, whitespace and focal crop from the paired captures and original Visual hierarchy. Desktop header plus complete hero must fit 1536 x 864 at normal zoom, even if the source was captured at a taller viewport. Mobile may be content-height driven.

### Page rhythm and content mapping

Keep these assigned chapters in order; the numbers below describe actual page sequence, not decorative labels to add to the site:

1. **hero**
2. **welcome**
3. **press-or-proof**
4. **restoration-details**
5. **about**
6. **story**
7. **property-scenes**
8. **rooms-strip**
9. **contact-footer**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: restrained editorial serif. Body character: light neutral sans. Hierarchy: small uppercase labels, carefully sized hero sentence, narrow long-form story measure, quiet captions. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: warm ivory; pale stone; terracotta. Contrast intent: soft hospitality palette with readable text and booking controls. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: authentic interior, restoration/object detail, garden and room scenes. Crop guidance: full-bleed opening plus alternating small and large narrative image blocks. Focal role: room architecture, material and sense of place. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: rooms and real property experiences as a compact browseable strip, supported by editorial chapters. Early action: within first view, before longer story content. Primary placement: Book your stay in opening navigation and hero. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **single-column narrated house journey**. scale title over image-safe area; alternate copy and images without empty spacer gaps; stack room experiences into clear swipe/stack choices; retain visible booking action; no horizontal page overflow.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: quiet image/story reveal and horizontal room strip navigation. Reduced-motion contract: show all story content in static order; provide video poster where motion exists. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **house-scene-opening** ([data-reference-signature=house-scene-opening]): full-bleed room image with a restrained place-specific promise. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **restoration-story** ([data-reference-signature=restoration-story]): alternating image and concise history/material narrative when verified. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **room-experience-strip** ([data-reference-signature=room-experience-strip]): visually distinct rooms/experiences browse route. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **booking-close** ([data-reference-signature=booking-close]): warm contact footer with direct working booking action. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
