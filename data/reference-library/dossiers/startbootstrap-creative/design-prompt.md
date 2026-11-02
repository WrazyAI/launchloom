# Reference implementation brief

## Visual hierarchy
Lead with a full-bleed photograph behind a centered white promise and one orange pill action. Use a rounded geometric sans with large centered headings. The photograph supplies the energy; the copy stays short. Follow with a solid orange band carrying one promise and one white action. Keep the accent color concentrated in the hero and the band rather than spread across every section.

## Page sequence
After the masthead, use the orange promise band, then four icon-led feature columns, then a six-image workshop grid, a dark download band, a contact form, and a light footer. Each section should have one job. The image grid should read as a gallery of work, not as service cards.

## Responsive translation
At mobile width, stack the masthead, orange band, feature columns, image grid, dark band, and contact form. Keep the masthead action visible, preserve image crops, and avoid horizontal overflow. The centered headings should remain readable rather than shrinking into the image.

## Signature elements
Carry the full-bleed photographic masthead, the orange promise band, and the six-image workshop grid. Translate them with client-cleared photography and original copy. Do not reuse the source workshop photos or the Start Bootstrap demo copy.

## Prohibited patterns
Do not reuse source photography, copy, or trade dress. Do not invent services, prices, guarantees, or outcomes. Do not copy source code into a client site. Avoid replacing the masthead with a generic card grid, avoid a repetitive feature wall, and avoid low-contrast actions.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **Start Bootstrap Creative: full-bleed photo masthead with orange bands**; family: `startbootstrap-creative-family`; subject fit: fitness, gym, creative-studio, agency. Production eligibility is unchanged.
- Open the paired full-page captures: desktop: `screenshots/desktop.png`, captured viewport 1440 x 900; mobile: `screenshots/mobile.png`, captured viewport 390 x 844. Read the opening at its captured viewport and then inspect the whole page. A full-page image's total height is not CSS vh.
- Use this dossier alone for its route, not an average of the other candidates. Verified client facts, sealed content, accessibility, client font/palette choices and host runtime rules constrain the adaptation. Preserve the assigned composition, section order and signatures; if evidence and prose disagree, identify the conflict rather than silently rewriting the curated contract.
- Separate observed design from proposed client treatment. Do not claim an exact font, hex value, spacing measurement, interaction or animation was observed unless retained evidence supports it. Static captures do not prove scroll, hover or click behavior.

### Opening layout contract

**desktop: image-led-stage / media-leads-copy**

```text
[ navigation ]
[ dominant media stage ]
[ supporting promise + action ]
```

Let the media lead the opening. Keep supporting copy subordinate and maintain the source's visual pause before the next chapter; do not substitute equal-weight text/image columns.

**mobile: image-led-stage / media-leads-copy**

```text
[ navigation ]
[ dominant media stage ]
[ supporting promise + action ]
```

Let the media lead the opening. Keep supporting copy subordinate and maintain the source's visual pause before the next chapter; do not substitute equal-weight text/image columns.

These are relationship diagrams, not pixel specifications. Resolve alignment, proportions, whitespace and focal crop from the paired captures and original Visual hierarchy. Desktop header plus complete hero must fit 1536 x 864 at normal zoom, even if the source was captured at a taller viewport. Mobile may be content-height driven.

### Page rhythm and content mapping

Keep these assigned chapters in order; the numbers below describe actual page sequence, not decorative labels to add to the site:

1. **overlay navigation**
2. **full-bleed photo masthead**
3. **orange promise band**
4. **four feature columns**
5. **six-image grid**
6. **dark download band**
7. **contact form**
8. **footer**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: rounded geometric sans. Body character: same rounded sans. Hierarchy: large centered headings. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: warm wood photograph; orange; white; charcoal. Contrast intent: energetic high contrast. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: full-bleed hero and six-image workshop grid. Crop guidance: cover. Focal role: subject-safe. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: four feature columns. Early action: in the masthead and orange band. Primary placement: Find Out More. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **stack the masthead, orange band, features, image grid, and contact form**. keep the masthead action visible; preserve image crops; avoid horizontal overflow.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: restrained. Reduced-motion contract: static. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **full-bleed-masthead** ([data-reference-signature=full-bleed-masthead]): photograph fills the opening behind centered copy and one action. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **orange-promise-band** ([data-reference-signature=orange-promise-band]): solid orange band with a short promise and one action. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **image-grid** ([data-reference-signature=image-grid]): six-image workshop grid. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
