# Visual hierarchy

Build a renter-first property experience. A calm bedroom or home interior carries a centered search panel, not a long company pitch. Let the location or community search be the first functional element. Follow it immediately with a browseable set of apartment communities that shows the verified location and current rental context. The page then moves through why a renter might choose the service, a wide human-scale resident-life image, short benefit chapters, a city discovery rail, practical renting guidance, a partnership or management statement, and useful location directories. A dark corporate footer can gather resident help and company links. Make search, apartment facts, and cost explanations more prominent than corporate scale.

# Page sequence

Use this rhythm when it matches the client's model: rental search hero; a manageable community or property list; a brief explanation of the resident experience; two or three practical benefits; geographic discovery; rental or property-maintenance guidance; resident support; local apartment or service directories; and a clean footer. For a small local property manager, replace global property inventory with the client-confirmed rental management process, tenant support, owner services, and local coverage. Do not reproduce the source's resident claims, rates, services, or broad scale. If the client is not a landlord or apartment operator, adapt this pattern into its actual property search or management task.

# Responsive translation

Desktop can present the search as a floating light panel over a full-width photo, with property cards arranged in a horizontal browse rail. Use card controls that announce the current position and support keyboard and touch. At 390 px, put the location field and search action near the top, stack apartment details, and make city links swipe-safe or vertical. Do not hide monthly costs or other essential property information inside hover states. Use real mobile tap targets, a static image fallback, readable card detail, and clear resident support. Ensure the mobile path is not obscured by a fixed bottom chat control.

# Signature elements

- `renter-search-console`: a direct search by location or community anchors the opening.
- `community-listing-rail`: a set of actual places is browsable with useful, client-approved context.
- `renter-guide-cluster`: practical renter information answers real questions before the page closes.

Use one purposeful carousel or list interaction for places. Provide static first items and visible controls when motion is reduced. For a service provider with no inventory, keep the structure but replace the rail with a factual, client-specific service-area index. Do not invent neighborhoods, rent, availability, resident amenities, property features, or outcomes.

# Prohibited patterns

Never use source logos, photography, people, apartment names, rates, amenities, market coverage, rental totals, claims, or corporate facts. Do not imply the client owns or manages a photographed building unless the client confirms it. Do not create a fake listings map or live search, bury renter help, or show costs that omit required monthly charges. Avoid a generic card wall, low-contrast copy over lifestyle images, or an interface that only works with a mouse. Keep access and fairness information visible where required by the real client context.

# Local SEO and conversion constraints

Use only the client's true property services, verified service areas, current availability, approved costs, and actual resident or owner questions. Use natural local search language in the page title, primary heading, location sections, and useful FAQs without repeating city names mechanically. Create a page for a locality only if submitted and verified, and include unique local information. Use accurate rental or property schema only when the necessary fields are current. Link phone, inquiry, search, and support actions to real destinations. Keep one primary search/contact route plus a useful secondary help path near the opening. Never invent an office, building, amenity, price, service promise, review, response time, or occupancy result.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **Greystar: renter search, apartment discovery, and city guides**; family: `real-estate-renter-discovery`; subject fit: real estate, real-estate, property management, apartment rental, multifamily housing. Production eligibility is unchanged.
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

**mobile: utility-panel / task-panel-in-opening**

```text
[ navigation ]
[ promise / media | actionable task panel ]
```

The task panel is part of the opening, not a decorative proof card. Preserve the assigned task and its visible controls; use the host's single-form placement contract when this is a lead-form panel.

These are relationship diagrams, not pixel specifications. Resolve alignment, proportions, whitespace and focal crop from the paired captures and original Visual hierarchy. Desktop header plus complete hero must fit 1536 x 864 at normal zoom, even if the source was captured at a taller viewport. Mobile may be content-height driven.

### Page rhythm and content mapping

Keep these assigned chapters in order; the numbers below describe actual page sequence, not decorative labels to add to the site:

1. **renter search hero**
2. **available communities carousel**
3. **resident life rationale**
4. **resident benefit triptych**
5. **city discovery rail**
6. **renter education articles**
7. **management partnership invitation**
8. **local apartment directories**
9. **corporate footer**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: humanist product grotesk. Body character: compact readable sans. Hierarchy: medium search headline, short benefit titles, dense but legible rental facts. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: white; pale sky blue; warm sand; navy footer. Contrast intent: highly legible utility controls and housing information across bright surfaces. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: everyday apartment and resident documentary. Crop guidance: large bedroom hero followed by community, city, and lived-in moments. Focal role: show practical residential spaces and people with room around overlay text. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: community carousel and rental advice. Early action: rental location search in hero console. Primary placement: search rental homes by city or community. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **renter search console then one column communities**. keep the search action visible without scrolling through explanation; stack the community cards with full rent context; convert city and guide rails into touch-safe rows; preserve resident support and access links in the compact menu.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: touch safe community carousel. Reduced-motion contract: render the first community cards in a static list and keep all links available. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **renter-search-console** ([data-reference-signature=renter-search-console]): A location or community search is the primary opening interaction. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **community-listing-rail** ([data-reference-signature=community-listing-rail]): Places are browseable with verified location and pricing context. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **renter-guide-cluster** ([data-reference-signature=renter-guide-cluster]): Useful renter guidance appears before the close and answers real customer questions. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
