# Reference implementation brief

Archive status: LaunchLoom-owned historical study. This dossier is deliberately ineligible for production randomization (`productionEligible: false`). The design analysis below is retained for traceability and is not an active route prompt.
## Scope and non-copy rule
Use the paired screenshots as evidence for layout mechanics, design rhythm, type hierarchy, image placement, and interaction opportunities only. Re-author every word, asset, logo, and brand element for the client. Use verified client facts and SEO content tokens; do not transfer the fictional prototype's claims, address, staff, prices, or sample copy. Keep Services, FAQs, and Contact discoverable.

## Visual hierarchy
Use an immersive, near-black salon opening led by the interior photograph, not a two-column marketing split. Anchor a short editorial serif promise to the scene, then use small warm-metal labels and restrained utility links. Keep one booking action visible in the first scene. Image light, wood, seating, and shadow establish the atmosphere; do not add unrelated floating decoration.

## Page sequence
Move from the room scene to a distinct sensory chapter, a concise editorial explanation, service chapters, a simple preparation/process moment, a second cinematic closing scene, FAQs, and contact. The service list should feel like an evening program, not four repeated cards. Use real service names and appointment details only from sealed business content.

## Interaction and motion
A slow image crossfade or image-crop reveal can connect the room and material details. Prefer one controlled sequence with a static image fallback. Keep motion subtle enough that the words and booking control remain immediately readable; do not pin the whole page or make booking dependent on animation.

## Responsive translation
On 390px, let the room crop lead, then place the promise, short support, and booking action in normal flow. Make each material chapter a separate full-width image/text beat. Avoid text over the brightest photograph areas, remove pinned behavior, and keep the phone or booking route reachable without a hover.

## Signature elements
Preserve these mechanics in the new implementation: A low-light room-scene hero with copy inset into its composition; a distinct close-detail or atmosphere chapter; a restrained chapter-based service presentation; and a final image scene that resolves into the booking action.

## Prohibited patterns
Do not introduce any of the following: Bright clinic colors, generic beige luxury cards, a floating white pill navbar, numbered service tiles, borrowed salon claims, invented staff, or a copy-heavy process essay.

## Local SEO and conversion constraints
Bind the business name, primary service, verified service area, contact details, pricing, qualifications, and FAQs to sealed content tokens and the researched intake. Place the main conversion action near the opening promise, then repeat it at useful decision points. Never invent a physical office from a service-area list, reviews, certifications, response times, operating hours, or outcomes. Do not use em dashes. At 1536x864 and 1366x768, the complete desktop navigation and hero must fit the opening viewport; at 390x844, preserve the intended composition with no horizontal overflow.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **LaunchLoom nocturnal salon study**; family: `launchloom-nocturnal-salon`; subject fit: hospitality, fine-jewelry, luxury-retail, beauty. Archive-only: this refinement does not authorize production selection.
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
2. **image-chapter**
3. **editorial-intro**
4. **services**
5. **process**
6. **closing-scene**
7. **faq**
8. **contact**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: high-contrast display serif. Body character: neutral humanist sans. Hierarchy: large statement with small utility labels. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: near-black; espresso; warm ivory. Contrast intent: low-light contrast with clear text surfaces. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: warm interior and material close-ups. Crop guidance: wide room scene followed by tight detail crops. Focal role: light sources and material texture. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: sensory service chapters. Early action: after opening scene. Primary placement: quiet booking action in hero. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **single-column cinematic scenes**. keep the call action in the opening flow; crop people and materials safely; remove pinned scenes.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: slow scene crossfade. Reduced-motion contract: use static image chapters. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **nocturnal-scene** ([data-reference-signature=nocturnal-scene]): full-bleed low-light opening scene. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **material-chapter** ([data-reference-signature=material-chapter]): distinct material or atmosphere image chapter. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
