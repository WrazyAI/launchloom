# Visual hierarchy

Design a refined, one-screen dental-studio landing experience for a local practice, using the supplied Reference DNA and screenshots as evidence for composition and interaction mechanics only. Do not reproduce the fictional name, copy, imagery, exact colors, or logo in the screenshots. The opening is a centered photographic stage rather than a split hero: a darkened, high-quality treatment-room photograph fills the viewport, a small geometric mark sits above a thin rule, the practice name forms the typographic center, and a concise care promise plus one primary appointment CTA sit below. Place a segmented four-item section index beneath the opening block. Use an editorial serif display face paired with a neutral, highly legible sans for interface labels and body copy. Keep the palette quiet and clinical without looking sterile: deep green or charcoal, warm ivory, and a small restrained metal accent. Maintain high text contrast over photographs with a single consistent overlay treatment.

# Page sequence

Keep the opening viewport visually calm and focused. The section index opens one content panel at a time, with panels layered over the blurred photographic stage instead of extending the home page into a conventional long card stack. Include four destinations in this order: Services, Approach, FAQs, Contact. Services should be a short, ruled list with clear descriptions rather than a grid of cards. Approach should explain a three-step first-visit process in concise, factual language. FAQs should answer practical pre-visit concerns using native disclosure rows or a compact question list. Contact should make the next step obvious and present a short, accessible inquiry form. Put one prominent CTA in the opening stage, then repeat a contact action only inside relevant decision panels. Use semantic headings and enough real descriptive text for local search; the actual city, practice name, service scope, payment details, accessibility provisions, and contact data must come from verified client tokens. Never invent credentials, prices, insurance participation, guarantees, patient reviews, or outcomes. The local screenshots contain fictional illustrative copy only.

# Responsive translation

At wide desktop sizes, preserve the centered one-screen composition and four-way section index. Let typography scale down before changing the core alignment. At narrow mobile widths, convert the section index to a two-column touch grid, reduce the hero title to readable stacked lines, and make each opened panel a nearly full-screen, vertically scrollable sheet with a persistent close control and safe-area padding. Keep the first CTA visible without scrolling, avoid text over the brightest part of an image, and ensure panel bodies can scroll independently. There must be no horizontal overflow at 390 px and no requirement to hover. Escape closes a panel on keyboard devices, focus moves into the panel and returns to the opener on close, and reduced-motion preferences replace blur/fade transitions with immediate state changes. Do not let browser zoom or large accessibility text clip the title, close button, or form fields.

# Signature elements

Preserve the combination of a full-bleed clinical image, a centered identity lockup, a segmented section index, and focused overlay panels. The hero CTA and each navigation item need distinct hit areas. When a panel opens, gently defocus the stage and fade/lift the panel into view. The services panel uses a compact ruled index; the FAQ panel uses direct, answer-first questions; the contact panel explains what happens after the form is sent using verified provider facts. Use original, relevant client images when available. If not, use one route-specific generated clinical image set with restrained clinical details and no false human endorsements. Keep all image crops subject-safe on mobile. Capture the full opening and every interactive section state in QA; the required reference screenshot records the full initial viewport, while supplemental state captures may show opened panels.

# Prohibited patterns

Do not revert to a generic split hero, a pill navbar spanning the page, a large card wall, duplicate service/approach content, a wordy why-us essay, unverified review badges, stock people presented as employees or patients, decorative medical claims, or a contact form that implies it is connected when it is not. Do not add fake phone numbers, addresses, hours, pricing, insurance details, providers, credentials, ratings, testimonials, or guarantees. Do not copy the pictured practice identity, exact words, generated images, or brand treatment. Do not hide core navigation behind hover-only behavior or add motion that blocks reading. Never use an em dash in published copy.

# Content and SEO constraints

Bind the main heading and page title to the client's verified primary service and location phrase. Write a unique meta description from verified services, audience, and service area. Keep one descriptive H1, meaningful H2s for Services, FAQs, and Contact, helpful alt text, working in-page links, and visible phone/address only when the client provides them. Structured data and canonical URLs belong to the production shell, not this visual reference implementation. Research terms should inform natural language, not cause keyword stuffing. The fictional study copy is not reusable as factual dental advice.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **Dimension: centered dental care index**; family: `html5up-dimension-clinic`; subject fit: dental clinic, dentist, dental. Production eligibility is unchanged.
- Open the paired full-page captures: desktop: `screenshots/desktop.png`, captured viewport 1440 x 900; mobile: `screenshots/mobile.png`, captured viewport 390 x 844. Read the opening at its captured viewport and then inspect the whole page. A full-page image's total height is not CSS vh.
- Use this dossier alone for its route, not an average of the other candidates. Verified client facts, sealed content, accessibility, client font/palette choices and host runtime rules constrain the adaptation. Preserve the assigned composition, section order and signatures; if evidence and prose disagree, identify the conflict rather than silently rewriting the curated contract.
- Separate observed design from proposed client treatment. Do not claim an exact font, hex value, spacing measurement, interaction or animation was observed unless retained evidence supports it. Static captures do not prove scroll, hover or click behavior.

### Opening layout contract

**desktop: media-overlay / copy-over-media**

```text
[ navigation ]
[ media field: copy + action over image ]
```

Keep copy inside the media field, not in a separate adjacent card. Choose a quiet crop or a local contrast plate/scrim; do not move copy outside the image to fix contrast.

**mobile:** no normalized opening topology is recorded. Read the paired capture and the original hierarchy/mobile notes before drawing this viewport's wireframe. Do not infer a split hero from the absence of a label.

These are relationship diagrams, not pixel specifications. Resolve alignment, proportions, whitespace and focal crop from the paired captures and original Visual hierarchy. Desktop header plus complete hero must fit 1536 x 864 at normal zoom, even if the source was captured at a taller viewport. Mobile may be content-height driven. The existing topology is medium-confidence: Screenshot shows overlapping layout mechanics; preserve the hybrid treatment rather than flattening it to this primary topology.

### Page rhythm and content mapping

Keep these assigned chapters in order; the numbers below describe actual page sequence, not decorative labels to add to the site:

1. **hero**
2. **services panel**
3. **approach panel**
4. **faqs panel**
5. **contact panel**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: high-contrast editorial serif. Body character: neutral sans-serif. Hierarchy: large stacked identity with compact uppercase utility labels. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: deep forest; translucent charcoal panel. Contrast intent: high contrast over darkened photography. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: dimmed full-bleed clinical interior with in-panel editorial stills. Crop guidance: wide cover on desktop with focal-point adjustment on mobile. Focal role: chair and natural light remain recognizable without reducing text contrast. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: short ruled service list inside a focused overlay. Early action: visible in the initial viewport. Primary placement: inside the centered hero lockup. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **retain centered stage and convert navigation into touch grid**. stack title into short lines; keep CTA visible above navigation; make panels independently scrollable; avoid horizontal overflow.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: panel fade and lift with background defocus. Reduced-motion contract: instant panel state changes and no blur transition. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **modal-care-index** ([data-reference-signature=modal-care-index]): centered photo stage with segmented Services, Approach, FAQs, Contact index. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **single-overlay-panel** (#main article[role=dialog]): one focus-managed section panel open above the defocused stage. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
