# Reference implementation brief: warm image-led restaurant journey

## Scope and non-copy rule

Use the attached official-site captures as visual evidence for page composition, image rhythm, section sequence, typography roles, and conversion placement. Do not reproduce the source restaurant's wordmark, brand colors as a logo system, exact headlines, menu names, dishes, ingredient language, prices, locations, hours, staff, testimonials, rating, review counts, history, or claims. These screenshots are permission-attested internal references, not a client asset library. Do not extract or reuse source photographs, SVGs, logos, review content, or other source assets in a generated client site. Bind facts to sealed client tokens. Use client-provided photography first, then only separately rights-cleared imagery that matches the business.

## Visual hierarchy

Open with a full-width restaurant atmosphere image that feels like arrival. Keep the navigation extremely compact, use a carefully controlled dark image overlay, and place a short editorial headline and the primary reservation, order, or inquiry action where they are immediately legible. Use a high-contrast display serif for restaurant identity and chapter titles, balanced by a quiet sans for practical details. The visual tone should feel warm, crafted, and contemporary rather than like an app dashboard.

Transition into a short story or point of view, then make the menu a real content centerpiece. Pair a readable text-led menu board with one or more large dish images; use clear item, description, and price relationships. Avoid building every dish as an identical image card. A second service such as catering can have its own short visual chapter with a small number of distinct images and concise service descriptions. If the client does not offer catering, use an actually verified service or omit that section. A drinks or dessert list may work when present in the real menu. Use a darker dining-room image as an atmospheric pause before verified review proof and a useful locations, hours, contact, and booking close.

## Page sequence

Choose a coherent sequence based on the actual business: image-led opening with a direct action; short restaurant story; scannable menu or signature offering; one additional service chapter if supported; supporting product or interior photography; optional verified proof; visit details and contact. The reference's sequence is not a mandatory checklist. A cafe may give more space to bakery categories and pickup. A single-location restaurant should not inherit a multi-location chooser. A catering business may make event inquiry primary and move the menu into a supporting section. Keep Services, FAQs, and Contact easy to reach without forcing every business into identical anchors.

## Interaction and motion

Use direct navigation and clear booking/order links. Optional motion is limited to restrained image reveals, menu-tab state, or a manually controlled testimonial rail. The menu, hours, contact details, and service scope must remain available without JavaScript and without hover. Do not auto-advance testimonials, create fake booking slots, embed an unconnected reservation flow, or use scroll-jacking. Any animated reveal must have a reduced-motion fallback and must not delay access to the first action.

## Responsive translation

At 1536 by 864, keep the overlay navigation, concise opening promise, and primary action within the first viewport. Preserve enough of the photograph to create atmosphere without sacrificing contrast. At 390 by 844, retain the sense of an image-led opening while making the headline, navigation, and action easy to read and tap. Stack menu rows with prices and descriptions clearly associated. Recompose the catering or product imagery into a deliberate rhythm, rather than shrinking a desktop triptych. Convert a review rail into touch-safe cards or a readable stack. Place current location, hours, phone, address, and contact links in a practical closing area. Verify no horizontal overflow.

## Signature elements

The transfer target is the combination of an atmospheric dining opening, an accessible editorial menu, a distinct visual chapter for another verified service, and a practical visit-details close. Keep the menu more text-forward than the image sections so it works for visitors and search engines. Use a warm light content surface against selective dark photography and a restrained amber-like accent, but derive the final palette from the client's identity and images. Do not use this source's exact iconography, images, copy, or visual identity.

## Prohibited patterns

Do not invent dishes, ingredients, allergen status, vegetarian or vegan labels, prices, hours, locations, reservations, delivery, catering capacity, customer reviews, awards, restaurant history, or sourcing claims. Do not present AI or stock food photography as the client's real food or venue. Do not copy the original site's slogans or reviews. Do not put critical menu information only in image files, hide it behind hover, make reservation controls nonfunctional, fill the page with repeated rounded cards, or bury practical location details below an unbounded image wall.

## Local SEO and conversion

Use the client's verified business name, cuisine/category, city, service area, address, phone, hours, reservation path, menu, accessibility details, catering scope, and dietary information only when present in approved facts. Make the booking or order route obvious near the first promise and repeat it after useful decision information. Keep visible NAP details aligned with LocalBusiness/Restaurant structured data and the canonical URL. Use descriptive HTML headings for menu and service sections. Never add em dashes.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **Amrit image-led heritage dining and menu journey**; family: `direct-amrit-warm-menu-editorial`; subject fit: restaurant, indian-restaurant, fine-dining, catering. Production eligibility is unchanged.
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

**mobile: media-overlay / copy-over-media**

```text
[ navigation ]
[ media field: copy + action over image ]
```

Keep copy inside the media field, not in a separate adjacent card. Choose a quiet crop, a proving foreground color, or a soft scrim; never box text lines to fix contrast, and do not move copy outside the image.

These are relationship diagrams, not pixel specifications. Resolve alignment, proportions, whitespace and focal crop from the paired captures and original Visual hierarchy. Desktop header plus complete hero must fit 1536 x 864 at normal zoom, even if the source was captured at a taller viewport. Mobile may be content-height driven.

### Page rhythm and content mapping

Keep these assigned chapters in order; the numbers below describe actual page sequence, not decorative labels to add to the site:

1. **dining-room-hero-and-actions**
2. **restaurant-story**
3. **signature-menu-and-dish-images**
4. **catering-offerings**
5. **drinks-list-and-photography**
6. **gift-or-occasion-path**
7. **interior-atmosphere-chapter**
8. **guest-proof**
9. **locations-hours-contact-footer**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: high-contrast editorial serif for hospitality chapters and menu display. Body character: restrained clean sans for item notes, operating details, and controls. Hierarchy: large but elegant section titles, small utility labels, compact menu list with distinct item/price hierarchy. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: warm parchment; saffron ochre; deep espresso; photographic black-brown. Contrast intent: light text over a controlled hero overlay and dark food images; menu text remains high-contrast on a warm light surface. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: cinematic dining-room hero, large food images, catering activity triptych, drinks portraits, and a dark interior chapter. Crop guidance: wide cover hero and varied wide/portrait food and hospitality crops. Focal role: preserve food or hospitality activity as the focal subject; the source photos are visual evidence only, not client photography. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: text-forward item list with concise description and aligned price, contrasted against large food images; catering is grouped into a small number of photographic service chapters. Early action: offer the most relevant booking path beside the opening promise, without forcing users to choose between multiple locations unless the business has them. Primary placement: reservation or order choice appears in the opening and repeats at menu or closing decision points. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **long single-column restaurant journey with compact menu actions and full-width photography**. keep a short promise and the primary reserve/order route near the top; allow menu rows to stack with price and description visibly associated; stack catering imagery without shrinking labels below comfortable reading size; turn drink and guest-review rails into swipe-safe or stacked content with visible controls; keep location, current hours, and contact information easy to scan in the footer.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: subtle section reveals and optional review carousel; no movement is required to read menu or location details. Reduced-motion contract: show static images and all reviews or menu information; no autoplay or scroll-jacking. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **dining-image-opening** ([data-reference-signature=dining-image-opening]): broad hospitality image opening with concise promise and direct action. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **menu-board** ([data-reference-signature=menu-board]): accessible text-led menu hierarchy with verified prices when provided. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **service-photo-chapter** ([data-reference-signature=service-photo-chapter]): small editorial image sequence for an additional service such as catering, only when offered. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **visit-details-close** ([data-reference-signature=visit-details-close]): practical location, hours, and contact close using verified facts. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
