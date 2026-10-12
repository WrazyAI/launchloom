# Reference implementation brief: destination-led inn

## Scope and non-copy rule

Use the paired screenshots as a permission-attested visual reference for destination sequencing, photography treatment, booking placement, and the way lodging, food, arrival, activities, and stories form one guest journey. No source-owner grant was uploaded; the requester attested to retention and model-reference use. Do not reproduce Fogo Island Inn’s identity, logos, copy, images, room details, rates, awards, service claims, local geography, or community model. Treat all source statements as non-transferable. Business facts, local SEO, amenities, prices, accessibility, dates, activities, and policies must come only from sealed, researched client content.

## Visual hierarchy

Use a minimal destination nav over a full-bleed, client-owned or generated place scene. The opening should immediately name the type of stay and show a real date/reservation route. Let the landscape carry the mood; keep supporting copy sparse and high-contrast. After the opening, switch to light or calm surfaces for practical room and rate details. Let the journey itself create variety: arrival, accommodation, dining, activities, and the character of the place should each have their own scene rather than being crushed into equal cards.

## Page sequence

1. Minimal wordmark/navigation with an explicit booking action.
2. Immersive destination hero with a short stay promise and date/availability path.
3. Location and arrival context, including accurate travel information only where verified.
4. Rooms or accommodation types with client-owned imagery and actual booking/rate details.
5. Food, drink, or included services only if the property offers them.
6. Local activities or experiences with truthful provider/season information.
7. A specific place/community/sustainability story only when documented by the client.
8. Recent editorial or practical guest guides that help a visitor plan.
9. Closing reservation/contact path, address and footer.

Keep the booking decision close to room/rate information. Do not make the visitor traverse a long brand story to discover the practical offer.

## Interaction and motion

One subdued image reveal or scene transition can reinforce the sense of arrival. A horizontal rail is allowed only for optional imagery and must remain manually controllable. Booking/date controls must use a real availability source; if unavailable, route to a truthful enquiry instead of showing a fake calendar or open dates. Avoid parallax that impairs reading, autoplay audio, scroll locks, and motion that obscures room details. Provide a static reduced-motion layout.

## Responsive translation

At 390px, keep the reservation route visible in compact navigation. Stack place context, rooms/rates, dining, and activities in that order. Images should crop for the subject and not become unreadable text backdrops. Show rate basis, inclusions, and important policies with the corresponding room choice. Preserve address/arrival directions and contact details, and ensure no horizontal overflow at 320px.

## Signature elements

Preserve the large place-setting scene, low-chrome booking nav, journey-like sequence of stay planning chapters, and a place-specific contact close. Use the new client’s actual landscape/architecture and geography; do not copy the source’s rock-coast imagery, color grading, property composition, or marks.

## Prohibited patterns

Do not copy the source hotel name, logo, award marks, community ownership model, room count, operating surplus statement, rates, menus, photography, destination activities, or copy. Do not invent all-inclusive plans, sustainability impact, cultural relationships, accessibility, travel times, room attributes, amenities, local partners, seasonal experiences, reviews, or booking availability. Avoid a generic luxury-resort card wall, fake scarcity, stock landscapes presented as the client property, and animated content that hides booking terms.

## Local SEO and conversion

Use verified property location, lodging category, nearby service area, arrival details, amenities, and booking method. Build separate room/experience pages only for real offerings. Include accurate Hotel/LocalBusiness schema, name-address-phone, opening/seasonal dates, and canonical booking URLs only from the client. Put the primary reservation action near the opening promise and repeat it at the room/rate decision point. Make every CTA route to the real booking or enquiry system.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **Fogo Island Inn destination-led hospitality**; family: `direct-fogo-island-inn-destination-story`; subject fit: boutique-hotel, inn, lodging, destination-stay, hospitality. Production eligibility is unchanged.
- Open the paired full-page captures: desktop: `screenshots/desktop.png`, captured viewport 1440 x 900; mobile: `screenshots/mobile.png`, captured viewport 390 x 844. Read the opening at its captured viewport and then inspect the whole page. A full-page image's total height is not CSS vh.
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

1. **reservation-navigation**
2. **coastal-stay-hero**
3. **place-and-route**
4. **rooms-and-rates**
5. **food-and-drink**
6. **island-activities**
7. **community-or-place-story**
8. **news-and-guides**
9. **reservation-contact**
10. **footer**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: quiet contemporary grotesk with occasional editorial serif accents. Body character: light, readable neutral sans. Hierarchy: large place-led statement, restrained captions, short section introductions, clear booking labels. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: deep warm brown; ocean charcoal; soft limestone. Contrast intent: photographic overlays protect white navigation and hero text; body sections switch to calm light surfaces for sustained reading. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: large natural landscape, then specific room, food, and island imagery. Crop guidance: wide hero crop transitions into varied editorial image panels and smaller destination cards. Focal role: shoreline light and rugged Atlantic coast establish place; client-owned imagery must carry the new business's actual destination. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: lodging is organized as an experience journey: stay, arrival, food, and activities, each with its own specific route. Early action: lodging details and rates follow place context before editorial/community chapters. Primary placement: date-selection/reservation action inside the opening scene. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **immersive opening followed by stacked stay-planning chapters**. keep reserve action visible in compact nav; show destination context and date path before secondary stories; stack room, rate, food and activity chapters as distinct full-width scenes; avoid tiny overlays on photography; no horizontal overflow.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: slow image reveal or gentle scene transition that reinforces a destination rather than concealing room/rate facts. Reduced-motion contract: static hero crop and complete visible image/section content. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **destination-hero-scene** ([data-reference-signature=destination-hero-scene]): a single immersive place-setting image with legible lodging promise. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **reservation-utility-nav** ([data-reference-signature=reservation-utility-nav]): quiet destination navigation with a direct, real booking route. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **stay-planning-chapters** ([data-reference-signature=stay-planning-chapters]): rooms/rates, food and activities appear as distinct journey stages, not one generic service grid. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **place-specific-close** ([data-reference-signature=place-specific-close]): close with truthful arrival/contact details and destination guidance. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
