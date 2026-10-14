# Reference implementation brief: Storm-response roofing

## Scope and non-copy rule

Use the paired captures as a licensed visual reference for composition, section rhythm, interaction, and conversion. The source template is CC BY 4.0; its license and attribution are retained in this dossier. Do not copy the fictional Ridgeline brand, wording, phone, proof metrics, warranty, insurance statements, or service promises. The hero art is AI-generated placeholder artwork, not a real roof or customer property. Client facts and SEO copy come only from sealed, researched tokens.

## Visual hierarchy

Start with a narrow signal-orange status band, then compact navigation with a visible phone route. The opening is a dark cinematic roof scene, not a conventional white split hero. Put an oversized condensed inspection promise on the left over a text-safe charcoal fade; let the roofline and warm edge light occupy the right. Pair one primary inspection/request action with a quieter call action. A thin proof strip can follow only when verified facts exist. Use orange sparingly for active state, warnings, and next steps.

## Page sequence

Move from the opening into a self-check that only asks visitors to select visible symptoms from ground level. Follow with an accessible before/after project comparison, then a five-step process that separates what the homeowner does from what the contractor does. A shingle/material selector and warranty explanation may follow when the client supplies real options. Close with concise FAQs and a detailed inspection request form. Do not repeat the same CTA in every chapter.

## Interaction and motion

Use two useful mechanics: a short symptom checklist that changes its explanation, and a drag comparison with keyboard/touch support. Keep the roof hero static; no background video or scroll lock. On reduced motion, show the comparison in a clear default state and all diagnostic content without animation.

## Responsive translation

At 390px, keep the alert band, service promise, and request/call actions together. Stack the checklist and process rows in reading order. The before/after control must stay within the viewport, allow arrow-key adjustment, and not rely on drag alone. Replace wide stats with a compact two-column list only if verified data exists. Check 390x844 and 320px widths for overflow.

## Signature elements

Preserve the alert-strip-to-roof-scene opening, a ground-level diagnostic checklist, a work comparison, and a homeowner/provider responsibility timeline. Give each a different visual treatment so the page does not collapse into cards.

## Prohibited patterns

No invented damage counts, certifications, response windows, insurance outcomes, prices, warranty duration, customer reviews, or project metrics. Do not reproduce source copy or image. Avoid generic bento cards, a floating glass nav pill, decorative number stacks, and a carousel-only proof section.

## Local SEO and conversion

Put the verified primary roofing service and service area in the opening, then make repair, inspection, and replacement paths scannable. Use researched customer terms naturally in service explanations and FAQs. Phone and form actions must route to the client’s actual contact system; never treat the template demo form as functional.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **Storm-response roofing inspection**; family: `spicer-roofing-storm-response`; subject fit: roofing, home-services, local-trades, storm-repair. Archive-only: this refinement does not authorize production selection.
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
2. **conversion-band**
3. **services**
4. **image-chapter**
5. **process**
6. **products**
7. **proof**
8. **faq**
9. **contact**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: heavy condensed grotesk with uppercase labels. Body character: compact humanist sans. Hierarchy: large three-to-five-line poster headline, very small technical labels, readable body copy. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: near-black; charcoal; warm paper. Contrast intent: high contrast; reserve orange for urgency, focus and next actions. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: cinematic roofline illustration with a darkened photograph-like texture. Crop guidance: wide cover crop with fade into a solid text-safe region. Focal role: roof edge and warm light on the right; headline stays over quiet dark space. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: ground-level damage checklist followed by direct repair and replacement choices. Early action: after the alert band and before the damage checklist. Primary placement: inspection request inside the first hero viewport. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **poster-first stacked service flow**. show promise and request action before stats; stack diagnostic choices without horizontal scrolling; make comparison handle keyboard and touch accessible; keep the first FAQ and contact path easy to reach.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: severity response on selected visible symptoms and a draggable comparison handle. Reduced-motion contract: static comparison with all form and service choices visible. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **storm-alert-band** ([data-reference-signature=storm-alert-band]): narrow high-visibility alert band above the utility navigation. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **damage-self-check** ([data-reference-signature=damage-self-check]): ground-level symptom checklist that makes a roof concern legible. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **work-comparison** ([data-reference-signature=work-comparison]): before/after work comparison with an accessible control. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **claim-timeline** ([data-reference-signature=claim-timeline]): step timeline separating visitor actions from provider actions. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
