# Reference implementation brief: Circular dining atlas

## Scope and non-copy rule

Use the paired direct-site captures to study a locally anchored restaurant experience built around a busy full-bleed dining scene, large circular navigation targets, a direct story, a cinematic food chapter, editorial news, catering and team choices, review/gallery chapters, and clear ordering/location routes. The source is Ethos Greek Bistro. Do not reproduce its name, logo, location list, photographs, Greek menu text, ratings, testimonials, claims, event offers, or exact layout. The user has attested to internal screenshot and visual-reference use; none of the source's branding, copy, or media files are client assets. All local business facts, SEO terms, menu information and conversion behavior must be verified and sealed.

## Visual hierarchy

Lead with one atmospheric, full-width dining photograph and a quiet top utility bar. Place four or five outlined circular anchors over calm regions of the image, each representing an actual visitor task such as Menu, Reservations, Catering, Visit, or Story. Use only routes the client truly supports. Below, transition to a restrained paper surface with a short, factual restaurant introduction. A dark, cinematic food image can form the emotional middle of the page, followed by a compact editorial update rail and a three-part action section for ordering, events/catering, or visiting. Keep the content hierarchy useful before adding any lime or circular decoration.

## Page sequence

1. Utility/navigation row and immersive dining image with clear text navigation plus distinct circular shortcuts.
2. Concise restaurant identity and verified local positioning.
3. One food, space, or cooking-process image chapter that adds atmosphere without burying menu and location details.
4. A small journal/event update rail only if the business maintains current content.
5. Separate routes for dining, order/takeout, catering/events and careers only when these are actual services.
6. A short proof/review surface only for authentic, permissioned customer feedback; ratings must match the source and remain current.
7. Menu or signature categories with the names, prices, allergens and availability the client confirms.
8. Address, hours, accessible directions, phone and reservation/order actions.

## Responsive translation

At 390px, preserve the dining image and recognizable circular navigation idea without shrinking circles below comfortable touch size. If five circles do not fit, place two or three visible actions over the photo and move remaining anchors into a clear text strip immediately below. Keep the restaurant identity and primary reservation/order action in the first sequence. Convert the update rail and menu gallery into touch-safe horizontal rails with visible controls or stack them into clear groups; never crop content to mask overflow. Stack catering/order/visit choices, then show verified address and hours. Verify at 390px and 320px with no horizontal page overflow.

## Signature elements

- Immersive dining photograph with task-specific circular navigation targets.
- Calm editorial welcome section after the vivid opening.
- One grayscale or low-saturation food/process film chapter with a still poster fallback.
- Distinct ordering, catering/event, visit and menu routes presented as real tasks.
- Broad food gallery as the closing visual chapter, followed by useful location/contact details.

Use real controls and routes. If the business does not offer online ordering, catering, gift cards, hiring or rewards, omit those circular shortcuts and replace them with verified customer tasks. A button must not imply a live reservation or order system if none is connected.

## Prohibited patterns

- Copying Ethos branding, circular button labels, menu items, photos, locations, hours, awards, reviews or rating snippets.
- Inventing reservation availability, wait times, delivery terms, dietary claims, prices, customer ratings or awards.
- Using a source restaurant photo as the client's venue, kitchen, staff, customers or menu item.
- Making every section a carousel or using a moving image without a poster/static fallback.
- Overlapping circle buttons with headline or critical visual subjects, especially on mobile.
- Embedding a map from a service area instead of a confirmed street address.

## Local SEO and conversion

Use the verified restaurant type, location and cuisine/food terms naturally in the title, heading, menu context and FAQs. Keep visible NAP, hours, reservation path and LocalBusiness data consistent. A real street address can support a map and directions link; a city served alone cannot. Make Menu and Contact easy to reach, and choose Order, Reservation or Call as the single primary action according to the client's actual operations. Provide allergy and dietary information only after client verification. Do not turn review content into a ranking/quality promise.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **Ethos circular dining atlas**; family: `direct-ethos-circular-dining-atlas`; subject fit: restaurant, greek-restaurant, mediterranean-restaurant, catering, multi-location-dining. Production eligibility is unchanged.
- Open the paired full-page captures: desktop: `screenshots/desktop.png`, captured viewport 1440 x 1000; mobile: `screenshots/mobile.png`, captured viewport 390 x 844. Read the opening at its captured viewport and then inspect the whole page. A full-page image's total height is not CSS vh.
- Use this dossier alone for its route, not an average of the other candidates. Verified client facts, sealed content, accessibility, client font/palette choices and host runtime rules constrain the adaptation. Preserve the assigned composition, section order and signatures; if evidence and prose disagree, identify the conflict rather than silently rewriting the curated contract.
- Separate observed design from proposed client treatment. Do not claim an exact font, hex value, spacing measurement, interaction or animation was observed unless retained evidence supports it. Static captures do not prove scroll, hover or click behavior.

### Opening layout contract

**desktop: image-led-stage / media-leads-copy**

```text
[ navigation ]
[ dominant media stage ]
[ supporting promise + action ]
```

Let the media lead the opening. Keep supporting copy subordinate and maintain the source's visual pause before the next chapter; do not substitute equal-weight text/image columns.

**mobile: image-led-stage / media-leads-copy**

```text
[ navigation ]
[ dominant media stage ]
[ supporting promise + action ]
```

Let the media lead the opening. Keep supporting copy subordinate and maintain the source's visual pause before the next chapter; do not substitute equal-weight text/image columns.

These are relationship diagrams, not pixel specifications. Resolve alignment, proportions, whitespace and focal crop from the paired captures and original Visual hierarchy. Desktop header plus complete hero must fit 1536 x 864 at normal zoom, even if the source was captured at a taller viewport. Mobile may be content-height driven.

### Page rhythm and content mapping

Keep these assigned chapters in order; the numbers below describe actual page sequence, not decorative labels to add to the site:

1. **utility-navigation**
2. **circular-hero**
3. **welcome**
4. **cinematic-food-story**
5. **editorial-updates**
6. **service-actions**
7. **reviews**
8. **menu-gallery**
9. **location-contact**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: restrained editorial serif. Body character: compact readable grotesk. Hierarchy: small navigational labels, medium welcome heading, large menu/gallery captions. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: deep olive; warm cream; soft white. Contrast intent: photographic drama at hero, quiet warm reading surfaces and high-contrast action controls. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: full-bleed restaurant interiors, cinematic food/process scene, and varied dish gallery. Crop guidance: wide cover hero, alternating large story panels, compact image gallery. Focal role: real dining room or food object remains legible behind task labels. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: separate menu, ordering, event/catering and location tasks rather than one generic service grid. Early action: over the opening image, with a text fallback immediately beneath it. Primary placement: menu or reservation task in hero shortcut. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **photo-led single column with large task buttons**. limit circular shortcuts to what fits as readable touch targets; move extra routes into a simple text row; stack restaurant story and service choices; keep menu, location and primary action visible; no horizontal page overflow.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: small circular anchor navigation, story image reveal and gallery controls. Reduced-motion contract: still poster image and all navigation/gallery content available in static sequence. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **circular-dining-navigation** ([data-reference-signature=circular-dining-navigation]): clear circular shortcut navigation over the dining image. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **editorial-restaurant-story** ([data-reference-signature=editorial-restaurant-story]): calmer editorial introduction after the image-led hero. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **restaurant-service-choices** ([data-reference-signature=restaurant-service-choices]): separate and accurate menu/order/catering/location actions. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **food-image-atlas** ([data-reference-signature=food-image-atlas]): food or place gallery that is not used as unsupported client proof. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
