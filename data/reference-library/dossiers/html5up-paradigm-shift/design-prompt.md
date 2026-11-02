# Reference implementation brief

## Visual hierarchy
Build a two-field opening. One field carries an oversized statement in a bold geometric sans, a small all-caps descriptor, a short credit line, and a single downward cue. The opposite field carries a full-height, subject-safe photograph. Use a saturated mint surface, black type, and white space. The statement must dominate; the photograph supplies texture, not a second headline.

## Page sequence
After the split opening, use stacked feature chapters with short headings and readable text columns. Include one element showcase that demonstrates type, lists, buttons, and forms, then a compact contact block and footer. Keep the chapters varied in density so the page reads as an editorial sequence rather than a repeated card grid.

## Responsive translation
At mobile width, stack the statement and the photograph, then the feature chapters. Keep the oversized title legible and avoid clipping. Preserve a face-safe photo crop, keep the first action visible, and remove any horizontal overflow. The split desktop field becomes a vertical editorial stack.

## Signature elements
Carry the split statement-and-photo opening and the stacked feature chapters. Translate the mint field, oversized type, and full-height photograph with new-client content and original presentation. Do not treat the source mint color or photograph as brand assets.

## Prohibited patterns
Do not reuse the source mint-and-photo composition as a brand, and do not reuse source copy, photography, or trade dress. Do not invent services, prices, credentials, or outcomes. Do not copy source code into a client site. Avoid flattening the opening into a generic card grid and avoid low-contrast type.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **Paradigm Shift by HTML5 UP: split type-and-photo statement**; family: `html5up-paradigm-shift-family`; subject fit: creative-studio, agency, architecture, interior-design. Production eligibility is unchanged.
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

1. **split statement hero**
2. **feature chapters**
3. **element showcase**
4. **contact block**
5. **footer**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: bold geometric sans with tight leading. Body character: same geometric sans. Hierarchy: oversized display against small caps labels. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: mint green; white; black. Contrast intent: high-contrast black on mint. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: full-height portrait photograph. Crop guidance: cover, subject-safe. Focal role: face-safe. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: stacked feature chapters. Early action: in the opening. Primary placement: down arrow into content. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **stack the statement, then the photograph, then chapters**. keep the oversized title readable; preserve a subject-safe photo crop; avoid horizontal overflow.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: restrained reveal. Reduced-motion contract: static. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **split-statement-hero** ([data-reference-signature=split-statement-hero]): half type field and half full-height photograph. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **feature-chapters** ([data-reference-signature=feature-chapters]): stacked short chapters with headings and text columns. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
