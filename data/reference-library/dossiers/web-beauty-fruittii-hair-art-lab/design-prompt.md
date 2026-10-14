# Reference implementation brief

## Visual hierarchy

Use the paired Fruittii London captures as evidence for composition, image pacing, and mobile translation only. Build an original beauty or hair-styling site with a distinctly different brand, words, palette, type choices, and imagery. The transferable idea is a lively hair-art experience: a bold, full-width visual opening; small unobtrusive navigation; short editorial copy; and expressive portraits that are allowed to carry the story. Do not reproduce the source's rainbow wordmark, exact colors, name, people, photos, phrases, review cards, icons, or page trade dress.

The desktop opening should be an image stage rather than a conventional half-copy/half-photo split. Use client-supplied media first, then a specifically generated or reviewed licensed salon image. If a short film is used, provide a static poster from the same approved asset, visible controls where playback is offered, and a reduced-motion fallback. Do not require autoplay. Place a concise, verified service/location phrase and a real booking action in a separate, high-contrast zone that does not cover the subject. Keep the navigation lightweight: a wordmark or simple logotype, a few useful routes, and an explicit booking control. Avoid an oversized floating pill bar.

After the hero, introduce the studio through compact copy paired with one expressive portrait or studio image. Follow with at least one further image/copy chapter that changes the image placement and rhythm. Make the contrast between quiet white space, carefully limited dark fields, and a single client-specific bright accent do the visual work. Keep editorial display type short and purposeful; use a calm sans for readable service details, policies, contact, and FAQs. Do not copy the source palette or reproduce its rainbow lettering.

## Page sequence

Use this general narrative rhythm, adapting every section to verified business facts:

1. Compact navigation and an image-led, full-bleed opening with one clear appointment or consultation route.
2. A short studio identity chapter paired asymmetrically with a portrait or atmosphere image.
3. A second, differently composed image/text chapter about a client-approved point of view, service approach, or hair texture expertise.
4. A concise service index that names the client's real offerings and links to a booking or service detail. Do not invent service names, prices, stylist levels, treatment outcomes, or appointment terms.
5. A proof or work gallery only when the client supplies real work images and approvals. If no usable proof exists, use a clear service process or preparation chapter instead of fake testimonials.
6. One restrained review/community moment populated only by verified, consented client material. Do not transplant the source carousel or its reviewers.
7. A useful FAQ and contact/visit close with submitted hours, contact details, location facts, service areas, and working appointment links.

This is a visual reference, not a required content template. Reorder or omit chapters to fit the real business, but keep the varied image/copy rhythm. Do not add a long “why us” essay, a generic grid of identical service cards, or a duplicate CTA after every section. Every SEO phrase must read naturally and be supported by the client's verified services and locations.

## Responsive translation

On mobile, keep the visual opening recognizable while making the media crop subject-safe. Put the logo and a clearly named, keyboard-accessible menu control on the top edge; do not rely on tiny unlabeled icons. Keep a real booking action discoverable early without covering the portrait or colliding with browser chrome. Reflow each story chapter into a deliberate image-first or copy-first sequence, alternating order where it preserves narrative variety. Make the service index readable without sideways scrolling. A review rail may become swipeable only if it has visible affordances, accessible controls, and a static or vertical fallback. Check body and document widths at 390 CSS px; no horizontal overflow or clipped text is acceptable. Respect reduced-motion preferences and never make copy, service information, or contact actions dependent on animation.

## Signature elements

- One image-led opening with a compact navigation layer and a genuine early conversion route.
- At least two distinct editorial image/copy chapters, with meaningful changes in image placement and scale.
- A service-discovery treatment that feels visual and expressive but still exposes real service names and scope to visitors and search engines.
- A late-page proof or community chapter that uses only verified client evidence, transitioning into practical contact details.
- A restrained, client-specific accent over a legible neutral foundation; keep identity and palette original.
- Designed mobile recomposition, not a compressed desktop grid.

## Prohibited patterns

Do not copy the reference's brand, logo, color sequence, exact typography, page wording, people, photographs, client reviews, business details, or overall trade dress. Do not imply that source photos show the client, and do not present generated people as actual staff or customers. Never invent services, training, credentials, salon locations, service areas, inclusivity policies, price ranges, guarantees, review scores, appointment availability, or outcomes. Avoid clinical/medical treatment language unless independently supplied and appropriate to the client's verified business. Do not hide booking behind an icon, require autoplay, use a carousel as the only way to read essential information, cover copy with motion, or reproduce the source's 15 px body overflow. Keep every factual token sealed to verified client input, use supplied brand assets first, and use only route-specific generated or reviewed licensed imagery when the client has none. Never use an em dash in generated site copy.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **Fruittii London expressive hair-art studio**; family: `beauty-counterculture-hair-art-editorial`; subject fit: beauty, hair-salon, hair-styling, barber, grooming. Production eligibility is unchanged.
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

1. **compact-navigation**
2. **expressive-hair-process-hero**
3. **studio-identity-editorial-chapter**
4. **hair-as-self-expression-image-chapter**
5. **inclusive-service-context-chapter**
6. **customer-proof-rail**
7. **community-signup**
8. **contact-and-visit-footer**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: confident geometric grotesk or custom-feeling rounded display sans, selected from available licensed/system stacks. Body character: clear neutral sans for service and visit information. Hierarchy: short all-caps labels, oversized editorial phrases, compact centered story copy, touch-legible mobile text. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: clean white; deep ink; one light neutral. Contrast intent: playful and expressive without sacrificing legibility; never rely on a rainbow gradient or pale accent text for essential copy. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: large editorial portraits, close hair-detail crops, and selective studio atmosphere. Crop guidance: full-bleed opening media followed by alternating contained portrait crops; subject-safe on small screens. Focal role: hair silhouette, texture, color, and self-expression; no generated subject may be presented as the client's real team or customer. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: visual service discovery supported by a concise, accessible service index; describe actual client services with short scope notes rather than copying a source service menu. Early action: within the first viewport without covering the subject or obscuring a full-page image. Primary placement: a visible booking or consultation route in the opening navigation and after the first editorial chapter. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **image-first editorial stack with independent copy chapters and compact controls**. keep the opening media subject visible and reserve a non-overlapping text/action zone; stack each alternating image and copy chapter in an intentional sequence rather than shrinking desktop columns; convert the proof rail into a touch-safe horizontal carousel or vertically readable quotes; make navigation and booking controls explicit, accessible, and at least 44 CSS px when actionable; remove source-like 15 px body overflow and verify document and body widths equal the viewport.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: optional short process film or still-image sequence with an explicit poster/fallback; one restrained image reveal or touch-safe review rail. Reduced-motion contract: replace moving imagery with a poster, disable scroll-triggered transforms, and keep every service, action, and text chapter visible. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **expressive-image-opening** ([data-reference-signature=expressive-image-opening]): A full-bleed, subject-led opening image or video poster paired with a compact identity and a real early booking route. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **alternating-editorial-chapters** ([data-reference-signature=alternating-editorial-chapters]): At least two intentional portrait/copy chapters with changing image placement and generous white space, not generic cards. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **community-proof-close** ([data-reference-signature=community-proof-close]): A distinct late-page community or proof moment that transitions into a clear contact/visit close, using only verified client material. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
