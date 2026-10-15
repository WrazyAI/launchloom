# Visual hierarchy

Use the screenshots and Reference DNA to study how a specialized homecare provider separates its opening promise, clinical context, service choices, and contact path. Keep the LaunchLoom care recipe calm and person-centered: plain language, welcoming photography, generous spacing, and readable contrast. Present the client's verified support scope in a short opening beside one relevant image, followed by one primary consultation action and one useful secondary contact option. Use a clinical tone only where client facts support it. The screenshots contain dense copy, repeated violet panels, source logos, specialist marks, and care photography; none of those exact source elements may be reused.

# Page sequence

For a new provider, translate the source's education-first rhythm into a clear promise, a brief explanation of how support is arranged, an organized service list, practical guidance for families, verified trust evidence, and a straightforward consultation close. Keep dementia, Parkinson's, nursing, therapy, personal care, and companionship distinct according to the verified business. Do not claim that the client has nurses, case managers, specialist training, accreditation, clinical oversight, or disease-specific outcomes unless the facts are independently confirmed. Avoid repeating every qualification in multiple sections. Use short paragraphs and answer useful visitor questions before asking for contact information.

# Responsive translation

At desktop width, place the first care image and promise in a stable opening stage, then alternate concise image and text chapters. Group any verified qualifications into a small trust band, but keep the page focused on visitor decisions. At mobile width, collapse the navigation into a short menu, keep the title and next action easy to find, and stack support topics into readable rows. Do not shrink the full desktop brochure into tiny text. Keep icons subordinate to their labels, buttons touch sized, forms clear, and the document within the viewport width. All images must have a static fallback; no autoplay or scroll lock is allowed.

# Signature elements

Retain a visible care promise, a compact explanation of the approach, service topics that are easy to compare, and a next-step action after the visitor has enough context. If the client has genuine staff or home imagery, use it with dignity and preserve the people's actual roles. When no matching client image exists, use approved or generated imagery that does not depict an invented employee, customer, diagnosis, outcome, or facility. A proof section should display only claims with a supplied source.

# Prohibited patterns

Do not copy the source's name, logo, violet brand system, exact wording, photographs, people, icon set, accreditation marks, testimonials, health claims, program names, credentials, or outcomes. Never imply nursing or medical care when the client offers non-clinical home support. Do not invent response time, safety results, professional oversight, disease expertise, coverage, hours, service prices, or guarantees. Avoid cramped paragraphs, a long repeated icon wall, tiny mobile text, image overlays without a readable backing, and decorative claims that compete with the next step. Do not expose internal implementation details in the client flow. Generated content must contain no em dash.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **Angels on Call specialized homecare story**; family: `attested-angels-on-call-homecare`; subject fit: specialized homecare, private duty care, home health services, home-care. Production eligibility is unchanged.
- Open the paired full-page captures: desktop: `screenshots/desktop.png`, captured viewport 1440 x 900; mobile: `screenshots/mobile.png`, captured viewport 390 x 844. Read the opening at its captured viewport and then inspect the whole page. A full-page image's total height is not CSS vh.
- Use this dossier alone for its route, not an average of the other candidates. Verified client facts, sealed content, accessibility, client font/palette choices and host runtime rules constrain the adaptation. Preserve the assigned composition, section order and signatures; if evidence and prose disagree, identify the conflict rather than silently rewriting the curated contract.
- Separate observed design from proposed client treatment. Do not claim an exact font, hex value, spacing measurement, interaction or animation was observed unless retained evidence supports it. Static captures do not prove scroll, hover or click behavior.

### Opening layout contract

**desktop: media-overlay / copy-over-media**

```text
[ navigation ]
[ media field: copy + action over image ]
```

Keep copy inside the media field, not in a separate adjacent card. Choose a quiet crop, a proving foreground color, or a soft scrim; never box text lines to fix contrast, and do not move copy outside the image.

**mobile: media-overlay / copy-over-media**

```text
[ navigation ]
[ media field: copy + action over image ]
```

Keep copy inside the media field, not in a separate adjacent card. Choose a quiet crop, a proving foreground color, or a soft scrim; never box text lines to fix contrast, and do not move copy outside the image.

These are relationship diagrams, not pixel specifications. Resolve alignment, proportions, whitespace and focal crop from the paired captures and original Visual hierarchy. Desktop header plus complete hero must fit 1536 x 864 at normal zoom, even if the source was captured at a taller viewport. Mobile may be content-height driven.

### Page rhythm and content mapping

Keep these assigned chapters in order; the numbers below describe actual page sequence, not decorative labels to add to the site:

1. **contact utility and navigation**
2. **photo-led specialist-care promise**
3. **recognition banner**
4. **care context and process chapters**
5. **expertise pillars**
6. **service catalog**
7. **relationship story**
8. **recognition proof**
9. **consultation close**
10. **newsletter and footer**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: bold geometric sans. Body character: small neutral sans with restrained line length. Hierarchy: large chapter headings, compact clinical utility copy, repeated service labels. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: violet; white; pale lavender; light gray. Contrast intent: high-contrast white bands and violet separators around dense care information. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: human-scale homecare photography paired with simple clinical support icons. Crop guidance: wide hero image followed by alternating contained scenes. Focal role: keep caregiver and recipient interactions visible without implying client ownership of the source people. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: icon-led expertise rows followed by grouped homecare service tiles. Early action: repeat after the explanatory and recognition chapters. Primary placement: consultation action inside the hero. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **compact navigation followed by a single-column care guide**. keep hero copy short and action controls touch sized; use one care image at a time; break long expertise copy into clearly separated rows; avoid compressing text into a miniature brochure; stack the service catalog without sideways page overflow.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: mostly static chapter flow with optional source-owned moving content. Reduced-motion contract: render icon rows and proof panels as static content and avoid autoplay. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **care-promise-scene** ([data-reference-signature=care-promise-scene]): opening care promise set against one contextual homecare scene. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **expertise-pillars** ([data-reference-signature=expertise-pillars]): clearly separated support topics with accessible labels. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **service-catalog** ([data-reference-signature=service-catalog]): service options grouped as scannable links rather than an undifferentiated icon wall. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **consultation-close** ([data-reference-signature=consultation-close]): plain next-step prompt following the explanatory chapters. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
