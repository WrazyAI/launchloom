# Reference implementation brief: Sanctuary wordmark and room index

## Scope and non-copy rule

Use the paired captures to study a highly restrained residential architecture presentation: architectural image as a quiet canvas, one oversized wordmark, expansive white space, a centered sequence of evocative project/room names, a single cinematic presentation panel, and a dark minimal navigation close. Translate this rhythm into a client's own practice and actual approved portfolio. Do not use McAlpine's logo, image, project/room names, Roman numeral sequence, film, text, contact details, or exact spacing as a cloned page. Do not call source projects the client's projects.

## Visual hierarchy

Allow one architectural photograph to occupy the first viewport, with a large, low-frequency wordmark or brand expression placed directly over it. Keep the top utility controls very small and useful. The transition to the body should feel intentionally quiet: a short project or practice label appears alone, followed by a single film/image object with generous margins. Build the project/service names into a narrow vertical index using a high-contrast editorial serif; tiny ordinal marks are acceptable only as navigation anchors, not as false project metrics. Use a white or warm-white field, charcoal text, and a single deep-gray footer plane. Avoid decorative color systems and sales-card conventions.

## Page sequence

1. Minimal menu control and verified contact route over a full-bleed architectural scene.
2. Large brand wordmark and one concise local practice statement; make the actual service and market explicit in HTML text even when the image is atmospheric.
3. One featured project/presentation frame with meaningful alt text and approved media.
4. A vertically composed index of project or service chapters, each using the client's real service/project labels and linking to useful detail.
5. A short process or practice note that supplies the factual SEO depth without breaking the minimal rhythm.
6. A compact FAQ set covering scope, site visits, preparation, timing and the first conversation only where answers are verified.
7. Dark contact/navigation close with working phone, email or project form.

## Responsive translation

At 390px, let the photographic opening remain full-width, but scale the wordmark to fit inside the content edges. Keep menu controls visible and accessible. The centered index becomes one clear column with readable labels, no overlapping numerals and ample touch height. The featured film/image retains its aspect ratio and has a poster/static fallback. Put location/service clarity in a short HTML statement before the visitor reaches the index. The dark footer stacks its navigation and contact channels. Verify no horizontal overflow at 390px and 320px.

## Signature elements

- Full-bleed architectural opening with one restrained brand expression.
- Exceptionally sparse transition into a single featured work/presentation frame.
- Narrow vertical serif index of project or service names.
- Large margins as a deliberate pacing device, balanced by useful local service information.
- Distinct dark closing navigation/contact field.

## Prohibited patterns

- Reproducing McAlpine's wordmark, photography, project names, film, Roman numeral labels or source copy.
- Copying the exact white-space ratios if they cause essential service, location or CTA content to disappear.
- Using names as unsupported project claims, or inventing a physical studio address from portfolio context.
- Autoplay-only video, hover-only chapter navigation, fake awards, invented staff or unverified project history.
- Applying this sparse residential architecture grammar to a business whose customers need urgent triage or immediate price discovery.

## Local SEO and conversion

The minimal look does not excuse a vague page. State the actual architecture/interior service, intended project fit, and real service area in visible text and metadata. Use researched customer questions for useful short FAQs; keep named service rows anchored to verified service scope. If the studio has no public walk-in location, do not add a map. Provide one clear consultation/enquiry action over the hero or immediately after its statement, then a second at the close. Structure data and contact details must match the visible business facts.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **McAlpine sanctuary wordmark and room index**; family: `lapa-mcalpine-sanctuary`; subject fit: architecture, residential-architecture, interior-design, luxury-home-design, design-studio. Production eligibility is unchanged.
- Open the paired full-page captures: desktop: `screenshots/desktop.png`, captured viewport 1440 x 1000; mobile: `screenshots/mobile.png`, captured viewport 390 x 844. Read the opening at its captured viewport and then inspect the whole page. A full-page image's total height is not CSS vh.
- Use this dossier alone for its route, not an average of the other candidates. Verified client facts, sealed content, accessibility, client font/palette choices and host runtime rules constrain the adaptation. Preserve the assigned composition, section order and signatures; if evidence and prose disagree, identify the conflict rather than silently rewriting the curated contract.
- Separate observed design from proposed client treatment. Do not claim an exact font, hex value, spacing measurement, interaction or animation was observed unless retained evidence supports it. Static captures do not prove scroll, hover or click behavior.

### Opening layout contract

**desktop: media-overlay / copy-over-media**

```text
[ navigation ]
[ media field: copy + action over image ]
```

Keep copy inside the media field, not in a separate adjacent card. Choose a quiet crop or a local contrast plate/scrim; do not move copy outside the image to fix contrast.

**mobile: media-overlay / copy-over-media**

```text
[ navigation ]
[ media field: copy + action over image ]
```

Keep copy inside the media field, not in a separate adjacent card. Choose a quiet crop or a local contrast plate/scrim; do not move copy outside the image to fix contrast.

These are relationship diagrams, not pixel specifications. Resolve alignment, proportions, whitespace and focal crop from the paired captures and original Visual hierarchy. Desktop header plus complete hero must fit 1536 x 864 at normal zoom, even if the source was captured at a taller viewport. Mobile may be content-height driven.

### Page rhythm and content mapping

Keep these assigned chapters in order; the numbers below describe actual page sequence, not decorative labels to add to the site:

1. **architectural-opening**
2. **project-label**
3. **presentation-frame**
4. **vertical-index**
5. **services**
6. **faq**
7. **dark-navigation-contact**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: high-contrast editorial serif. Body character: quiet neutral sans. Hierarchy: large brand masthead, small single labels, refined vertical project names. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: white; stone gray; deep charcoal. Contrast intent: restrained monochrome, with brand text readable on the photo and high contrast in the closing panel. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: atmospheric architectural material image and one cinematic presentation frame. Crop guidance: full-bleed opening, restrained centered media frame, minimal image chapter. Focal role: texture, branch shadows and architectural material rather than people. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: narrow vertical typographic index of service or project chapters. Early action: one visible enquiry link after the wordmark statement. Primary placement: quiet enquiry control in opening menu and dark closing panel. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **one-column sanctuary narrative**. keep wordmark within the image-safe area; stack the presentation frame at natural ratio; maintain readable project/service names; show local scope before the chapter index; stack final navigation and contact routes.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: slow reveal for image/presentation chapter only. Reduced-motion contract: show a still image and all chapter content in order. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **architectural-wordmark-scene** ([data-reference-signature=architectural-wordmark-scene]): quiet architectural image with large centered wordmark. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **presentation-frame** ([data-reference-signature=presentation-frame]): single cinematic image or static poster chapter. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **vertical-chapter-index** ([data-reference-signature=vertical-chapter-index]): narrow typographic service/project index. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **dark-contact-close** ([data-reference-signature=dark-contact-close]): dark contact and navigation closing plane. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
