# Reference implementation brief

## Visual hierarchy
Open with a full-bleed photograph behind a centered, uppercase promise, a short welcome line, and one high-contrast action. Use a dark charcoal navigation, white content bands, and a signal color for actions. The display face is an uppercase geometric sans; supporting copy uses a readable slab or serif. Keep the masthead promise short and the action unmistakable.

## Page sequence
Follow the masthead with three icon-led service columns, then a six-item project grid with square thumbnails and short captions. Add a vertical timeline for the business story, three team portraits, a quiet client-logo strip, and a dark contact section with a form. Close with a compact footer. Each section should have one job and one dominant action.

## Responsive translation
At mobile width, keep the masthead action visible, stack the service columns, preserve square project crops, and convert the timeline into a vertical list without horizontal overflow. Stack the team portraits and contact fields in one column. Do not shrink the masthead type below a readable size or hide the primary action behind a menu.

## Signature elements
Carry the full-bleed photo masthead, the square project grid, and the vertical timeline. Translate them with client-cleared photography, real project types, and verified business facts. The project grid must read as work, not as generic service cards. The timeline must communicate a real sequence, not invented milestones.

## Prohibited patterns
Do not reuse source photographs, client logos, team names, copy, or trade dress. Do not invent clients, awards, history, or outcomes. Do not copy source code into a client site. Avoid replacing the masthead with a card wall, avoid flat icon rows with no hierarchy, and avoid low-contrast actions.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **Start Bootstrap Agency: dark photo masthead with project grid**; family: `startbootstrap-agency-family`; subject fit: home-services, local-trades, landscaping, creative-studio, agency, roofing, veterinary. Production eligibility is unchanged.
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

1. **fixed dark navigation**
2. **full-bleed masthead**
3. **three icon services**
4. **six-item portfolio grid**
5. **vertical timeline about**
6. **team portraits**
7. **client logo strip**
8. **dark contact form**
9. **footer**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: Montserrat uppercase. Body character: Roboto Slab. Hierarchy: large uppercase opening with compact section labels. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: charcoal; white; light gray. Contrast intent: high-contrast studio contrast. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: full-bleed masthead and square project thumbnails. Crop guidance: cover with subject-safe center. Focal role: subject-centered. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: icon-led service columns. Early action: in the masthead. Primary placement: masthead button. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **stack masthead, services, portfolio, timeline, team, contact**. keep the masthead action visible; preserve square project crops; stack the timeline without horizontal overflow.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: restrained hover and scroll. Reduced-motion contract: static sections. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **full-bleed-masthead** ([data-reference-signature=full-bleed-masthead]): photograph fills the opening behind one centered promise and action. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **portfolio-grid** ([data-reference-signature=portfolio-grid]): six square project thumbnails with short captions. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **vertical-timeline** ([data-reference-signature=vertical-timeline]): vertical story timeline with alternating entries. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
