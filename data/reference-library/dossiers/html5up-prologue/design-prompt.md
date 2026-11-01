# Reference implementation brief

## Visual hierarchy
Use a fixed dark sidebar for identity: a portrait, name, role, icon navigation, and social links. In the main field, open with a blurred landscape photograph behind a centered light statement, a supporting line, and one muted teal action. The type is a light humanist sans. The sidebar and the image-backed intro must feel like one composition, not a header plus a separate hero.

## Page sequence
After the intro, present a captioned portfolio grid, then an about section with a short first-person statement, then contact forms. Close with a compact footer. Keep the portfolio varied in subject and crop, and keep the contact forms simple and legible. The page should read as a personal studio record, not a service catalogue.

## Responsive translation
At mobile width, collapse the fixed sidebar into a top menu button, center the intro, and stack the portfolio and about sections. Keep the intro action visible, preserve thumbnail crops, and avoid horizontal overflow. The desktop sidebar becomes a compact menu without losing the identity block.

## Signature elements
Carry the fixed sidebar, the image-backed centered intro, and the captioned portfolio grid. Translate the identity block and landscape photograph with client-cleared assets. Do not reuse the source portrait or landscape as if they were the client's own.

## Prohibited patterns
Do not reuse source photography, copy, or trade dress. Do not invent credentials, clients, awards, or outcomes. Do not copy source code into a client site. Avoid replacing the sidebar with a generic top bar, avoid low-contrast overlaid copy, and avoid turning the portfolio into identical service cards.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **Prologue by HTML5 UP: fixed sidebar with image-backed intro**; family: `html5up-prologue-family`; subject fit: consulting, accounting, legal-services, professional-services. Production eligibility is unchanged.
- Open the paired full-page captures: desktop: `screenshots/desktop.png`, captured viewport 1440 x 900; mobile: `screenshots/mobile.png`, captured viewport 390 x 844. Read the opening at its captured viewport and then inspect the whole page. A full-page image's total height is not CSS vh.
- Use this dossier alone for its route, not an average of the other candidates. Verified client facts, sealed content, accessibility, client font/palette choices and host runtime rules constrain the adaptation. Preserve the assigned composition, section order and signatures; if evidence and prose disagree, identify the conflict rather than silently rewriting the curated contract.
- Separate observed design from proposed client treatment. Do not claim an exact font, hex value, spacing measurement, interaction or animation was observed unless retained evidence supports it. Static captures do not prove scroll, hover or click behavior.

### Opening layout contract

**desktop: utility-panel / task-panel-in-opening**

```text
[ navigation ]
[ promise / media | actionable task panel ]
```

The task panel is part of the opening, not a decorative proof card. Preserve the assigned task and its visible controls; use the host's single-form placement contract when this is a lead-form panel.

**mobile:** no normalized opening topology is recorded. Read the paired capture and the original hierarchy/mobile notes before drawing this viewport's wireframe. Do not infer a split hero from the absence of a label.

These are relationship diagrams, not pixel specifications. Resolve alignment, proportions, whitespace and focal crop from the paired captures and original Visual hierarchy. Desktop header plus complete hero must fit 1536 x 864 at normal zoom, even if the source was captured at a taller viewport. Mobile may be content-height driven.

### Page rhythm and content mapping

Keep these assigned chapters in order; the numbers below describe actual page sequence, not decorative labels to add to the site:

1. **fixed sidebar navigation**
2. **image-backed centered intro**
3. **portfolio grid**
4. **about section**
5. **contact forms**
6. **footer**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: light humanist sans. Body character: same humanist sans. Hierarchy: quiet large display with small labels. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: charcoal; white; muted landscape. Contrast intent: quiet editorial contrast. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: blurred landscape hero and portfolio thumbnails. Crop guidance: soft wide cover. Focal role: atmospheric. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: portfolio grid with captions. Early action: in the intro. Primary placement: teal intro button. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **collapse the sidebar to a menu button, center the intro, stack the grid**. keep the intro action visible; preserve thumbnail crops; avoid horizontal overflow.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: static-first. Reduced-motion contract: static. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **fixed-sidebar** ([data-reference-signature=fixed-sidebar]): fixed dark sidebar with identity and icon navigation. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **image-backed-intro** ([data-reference-signature=image-backed-intro]): centered intro over a blurred landscape photograph. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **portfolio-grid** ([data-reference-signature=portfolio-grid]): captioned portfolio thumbnails. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
