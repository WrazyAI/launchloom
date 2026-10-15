# Visual hierarchy

Build a vivid local fitness-studio site from the supplied Reference DNA and screenshots, transferring the full-screen chapter mechanics rather than copying the source identity, copy, exact palette, imagery, or trade dress. Lead with an atmospheric, full-viewport training photograph and a decisive oversized headline with a short proposition, a concise supporting sentence, and one visible next-step action. Use a transparent, lightweight top navigation over the hero that transitions to a solid background after the opening. Pair compact uppercase utility labels with bold condensed or grotesk display typography. The visual system should feel like an independent training space: deep charcoal, chalk-white, a warm neutral for information sections, and a single high-energy accent. Use grain or texture only if it remains subtle and accessible. Every full-bleed image needs a readable overlay behind text.

# Page sequence

Organize the page into distinct scroll chapters: 1) a full-screen training promise and CTA; 2) an image-backed services chapter with one concise coaching proposition; 3) a counterweight approach chapter with a short sequence of how a first session works; 4) a bright studio/gallery chapter that shows facilities or training details; 5) a contrasting intake/contact close. The first two chapters should be image-led and fill the screen at common desktop viewports. Use directional scroll cues to reveal the next section. Keep services and process content useful rather than promotional. At least one service or training option should have a real scope and next step, bound to verified client tokens. Do not fabricate class schedules, coach credentials, equipment, prices, locations, memberships, transformations, athlete endorsements, or before/after results. A static, clearly fictional design study may label its copy and generated imagery as illustrative.

# Responsive translation

At desktop widths, use image-backed scenes with alternating left/right content panels and restrained pinned-feeling continuity, but do not make the visitor wait for a long scrub animation to reach core information. Keep the first headline and CTA inside a 900 px-tall opening, with no text clipped at browser zoom. At mobile widths, replace fixed background attachment with ordinary cover crops, preserve the visual poster hierarchy, stack text panels over legible local image crops, and reduce the large type before reducing content. Keep navigation compact yet readable, ensure scroll cues do not overlap CTA buttons, and make the gallery a 2-column grid with no horizontal overflow. Forms and links need minimum touch areas. Scroll snapping may be used softly on desktop and must be disabled on small screens or for reduced-motion users. Test exact 1440 x 900 and 390 x 844 renderings.

# Signature elements

Preserve the visual difference between dark, atmospheric full-screen story chapters and the bright, tactile studio chapter. Use alternate side-anchored panels rather than a chain of cards. Make one purposeful interaction do real work: directional scroll cues move to the next chapter, image reveal responds to viewport entry, and the header adapts as the visitor moves past the hero. The interaction must degrade to static content with reduced motion and remain usable by keyboard and touch. The contact close should feel like a clear invitation, not a hard-sell subscription panel. Use original client assets where provided, otherwise generate a small route-specific set that depicts this studio's real business type without attaching invented claims or identity to people in the pictures.

# Prohibited patterns

Do not use a generic split hero, a white-card grid for every section, sticky overlapping controls, fake client transformation stories, fabricated trainer qualifications, invented member counts, unverified class times, unverified equipment lists, numeric performance claims, false testimonials, or unrelated lifestyle stock photography. Avoid oversize text that pushes the CTA below the viewport, low-contrast text on images, fixed backgrounds on mobile, excessive scroll locks, and motion that blocks important content. Do not copy the source template's wording, business identity, demo photos, or exact visual skin. Do not add a pricing panel unless actual client prices are confirmed. Never use an em dash in rendered copy.

# Content and SEO constraints

Bind the title, H1, and introductory copy to the client's verified training type and service location. Explain actual program formats, suitable experience level, booking or trial process, and the next step in plain language. Use specific service headings and one FAQ section based on researched search intent and confirmed policy. Keep structured data, canonical metadata, NAP details, and sitemap ownership in the production shell. Do not imply health outcomes or guaranteed transformations. All business facts remain sealed tokens; the design model may reorganize the presentation, but may not invent the schedule, trainer details, facilities, pricing, location, or claims. Ensure semantic heading order, descriptive alt text, and readable text alternatives for interactive visual cues.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **Big Picture: full-screen fitness chapters**; family: `html5up-big-picture-fitness`; subject fit: fitness studio, gym, strength training, fitness. Production eligibility is unchanged.
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

1. **hero poster**
2. **training services scene**
3. **coaching approach scene**
4. **studio gallery**
5. **contact intake**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: bold condensed grotesk or system sans. Body character: clean neutral sans. Hierarchy: oversized uppercase poster headline with compact numbered chapter labels. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: charcoal; chalk; warm stone. Contrast intent: strong contrast with image overlays and separate light gallery surfaces. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: atmospheric full-bleed studio scenes plus bright gallery. Crop guidance: cover on desktop, subject-safe responsive crop on mobile, object-fit thumbnails in gallery. Focal role: movement and equipment stay visible behind readable copy. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: one concise offering inside a side-anchored image chapter followed by a short process list. Early action: visible within the first viewport. Primary placement: hero poster next-step action. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **poster-led stacked story chapters**. disable fixed image attachment; shrink display type before changing the message; preserve alternate image-and-copy panels; use a two-column touch gallery; keep nav and CTA in view without overlap.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: scroll-linked chapter entrance and header surface transition. Reduced-motion contract: disable snapping and animation while preserving all sections and direct anchors. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **fullbleed-training-poster** ([data-reference-signature=fullbleed-training-poster]): full-screen fitness poster with prominent headline. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **image-led-program-scene** ([data-reference-signature=image-led-program-scene]): right-anchored panel within an image-backed service chapter. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **counterweight-story-scene** ([data-reference-signature=counterweight-story-scene]): opposite side-anchored approach chapter with short process list. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **training-gallery** ([data-reference-signature=training-gallery]): distinct bright gallery chapter. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
