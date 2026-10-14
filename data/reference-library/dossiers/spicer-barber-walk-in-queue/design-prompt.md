# Walk-in-first barber shop implementation brief

Use the paired captures as evidence of a queue-led, low-friction service flow. Build an original experience from the client's verified hours, service list, prices, staff schedule, and actual booking policy. Do not copy the sample shop, its name, source copy, image, barber names, prices, wait state, opening hours, review quotes, or product shelf. The archive's wait card is a static placeholder, not a live integration.

## Visual hierarchy

Answer the visitor's immediate question first: can I walk in, and what is the likely next step? A narrow status strip can show verified open/closed hours or a real queue state when data is connected. Below it, use a dark, warm workshop hero with a short walk-in promise, one practical explanation, an immediate queue/call action, and a secondary price-list link. Keep the hero direct and compact. Do not turn the barber shop into a full-service salon appointment funnel.

Use a restrained palette of espresso, charcoal, warm white, and one burnt-orange signal color reserved for current status and primary actions. Display type should be strong and readable; body copy and price metadata should be plain. If using Inter and Fraunces, apply font-family rules explicitly and verify the typefaces load, because the source's arbitrary font utility is miscompiled as font-weight. Keep service prices visible and literal. Avoid decorative graphics that imply real-time data if no backend supplies it.

## Page sequence

1. A truthful queue/opening-status strip with hours or a clearly labeled estimate, but only if the client supplies the corresponding facts or data connection.
2. Walk-in-first hero with shop name, concise promise, queue/call action, and price-list link.
3. Flat-price board for the main services, with scope and duration only when verified.
4. Barber or chair availability panel, populated only by current staff/schedule data; otherwise omit or replace with real shop hours.
5. A practical weekly busyness/visit-planning table only if supported by actual appointment or historical schedule data.
6. A small product shelf only for products the shop really sells.
7. Genuine, approved reviews if available.
8. Short FAQ about walk-ins, payment, service scope, and wait estimates, grounded in business policy.
9. A narrow booking/contact form only for services that genuinely require advance booking. If walk-ins are the default, keep the walk-in action primary and explain what the form is for.

Do not add a fake status LED, simulated customer count, random wait estimate, invented chair availability, or fabricated staff roster. When no live data connection exists, use static business hours and an honest phone/contact option. Generated local SEO copy should answer real search intent for barber services and the verified service area without fabricated hours, price guarantees, availability, or review claims.

## Responsive translation

At 1440px, let the queue status and hero promise share the first screen, then make the price board easy to scan across a few well-defined columns. At 390px, put status first, promise second, queue/check action third. Reflow price items to readable rows, then stack availability and schedule blocks with their labels beside the right values. Avoid squeezing an availability table into a tiny grid. Keep call and directions actions easy to reach. All content must fit the viewport width; do not repeat the reference's copy, placeholder names, prices, or queue state.

Use small state pulses only when they communicate real updated information. Under reduced motion, replace pulses with a static text state and make the entire page visible. Native `<details>` can be used for the FAQ. Ensure the queue state has an accessible textual label, color is not the only state cue, all controls are keyboard-operable, and any booking form has an honest submit destination and privacy notice.

## Signature elements

- A compact, truthful queue/opening status above the main shop promise.
- Walk-in-first hero with a practical queue or phone action and a price-list shortcut.
- A short flat-price board rather than package comparisons.
- Current barber/chair availability only when the business can keep it accurate.
- Booking kept secondary or scoped to genuine exceptions when walk-ins are the verified default.

## Prohibited patterns

- No copied brand, source image, name, sample price, fake wait time, barber roster, hours, reviews, product listing, or source copy.
- No simulated live queue, false "no wait" claim, invented availability, or guaranteed service time.
- No fake store reviews, staff biographies, certifications, card/payment promises, or service offers.
- No appointment-first form when the client primarily serves walk-ins, no dark generic card wall, and no status communicated only by color or animation.
- No section that stays invisible when JavaScript or scroll animation is unavailable, and no form that looks functional without a real handler.

Before delivery, verify the opening status against client data, confirm every price/hours/staff fact, test phone and directions routes, measure mobile overflow, inspect keyboard focus and reduced-motion behavior, and ensure the attribution link remains if adapting the CC BY package itself. Use the reference's information hierarchy, not its sample business or numeric data.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **Spicer barber walk-in and queue-led shop**; family: `spicer-barber-walk-in-queue`; subject fit: barbershop, barber, mens-grooming, walk-in-service, independent-retail, beauty. Production eligibility is unchanged.
- Open the paired full-page captures: desktop: `screenshots/desktop.png`, captured viewport 1440 x 1000; mobile: `screenshots/mobile.png`, captured viewport 390 x 844. Read the opening at its captured viewport and then inspect the whole page. A full-page image's total height is not CSS vh.
- Use this dossier alone for its route, not an average of the other candidates. Verified client facts, sealed content, accessibility, client font/palette choices and host runtime rules constrain the adaptation. Preserve the assigned composition, section order and signatures; if evidence and prose disagree, identify the conflict rather than silently rewriting the curated contract.
- Separate observed design from proposed client treatment. Do not claim an exact font, hex value, spacing measurement, interaction or animation was observed unless retained evidence supports it. Static captures do not prove scroll, hover or click behavior.

### Opening layout contract

**desktop: utility-panel / task-panel-in-opening**

```text
[ navigation ]
[ promise / media | actionable task panel ]
```

The task panel is part of the opening, not a decorative proof card. Preserve the assigned task and its visible controls; use the host's single-form placement contract when this is a lead-form panel.

**mobile: media-overlay / copy-over-media**

```text
[ navigation ]
[ media field: copy + action over image ]
```

Keep copy inside the media field, not in a separate adjacent card. Choose a quiet crop or a local contrast plate/scrim; do not move copy outside the image to fix contrast.

These are relationship diagrams, not pixel specifications. Resolve alignment, proportions, whitespace and focal crop from the paired captures and original Visual hierarchy. Desktop header plus complete hero must fit 1536 x 864 at normal zoom, even if the source was captured at a taller viewport. Mobile may be content-height driven. The existing topology is medium-confidence: Screenshot shows overlapping layout mechanics; preserve the hybrid treatment rather than flattening it to this primary topology.

### Page rhythm and content mapping

Keep these assigned chapters in order; the numbers below describe actual page sequence, not decorative labels to add to the site:

1. **queue-status-strip**
2. **walk-in-hero**
3. **flat-price-board**
4. **barber-availability-grid**
5. **weekly-queue-planner**
6. **small-product-shelf**
7. **approved-review-proof**
8. **questions**
9. **exception-booking-form**
10. **attribution-footer**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: intended Fraunces editorial face, though static HTML currently falls back to system sans. Body character: intended Inter neutral sans, though font-family utility is miscompiled in the capture. Hierarchy: large short walk-in message, monospace-like micro labels, compact flat prices, and clear status states. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: near-black; espresso brown; warm charcoal. Contrast intent: dark shop atmosphere with bright orange reserved for important wait/price/action states. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: AI-generated atmospheric barbershop interior hero under a strong dark overlay. Crop guidance: wide hero image with enough negative space for the promise and queue card; no other photography is required by the package. Focal role: shop interior as atmosphere, not a real location or identifiable barber/customer. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: a short flat-price board, followed by barber/chair availability and a wait-planning view; walk-ins are the default and booking is only a secondary exception route. Early action: current service state and next step are above the price list; appointment booking is kept for cases the business actually books. Primary placement: walk-in or queue-check action beside the hero promise. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **fast walk-in decision path with stacked practical panels**. keep the status strip readable above the header; place the queue estimate beneath the walk-in promise, not beside narrow text; show flat-price services as compact one- or two-column rows with readable amounts; stack availability and schedule tables with clear day labels; reserve the final form for services that truly require booking and remove all sideways scroll.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: small queue-state pulse and barber availability indicators. Reduced-motion contract: show a static status label and fixed availability list; all sections are visible without transforms. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **walk-in-status-strip** ([data-reference-signature=walk-in-status-strip]): a truthful live-state strip or static opening-hours statement, using a live wait only when an actual data source exists. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **flat-price-board** ([data-reference-signature=flat-price-board]): a compact, factual list of core service prices with no package confusion. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **barber-availability-panel** ([data-reference-signature=barber-availability-panel]): barber availability only when the client supplies current staff and scheduling data. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **exception-booking-route** ([data-reference-signature=exception-booking-route]): a booking or contact option clearly scoped to services that require advance arrangement. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
