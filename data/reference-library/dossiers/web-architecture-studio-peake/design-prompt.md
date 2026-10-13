# Visual hierarchy

Reference: Studio Peake color-rich interior portfolio, captured from https://www.studiopeake.com/ on 2026-09-26. A full-width interior photograph carries a very large white serif studio title along its bottom edge; the next cream band gives a short craft statement. A small emblem on the left and compact uppercase portfolio, studio, shop, news and contact links on a cream top line. Expressive high-contrast serif display and section titles paired with small, measured body copy; typography feels like an interiors journal. Cream paper, charcoal ink, warm terracotta, muted olive and pale blue editorial panels drawn from furnishings. Immersive furnished-room photographs, three adjacent feature images, a maker portrait, material close-ups and image-led news chapters. Translate only these visual and information-order mechanics into a new client-owned design. Let the verified client's name, services, place, assets and actual next step determine all visible language.

# Page sequence

The observed page flows through 1. room photograph and oversized title; 2. cream craft statement; 3. three-image discipline gateway; 4. studio portrait and story; 5. material philosophy image band; 6. approach split; 7. featured room; 8. news and views collage; 9. project enquiry; 10. terracotta footer. Preserve that rhythm only where the client has matching facts and assets. Lead with photographic discipline gateways, then explain the approach through a portrait and material detail instead of a generic list. Use a quiet contact link in the header and a project enquiry after the visual case for the studio is made. Include a locally useful service and coverage explanation from the intake, with one primary and one secondary action near the opening. A service area must remain a service area rather than an invented office.

# Responsive translation

At a 390 by 844 viewport, turn the three-image gateway into a deliberate vertical sequence and preserve the warm color alternation. The retained mobile opening still places display copy over media: its title wraps onto two lines higher in the room image, rather than retaining the desktop's single lower-edge title. Choose a quiet focal crop and a measured scrim or local plate when needed; "avoid busy image areas" does not mean moving the title into a separate text band. Recheck the adapted desktop opening at 1536 by 864 so the complete header, promise, first action and focal image fit at normal zoom. On both sizes, use real links, an accessible menu, readable contrast, reachable form controls, and no horizontal overflow. Honor reduced-motion preference by presenting equivalent static information; a video or reveal may never be required to discover the next action.

# Signature elements

1. Bottom Anchored serif image title (`bottom-anchored-serif-image-title`): the desktop's oversized light serif title spans the lower part of one immersive room image below a shallow cream navigation strip. On mobile preserve the image-overlay relationship, but use the captured two-line, higher title placement. Adapt identity to the sealed client heading; never reuse the source wordmark.
2. Three Photo discipline gateway (`three-photo-discipline-gateway`): three adjacent, edge-to-edge image destinations on desktop, each carrying a restrained overlaid service label. On mobile these become three full-width successive image chapters, not tiny cards in a three-column grid. Use verified service destinations and appropriate client photographs.
3. Material image band (`material-image-band`): a full-width material-detail image and centered light statement interrupt the inset cream portrait/story row. Preserve this contrast between intimate inset content and an immersive visual pause; do not present the source's craftsmanship statement as a client claim.

## Chapter anatomy observed in the paired captures

The cream statement below the desktop hero pairs a short multiline heading on the left with a narrower supporting paragraph on the right; mobile stacks them. The studio row uses a tall inset portrait left and restrained story/proof rows right, then becomes portrait followed by copy on mobile. The approach chapter reverses emphasis on desktop, placing explanatory copy left and a working-scene photo right; mobile places the photo among the explanatory material. The featured-room stage returns to full bleed with a small lower-left project label. News alternates photography and solid-color text panels before a quiet centered inquiry strip and a terracotta footer; the mobile capture keeps a vertical image/text sequence and stacked footer navigation. These are source observations, not permission to invent a team, press mentions, projects or articles. Use only client-supported equivalents and flag unsupported required chapters.

# Prohibited patterns

- Do not reuse the studio's portraits, bespoke furniture, portfolio rooms, press titles or proprietary color sequence as trade dress.
- Source identity, exact wording, logos, people, photographs, fonts, badges, testimonials, numerical claims or locations as client assets.
- Invented reviews, credentials, prices, guarantees, service areas, outcomes, response times or staff.
- Generic SaaS cards that replace the observed composition, and decorative motion that hides service or contact information.
- The source screenshots are internal visual evidence only. Do not hotlink or export them into a generated client site. Keep the resulting page original and inspect desktop and mobile rendering before promotion.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **Studio Peake color-rich interior portfolio**; family: `architecture-bottom-anchored-serif-image-title`; subject fit: interior-design, interior-architecture, architecture. Production eligibility is unchanged.
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

1. **room photograph and oversized title**
2. **cream craft statement**
3. **three-image discipline gateway**
4. **studio portrait and story**
5. **material philosophy image band**
6. **approach split**
7. **featured room**
8. **news and views collage**
9. **project enquiry**
10. **terracotta footer**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: Expressive high-contrast serif display and section titles paired with small, measured body copy; typography feels like an interiors journal. Body character: readable supporting text with visible heading hierarchy. Hierarchy: one dominant opening statement, clear section headings and compact service labels. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: Cream paper; charcoal ink; warm terracotta; muted olive and pale blue editorial panels drawn from furnishings. Contrast intent: preserve readable contrast; source colors are inspiration, not a copied brand palette. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: Immersive furnished-room photographs, three adjacent feature images, a maker portrait, material close-ups and image-led news chapters. Crop guidance: site-specific focal crops at desktop and mobile. Focal role: client-owned or reviewed licensed imagery only; preserve the role of each source image rather than its subject identity. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: Lead with photographic discipline gateways, then explain the approach through a portrait and material detail instead of a generic list. Early action: primary and secondary actions should be visible near the first promise. Primary placement: Use a quiet contact link in the header and a project enquiry after the visual case for the studio is made. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **Turn the three-image gateway into a deliberate vertical sequence; keep display text off busy image areas and preserve the warm color alternation**. keep source-specific hierarchy and decision sequence; use a 390 px single-column or deliberate two-column layout without overflow; keep touch actions and form labels visible; remove motion dependence.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: gentle-image-reveal; static-reduced-motion. Reduced-motion contract: all copy, imagery and actions visible statically. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **bottom-anchored-serif-image-title** ([data-reference-signature=bottom-anchored-serif-image-title]): A new-client interpretation of the observed bottom-anchored serif image title relationship, with source identity and assets excluded. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **three-photo-discipline-gateway** ([data-reference-signature=three-photo-discipline-gateway]): A new-client interpretation of the observed three-photo discipline gateway relationship, with source identity and assets excluded. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **material-image-band** ([data-reference-signature=material-image-band]): A new-client interpretation of the observed material image band relationship, with source identity and assets excluded. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
