# Reference implementation brief

## Visual hierarchy
Use a fixed left sidebar for search, section links, thumbnails, contact details, and a small copyright line. In the main column, open with a split editorial hero: a high-contrast serif headline and short paragraph on one side, a portrait photograph on the other, and one outlined action. Keep the sidebar quiet and the main column generous. The serif display and coral accent should carry the editorial tone.

## Page sequence
After the split hero, use a four-icon feature grid, then a two-column article grid with images and outlined More actions. Close with a compact contact and footer block. Each article should pair one image with one idea. Do not turn the article grid into identical service cards.

## Responsive translation
At mobile width, collapse the sidebar into a top bar with a menu, stack the hero image and copy, and turn the article grid into a single column. Keep the hero action visible, preserve image crops, and avoid horizontal overflow. The sidebar identity should remain present as a compact header rather than disappearing.

## Signature elements
Carry the fixed sidebar, the split editorial hero, and the two-column article grid. Translate them with client-cleared photography and original editorial copy. Do not reuse the source portrait or article images as if they were the client's own.

## Prohibited patterns
Do not reuse source photography, copy, or trade dress. Do not invent services, credentials, awards, or outcomes. Do not copy source code into a client site. Avoid replacing the sidebar with a generic top bar, avoid low-contrast actions, and avoid a repetitive card wall.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **Editorial by HTML5 UP: fixed sidebar with split editorial hero**; family: `html5up-editorial-family`; subject fit: dental, home-care, hospitality, roofing, veterinary, professional-services. Production eligibility is unchanged.
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

1. **fixed sidebar**
2. **split editorial hero**
3. **feature icon grid**
4. **two-column article grid**
5. **contact and footer**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: high-contrast serif display. Body character: neutral sans. Hierarchy: large editorial headline with small labels. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: white; warm gray; coral red. Contrast intent: clean editorial contrast. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: portrait hero and article thumbnails. Crop guidance: editorial crops. Focal role: subject-safe. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: article grid with outlined actions. Early action: in the hero. Primary placement: Learn More. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **collapse the sidebar, stack the hero image and copy, then the article cards**. keep the hero action visible; preserve article image crops; avoid horizontal overflow.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: static-first. Reduced-motion contract: static. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **fixed-sidebar** ([data-reference-signature=fixed-sidebar]): fixed left sidebar with search and section links. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **split-editorial-hero** ([data-reference-signature=split-editorial-hero]): serif headline and copy beside a portrait photograph. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **article-grid** ([data-reference-signature=article-grid]): two-column article grid with outlined actions. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
