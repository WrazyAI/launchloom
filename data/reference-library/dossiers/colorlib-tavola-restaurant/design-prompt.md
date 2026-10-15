# Reference implementation brief: Tavola menu-led hospitality

## Scope and non-copy rule

Use the paired screenshots as evidence for page rhythm, hierarchy, image choreography, and interaction mechanics only. Do not reproduce the Tavola name, wording, menu entries, dishes, address, hours, fees, staff, reviews, or recognizable brand identity. All client-specific facts must come from sealed content tokens and the client's submitted assets. The reference's photographs are licensed for this reference record, not as client premises or client menu imagery. Use the client's photos first, then only approved subject-matched assets.

## Visual hierarchy

Open with a slim, factual status strip and a restrained wordmark header. Make the first image broad and atmospheric, with a clear text-safe region for one concise promise. The hero should feel like a restaurant's front door rather than an app dashboard. Keep the primary booking or order-inquiry action visible beside a lighter menu-browsing action.

Make the accessible menu board the visual centerpiece. Use a quiet paper-toned panel, editorial serif section titles, compact uppercase labels, and a deliberate row rhythm. Menu items should read as text with one short note and a clear price, not as a wall of image cards. A hairline or dotted leader can connect an item name to its price.

## Page sequence

Use this sequence when it matches the business: opening promise and status, category-led menu or product offering, a short kitchen/craft story, selected room or product imagery, reservation or enquiry, visit details and useful questions, then a compact footer. For a bakery or cafe, categories can represent actual menu periods, baked goods, beverages, or dietary groups. Do not force restaurant-specific sections into a business where they are not useful.

## Interaction and motion

Use ordinary, accessible category tabs and native date, time, or booking controls. Provide clear active states and keyboard operation. Motion should be quiet: small tab transitions, focus feedback, and optional reduced-motion-safe reveals. Keep the menu legible with JavaScript unavailable and do not use scroll-jacking, carousels as the only way to find an item, or hover-only information.

## Responsive translation

At 1536 by 864, keep the navigation, promise, and primary action within the opening viewport. At 390 by 844, stack the copy and image composition deliberately, retain both booking and menu actions, and make every price legible. Let the menu categories wrap or use a touch-safe horizontal row that does not clip. Stack menu rows, booking fields, and visit details. Recompose the room mosaic vertically while preserving varied image scale and whitespace. Confirm there is no horizontal overflow at 390 pixels.

## Signature elements

Preserve the thin operating-status strip, broad photo-led opening, large text-led menu board with tabbed categories, asymmetric room/food image rhythm, and separate practical booking/visit close. At most one of these may be simplified when the client's real content lacks the corresponding material.

## Prohibited patterns

Do not transfer the reference business name, sample copy, location, prices, dishes, hours, dietary statements, reviews, staff, or claims. Never present stock food or room imagery as the client's actual offerings or premises. Do not fabricate a menu, reservation system, delivery service, open status, or sourcing story. Do not replace a readable menu with an image or a generic card wall.

## Local SEO and conversion

Bind service names, item names, prices, hours, location, phone, email, dietary notes, and booking rules to verified content only. Put a real primary action close to the promise. Show a street address or map only when supplied and verified; a service area is not a storefront. Use an HTML menu, clear internal anchors, a descriptive page title, and matching visible and structured business details. Never add em dashes.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **Tavola service-time menu board**; family: `colorlib-tavola-menu-editorial`; subject fit: restaurant, cafe, bistro, local-food. Production eligibility is unchanged.
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

1. **hero-and-status**
2. **service-period-menu**
3. **kitchen-story**
4. **room-and-food-mosaic**
5. **reservation**
6. **visit-details-and-faq**
7. **footer**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: system editorial serif for the main promise, section headings, and dish names. Body character: neutral system sans-serif for descriptions, metadata, and form labels. Hierarchy: large but restrained hero type, small uppercase rules, compact menu labels, clear price alignment. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: warm ivory; pale sage-gray; deep green-black. Contrast intent: light paper-like content surfaces over a dark status strip, with one warm action accent. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: wide hero photography, one split editorial kitchen image, then a room and dish mosaic. Crop guidance: cover crop for the hero; irregular square and landscape crops in the mosaic. Focal role: keep the dining/food subject legible behind a soft text-safe gradient; use mosaic images as atmosphere, not as evidence of the client's venue. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: service-period tabs followed by course headings and menu rows. Early action: the first viewport should offer the primary action without hiding the menu path. Primary placement: reservation or order inquiry appears in the hero and at the dedicated booking point. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **single-column menu-led page with readable price rows**. stack hero copy before the secondary menu action while preserving the image focal area; allow service tabs to wrap or scroll without hiding category labels; keep prices aligned and descriptions readable as menu rows stack; turn the mosaic into an intentional vertical sequence; stack booking fields and visit details without horizontal scrolling.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: native menu tabs and date/time controls with quiet state changes. Reduced-motion contract: all content remains visible and controls work without transition effects. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **service-menu-board** ([data-reference-signature=service-menu-board]): a prominent, accessible service or menu board with category and item hierarchy. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **status-strip** ([data-reference-signature=status-strip]): a concise factual operating or next-step strip, using verified hours only. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **room-mosaic** ([data-reference-signature=room-mosaic]): an asymmetric set of client-owned or licensed venue/food imagery. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **reservation-close** ([data-reference-signature=reservation-close]): a practical booking or inquiry close with verified visit details. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
