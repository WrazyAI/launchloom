# Visual hierarchy

Create a calm, humane experience for a verified end-of-life, senior-pet, hospice, or support service. The page must speak with care but must not pressure a visitor or imply a diagnosis. Place a plain service explanation beside an authentic in-home image and a gentle, useful next step. A soft tonal field, classic readable serif, precise sans-serif body, and quiet line icons can make the experience feel considered. Prefer real client photography or approved generated imagery. The source's exact lavender, wordmark, images, writing, and testimonials are not a brand kit.

# Page sequence

Use an opening service finder or contact action; a small service compass; verified provider or process context; a simple service index; family stories only when approved; practical educational resources; and a final call or service-area route. The sequence should let visitors either ask for help or learn at their own pace. Use a secondary resource path rather than filling the top of the page with claims. If client facts do not support hospice or euthanasia services, do not use those topics or imply they are offered.

# Responsive translation

Desktop may balance a short promise and locator against a gentle landscape or home photograph. Mobile should place the statement, finder, image, and touch-sized care shortcuts in a straightforward vertical order. Profiles and stories can be manually browsed but never auto-advance; list entries should remain in the document for assistive technology. A video or chat tool is optional and must not leave a black placeholder or fixed obstruction. Keep important help and eligibility information visible without triggering a popup.

# Signature elements

Build a three-to-six-item service compass, one modest provider or process portrait chapter, and an asymmetric practical-resource grouping. Give each action its own verified destination. If provider details are unavailable, explain the service process without invented staff. The resource mosaic should vary image scale and text width, with the smallest item still readable. The closing contact route should be a calm continuation, not a pushy conversion overlay.

# Prohibited patterns

Do not copy the source's compassionate slogans, clinic photos, pet portraits, staff, testimonials, contact details, service area, prices, clinical statements, or distinctive brand marks. Never promise a peaceful outcome, medical result, availability, or emotional benefit. Do not present source medical resources as advice from the generated practice. Avoid duplicate floating chat controls, forced countdowns, auto-playing stories, distressing imagery, or decorative icons that obscure meaning.

# Local SEO and conversion

Use only the client-confirmed care category, species, and real service area. Create a location finder only when the business has actual provider locations or coverage data. Write FAQs that describe how to contact the practice, what information to prepare, and the next step, not individualized medical instructions. Phone, email, and scheduling links must use confirmed business details. Keep structured data accurate and do not claim a clinic address for a home-visit-only business.

# Verification

Review the copy with special care for medical and grief-related claims. Confirm every action is usable by keyboard and touch, reduced motion leaves all content available, mobile controls are not obscured, and full-page screenshots have no blank media blocks. Check text contrast and overflow at 1536 by 864, 1366 by 768, and 390 by 844. Confirm unsupported services, testimonials, locations, and outcomes are absent.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **At-home hospice support with a service compass and guided resources**; family: `veterinary-hospice-support-compass`; subject fit: veterinary hospice, in-home veterinary care, pet aftercare, pet loss support, veterinary. Production eligibility is unchanged.
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

1. **care identity and location finder**
2. **service compass**
3. **veterinarian profile**
4. **service pathway index**
5. **family testimonials**
6. **support resource mosaic**
7. **second finder and support callout**
8. **quiet footer**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: compassionate high-contrast serif. Body character: open neutral sans. Hierarchy: moderate title, generous section headings, compact labels. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: soft lilac; warm white; pale sand; deep slate. Contrast intent: low-stress surfaces with dark text and distinct accessible control boundaries. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: home-context portraits and veterinarian photographs. Crop guidance: large welcoming hero portrait, small profile thumbnails, varied article crops. Focal role: keep pet-family interaction gentle and legible; never imply a source person represents the generated practice. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: icon-led service compass at the opening followed by a plain vertical service menu. Early action: location finder appears directly below the opening promise. Primary placement: find the appropriate provider or service area. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **place location and care-finder actions before stacked service, profile, testimonial, and resource chapters**. make the service compass a touch-friendly two-column or vertical set; keep long service labels fully visible; avoid an always-on chat tool obscuring content; provide non-carousel ways to reach profiles and stories.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: portrait and testimonial carousels with visible next/previous controls. Reduced-motion contract: show a static, browsable set of profiles and testimonials. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **care-service-compass** ([data-reference-signature=care-service-compass]): A compact set of distinct care routes appears near the opening as a service compass. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **provider-profile-story** ([data-reference-signature=provider-profile-story]): A verified provider or process profile uses a restrained editorial portrait and short readable context. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **support-resource-mosaic** ([data-reference-signature=support-resource-mosaic]): Practical education or preparation content is presented as a varied editorial resource group, not another uniform product grid. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
