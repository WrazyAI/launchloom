# Visual hierarchy

Reference: Goodman Jones accountancy advisory, captured from https://www.goodmanjones.com/ on 2026-09-26. A cinematic skyline panel carries a concise proposition and a gold specialist action before a dense, white editorial firm introduction. Centered small wordmark, low-contrast service/audience menus and a search/contact path on a narrow top bar. Confident serif section headings with readable sans paragraphs and compact uppercase taxonomy labels. White, charcoal, graphite, warm gold and occasional sandstone service fields. Skyline opening, practice-location image, case photography and editorial insight thumbnails supply the visual punctuation. Translate only these visual and information-order mechanics into a new client-owned design. Let the verified client's name, services, place, assets and actual next step determine all visible language.

# Page sequence

The observed page flows through 1. skyline-led service opening; 2. firm introduction with location image; 3. audience question accordion; 4. service color-block grid; 5. industry accordion; 6. casework samples; 7. insights collage; 8. credential marks; 9. dark footer. Preserve that rhythm only where the client has matching facts and assets. Use audience questions to route the visitor to verified services, then present a compact audit/tax/advisory taxonomy and sector detail. Offer specialist enquiry in the opening and again after relevant service evidence, without repeating it on every card. Include a locally useful service and coverage explanation from the intake, with one primary and one secondary action near the opening. A service area must remain a service area rather than an invented office.

# Responsive translation

At a 390 by 844 viewport, Collapse the hero imagery behind legible text, turn service blocks and case samples into a one-column narrative, and preserve accordion labels as clear taps. Recheck the opening at 1440 by 1000 so the main promise, first action and focal image are legible at normal zoom. On both sizes, use real links, an accessible menu, readable contrast, reachable form controls, and no horizontal overflow. Honor reduced-motion preference by presenting equivalent static information; a video or reveal may never be required to discover the next action.

# Signature elements

1. Skyline statement panel: preserve the relationship and hierarchy visible in the capture, using new imagery and the client's verified content.
2. Audience Question accordion: preserve the relationship and hierarchy visible in the capture, using new imagery and the client's verified content.
3. Stone And Graphite service blocks: preserve the relationship and hierarchy visible in the capture, using new imagery and the client's verified content.

# Prohibited patterns

- Do not carry over firm years, employee counts, client names, case work, registrations, credentials or original photography.
- Source identity, exact wording, logos, people, photographs, fonts, badges, testimonials, numerical claims or locations as client assets.
- Invented reviews, credentials, prices, guarantees, service areas, outcomes, response times or staff.
- Generic SaaS cards that replace the observed composition, and decorative motion that hides service or contact information.
- The source screenshots are internal visual evidence only. Do not hotlink or export them into a generated client site. Keep the resulting page original and inspect desktop and mobile rendering before promotion.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **Goodman Jones accountancy advisory**; family: `accounting-skyline-statement-panel`; subject fit: accounting, accountant, bookkeeping, chartered-accountant. Production eligibility is unchanged.
- Open the paired full-page captures: desktop: `screenshots/desktop.png`, captured viewport 1440 x 1000; mobile: `screenshots/mobile.png`, captured viewport 390 x 844. Read the opening at its captured viewport and then inspect the whole page. A full-page image's total height is not CSS vh.
- Use this dossier alone for its route, not an average of the other candidates. Verified client facts, sealed content, accessibility, client font/palette choices and host runtime rules constrain the adaptation. Preserve the assigned composition, section order and signatures; if evidence and prose disagree, identify the conflict rather than silently rewriting the curated contract.
- Separate observed design from proposed client treatment. Do not claim an exact font, hex value, spacing measurement, interaction or animation was observed unless retained evidence supports it. Static captures do not prove scroll, hover or click behavior.

### Opening layout contract

**desktop: image-led-stage / media-leads-copy**

```text
[ navigation ]
[ dominant skyline media: promise + specialist action inside ]
[ separate firm-introduction chapter ]
```

Keep the promise and specialist action inside the opening media panel, subordinate to its dominant image. Preserve the pause before the separate firm introduction; do not move the opening action into a later detached text block.

**mobile: media-overlay / copy-over-media**

```text
[ navigation ]
[ media field: copy + action over image ]
```

Keep copy inside the media field, not in a separate adjacent card. Choose a quiet crop, a proving foreground color, or a soft scrim; never box text lines to fix contrast, and do not move copy outside the image.

These are relationship diagrams, not pixel specifications. Resolve alignment, proportions, whitespace and focal crop from the paired captures and original Visual hierarchy. Desktop header plus complete hero must fit 1536 x 864 at normal zoom, even if the source was captured at a taller viewport. Mobile may be content-height driven.

### Page rhythm and content mapping

Keep these assigned chapters in order; the numbers below describe actual page sequence, not decorative labels to add to the site:

1. **skyline-led service opening**
2. **firm introduction with location image**
3. **audience question accordion**
4. **service color-block grid**
5. **industry accordion**
6. **casework samples**
7. **insights collage**
8. **credential marks**
9. **dark footer**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: Confident serif section headings with readable sans paragraphs and compact uppercase taxonomy labels. Body character: readable supporting text with visible heading hierarchy. Hierarchy: one dominant opening statement, clear section headings and compact service labels. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: White; charcoal; graphite; warm gold and occasional sandstone service fields. Contrast intent: preserve readable contrast; source colors are inspiration, not a copied brand palette. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: Skyline opening, practice-location image, case photography and editorial insight thumbnails supply the visual punctuation. Crop guidance: site-specific focal crops at desktop and mobile. Focal role: client-owned or reviewed licensed imagery only; preserve the role of each source image rather than its subject identity. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: Use audience questions to route the visitor to verified services, then present a compact audit/tax/advisory taxonomy and sector detail. Early action: primary and secondary actions should be visible near the first promise. Primary placement: Offer specialist enquiry in the opening and again after relevant service evidence, without repeating it on every card. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **Collapse the hero imagery behind legible text, turn service blocks and case samples into a one-column narrative, and preserve accordion labels as clear taps**. keep source-specific hierarchy and decision sequence; use a 390 px single-column or deliberate two-column layout without overflow; keep touch actions and form labels visible; remove motion dependence.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: manual-hero-slides; accordion-disclosure. Reduced-motion contract: all copy, imagery and actions visible statically. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **skyline-statement-panel** ([data-reference-signature=skyline-statement-panel]): A new-client interpretation of the observed skyline statement panel relationship, with source identity and assets excluded. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **audience-question-accordion** ([data-reference-signature=audience-question-accordion]): A new-client interpretation of the observed audience-question accordion relationship, with source identity and assets excluded. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **stone-and-graphite-service-blocks** ([data-reference-signature=stone-and-graphite-service-blocks]): A new-client interpretation of the observed stone-and-graphite service blocks relationship, with source identity and assets excluded. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
