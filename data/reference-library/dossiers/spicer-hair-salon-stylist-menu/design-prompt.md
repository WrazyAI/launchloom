# Stylist-led hair salon implementation brief

Use the paired screenshots as a reference for service information architecture and atmosphere, not as a copy deck. Build an original site around the client's verified service list, prices, stylist levels, timing, color policy, hours, and booking rules. Do not copy the source salon name, artwork, wording, prices, staff descriptions, testimonials, treatment claims, or business details. Client photography has priority; if absent, use newly generated or licensed salon imagery that does not pretend to depict the client or actual staff.

## Visual hierarchy

Open with a narrow phone/booking utility and a cinematic salon-interior image under a dark overlay. Place a concise appointment promise and two practical actions over the left side: one to book, one to inspect the menu. Keep the brand/navigation quiet and usable. The page's main visual idea is a transition from atmospheric shop photography to a highly legible service table; do not extend the hero mood into every section or replace the service data with a stack of generic cards.

Use a dark aubergine, charcoal, and warm-ivory field with one copper or bronze accent for actions and important values. Body text and prices must retain strong contrast. The reference declares Inter for body and Fraunces for display, though its static CSS utility does not apply `font-family` correctly; if adopting this intended pairing, define those roles explicitly and verify them in the browser. Use mono-like uppercase micro-labels for table headings only when readable. The service menu should remain the dominant content.

## Page sequence

1. Utility strip with the verified booking/phone route and any confirmed scheduling note.
2. Image-backed hero with a short service promise, primary booking action, and menu shortcut.
3. Service menu showing price and duration side by side. If actual prices vary by stylist level, name those levels with verified client terminology and put the price basis next to the service.
4. Stylist-level comparison that explains the difference in experience or price only when the business confirms that information.
5. A color-service consultation path with patch-test or other prerequisites only when required by verified salon policy and applicable professional guidance.
6. Product recommendations only if the salon genuinely sells products and has approved inventory copy.
7. Gallery/image policy: show genuine approved work or explain how client work is selected. Do not show generated before-and-after hair transformations as real results.
8. Genuine approved review proof, native FAQ, and a focused appointment request form with a real destination.
9. Footer with the required Spicer Designs credit if the CC BY template is directly adapted; do not imply their endorsement.

The central value is planning: visitors should understand approximate time, price, and preparation before booking. Search copy should answer real local questions about services and stylist choice. Never reuse example service durations, prices, business hours, review claims, staff names, patch-test intervals, or color-safety statements from the screenshot.

## Responsive translation

At 1440px, keep the hero wide and the main service table within a readable max-width. Preserve the relationship between service, time, and price column. At 390px, stack each service as a labeled row or compact block: service name, duration, then available stylist-level prices. Do not force the desktop table to scroll sideways. Turn stylist tiers into labeled panels with enough width for their explanations. Put color consultation prerequisites before a color booking action. Stack form fields, preserve phone access, and keep both primary actions visible and touch-safe.

Use brief section reveals only when JavaScript and intersection observation work. The full source package uses hidden reveal classes without a reveal observer in its HTML version, so all content must render visibly by default or use a robust reduced-motion/static fallback. The captures were taken with the package's reduced-motion state, where all 18 reveal groups become visible. Native `<details>` is an acceptable FAQ pattern. Provide keyboard focus, clear table headers, semantic form labels, useful alt text, and no motion-only or color-only information.

## Signature elements

- A compact booking/phone utility above a moody salon hero.
- A service matrix that exposes both duration and price basis before booking.
- Distinct stylist-level pricing when the client actually uses that model.
- A separate consultation/prerequisite path for color work when supported by policy.
- A restrained appointment close instead of repetitive calls to action after every section.

## Prohibited patterns

- No source brand, name, image, exact copy, sample prices, sample durations, fictional stylist names, testimonials, store hours, or business facts.
- No invented stylist seniority, credentials, patch-test timing, allergy advice, color policy, product recommendation, treatment result, or booking availability.
- No source placeholder art presented as a real salon, customer, or employee.
- No hiding the menu behind a filter, card wall, accordion, or animation; no default invisible sections; no horizontal-scroll service table at mobile width.
- No non-functional booking/filter controls labeled as live, and no form shown as successfully submitting without a real handler.

Before delivery, verify client facts against the sealed content source, calculate no prices or timings from the reference, test booking routes, inspect contrast and table legibility at desktop and mobile, confirm reduced-motion behavior, and preserve required CC BY attribution if directly adapting the Spicer package. Treat the visual language as guidance; the client and current SEO research govern the copy and services.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **Spicer hair salon stylist-level menu**; family: `spicer-hair-salon-stylist-menu`; subject fit: hair-salon, hair-stylist, hair-colorist, cosmetology, independent-beauty, beauty. Production eligibility is unchanged.
- Open the paired full-page captures: desktop: `screenshots/desktop.png`, captured viewport 1440 x 1000; mobile: `screenshots/mobile.png`, captured viewport 390 x 844. Read the opening at its captured viewport and then inspect the whole page. A full-page image's total height is not CSS vh.
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

1. **booking-utility-bar**
2. **cinematic-hero**
3. **price-and-duration-menu**
4. **stylist-level-comparison**
5. **colour-consultation-and-patch-test**
6. **product-recommendations**
7. **gallery-policy**
8. **approved-proof**
9. **questions**
10. **appointment-form**
11. **attribution-footer**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: intended Fraunces editorial face, though static HTML currently falls back to system sans. Body character: intended Inter neutral sans, though font-family utility is miscompiled in the capture. Hierarchy: large two-line promise, compact uppercase mono-like labels, dense but readable service table. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: deep plum-black; charcoal; warm dark brown. Contrast intent: moody salon atmosphere with high-contrast booking actions and readable table content. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: atmospheric salon-interior hero image with layered dark gradients. Crop guidance: wide hero image under left-to-right and bottom gradients; all later sections rely mostly on typography, tables, and lists. Focal role: salon environment rather than a person; use only client-owned, licensed, or newly generated imagery. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: service matrix with a duration column and separate price by stylist level; colour services are routed through a consultation qualification instead of immediate booking. Early action: before the service matrix, with consultation qualification placed before any color booking. Primary placement: appointment request in the hero and again in the final focused form. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **stacked dark salon-planning flow**. keep telephone and booking access above the first section; turn the service matrix into stacked service rows that retain duration and level pricing; present stylist tiers as labeled blocks instead of shrinking columns; keep the colour consultation path separate and visible; stack form fields and preserve full-width touch actions without horizontal overflow.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: small section-rise reveals and native FAQ disclosures. Reduced-motion contract: make all content visible without transforms; this fallback was used for captures. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **salon-booking-utility** ([data-reference-signature=salon-booking-utility]): a slim phone or booking utility above the cinematic salon opening. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **stylist-price-time-matrix** ([data-reference-signature=stylist-price-time-matrix]): a service menu that exposes duration and verified price variation by stylist level. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **color-consultation-path** ([data-reference-signature=color-consultation-path]): a separate consultation or patch-test booking path only when required by verified salon policy. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **focused-appointment-close** ([data-reference-signature=focused-appointment-close]): a clear, minimal appointment request form with a truthful submission route. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
