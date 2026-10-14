# Treatment-led medical spa implementation brief

Use the desktop and mobile screenshots as evidence for information architecture, table layout, and restrained clinical-luxury direction. Build a new design for the client's verified clinic using only clinician-approved business facts, actual credentials, accepted procedures, confirmed pricing, and SEO research. Do not copy the sample clinic identity, source copy, source hero art, procedure names, provider biographies, reviews, prices, downtime figures, financing, or before/after policy. This is a design reference, not a clinical source.

## Visual hierarchy

Lead with a precise treatment-category promise and an early consultation path, not a generic spa lifestyle headline. Use a pale clinic-interior atmosphere only if the client provides approved photography or a newly licensed/generated image; keep the image quiet enough that the heading and actions remain dominant. A slim contact/consult utility line can sit above the header. Place the primary consultation action and a secondary price-menu link in the opening viewport.

Let the treatment menu become the first major information surface. It should explain what each real procedure is, its verified price basis, and any material decision details. Keep the design light, calm, and organized: warm white and blush surfaces, dark readable text, muted clay accent, restrained borders, and simple table or row structures. Use an editorial display face for a short heading and a neutral sans for price, safety, clinical, and navigation text. If using the font families linked by the source, apply them explicitly with `font-family` and verify loaded fallback behavior; do not repeat the source's font utility mapping defect.

## Page sequence

1. Compact consultation/contact utility strip and quiet navigation.
2. Treatment-led hero with a concise promise, primary consult action, and direct price-menu link.
3. Per-treatment menu showing verified cost basis and price information, with only client-confirmed categories.
4. A separate downtime/recovery table, using clinician-approved recovery information and clearly labeled estimates where appropriate.
5. Consultation path: how assessment works, which decisions happen with a clinician, and what happens next.
6. Provider credentials, using exact verified licenses and scope of practice. Place this beside the relevant clinical decision content, not as decoration.
7. Before/after imagery policy or other evidence standards, only if the clinic has approved copy and images. Otherwise omit this section.
8. Financing, if actually offered, described with accurate terms and eligibility.
9. Genuine, approved reviews and a concise FAQ. Do not generate fictional patient outcomes or review summaries.
10. A consultation request form with a real handler, clear consent, privacy notice, and a useful non-submission fallback.

The order is intentional: identify what is offered, disclose the price basis and recovery considerations, establish who provides care, and then invite consultation. Client SEO terms should be mapped to actual procedures and service areas; do not promise results, diagnose, imply candidacy, or answer medical questions beyond approved source material. Remove any section that the client cannot substantiate.

## Responsive translation

At 1440px, align the opening promise and a pale treatment image without making the page read as a generic split-hero template. Keep the price menu broad enough for labels and numeric values; separate the recovery table visually. At 390px, stack menu entries into labeled treatment rows so name, price basis, and cost remain together. Reflow downtime as a list or compact labeled rows. Do not shrink dense clinical information into unreadable columns. Keep provider credentials and consultation action adjacent to relevant text, use full-width form controls, and verify zero horizontal overflow.

Animation is optional. If present, use short, non-blocking transitions for section entrances only. The full menu, recovery details, credentials, and FAQs must be visible when JavaScript is unavailable or reduced motion is enabled. Native details elements are acceptable for low-risk FAQs. All clinical content must be keyboard reachable, screen-reader meaningful, high contrast, and available without hover. Use descriptive alt text only for real, approved imagery; do not use generated people as clinicians or patients.

## Signature elements

- A specific treatment-led hero with consultation action and price discovery visible early.
- A per-unit or otherwise explicit pricing menu that reflects the client's actual pricing model.
- A separate recovery/downtime explanation using approved clinician facts.
- Provider credentials close to treatment detail.
- A calm consultation pathway that prioritizes fit and safety over pressure to purchase.

## Prohibited patterns

- No invented efficacy, guaranteed results, risk percentages, candidacy rules, contraindications, recovery duration, clinician titles, credentials, prices, financing terms, testimonials, or treatment availability.
- No copied source clinic, names, source copy, source photography, sample procedure list, or demo outcomes.
- No medical advice written as fact unless supplied and approved by the responsible clinician.
- No vague "results" marketing, false urgency, unsafe before/after claims, fabricated patient quotes, or AI images represented as real patients or clinicians.
- No decorative card wall that buries the treatment menu, no hidden downtime, and no form that appears to submit without a working destination.

Before delivery, verify every clinical statement against sealed approved content, inspect price and downtime at 100 percent zoom, test keyboard/screen-reader structure, review desktop and mobile overflow, and confirm that the consultation form's status is truthful. The supplied reference is a layout inspiration only; patient safety, clinician facts, local regulations, and client SEO research govern the actual page.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **Spicer med spa treatment and downtime menu**; family: `spicer-med-spa-treatment-ledger`; subject fit: medical-spa, aesthetic-clinic, cosmetic-treatment, med-spa, clinical-beauty. Archive-only: this refinement does not authorize production selection.
- Open the paired full-page captures: desktop: `screenshots/desktop.png`, captured viewport 1440 x 1000; mobile: `screenshots/mobile.png`, captured viewport 390 x 844. Read the opening at its captured viewport and then inspect the whole page. A full-page image's total height is not CSS vh.
- Use this dossier alone for its route, not an average of the other candidates. Verified client facts, sealed content, accessibility, client font/palette choices and host runtime rules constrain the adaptation. Preserve the assigned composition, section order and signatures; if evidence and prose disagree, identify the conflict rather than silently rewriting the curated contract.
- Separate observed design from proposed client treatment. Do not claim an exact font, hex value, spacing measurement, interaction or animation was observed unless retained evidence supports it. Static captures do not prove scroll, hover or click behavior.

### Opening layout contract

**desktop:** no normalized opening topology is recorded. Read the paired capture and the original hierarchy/mobile notes before drawing this viewport's wireframe. Do not infer a split hero from the absence of a label.

**mobile:** no normalized opening topology is recorded. Read the paired capture and the original hierarchy/mobile notes before drawing this viewport's wireframe. Do not infer a split hero from the absence of a label.

These are relationship diagrams, not pixel specifications. Resolve alignment, proportions, whitespace and focal crop from the paired captures and original Visual hierarchy. Desktop header plus complete hero must fit 1536 x 864 at normal zoom, even if the source was captured at a taller viewport. Mobile may be content-height driven.

### Page rhythm and content mapping

Keep these assigned chapters in order; the numbers below describe actual page sequence, not decorative labels to add to the site:

1. **consult-utility-bar**
2. **treatment-led-hero**
3. **per-unit-treatment-menu**
4. **downtime-comparison-table**
5. **consultation-process**
6. **before-after-evidence-policy**
7. **practitioner-credentials**
8. **approved-reviews**
9. **questions**
10. **consultation-form**
11. **attribution-footer**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: intended Fraunces editorial face, though static HTML currently falls back to system sans. Body character: intended Inter neutral sans, though font-family utility is miscompiled in the capture. Hierarchy: large concise clinical promise, restrained micro-labels, compact price and downtime columns, legible policy body copy. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: warm white; light blush; pale stone. Contrast intent: calm clinical warmth with clear price, credential, and safety text contrast. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: soft AI-generated spa/clinic interior atmosphere with a light wash. Crop guidance: wide hero background only; most information sections remain clean typographic and tabular surfaces. Focal role: clinic atmosphere, not a real patient, clinician, procedure result, or promise. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: treatment rows with exact price basis and a separate recovery/downtime table; practitioner credentials and consultation context are near the decision point. Early action: immediately beside the service promise, before treatment detail. Primary placement: consultation action in the hero and final consultation form. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **single-column clinical decision journey**. put the consultation action and price link before procedure detail; turn each treatment row into a labeled block with price basis visible; stack downtime entries with treatment and recovery labels together; keep practitioner credentials adjacent to clinical copy; use full-width form controls and preserve all safety text without horizontal overflow.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: quiet section-rise reveals and native FAQ disclosures. Reduced-motion contract: make all treatment, downtime, credential, and policy content visible without transforms; this fallback was used for captures. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **treatment-led-opening** ([data-reference-signature=treatment-led-opening]): a concise opening that introduces the real treatment category and an early consultation action. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **per-unit-treatment-menu** ([data-reference-signature=per-unit-treatment-menu]): a treatment table or list that explains the actual price basis and verified prices. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **recovery-planning-table** ([data-reference-signature=recovery-planning-table]): a separate recovery/downtime comparison populated only from clinician-approved facts. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **practitioner-credential-panel** ([data-reference-signature=practitioner-credential-panel]): a factual provider credential presentation sourced from approved client credentials. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
