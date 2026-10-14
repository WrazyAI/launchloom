# Visual hierarchy

This dossier is currently ineligible for production selection because the supplied full-page evidence loses most text against light sections. Keep it archived for review until clearer desktop and mobile references replace or resolve that defect. If a designer inspects it manually, use only the broad idea of a confident opening followed by a progressive practice-area guide. Do not reproduce the original dark neon hero, justice illustration, exact white-on-white treatment, logo, portraits, chapter numerals, wording, testimonials, or page trade dress. Any new legal-services experience must use high-contrast type, concise factual positioning, and a contact path visible near the opening.

# Page sequence

For an independently verified law firm, use a clear professional promise; a short explanation of the client's scope and jurisdictions; a scannable practice-area index; practical descriptions of how a first conversation proceeds; verified professional biographies or proof; useful client questions; and a direct contact close. Keep legal matters precise and avoid guaranteeing outcomes. The source includes corporate, tax, intellectual property, crypto, immigration, dispute, criminal, mediation, and real-estate topics, but none of those specialties should be assigned to a client without evidence. Do not copy its testimonials or source-specific credentials. Separate each practice area so visitors can identify what is relevant without reading a long unstructured essay.

# Responsive translation

On desktop, keep navigation compact and give the positioning statement enough width and contrast to read immediately. A side index may be used only if all labels stay visible and keyboard accessible. At mobile widths, move the contact action into the opening flow, stack practice areas in ordinary document order, and remove any fixed elements that cover the content. Do not rely on scroll-triggered animation to reveal headings, descriptions, or forms. Use a responsive type scale, strong foreground/background contrast, and generous touch spacing. Confirm no horizontal overflow before treating a replacement capture as complete.

# Signature elements

A usable legal-service page should connect its opening promise to a practice index, then provide enough explanation for a visitor to prepare for contact. Any sidebar or chapter numbering is optional; it must support orientation rather than decorate the page. Add an individual biography only when the client supplies its credentials and role. Place a concise contact form or verified contact details after useful context and provide clear submission feedback. Replace the source's dim chapter sequence with legible section markers and persistent reading contrast.

# Prohibited patterns

Do not use this dossier as a production visual route while its lower-page content remains visually faint. Do not imitate its justice figure, neon palette, source logo, chapter numbers, people, exact copy, testimonials, legal advice, credentials, awards, jurisdictions, office details, outcomes, or promises. Never invent practice areas, case results, success rates, response times, fees, or guarantees. Avoid white or near-white text on pale surfaces, hidden scroll-reveal content, giant decorative numbers, generic card walls, and forms whose completion state is unclear. Keep legal copy grounded in client-approved facts and generated content free of em dashes.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **Grlica Law digital legal-services page**; family: `direct-grlica-law`; subject fit: law firm, international legal services, boutique legal practice. Archive-only: this refinement does not authorize production selection.
- Open the paired full-page captures: desktop: `screenshots/desktop.png`, captured viewport 1440 x 900; mobile: `screenshots/mobile.png`, captured viewport 375 x 844. Read the opening at its captured viewport and then inspect the whole page. A full-page image's total height is not CSS vh.
- Use this dossier alone for its route, not an average of the other candidates. Verified client facts, sealed content, accessibility, client font/palette choices and host runtime rules constrain the adaptation. Preserve the assigned composition, section order and signatures; if evidence and prose disagree, identify the conflict rather than silently rewriting the curated contract.
- Separate observed design from proposed client treatment. Do not claim an exact font, hex value, spacing measurement, interaction or animation was observed unless retained evidence supports it. Static captures do not prove scroll, hover or click behavior.

### Opening layout contract

**desktop:** no normalized opening topology is recorded. Read the paired capture and the original hierarchy/mobile notes before drawing this viewport's wireframe. Do not infer a split hero from the absence of a label.

**mobile:** no normalized opening topology is recorded. Read the paired capture and the original hierarchy/mobile notes before drawing this viewport's wireframe. Do not infer a split hero from the absence of a label.

These are relationship diagrams, not pixel specifications. Resolve alignment, proportions, whitespace and focal crop from the paired captures and original Visual hierarchy. Desktop header plus complete hero must fit 1536 x 864 at normal zoom, even if the source was captured at a taller viewport. Mobile may be content-height driven.

### Page rhythm and content mapping

Keep these assigned chapters in order; the numbers below describe actual page sequence, not decorative labels to add to the site:

1. **dark hero and contact**
2. **chapter index**
3. **practice areas**
4. **firm vision**
5. **testimonials**
6. **values**
7. **team**
8. **careers**
9. **contact form and office footer**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: large geometric sans. Body character: neutral sans. Hierarchy: oversized chapter numbering and short labels; body contrast is inadequate in the supplied captures. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: black hero; white or near-white chapters. Contrast intent: strong in the opening, visibly deficient through much of the light-page content. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: illustrative justice figure with luminous edge color and small portrait crops. Crop guidance: central hero illustration followed by small circular team portraits. Focal role: source focal image is highly branded and must not be reused. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: long practice-area list with sequential chapter framing. Early action: contact form appears at the end of the full page. Primary placement: small contact control in the hero. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **narrow chapter stack under a compact menu**. do not preserve oversized numerals when they displace readable copy; use dark readable text on light panels; keep all sections visible without animation; place the contact action in the opening flow; prevent width overflow.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: scroll-linked chapter and portrait movement suggested by the page. Reduced-motion contract: keep all section content visible in normal document flow. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **legal-promise-stage** ([data-reference-signature=legal-promise-stage]): a clear professional positioning statement with an early contact route. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **practice-area-index** ([data-reference-signature=practice-area-index]): scannable practice links in a deliberate chapter sequence. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **contact-close** ([data-reference-signature=contact-close]): accessible contact form or verified contact details at the page close. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
