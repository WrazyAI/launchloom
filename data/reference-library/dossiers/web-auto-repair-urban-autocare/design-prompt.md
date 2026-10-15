# Visual hierarchy

Translate the observed Urban Autocare page into a new, fact-grounded auto repair composition. The source opens with dark automotive photo with orange service headline and many location actions; its navigation uses multi-location phone utility above main navigation. Build the new client's hierarchy around that relationship: one clear promise, a visible primary action, a useful secondary route, and supporting context that does not compete with the headline. Use bold orange sans headings and dense black utility text, with charcoal, white, and orange as a structural palette relationship and orange only where it helps direction or status. Adjust exact hues and typefaces to the client's identity. The original brand and trade dress are not reusable.

# Page sequence

The observed home-page rhythm is location utility; shop photo opening; service promise; six-location selector; service photography; warranty and trust explanation; reviews; schedule close. Preserve this order as a planning scaffold when the new client's content supports it. The central information task is services and locations are separate navigational groups. Give each chapter one reason to exist: clarify an offering, reduce uncertainty, show a real process, or move a visitor toward contact. repair photos and shop scenes in robust horizontal bands. Replace every source-specific assertion with verified client facts. If a proof chapter lacks approved authentic evidence, use a process explanation or practical FAQ. Close with a truthful location or service-area statement and a working next step.

# Responsive translation

At 1440 px, establish the opening and broad image-to-text rhythm without making every chapter the same card grid. At 390 px, collapse six location choices into scannable labeled rows with clear phone actions. Let headlines wrap naturally, keep body text at a comfortable measure, and place buttons after the content they act on. Re-crop new imagery around its subject rather than scaling a desktop crop blindly. Check both full-page states for overlays, hidden reveal content, clipped navigation, horizontal overflow, readable contrast, and working booking or enquiry controls. Motion is optional; all text and actions must be present when motion is reduced or disabled.

# Signature elements

Carry these three mechanics into a fresh design: six-location switchboard, orange-on-dark hero, and photographic service bands. Express each through the new client's own content, typography, and photography. The source's spacing and pacing are directional evidence, never a pixel-for-pixel template. The primary conversion route is schedule service, then choose location; repeat it only at useful decision points. Where the source uses a specific photo, review, person, brand seal, menu item, or claim, substitute a client-cleared equivalent or omit the element entirely.

# Prohibited patterns

Do not reuse Urban Autocare's logo, wording, photographs, staff or customer imagery, reviews, awards, credentials, rates, exact colors, exact typeface pairing, or overall trade dress. Do not infer a physical office from a service area, turn stock people into staff, fabricate outcomes, or paste a source menu or service list into a new site. Avoid decorative grids that flatten the auto repair visitor journey, faint text over busy images, inaccessible controls, and hidden content that depends on animation. Never put an em dash in generated client copy. The screenshots are internal evidence, not client-site assets.

# Local content and verification

Use the new client's confirmed services and geography in title, H1, useful headings, FAQs, and contact route. A displayed phone number, booking link, hours, price, review, guarantee, accreditation, or service promise must come from the client or another approved fact source. Verify the rendered desktop and mobile page. The final page should clarify scope, preparation, process, and next action.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **Urban Autocare: six-location switchboard with orange-on-dark hero**; family: `web-auto-repair-urban-autocare-family`; subject fit: auto repair shop, independent garage, vehicle servicing, auto-repair. Production eligibility is unchanged.
- Open the paired full-page captures: desktop: `screenshots/desktop.png`, captured viewport 1440 x 1000; mobile: `screenshots/mobile.png`, captured viewport 390 x 844. Read the opening at its captured viewport and then inspect the whole page. A full-page image's total height is not CSS vh.
- Use this dossier alone for its route, not an average of the other candidates. Verified client facts, sealed content, accessibility, client font/palette choices and host runtime rules constrain the adaptation. Preserve the assigned composition, section order and signatures; if evidence and prose disagree, identify the conflict rather than silently rewriting the curated contract.
- Separate observed design from proposed client treatment. Do not claim an exact font, hex value, spacing measurement, interaction or animation was observed unless retained evidence supports it. Static captures do not prove scroll, hover or click behavior.

### Opening layout contract

**desktop: utility-panel / task-panel-in-opening**

```text
[ navigation ]
[ promise / media | actionable task panel ]
```

The task panel is part of the opening, not a decorative proof card. Preserve the assigned task and its visible controls; use the host's single-form placement contract when this is a lead-form panel.

**mobile: media-overlay / copy-over-media**

```text
[ navigation ]
[ media field: copy + action over image ]
```

Keep copy inside the media field, not in a separate adjacent card. Choose a quiet crop, a proving foreground color, or a soft scrim; never box text lines to fix contrast, and do not move copy outside the image.

These are relationship diagrams, not pixel specifications. Resolve alignment, proportions, whitespace and focal crop from the paired captures and original Visual hierarchy. Desktop header plus complete hero must fit 1536 x 864 at normal zoom, even if the source was captured at a taller viewport. Mobile may be content-height driven.

### Page rhythm and content mapping

Keep these assigned chapters in order; the numbers below describe actual page sequence, not decorative labels to add to the site:

1. **location utility**
2. **shop photo opening**
3. **service promise**
4. **six-location selector**
5. **service photography**
6. **warranty and trust explanation**
7. **reviews**
8. **schedule close**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: bold orange sans headings and dense black utility text. Body character: readable body with short explanatory paragraphs. Hierarchy: high-impact opening, clear chapter titles and comfortable mobile measure. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: charcoal; white; orange. Contrast intent: legible actions and body text across flat color and imagery. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: repair photos and shop scenes in robust horizontal bands. Crop guidance: wide desktop stage and subject-safe mobile crop. Focal role: preserve contextual subjects and keep text clear of faces. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: services and locations are separate navigational groups. Early action: primary and secondary routes near opening promise. Primary placement: schedule service. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **collapse six location choices into scannable labeled rows with clear phone actions**. keep the first action visible and touch-safe; use subject-safe image crops; avoid horizontal overflow and collapsed hierarchy.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: modest optional image or section transitions. Reduced-motion contract: all content visible immediately without scroll-dependent reveal. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **six-location-switchboard** ([data-reference-signature=six-location-switchboard]): Translate the observed six-location switchboard mechanic with new-client content and original presentation. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **orange-on-dark-hero** ([data-reference-signature=orange-on-dark-hero]): Translate the observed orange-on-dark hero mechanic with new-client content and original presentation. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **photographic-service-bands** ([data-reference-signature=photographic-service-bands]): Translate the observed photographic service bands mechanic with new-client content and original presentation. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
