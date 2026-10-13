# Visual hierarchy

Use the paired O'LYN screenshots to understand how a roofing page can move from a property-scale image to a practical service decision. The reference starts with a thin utility strip, a compact navigation line, and a broad house photograph carrying a short, high-contrast promise. A dark enquiry surface gives the desktop visitor an immediate action without making the service catalogue the hero. For a new client, write one specific roofing promise grounded in its actual work and coverage, then give one primary contact action and one secondary service or phone route. Translate the contrast between light service chapters and dark reassurance chapters into the client's own palette and type system. Do not reproduce the source's green-and-black identity, mark, wording, image selection or exact composition.

# Page sequence

The observed rhythm is a photographic opening and early enquiry; a narrow image-led row of roof and gutter choices; an explanation of what a visitor can expect; a darker trust or process pause; a large property photograph with a smaller editorial inset; a documented-work comparison; another enquiry point; and a place-context close. Keep those as distinct information jobs. Explain the problem each service solves, how a visitor can describe the issue, what the company will confirm, and the next step. Source testimonials, numeric proof, accreditations and before-and-after projects are not transferable facts. If the new client has no approved project pair, use a clear inspection or quotation process chapter in the comparison position. Keep a truthful form and contact path, with no promise of a free consultation, immediate response or specific warranty unless supplied by the client.

# Responsive translation

At 1440 px, let the house image establish the scene while the promise and first action remain legible at normal zoom. The desktop form can sit below or beside the first image as a separate dark surface. At 390 px, stack the opening, service choices, process, evidence and contact in a direct reading order; keep the primary action reachable even if the large desktop form is moved to the contact chapter. Turn the narrow service-photo ribbon into full-width touch targets. Keep before-and-after labels attached to their own images and give any comparison control a keyboard and touch equivalent. Protect roof and worker subjects from overlaid text. Check that the footer, contact route and every action fit without horizontal scrolling. All content must remain visible when motion is reduced or JavaScript is unavailable.

# Signature elements

Carry forward four mechanics: a roof-photo opening, a small photographic service ribbon, an inset project comparison, and a concise place-context close. The mid-page overlapping circular images can add scale contrast when there are suitable client-owned or reviewed assets; they are not a reason to invent staff, properties or completed work. Alternate broad imagery with useful explanatory text rather than repeating identical cards. Use a second enquiry prompt only after the visitor has learned something material. The original page's long footer inventory is an observed source detail, not a model for the new site.

# Prohibited patterns

Do not copy O'LYN's name, logo, pages, CSS, photography, roof projects, team imagery, reviews, awards, numbers, credentials, financing, warranties, prices, addresses, opening hours, or claims. Do not present a stock roof or person as the client's actual project or employee. Do not manufacture before-and-after evidence or imply results from an image that does not document the same property. Do not create a bulk list of cities or thin interchangeable location pages to chase search traffic. A location page needs a verified service area and useful local context; a service area must never be described as an office. Avoid a generic card wall, unreadable text over busy roof photography, overlapping mobile controls, and em dashes in generated page copy.

# Local content and verification

Use only the new client's confirmed services, phone, enquiry route, property imagery, project evidence and service areas. Keep one H1 that states the verified roofing offer and geography, then use service pages and FAQs to answer real visitor questions about scope, preparation, inspection and quoting. Only show a map for a confirmed street-level location. Render and inspect desktop and mobile output, including the first action, service links, comparison labels, form submission state, contrast and overflow. The reference screenshots are internal visual evidence, not client-site assets.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **O'LYN Roofing: image-led roof service and project journey**; family: `web-roofing-olyn-image-led`; subject fit: roofing contractor, residential roofing, roof replacement, gutter service, roofing. Production eligibility is unchanged.
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

1. **house photo opening**
2. **early enquiry surface**
3. **photographic service choices**
4. **what to expect image and checklist**
5. **verified proof or process pause**
6. **image-backed roofing explanation**
7. **project comparison**
8. **second enquiry point**
9. **why choose and place context**
10. **contact close**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: strong uppercase sans hierarchy. Body character: plain, readable sans for practical detail. Hierarchy: large opening statement, compact service labels, short explanatory chapters. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: light page field; near-black reassurance bands; photographic roof fields. Contrast intent: visible enquiry controls and legible text against roofs, houses and dark bands. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: contextual roof and house photographs used for services, project comparison and local context. Crop guidance: broad opening image, narrow service images, circular mid-page accents and an inset comparison panel. Focal role: keep the roof, property or work detail identifiable without text covering the subject. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: small set of photograph-led roof and gutter choices with direct detail routes. Early action: opening and service decision points, then again after project/process evidence. Primary placement: early enquiry action near the roof promise. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **stack house image, concise promise, service choices, proof and contact in reading order**. keep a real enquiry path reachable when a large desktop form is not used; turn narrow service photos into touch-safe rows; keep before-and-after labels attached to the correct images; shorten the service-area close to verified useful context; prevent horizontal overflow.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: restrained transitions on imagery or comparison only. Reduced-motion contract: show the full image and comparison content without autoplay, animation or scroll dependence. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **roof-photo-opening** ([data-reference-signature=roof-photo-opening]): a new-client roof or property image gives context to a concise roofing promise and early action. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **photographic-service-ribbon** ([data-reference-signature=photographic-service-ribbon]): a small number of contextual image-led service choices with useful detail routes. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **inset-project-comparison** ([data-reference-signature=inset-project-comparison]): an accessible before-and-after or documented-work comparison only when the client has approved real project evidence. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **place-context-close** ([data-reference-signature=place-context-close]): a concise verified coverage and contact close instead of a doorway-style area list. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
