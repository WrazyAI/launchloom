# Visual hierarchy

Use the supplied direct-site screenshots as evidence for a more expressive dental design language, not as a source to clone. Do not reproduce the Dapper Dental name, wordmark, exact typography, photos, staff/patient identities, reviews, copy, colors, or trade dress. The source page is dark, high-contrast, and playful: a compact top brand strip sits above a photographic hero, while large outlined and filled uppercase display typography acts as the dominant graphic system. For a new client, translate that energy into a unique local practice identity and a concise, fact-based dental promise. Keep one clear appointment action near the top, with a secondary phone or contact action only when the client supplies that channel. Use text contrast and image overlays that remain readable at desktop and mobile sizes.

# Page sequence

Follow the observed cadence without reproducing its content: dramatic hero; short patient-centered positioning chapter; alternating narrative and photography; one or two service/experience chapters; an optional product or comfort feature only when verified; a social-proof chapter only with real reviews and permission; and a strong closing booking/location section. For the generated local business, use the required Services, FAQs, and Contact sections with succinct descriptions and answers. The source's services and copy can be described as visual observations, never reused as claims. Avoid an encyclopedic services catalog on the home page; offer a concise index with direct detail links. Keep why-us copy brief and let spatial contrast, image choices, and useful information create the impression. If the client's voice is formal, preserve this layout rhythm but change typography and tone to fit them.

# Responsive translation

At desktop width, preserve the source's dark canvas, overscale display moments, thin separators, and alternating asymmetrical image/text chapters. Let selected images enter as broad bands instead of repeating identical side-by-side cards. On mobile, reduce the display type while preserving bold/outline contrast, stack text and images in a clear sequence, and ensure a menu action remains reachable without covering the content. Every image should use a crop that preserves its subject; testimonial text must not overlap faces or the close/footer. Keep line lengths short, use visible FAQ/booking controls, and prevent horizontal overflow at 390 px. Motion should be limited to subtle reveal/opacity transitions and should disable cleanly for reduced-motion users. Full-page desktop and mobile screenshots must show complete services/FAQ/contact content rather than clipping at a sticky overlay.

# Signature elements

Retain the high-contrast dark surface, oversized outlined display phrase, compact utility navigation, and alternation between editorial text fields and large photographs. Give sections clear changes in width or alignment so the page feels designed, not repeated. A dark image band can introduce a comfort/process chapter; a quieter contact section can complete the route. Use a CTA that states the client's real appointment path. Social proof is not a styling placeholder: include it only when the client provides permitted authentic review content. Where no image assets exist, generate a route-specific dental environment or object image; do not repurpose the source's clinicians, patients, or interiors.

# Prohibited patterns

Do not duplicate Dapper Dental's name/logo, photos, actual address, people, testimonials, awards, claims, prices, service details, or exact language. Do not invent "pain free" claims, medical outcomes, awards, credentials, membership perks, premium amenities, rates, office location, schedules, or clinician identities. Avoid the exact outlined text face, photo choices, composition, and color arrangement that would make the new page look like a clone. Do not use generic white cards on dark backgrounds, hide essential contact information, add a giant unreadable headline, or imply that a generated person is a real dentist or patient. Never use an em dash in page copy.

# Content and SEO constraints

Use verified service and location terms naturally in the page title, H1, service headings, FAQs, and contact section. One H1 should state what the practice does and where it serves. Keep Services, FAQs, and Contact semantically distinct. Answer practical patient questions using confirmed practice policy. Only show NAP, clinician credentials, prices, review content, insurance, or emergency claims that the client has supplied or research has verified. The screenshots show a real provider and its own content, not facts for the generated client. Production structured data, canonical metadata, and internal links remain deterministic in the production shell.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **Dapper Dental: high-contrast typographic practice story**; family: `attested-dapper-dental-dark`; subject fit: dental clinic, private dentist, family dentistry, dental. Production eligibility is unchanged.
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

**mobile: media-overlay / copy-over-media**

```text
[ navigation ]
[ media field: copy + action over image ]
```

Keep copy inside the media field, not in a separate adjacent card. Choose a quiet crop or a local contrast plate/scrim; do not move copy outside the image to fix contrast.

These are relationship diagrams, not pixel specifications. Resolve alignment, proportions, whitespace and focal crop from the paired captures and original Visual hierarchy. Desktop header plus complete hero must fit 1536 x 864 at normal zoom, even if the source was captured at a taller viewport. Mobile may be content-height driven.

### Page rhythm and content mapping

Keep these assigned chapters in order; the numbers below describe actual page sequence, not decorative labels to add to the site:

1. **hero**
2. **practice proposition**
3. **team/trust story**
4. **comfort experience**
5. **service chapter**
6. **testimonial/photo chapter**
7. **social presence**
8. **booking/contact close**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: bold outlined/solid condensed uppercase display. Body character: neutral sans-serif. Hierarchy: very large display phrases with small utility labels and short supporting paragraphs. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: near black; charcoal; muted image darks. Contrast intent: strong high-contrast headline against dark photographic fields. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: broad practice and patient-experience photos interleaved with dark statement chapters. Crop guidance: full-width desktop bands and subject-safe mobile images. Focal role: retain face and dental context, keep text areas unbusy. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: service and experience chapters introduced by oversized type and concise copy. Early action: visible at the top and repeated at the final booking close. Primary placement: compact top booking action and hero action. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **stacked high-contrast story chapters**. scale display type while preserving outline/solid hierarchy; stack image and copy; keep booking action reachable; avoid text overlay on faces; prevent horizontal overflow.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: subtle scroll reveal and broad image transitions. Reduced-motion contract: show each chapter statically and remove parallax/reveal delay. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **outlined-display-hero** ([data-reference-signature=outlined-display-hero]): full-bleed image stage with bold outlined or dual-weight display type. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **asymmetric-dark-chapters** ([data-reference-signature=asymmetric-dark-chapters]): alternating text and photo chapters on a deep surface. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **short-practice-details** ([data-reference-signature=short-practice-details]): compact patient/experience details, not an oversized generic about essay. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **booking-close** ([data-reference-signature=booking-close]): distinct final booking/contact section. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
