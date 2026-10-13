# Reference implementation brief: Strength-club command rail

## Scope and non-copy rule

Use the paired captures to study a gym page organized around a persistent vertical command rail, oversized strength promise over an equipment image, a class list, weekly timetable, coach profiles, membership choices, and a bounded first-session form. The pinned template is MIT licensed; its bundled hero photo and imagery credits are CC0/Public Domain as stated in the retained per-template credits. Do not copy Ironworks' brand, gym story, location, coach names, session counts, schedule, prices, reviews, opening hours, trial offer, measurements or claims. These are fictional sample details.

## Visual hierarchy

Use a slim left-side rail for wordmark, high-value section navigation and one primary action. The main canvas is an image-led gym floor with a bold condensed statement, a single short line explaining the actual training offer, and one first-visit action. Use a near-black/white palette with a precise orange action color. The class inventory should be compact and operational rather than a grid of marketing features. Give the timetable a distinct data-table surface. Coach profiles need real names and approved portraits; membership should compare actual inclusions and commitment terms with no visual pressure.

## Page sequence

1. Vertical navigation rail with Classes, Timetable, Coaches, Membership and First Visit links; one real call/booking action.
2. Strength/training promise over a clear facility or training-context image.
3. Training formats described through the visitor's needs, level and real session structure.
4. Weekly schedule or a truthful note about how to book; do not invent open places or class counts.
5. Real coaches and qualifications only if supplied and approved.
6. Membership comparison with confirmed rates, inclusions, cancellation terms and age/suitability conditions.
7. Questions and first-session form. Ask only what helps staff prepare; avoid collecting sensitive health information unless the real, secure process requires it.

## Responsive translation

At 390px, collapse the rail into a compact top utility nav and keep the first class/trial action accessible without overlapping the page. The hero image stays dominant but the training offer and contact action remain legible. Convert the schedule to grouped day/time rows or a touch-safe filter; never shrink it into unreadable cells or depend on horizontal scrolling. Stack class formats, coaches and plans. Keep price terms, pause/cancellation details and the first visit form visible. Verify 390px and 320px with no horizontal overflow.

## Signature elements

- Persistent vertical command rail on desktop, compact utility menu on mobile.
- Monochrome strength-poster hero with one signal-orange action.
- Operational weekly timetable as the data-focused center of the page.
- Membership comparison with honest terms and inclusion differences.
- First-session enquiry that lowers uncertainty rather than faking a live booking state.

## Prohibited patterns

- Copying Ironworks brand, source headline, photography, coach names, price points, schedules, location, reviews or claims.
- Inventing personal training credentials, member totals, capacity, class availability, transformation outcomes or opening hours.
- Fake occupancy/status meters, countdowns, “free trial” claims, or booking confirmation without a real endpoint.
- Using the source timetable when it does not match the client's operating schedule.
- A rail that blocks mobile content or hides accessibility navigation.
- Presenting generated/stock people as real coaches or members.

## Local SEO and conversion

Use the verified gym/training category and exact city or service area naturally in the opening and metadata. Clarify whether the client offers strength training, group classes, personal coaching, open gym or recovery, based only on intake. Keep location and hours truthful. Explain what a first session includes and what visitors should bring only when confirmed. Add a route/map only for a verified physical address. Make one primary booking/trial/consultation action clear; ensure rate and timetable content matches the live business.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **Ironworks strength-club command rail**; family: `colorlib-ironworks-strength-club`; subject fit: fitness, gym, strength-training, personal-training, sports-performance. Production eligibility is unchanged.
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

1. **command-rail**
2. **hero**
3. **classes**
4. **timetable**
5. **coaches**
6. **membership**
7. **first-visit**
8. **faq**
9. **contact**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: bold condensed athletic grotesk. Body character: compact neutral sans. Hierarchy: large uppercase promise, operational labels and dense schedule data with clear hierarchy. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: charcoal; white; cool gray. Contrast intent: strong athletic contrast with orange reserved for active state and action. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: monochrome equipment-led hero with restrained portraits. Crop guidance: wide image under overlaid headline; staff images sit in compact coach index. Focal role: training equipment supports the promise without obscuring text. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: class index plus schedule table and membership comparison. Early action: one clear class/visit action alongside the opening promise. Primary placement: trial or first-session action in the desktop rail and hero. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **top utility nav with vertically stacked operations**. move action to the opening hero flow; show classes before schedule; convert schedule into grouped day rows; stack coach and plan content; keep price terms attached to each plan; no horizontal overflow.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: active section state in the vertical rail and optional schedule filter. Reduced-motion contract: static nav state, complete schedule and visible form. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **strength-command-rail** ([data-reference-signature=strength-command-rail]): desktop vertical navigation rail with a compact mobile replacement. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **training-poster** ([data-reference-signature=training-poster]): equipment-led athletic hero with direct visit action. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **operational-timetable** ([data-reference-signature=operational-timetable]): true weekly schedule, or a clear booking-instructions alternative. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **membership-comparison** ([data-reference-signature=membership-comparison]): plans compared with confirmed inclusions and terms. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
