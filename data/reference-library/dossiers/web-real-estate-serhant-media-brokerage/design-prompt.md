# Visual hierarchy

Build a real-estate experience whose primary composition is a cinematic property-discovery stage, not a conventional split hero. Use one full-width moving or still image with a short headline, a useful search control, and just enough utility navigation to orient the visitor. Follow that opening with a market selector and a clear, browseable property feed. Use alternating dark film chapters and bright information surfaces to distinguish property discovery from the business behind it. Keep search labels, availability, property facts, and market names legible rather than embedding them in imagery. Treat a house, agent, or district as a story subject only when the client's own assets support it.

# Page sequence

Preserve this narrative rhythm: media-led opening with search; region or service-area discovery; featured properties or services; a focused showcase for new developments or major work; separate chapters for the client's actual media, technology, or advisory capabilities; concise proof; useful articles or FAQs; and a clear closing inquiry. A small number of well-paced scenes is better than an exhaustive directory. If the client is an individual agent, replace corporate divisions with their verified buying, selling, leasing, or property-management process. Do not create company scale or media divisions simply because the source has them. The top half of the page should support a visitor who already knows what they need as well as one still choosing an area or service.

# Responsive translation

On desktop, let image, title, and search share one coordinated stage; keep the search panel visually separate enough to scan. Let light listing intervals reset the eye between film chapters. At 390 px, turn the hero into a readable poster with one or two stacked actions, put the search fields immediately below the promise, and stack listing or capability media. Replace horizontal carousels with touch-safe rails that show an obvious next item or with a vertical list. Do not let media autoplay determine the reading order. Keep contact, availability, and navigation controls reachable, preserve keyboard access, and test for a full-page width of exactly the viewport.

# Signature elements

- `film-led-search-stage`: a single atmospheric property or neighborhood scene that includes an accessible first search or inquiry action.
- `cross-region-property-feed`: a market selector leads into a feed whose item details are supplied by the client, not invented.
- `media-division-story`: capabilities or expertise appear as distinct image-led chapters rather than a generic feature-card grid.

Use one deliberate interaction: a gentle transition from the opening film or poster into market or property discovery. It should improve orientation, not delay it. Supply a static image state and keep important labels outside video. This is a design-mechanics contract, not a request to mimic the source composition pixel by pixel.

# Prohibited patterns

Do not reproduce source logos, brand language, property photography, agents, listing records, interface details, source statistics, awards, prices, claims, or trade dress. Do not invent an agent team, markets served, listing inventory, transaction history, production studio, technology product, credentials, reviews, or outcomes. Do not use an animation-only button, put important copy inside an image, hide the search until a video completes, or turn every section into the same rounded card. If the client has no approved listing photography, use original generated property imagery or a deliberate graphic treatment and label sample content honestly.

# Local SEO and conversion constraints

Bind all business claims and copy to sealed client content and verified research. Use the actual business type, submitted service areas, location facts, services, buyer or seller questions, contact routes, and confirmed property details. Use one primary action and one useful secondary route near the opening promise, then repeat them after meaningful decision chapters. Build descriptive titles, canonical URLs, internal links, LocalBusiness or appropriate real-estate structured data, and substantive service or location pages only when the needed facts exist. Never imply an office from a service area, promise availability, publish a price or property fact without current authorization, or create thin city-swapped SEO text. Preserve contrast, semantic headings, accessible search labels, keyboard operation, and reduced-motion behavior.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **SERHANT: cinematic media and multi-market brokerage**; family: `real-estate-media-brokerage`; subject fit: real estate, real-estate, real estate brokerage, luxury brokerage. Production eligibility is unchanged.
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

1. **film hero**
2. **region discovery**
3. **featured property feed**
4. **development showcase**
5. **media studio chapter**
6. **brokerage capabilities**
7. **press editorial**
8. **contact capture**
9. **multi-column compliance footer**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: bold neo grotesk. Body character: compact neutral sans. Hierarchy: large short headline, dense market labels, restrained explanatory copy. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: near black; white; pale cool gray. Contrast intent: strong scene contrast with readable labels and accessible search controls. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: filmic property montage. Crop guidance: full-width moving-image stills interrupted by precise listing crops. Focal role: preserve the principal residence or human subject and keep key text over quiet image regions. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: regional listing and agent atlas. Early action: search overlay integrated into film hero. Primary placement: find a property through the hero search. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **stacked media search and listing feed**. keep the first search control above the initial listing sequence; stack development and service scenes rather than shrinking desktop carousels; preserve legible property facts and tap-sized controls; provide a poster image when video or motion is unavailable.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: film to listing scene transition. Reduced-motion contract: poster still with fully visible search, labels, and links. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **film-led-search-stage** ([data-reference-signature=film-led-search-stage]): A large media hero combines with an integrated property and location search. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **cross-region-property-feed** ([data-reference-signature=cross-region-property-feed]): Market selection leads into a property discovery feed rather than isolated generic service cards. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **media-division-story** ([data-reference-signature=media-division-story]): Supporting brokerage capabilities appear as separate media, technology, or development story chapters. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
