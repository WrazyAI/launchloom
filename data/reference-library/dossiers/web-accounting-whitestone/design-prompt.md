# Visual hierarchy

Reference: Whitestone Accounting consultation desk, captured from https://www.whitestoneaccounting.co.uk/ on 2026-09-26. A wide calculator photograph sits under a dark scrim; white left copy shares the first viewport with a compact light consultation form at right. White horizontal row with square blue mark, simple pages and small phone/contact affordances. Plain sans headings and dense practical paragraphs, with uppercase blue actions and readable form labels. White, slate, teal blue, pale green and charcoal overlay. Business paperwork photograph anchors the opening, followed by a document detail and a testimonial background. Translate only these visual and information-order mechanics into a new client-owned design. Let the verified client's name, services, place, assets and actual next step determine all visible language.

# Page sequence

The observed page flows through 1. calculator hero with enquiry form; 2. practice rationale; 3. service pictogram strip; 4. how-accountants-help explainer; 5. testimonial band; 6. footer contact and form. Preserve that rhythm only where the client has matching facts and assets. Give each confirmed accounting category a simple pictogram and direct route, then answer the visitor's practical decision questions. Provide a consultation form beside the opening, a mid-page contact action and a footer contact form only if the real workflow can receive submissions. Include a locally useful service and coverage explanation from the intake, with one primary and one secondary action near the opening. A service area must remain a service area rather than an invented office.

# Responsive translation

At a 390 by 844 viewport, Put the hero promise ahead of the form, stack service pictograms in comfortable rows and keep form labels and validation visible. Recheck the opening at 1440 by 1000 so the main promise, first action and focal image are legible at normal zoom. On both sizes, use real links, an accessible menu, readable contrast, reachable form controls, and no horizontal overflow. Honor reduced-motion preference by presenting equivalent static information; a video or reveal may never be required to discover the next action.

# Signature elements

1. Form Over Photo opening: preserve the relationship and hierarchy visible in the capture, using new imagery and the client's verified content.
2. Pale Green service pictogram band: preserve the relationship and hierarchy visible in the capture, using new imagery and the client's verified content.
3. Paired footer enquiry: preserve the relationship and hierarchy visible in the capture, using new imagery and the client's verified content.

# Prohibited patterns

- Do not repeat two forms without reason, copy source partner badges, customer quote, free-consultation promise, or location details.
- Source identity, exact wording, logos, people, photographs, fonts, badges, testimonials, numerical claims or locations as client assets.
- Invented reviews, credentials, prices, guarantees, service areas, outcomes, response times or staff.
- Generic SaaS cards that replace the observed composition, and decorative motion that hides service or contact information.
- The source screenshots are internal visual evidence only. Do not hotlink or export them into a generated client site. Keep the resulting page original and inspect desktop and mobile rendering before promotion.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **Whitestone Accounting consultation desk**; family: `accounting-form-over-photo-opening`; subject fit: accounting, accountant, bookkeeping, chartered-accountant. Production eligibility is unchanged.
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

These are relationship diagrams, not pixel specifications. Resolve alignment, proportions, whitespace and focal crop from the paired captures and original Visual hierarchy. Desktop header plus complete hero must fit 1536 x 864 at normal zoom, even if the source was captured at a taller viewport. Mobile may be content-height driven. The existing topology is medium-confidence: Screenshot shows overlapping layout mechanics; preserve the hybrid treatment rather than flattening it to this primary topology.

### Page rhythm and content mapping

Keep these assigned chapters in order; the numbers below describe actual page sequence, not decorative labels to add to the site:

1. **calculator hero with enquiry form**
2. **practice rationale**
3. **service pictogram strip**
4. **how-accountants-help explainer**
5. **testimonial band**
6. **footer contact and form**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: Plain sans headings and dense practical paragraphs, with uppercase blue actions and readable form labels. Body character: readable supporting text with visible heading hierarchy. Hierarchy: one dominant opening statement, clear section headings and compact service labels. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: White; slate; teal blue; pale green and charcoal overlay. Contrast intent: preserve readable contrast; source colors are inspiration, not a copied brand palette. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: Business paperwork photograph anchors the opening, followed by a document detail and a testimonial background. Crop guidance: site-specific focal crops at desktop and mobile. Focal role: client-owned or reviewed licensed imagery only; preserve the role of each source image rather than its subject identity. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: Give each confirmed accounting category a simple pictogram and direct route, then answer the visitor's practical decision questions. Early action: primary and secondary actions should be visible near the first promise. Primary placement: Provide a consultation form beside the opening, a mid-page contact action and a footer contact form only if the real workflow can receive submissions. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **Put the hero promise ahead of the form, stack service pictograms in comfortable rows and keep form labels and validation visible**. keep source-specific hierarchy and decision sequence; use a 390 px single-column or deliberate two-column layout without overflow; keep touch actions and form labels visible; remove motion dependence.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: simple-form-states; static-sections. Reduced-motion contract: all copy, imagery and actions visible statically. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **form-over-photo-opening** ([data-reference-signature=form-over-photo-opening]): A new-client interpretation of the observed form-over-photo opening relationship, with source identity and assets excluded. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **pale-green-service-pictogram-band** ([data-reference-signature=pale-green-service-pictogram-band]): A new-client interpretation of the observed pale-green service pictogram band relationship, with source identity and assets excluded. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **paired-footer-enquiry** ([data-reference-signature=paired-footer-enquiry]): A new-client interpretation of the observed paired footer enquiry relationship, with source identity and assets excluded. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
