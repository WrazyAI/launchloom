# Visual hierarchy

Create a reassuring but polished local home-care landing page using the supplied Reference DNA and screenshots as composition evidence only. Do not copy their fictional provider, exact copy, photographs, palette, logo, or trade dress. The opening is an expansive two-part chapter: a concise left editorial text field and a generous right-side human-scale image, held within a full-screen first impression. Place a very slim brand and text-link navigation above it, with one clear conversation CTA. Pair a high-contrast editorial serif headline with a clean sans-serif for body copy and small uppercase overlines. Favor warm cream, deep evergreen, muted sage, and one subtle natural accent. Keep image crops dignified and natural. The page should feel like a thoughtful care service, not a hospital or a stock-photo marketplace.

# Page sequence

Sequence the page as a story with deliberately different section rhythms: 1) promise and early care-conversation CTA; 2) an alternating image-and-copy chapter about practical support; 3) another alternating chapter about familiar routines; 4) a third concise chapter describing how to begin; 5) a short, editorial service index; 6) a horizontally browsable photo rail; 7) plain-language FAQs; 8) a warm, direct contact close. Avoid long why-us copy. Use service rows with a number or category marker, a plain service name, a one-sentence scope description, and an arrow, not repeated cards. The image rail should read as a set of everyday scenes, not a testimonial wall. Put a CTA just after the hero and repeat it at natural decision points. Production copy must use only confirmed service types, staffing model, location/service area, intake process, pricing, eligibility, and contact details. This fictional example must not be mistaken for a real care provider.

# Responsive translation

At desktop widths, let the hero image and copy share the first viewport, then alternate the image side in each spotlight chapter. Keep the service index within a readable line length and give the horizontal story rail enough visual width to invite browsing. At mobile widths, place the hero photograph before the copy, then stack each spotlight as image followed by text; do not force alternating columns into tiny panels. Keep the service rows as full-width, touch-safe lines and retain the gallery as a horizontal swipe rail with captions readable without hover. Collapse navigation labels only as needed, preserving a visible route to Contact. Make FAQ disclosures and form controls keyboard accessible. Check full-page captures at 1440 x 900 and 390 x 844, with no page-level horizontal overflow or sticky header obstruction. Honor reduced motion and avoid fixed image attachment on mobile.

# Signature elements

Preserve the story-led pacing: a strong split opening, alternating full-bleed photo/copy chapters, a short service ledger, a horizontal image rail, and a distinct final conversation section. Images should feel like observed everyday life: a home, shared activity, useful objects, and familiar surroundings. Use varied image crops, whitespace, and surface changes to create the rhythm. Interactions should be modest and purposeful: scroll-triggered image reveal, swipeable gallery, native FAQ disclosure, and clear in-page CTAs. Keep a slim identity-and-links nav rather than repeating the capsule treatment used by other routes. The reference's fictional photos are generated for this study and never represent real care staff or clients. Client photographs outrank generated imagery if supplied.

# Prohibited patterns

Do not turn every section into a rounded card, use repeated split heroes without variation, use a generic sticky pill navigation, stack multiple long abstract reassurance paragraphs, invent clinical or care credentials, invent reviews, claim guaranteed outcomes, imply medical treatment, or show a stock/generated person as a real employee or customer. Do not invent a physical office from a service area. Do not claim 24-hour support, licensure, insurance coverage, staff availability, response times, rates, or eligibility unless verified. Avoid a wall of FAQs, faux metrics, keyword stuffing, inaccessible hover-only captions, and animations that hide copy from full-page rendering. Do not copy the source's fictional identity, wording, assets, or brand treatment. Never use an em dash in page copy.

# Content and SEO constraints

Use the verified primary service and service-area phrase naturally in the title, H1, introduction, and one relevant section heading. Describe the actual types of non-medical support the provider offers and who it serves, without implying skilled nursing or clinical care unless the intake confirms it. Answer practical questions families search for, such as how to start, what services include, what areas are served, and how a plan can change. Keep service descriptions specific and concise. The actual city, service area, contact data, and provider facts must remain sealed content tokens. Unique metadata, canonical URLs, local business structured data, and indexable HTML should be supplied by the production renderer; this design reference does not create factual claims.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **Story: home-care editorial chapters**; family: `html5up-story-home-care`; subject fit: home care, non-medical home support, elder companionship, home-care. Production eligibility is unchanged.
- Open the paired full-page captures: desktop: `screenshots/desktop.png`, captured viewport 1440 x 900; mobile: `screenshots/mobile.png`, captured viewport 390 x 844. Read the opening at its captured viewport and then inspect the whole page. A full-page image's total height is not CSS vh.
- Use this dossier alone for its route, not an average of the other candidates. Verified client facts, sealed content, accessibility, client font/palette choices and host runtime rules constrain the adaptation. Preserve the assigned composition, section order and signatures; if evidence and prose disagree, identify the conflict rather than silently rewriting the curated contract.
- Separate observed design from proposed client treatment. Do not claim an exact font, hex value, spacing measurement, interaction or animation was observed unless retained evidence supports it. Static captures do not prove scroll, hover or click behavior.

### Opening layout contract

**desktop: split-media / side-by-side-fields**

```text
[ navigation ]
[ copy + action | separate media field ]
```

Keep copy and the focal media region as distinct adjacent fields on desktop. Match their hierarchy and relative occupancy to the capture; do not default to equal-width columns, a boxed copy card or centered copy over the focal subject. The original observations clarify any background image extending beyond its focal region.

**mobile: editorial-stack / vertical-copy-media-stack**

```text
[ navigation ]
[ copy + action ]
[ distinct media chapter ]
```

Keep the vertical copy/media relationship and chapter boundaries. Do not collapse the stacked narrative into a conventional split hero.

These are relationship diagrams, not pixel specifications. Resolve alignment, proportions, whitespace and focal crop from the paired captures and original Visual hierarchy. Desktop header plus complete hero must fit 1536 x 864 at normal zoom, even if the source was captured at a taller viewport. Mobile may be content-height driven.

### Page rhythm and content mapping

Keep these assigned chapters in order; the numbers below describe actual page sequence, not decorative labels to add to the site:

1. **hero**
2. **services chapter**
3. **routine chapter**
4. **getting-started chapter**
5. **service index**
6. **image rail**
7. **faqs**
8. **contact**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: editorial serif for section headlines. Body character: clear sans-serif with restrained line length. Hierarchy: large headline, small uppercase chapter labels, moderate body. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: warm paper; soft sage; deep evergreen; muted sand. Contrast intent: warm but clearly readable, with white-on-dark only in the FAQ chapter. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: alternating full-bleed domestic photos and swipeable image rail. Crop guidance: wide chapter crops on desktop and stacked portrait-friendly crops on mobile. Focal role: keep people and everyday activity legible without over-staging. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: editorial ruled index with a number, service name, one-line scope, and arrow. Early action: immediately in the split opening. Primary placement: inside hero copy. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **image-first single-column chapters**. place image before corresponding copy; keep service rows full width; retain horizontal gallery as swipe rail; disable fixed-background effects; preserve readable line length.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: viewport-triggered image fade and touch-scroll gallery. Reduced-motion contract: static fully visible chapters and no smooth-scroll dependency. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **split-story-opening** ([data-reference-signature=split-story-opening]): full-screen split copy/photo opening with early conversation CTA. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **alternating-care-chapters** ([data-reference-signature=alternating-care-chapters]): alternating image and copy chapters. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **editorial-service-index** ([data-reference-signature=editorial-service-index]): ruled service ledger rather than cards. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **horizontal-story-gallery** ([data-reference-signature=horizontal-story-gallery]): horizontally browsable everyday-scene strip. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
