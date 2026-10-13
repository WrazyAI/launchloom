# Visual hierarchy

Reference: City Wide Services diagnostic HVAC route, captured from https://citywideaustin.com/ on 2026-09-26. A dark technician-at-condenser photograph supports a left-aligned plainspoken repair promise, two contact actions and a low trust detail rail. Thin service-area utility line, white brand row, service links, call number and contrasting schedule action. Large friendly sans headlines, compact status labels and concise visitor-centered task descriptions. Deep navy, cream, slate blue and small rust-red action accents. Authentic technician scenes fill a service photo grid, while a simple circular metro diagram handles locality without pretending to be a literal map. Translate only these visual and information-order mechanics into a new client-owned design. Let the verified client's name, services, place, assets and actual next step determine all visible language.

# Page sequence

The observed page flows through 1. technician hero; 2. symptom-choice cards; 3. service photograph grid; 4. diagnosis approach split; 5. customer proof; 6. repair-versus-replace comparison; 7. metro coverage diagram; 8. before-you-call FAQ; 9. lead action and footer. Preserve that rhythm only where the client has matching facts and assets. Start with what the system is doing, route to confirmed AC/heating/maintenance service, and explain diagnosis and repair-or-replace decisions. Call or schedule in the opening, repeat after the comparison and final FAQ. Include a locally useful service and coverage explanation from the intake, with one primary and one secondary action near the opening. A service area must remain a service area rather than an invented office.

# Responsive translation

At a 390 by 844 viewport, Stack symptom choices as full-width controls, preserve photo captions, and move the coverage diagram below the explanatory text. Recheck the opening at 1440 by 1000 so the main promise, first action and focal image are legible at normal zoom. On both sizes, use real links, an accessible menu, readable contrast, reachable form controls, and no horizontal overflow. Honor reduced-motion preference by presenting equivalent static information; a video or reveal may never be required to discover the next action.

# Signature elements

1. Symptom First choice grid (`symptom-first-choice-grid`): the captured desktop has six concise symptom choices in two rows of three on a light surface; mobile presents a single vertical list. Give each choice a recognizable problem label and a functional route into supported services. Source ordinal labels are decoration here, not a customer process; omit them in the client adaptation.
2. Diagnosis Over Pressure chapter (`diagnosis-over-pressure-chapter`): desktop combines an inset technician photograph, a narrow explanatory column and a dark procedural panel. Mobile presents photo, explanation and procedural panel in reading order. Explain the client's actual diagnostic approach without adopting the source's "no pressure" policy, years in operation or numerical proof.
3. Metro radial diagram (`metro-radial-diagram`): pair a coverage explanation with a schematic central hub and surrounding area labels on desktop; place the diagram below the copy on mobile. Use confirmed service areas, describe it as a coverage schematic, and never imply a physical branch or precise travel time.

## Chapter anatomy observed in the paired captures

The desktop opening separates a dark left copy/action zone from the photograph's clear technician focal zone on the right; the image itself spans the frame. The curated `split-media` label describes that spatial division, not a requirement to add a white boxed copy card or equal-width columns. Mobile retains an over-image promise with a compact menu and stacked action/proof details. The customer-review rail sits at the opening's lower edge on desktop but becomes stacked panels before the symptom chapter on mobile; use it only with authentic client proof. A dark service band carries six image-led service destinations, three across on desktop and one per row on mobile. Later chapters alternate an inset light diagnostic row, blue proof and comparison bands, a light coverage row, pale FAQ row and dark final contact/footer. The repair-versus-replace comparison has two adjacent decision panels on desktop and two stacked panels on mobile; source prices and repair promises must not transfer. Preserve this useful variation instead of making symptoms, services, process, coverage and FAQs all identical cards.

# Prohibited patterns

- Do not copy technician photos, review quotes, years in business, claimed no-pressure policy, map areas or repair promises.
- Source identity, exact wording, logos, people, photographs, fonts, badges, testimonials, numerical claims or locations as client assets.
- Invented reviews, credentials, prices, guarantees, service areas, outcomes, response times or staff.
- Generic SaaS cards that replace the observed composition, and decorative motion that hides service or contact information.
- The source screenshots are internal visual evidence only. Do not hotlink or export them into a generated client site. Keep the resulting page original and inspect desktop and mobile rendering before promotion.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **City Wide Services diagnostic HVAC route**; family: `hvac-symptom-first-choice-grid`; subject fit: hvac, heating-and-cooling, air-conditioning, home-services. Production eligibility is unchanged.
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

**mobile: media-overlay / copy-over-media**

```text
[ navigation ]
[ media field: copy + action over image ]
```

Keep copy inside the media field, not in a separate adjacent card. Choose a quiet crop or a local contrast plate/scrim; do not move copy outside the image to fix contrast.

These are relationship diagrams, not pixel specifications. Resolve alignment, proportions, whitespace and focal crop from the paired captures and original Visual hierarchy. Desktop header plus complete hero must fit 1536 x 864 at normal zoom, even if the source was captured at a taller viewport. Mobile may be content-height driven.

### Page rhythm and content mapping

Keep these assigned chapters in order; the numbers below describe actual page sequence, not decorative labels to add to the site:

1. **technician hero**
2. **symptom-choice cards**
3. **service photograph grid**
4. **diagnosis approach split**
5. **customer proof**
6. **repair-versus-replace comparison**
7. **metro coverage diagram**
8. **before-you-call FAQ**
9. **lead action and footer**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: Large friendly sans headlines, compact status labels and concise visitor-centered task descriptions. Body character: readable supporting text with visible heading hierarchy. Hierarchy: one dominant opening statement, clear section headings and compact service labels. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: Deep navy; cream; slate blue and small rust-red action accents. Contrast intent: preserve readable contrast; source colors are inspiration, not a copied brand palette. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: Authentic technician scenes fill a service photo grid, while a simple circular metro diagram handles locality without pretending to be a literal map. Crop guidance: site-specific focal crops at desktop and mobile. Focal role: client-owned or reviewed licensed imagery only; preserve the role of each source image rather than its subject identity. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: Start with what the system is doing, route to confirmed AC/heating/maintenance service, and explain diagnosis and repair-or-replace decisions. Early action: primary and secondary actions should be visible near the first promise. Primary placement: Call or schedule in the opening, repeat after the comparison and final FAQ. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **Stack symptom choices as full-width controls, preserve photo captions, and move the coverage diagram below the explanatory text**. keep source-specific hierarchy and decision sequence; use a 390 px single-column or deliberate two-column layout without overflow; keep touch actions and form labels visible; remove motion dependence.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: card-hover; static-diagram. Reduced-motion contract: all copy, imagery and actions visible statically. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **symptom-first-choice-grid** ([data-reference-signature=symptom-first-choice-grid]): A new-client interpretation of the observed symptom-first choice grid relationship, with source identity and assets excluded. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **diagnosis-over-pressure-chapter** ([data-reference-signature=diagnosis-over-pressure-chapter]): A new-client interpretation of the observed diagnosis-over-pressure chapter relationship, with source identity and assets excluded. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **metro-radial-diagram** ([data-reference-signature=metro-radial-diagram]): A new-client interpretation of the observed metro radial diagram relationship, with source identity and assets excluded. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
