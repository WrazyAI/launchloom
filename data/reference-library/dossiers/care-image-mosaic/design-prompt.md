# Reference implementation brief

Archive status: LaunchLoom-owned historical study. This dossier is deliberately ineligible for production randomization (`productionEligible: false`). The design analysis below is retained for traceability and is not an active route prompt.
## Scope and non-copy rule
Use the paired screenshots as evidence for layout mechanics, design rhythm, type hierarchy, image placement, and interaction opportunities only. Re-author every word, asset, logo, and brand element for the client. Use verified client facts and SEO content tokens; do not transfer the fictional prototype's claims, address, staff, prices, or sample copy. Keep Services, FAQs, and Contact discoverable.

## Visual hierarchy
Open on a warm-paper canvas with a left-side care promise and a deliberately offset cluster of large landscape image windows on the right. Use a humanist sans with a large stacked headline and concise supporting text. Keep the photo cluster visibly related through matching crops and a quiet green frame; do not turn it into unrelated thumbnails.

## Page sequence
Follow the mosaic opening with a narrow first-conversation band, a short care explanation, open service panels, a practical process chapter, concise FAQs, factual trust information, and a two-column closing contact conversation. Let each section change surface or alignment so the full page has a clear pace.

## Interaction and motion
Reveal the image windows in a short stagger or let a service row show its detail inline. The image relationship must remain understandable if all motion is disabled. The main action belongs immediately after the promise, before extended reassurance or service copy.

## Responsive translation
At 390px, place the promise and action before a vertical sequence of crops. Preserve the different window proportions, but remove overlap that obscures people or text. Make service rows full-width tap targets and keep the first contact action above the long explanatory chapters.

## Signature elements
Preserve these mechanics in the new implementation: An asymmetrical promise-and-mosaic opening; several windows into a coherent care image story; a conversion band directly after the hero; and open editorial service rows rather than a card grid.

## Prohibited patterns
Do not introduce any of the following: Unrelated stock-photo grids, long why-us paragraphs, repeated claims about compassionate care, a centered generic split hero, clinical-blue dashboard components, or testimonials and credentials not supplied by the client.

## Local SEO and conversion constraints
Bind the business name, primary service, verified service area, contact details, pricing, qualifications, and FAQs to sealed content tokens and the researched intake. Place the main conversion action near the opening promise, then repeat it at useful decision points. Never invent a physical office from a service-area list, reviews, certifications, response times, operating hours, or outcomes. Do not use em dashes. At 1536x864 and 1366x768, the complete desktop navigation and hero must fit the opening viewport; at 390x844, preserve the intended composition with no horizontal overflow.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **Care modern-clinic image mosaic study**; family: `care-modern-clinic-mosaic`; subject fit: healthcare, home-care, elder-care, wellness. Archive-only: this refinement does not authorize production selection.
- Open the paired full-page captures: desktop: `screenshots/desktop.png`, captured viewport 1440 x 1000; mobile: `screenshots/mobile.png`, captured viewport 390 x 844. Read the opening at its captured viewport and then inspect the whole page. A full-page image's total height is not CSS vh.
- Use this dossier alone for its route, not an average of the other candidates. Verified client facts, sealed content, accessibility, client font/palette choices and host runtime rules constrain the adaptation. Preserve the assigned composition, section order and signatures; if evidence and prose disagree, identify the conflict rather than silently rewriting the curated contract.
- Separate observed design from proposed client treatment. Do not claim an exact font, hex value, spacing measurement, interaction or animation was observed unless retained evidence supports it. Static captures do not prove scroll, hover or click behavior.

### Opening layout contract

**desktop:** no normalized opening topology is recorded. Read the paired capture and the original hierarchy/mobile notes before drawing this viewport's wireframe. Do not infer a split hero from the absence of a label.

**mobile:** no normalized opening topology is recorded. Read the paired capture and the original hierarchy/mobile notes before drawing this viewport's wireframe. Do not infer a split hero from the absence of a label.

These are relationship diagrams, not pixel specifications. Resolve alignment, proportions, whitespace and focal crop from the paired captures and original Visual hierarchy. Desktop header plus complete hero must fit 1536 x 864 at normal zoom, even if the source was captured at a taller viewport. Mobile may be content-height driven.

### Page rhythm and content mapping

Keep these assigned chapters in order; the numbers below describe actual page sequence, not decorative labels to add to the site:

1. **hero**
2. **image-mosaic**
3. **conversion-band**
4. **editorial-intro**
5. **services**
6. **process**
7. **faq**
8. **proof**
9. **contact**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: humanist grotesk. Body character: neutral sans. Hierarchy: large stacked headline with concise supporting text. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: warm white; soft sage; deep green. Contrast intent: calm contrast with restrained color panels. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: offset care-image mosaic. Crop guidance: one broad landscape crop with smaller supporting windows. Focal role: people and setting kept recognizable. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: open editorial service panels. Early action: immediately after hero. Primary placement: first-conversation action within the opening region. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **image-first stacked mosaic**. stack image windows without overlap; keep headline and primary action before supporting copy; preserve service-row tap targets.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: staggered image-window reveal. Reduced-motion contract: show the complete still mosaic. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **care-image-mosaic** ([data-reference-signature=care-image-mosaic]): offset image windows beside the care promise. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **open-service-panels** ([data-reference-signature=open-service-panels]): open service rows instead of a uniform card wall. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
