# Visual hierarchy

Create a veterinary homepage that feels like a considerate digital care service, not a generic SaaS dashboard or a chain-clinic template. Begin with a narrow, confident utility header. In the first viewport, pair a short benefit-led statement and a real next step with one warm pet-and-person image. If the client has confirmed a physical practice or service territory, make a location or availability finder part of the opening; otherwise use a direct call or appointment action instead. Keep controls and image in distinct visual fields. Use a warm paper base, muted color chapters, editorial serif display, and precise sans-serif utility, but resolve exact colors and type to the client's identity.

# Page sequence

Use a measured rhythm: opening and care-finding action; short visit-expectation disclosures; proof or patient stories; useful location navigation; a concise service index; then any verified plan, team, app, or follow-up detail that the client actually offers. A newsletter or broader resource area belongs near the close, not ahead of care access. Each chapter should answer a different decision: where care is available, what a visit can involve, which service is relevant, or what to do next. Do not create a membership, mobile application, virtual-care service, rating, or location count from reference context. If proof is missing, use an honest process explanation.

# Responsive translation

At desktop, keep the opening message and finder compact beside a documentary image, then alternate between calm text-led and image-supported chapters. At mobile, put the service statement and action before the image. Convert long location lists and care details to keyboard-operable disclosures; do not compress desktop columns into tiny cards. Carousels need visible previous/next controls, a static first state, and no autoplay requirement. All sections remain readable with reduced motion. Do not reproduce the blank tail visible below this source capture's footer.

# Signature elements

Preserve three transferable mechanics: a care-finding action embedded in the opening, at least two alternating editorial care chapters, and a short disclosure explaining visit expectations or service choices. Place the interaction only where client facts make it truthful. Make the location finder an actual form or link connected to verified routing, not an inert search-shaped decoration. Use original client-cleared photography or approved generated imagery, with pet and caregiver in context and no text over a busy subject.

# Prohibited patterns

Do not reuse the reference identity, logo, copy, photographs, staff, stories, rating, prices, claims, app interface, exact color combination, or recognizable trade dress. Do not claim the client has an app, membership, virtual support, urgent availability, multi-city coverage, or a specific response time unless supplied and verified. Avoid a generic row of identical cards, hidden actions, a pop-up sale mechanic, or a long claim-heavy hero. Do not recreate the blank capture artifact under the source footer.

# Local SEO and conversion

Use the client's confirmed primary service, species served, and real locations in the title, H1, service labels, and internal links. A service area is not a clinic address. Give one clear primary action and one useful alternative near the opening; repeat them after a meaningful service or location decision. Keep contact information consistent with structured data. Do not turn reference locations, reviews, prices, or credentials into client facts.

# Verification

Check desktop and mobile first viewports at 100 percent zoom. Confirm the location or appointment route works, each disclosure can be operated with keyboard and touch, text contrast is readable, and no horizontal overflow or overlay blocks content. Confirm that missing optional facts were omitted rather than invented. The final composition should still make sense if imagery is temporarily unavailable or motion is disabled.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **Digital-first veterinary membership with a care-location index**; family: `veterinary-digital-membership-care`; subject fit: veterinary clinic, animal hospital, pet wellness, urgent veterinary care, veterinary. Production eligibility is unchanged.
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

**mobile: utility-panel / task-panel-in-opening**

```text
[ navigation ]
[ promise / media | actionable task panel ]
```

The task panel is part of the opening, not a decorative proof card. Preserve the assigned task and its visible controls; use the host's single-form placement contract when this is a lead-form panel.

These are relationship diagrams, not pixel specifications. Resolve alignment, proportions, whitespace and focal crop from the paired captures and original Visual hierarchy. Desktop header plus complete hero must fit 1536 x 864 at normal zoom, even if the source was captured at a taller viewport. Mobile may be content-height driven.

### Page rhythm and content mapping

Keep these assigned chapters in order; the numbers below describe actual page sequence, not decorative labels to add to the site:

1. **hero and clinic locator**
2. **care expectation disclosures**
3. **member stories**
4. **location index**
5. **service index**
6. **membership plan**
7. **care team and app**
8. **newsletter footer**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: warm editorial serif. Body character: clear humanist sans. Hierarchy: large but restrained opening with small uppercase wayfinding labels. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: warm paper; soft sky tint; neutral white. Contrast intent: gentle surfaces with unmistakable controls and strong body-text contrast. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: documentary owner-and-pet photography mixed with calm clinic interiors. Crop guidance: large rectangular hero and alternating editorial crops. Focal role: human-animal interaction remains visible; keep text in a separate calm field. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: short expandable care expectations followed by a compact service index. Early action: locator embedded in the opening, before long-form proof. Primary placement: find a nearby clinic or book. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **stack the opening copy, locator, and photograph, then make each editorial module a single readable chapter**. keep booking or location lookup near the opening; turn the location list into accessible disclosures; replace carousels with touch-safe controls and visible items; do not preserve the captured blank footer tail.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: horizontal member-story rail and small disclosure transitions. Reduced-motion contract: show all story controls and disclosure content without timed movement. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **care-locator-opening** ([data-reference-signature=care-locator-opening]): A location or care-finding action is part of the opening composition, when the client actually serves a locatable area. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **alternating-care-chapters** ([data-reference-signature=alternating-care-chapters]): At least two middle sections alternate between concise text and context imagery rather than repeating one card grid. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **care-path-disclosure** ([data-reference-signature=care-path-disclosure]): A short, accessible disclosure explains care options or visit expectations. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
