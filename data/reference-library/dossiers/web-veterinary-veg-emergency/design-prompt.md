# Visual hierarchy

For a verified emergency or urgent-care practice, design an immediate, high-contrast response page. Use compact navigation, one short problem-led headline, a plainly worded availability statement only when verified, and a location or call action that can be found without hunting. A documentary care photograph may sit beside the headline, but keep instructions in an uncluttered text field. Use bold condensed or compact grotesk type with a restrained signal color against white and dark surfaces. The energy comes from hierarchy and scale, not a cloned brand palette or decorative alarm graphics.

# Page sequence

After the urgent opening, explain the scope of care in one image-and-text chapter. Follow with a compact set of distinct practical principles, then a proof or process chapter. A large numeric statement is allowed only when the client provides an attributable, current metric; otherwise use a typographic service-availability or preparedness statement with no implied quantity. Add authentic patient feedback only when supplied, then a small education rail and concise contact footer. Make each chapter reduce uncertainty or enable action. Do not add press logos, made-up review counts, or a generic card wall.

# Responsive translation

Desktop can use an asymmetrical headline-and-image composition with a broad whitespace field. On mobile, order the service and location action first, then the supporting image and short care explanation. Stack decision principles vertically. If stories or articles scroll horizontally, provide explicit previous/next controls, keyboard support, visible neighboring items, and a static reduced-motion mode. Do not allow the article rail, sticky controls, or third-party widget to obscure emergency contact details. Check the first screen at 390 by 844 and 100 percent zoom.

# Signature elements

Keep a forceful urgent-location poster, a concise principles row, and a small education chapter. The poster must express only services and hours confirmed by the business. The principles should be distinct, useful, and text-led rather than four interchangeable icon cards. The education chapter may surface a real FAQ or preparation resource. Use original assets and client facts, never source screenshots or source imagery as client media.

# Prohibited patterns

Never copy the source logo, exact display phrase, image, testimonials, press marks, colors, statistics, business names, or story language. Do not imply the client is open 24 hours, accepts walk-ins, treats every animal, performs surgery, or offers a specific response time unless verified. Do not add fabricated medical authority, panic-inducing language, unreferenced metrics, or urgent claims to an ordinary practice. Avoid color-only severity states and inaccessible scrolling text.

# Local SEO and conversion

Put the verified emergency or urgent service, actual species, and real location in useful headings and metadata. Direct calls should use the client's phone; location lookup must reach a real location page or map. Clarify when a service is not emergency care, when this is known. Keep a primary contact route and a secondary service-information route. Do not use source reviews or location claims as local proof.

# Verification

Validate every availability and clinical-scope statement against intake facts. Test phone and location actions, mobile menu, all review or article controls, keyboard focus, reduced-motion behavior, contrast, and horizontal overflow. Inspect the desktop hero at 1536 by 864 and mobile at 390 by 844. If no current sourced metric exists, confirm that no ornamental number was introduced.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **High-urgency animal emergency service with signal-red wayfinding**; family: `veterinary-emergency-signal-wayfinding`; subject fit: veterinary emergency hospital, urgent veterinary care, animal hospital, pet emergency clinic, veterinary. Production eligibility is unchanged.
- Open the paired full-page captures: desktop: `screenshots/desktop.png`, captured viewport 1440 x 1000; mobile: `screenshots/mobile.png`, captured viewport 390 x 844. Read the opening at its captured viewport and then inspect the whole page. A full-page image's total height is not CSS vh.
- Use this dossier alone for its route, not an average of the other candidates. Verified client facts, sealed content, accessibility, client font/palette choices and host runtime rules constrain the adaptation. Preserve the assigned composition, section order and signatures; if evidence and prose disagree, identify the conflict rather than silently rewriting the curated contract.
- Separate observed design from proposed client treatment. Do not claim an exact font, hex value, spacing measurement, interaction or animation was observed unless retained evidence supports it. Static captures do not prove scroll, hover or click behavior.

### Opening layout contract

**desktop: split-media / side-by-side-fields**

```text
[ navigation ]
[ copy + action | separate media field ]
```

Keep copy and the focal media region as distinct adjacent fields on desktop. Match their hierarchy and relative occupancy to the capture; do not default to equal-width columns, a boxed copy card or centered copy over the focal subject. The original observations clarify any background image extending beyond its focal region.

**mobile: utility-panel / task-panel-in-opening**

```text
[ navigation ]
[ promise / media | actionable task panel ]
```

The task panel is part of the opening, not a decorative proof card. Preserve the assigned task and its visible controls; use the host's single-form placement contract when this is a lead-form panel.

These are relationship diagrams, not pixel specifications. Resolve alignment, proportions, whitespace and focal crop from the paired captures and original Visual hierarchy. Desktop header plus complete hero must fit 1536 x 864 at normal zoom, even if the source was captured at a taller viewport. Mobile may be content-height driven.

### Page rhythm and content mapping

Keep these assigned chapters in order; the numbers below describe actual page sequence, not decorative labels to add to the site:

1. **emergency poster and finder**
2. **scope image chapter**
3. **care principles**
4. **evidence metric**
5. **approach statement**
6. **review rail**
7. **external mention strip**
8. **education articles**
9. **contact footer**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: heavy compact grotesk. Body character: neutral readable sans. Hierarchy: short stacked caps, sharp section labels, rare oversized evidence numerals. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: clean white; deep black. Contrast intent: emergency actions and essential text remain clear without relying on color alone. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: documentary care image with short supporting pet portraits. Crop guidance: rounded rectangular opening image and modular article crops. Focal role: show the animal and care context; never put urgent instructions over a busy image. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: problem and care-scope explanation followed by four concise decision principles. Early action: find-care action appears beside the opening promise. Primary placement: locate an open emergency service. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **collapse to emergency headline, locator, image, then short explanatory chapters**. keep emergency contact or location action before nonessential content; stack the four decision principles instead of shrinking them; use clipped rails only with visible controls and keyboard access; avoid tiny trust marks and dense legal text in the primary reading path.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: limited horizontal testimonial or article navigation. Reduced-motion contract: provide standard previous/next controls and static visible cards. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **urgent-location-poster** ([data-reference-signature=urgent-location-poster]): A short, visually forceful problem-led opening puts an appropriate location or contact action close to the headline. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **care-principles-row** ([data-reference-signature=care-principles-row]): A compact set of distinct care or process principles is arranged for fast scanning, not as repeated generic cards. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **education-rail** ([data-reference-signature=education-rail]): A small education or FAQ chapter helps visitors understand a next step after the urgent opening. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
