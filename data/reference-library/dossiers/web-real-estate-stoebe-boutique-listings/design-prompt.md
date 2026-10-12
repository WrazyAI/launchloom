# Visual hierarchy

Create a composed real-estate brokerage page with a framed utility header, an asymmetrical residential-photo cover, and a detached search surface that creates a clear second layer of hierarchy. Let a quiet serif statement and warm architectural image carry the opening, then give the visitor a more functional address or neighborhood search. Move from a short brokerage explanation to an editorial market index with distinct audience or property-type entries. Treat each property as a curated object, with enough space for verified location and practical facts. Use the pause between the introduction, market index, portfolio, and contact chapters deliberately; the source is more spacious than a standard search portal.

# Page sequence

Use the source's observed rhythm as an adaptable scaffold: framed navigation; asymmetrical image-and-wordmark cover; floating property search; a concise explanation and a small set of verified proof points; a brokerage or service thesis; a visual taxonomy for buyer, seller, rental, commercial, or other supported audiences; a regional index; one focused process or mobile-tool demonstration; a small selection of current properties or representative projects; useful FAQs or seller guidance; and a contact close. Keep buyer and seller journeys distinct when that matches the client's service. If no transaction metrics or testimonials are supplied, use an honest process section rather than borrowing source proof. The optional mobile application scene must only become an actual product claim when the client has one.

# Responsive translation

At desktop width, preserve the off-center title and architectural picture, then align the search panel as its own clean surface instead of forcing a standard two-column hero. Market categories should feel like a browseable index rather than uniform service cards. At 390 px, shrink the cover without cropping the promise, place search controls directly after it, stack market links in a touch-safe layout, and turn listing carousels into visible rows or a vertical collection. Avoid fixed-width logos, horizontal overflow, crowded price labels, and small hover-only controls. Make a mobile screenshot of the entire page after all content and image crops have loaded.

# Signature elements

- `floating-property-search`: a search console separate from the hero image, so an intention can be acted on immediately.
- `market-taxonomy-tiles`: market or audience options appear as a deliberate visual index with real destinations.
- `mobile-property-toolkit`: an optional short product or process demonstration that shows how a visitor receives useful property information.

Use restrained linework, warm whitespace, and one useful browsing interaction. If the client has no search inventory, replace search with a clear contact or valuation request instead of creating fake listings. The design should inherit the mechanics, not the source's exact framing, logo, typography, or color values.

# Prohibited patterns

Never copy the source brand, words, identity, property photography, team, listing details, market names, proof, prices, statistics, testimony, colors, or card geometry. Do not create a fictitious mobile app, private-market access, valuation service, luxury market, or commercial offering. Avoid a sea of interchangeable cards, an early lead form that interrupts useful search, filters that cannot work, or unsupported home-value calculators. A source screenshot remains internal design evidence and is never a client asset.

# Local SEO and conversion constraints

Write only from the client's verified facts and keyword research. Use the actual property services, buyer or seller intent, service area, contact details, and confirmed inventory. Place one primary action and one relevant secondary action near the opening. Answer authentic questions about search, preparation, process, pricing factors, or property management on the appropriate section or page. Provide meaningful location pages only for submitted and confirmed service areas, with local context and useful original content. Keep titles, canonical links, navigation, structured data, phone links, forms, and listing facts consistent. Never use a service area as proof of a physical office or fabricate listings, prices, reviews, or results.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **Stoebe & Co.: boutique market atlas and property-search panel**; family: `real-estate-boutique-search`; subject fit: real estate, real-estate, real estate brokerage, luxury brokerage, property sales. Production eligibility is unchanged.
- Open the paired full-page captures: desktop: `screenshots/desktop.png`, captured viewport 1440 x 1000; mobile: `screenshots/mobile.png`, captured viewport 390 x 844. Read the opening at its captured viewport and then inspect the whole page. A full-page image's total height is not CSS vh.
- Use this dossier alone for its route, not an average of the other candidates. Verified client facts, sealed content, accessibility, client font/palette choices and host runtime rules constrain the adaptation. Preserve the assigned composition, section order and signatures; if evidence and prose disagree, identify the conflict rather than silently rewriting the curated contract.
- Separate observed design from proposed client treatment. Do not claim an exact font, hex value, spacing measurement, interaction or animation was observed unless retained evidence supports it. Static captures do not prove scroll, hover or click behavior.

### Opening layout contract

**desktop: editorial-stack / vertical-copy-media-stack**

```text
[ navigation ]
[ copy + action ]
[ distinct media chapter ]
```

Keep the vertical copy/media relationship and chapter boundaries. Do not collapse the stacked narrative into a conventional split hero.

**mobile: editorial-stack / vertical-copy-media-stack**

```text
[ navigation ]
[ copy + action ]
[ distinct media chapter ]
```

Keep the vertical copy/media relationship and chapter boundaries. Do not collapse the stacked narrative into a conventional split hero.

These are relationship diagrams, not pixel specifications. Resolve alignment, proportions, whitespace and focal crop from the paired captures and original Visual hierarchy. Desktop header plus complete hero must fit 1536 x 864 at normal zoom, even if the source was captured at a taller viewport. Mobile may be content-height driven. The existing topology is medium-confidence: Screenshot shows overlapping layout mechanics; preserve the hybrid treatment rather than flattening it to this primary topology.

### Page rhythm and content mapping

Keep these assigned chapters in order; the numbers below describe actual page sequence, not decorative labels to add to the site:

1. **image wordmark cover**
2. **floating address search**
3. **sales proof measures**
4. **editorial brokerage story**
5. **market taxonomy tiles**
6. **regional market index**
7. **mobile product demonstration**
8. **listing carousel**
9. **testimonial interlude**
10. **seller enquiry**
11. **social gallery**
12. **contact details**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: high contrast fashion serif. Body character: small neutral sans. Hierarchy: quiet oversized market headings, micro labels, short supporting paragraphs. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: warm white; soft gray; pale sand. Contrast intent: restrained premium contrast with strong text legibility and clear controls. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: warm interior and listing editorial collage. Crop guidance: wide residential cover, then small market tiles and listing thumbnails. Focal role: architectural light and home detail rather than embedded copy or identifiable source people. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: audience market taxonomy. Early action: floating property search between cover and brokerage story. Primary placement: search by address, neighborhood, or client intent. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **single column listing catalogue and compact region menu**. turn market tiles into a readable two-column or stacked index; keep property-search controls in the first decision sequence; stack property cards with readable location and key facts; preserve whitespace without making headings clip.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: curated listing carousel with pagination. Reduced-motion contract: show a fixed listing set and accessible previous and next buttons. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **floating-property-search** ([data-reference-signature=floating-property-search]): A search surface is visually distinct from and immediately follows the cover scene. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **market-taxonomy-tiles** ([data-reference-signature=market-taxonomy-tiles]): Audience or property-market categories form a browseable editorial index. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **mobile-property-toolkit** ([data-reference-signature=mobile-property-toolkit]): A mobile-facing product or search interaction is shown as a narrative chapter rather than a generic testimonial card. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
