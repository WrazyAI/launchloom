# Visual hierarchy

Translate the observed Vivid Specialized Dentistry home page into an original, fact-grounded dental-specialty experience. The source opens with an immersive, low-light practice image, a compact line of utility navigation and consultation controls, and a large display statement that gives way to a light credential/context strip. Its longer story alternates clean white editorial panels, close-up practice imagery, muted lavender surfaces, handwritten-style display accents, and substantial specialist portraits. Avoid building a conventional grid of identical clinic cards. Let the page move between moments of high contrast and quiet explanation. Use a distinctive display face paired with a highly readable sans-serif, but select new type and colors that belong to the client. The source brand, people, clinical images, proof, statistics, copy, and exact trade dress are not reusable.

# Page sequence

The observed rhythm is: compact consultation header; cinematic practice-image hero; a short credential/context band; a concise specialist proposition with a small image sequence; an editorial specialist/team introduction; a treatment-range selector; an explanatory technology chapter; one patient-review moment; a carefully structured case/story sequence; a consultation invitation with one human-scale image; patient questions; and a detailed contact/footer close. Use this as an evidence-backed planning reference, not a page template. In the new site, explain what specialty care is offered, which patient needs it may address, how an initial consultation works, what the patient should prepare, and how to take the next step. Keep Services, FAQs, and Contact directly navigable. If verified clinician biographies, associations, outcome evidence, reviews, financing, or case details are not supplied by the client, replace those blocks with a general process explanation or omit them.

Service choices may be image-led, but each needs a concise service label and a useful destination. The original page uses a technology explainer to make specialist tools understandable; translate that information pattern only when the client can substantiate the named tools and their role. Patient case stories must never be fabricated or transplanted. A client may supply consented case imagery, but absent that, use an explanation of planning and consultation instead. Avoid copying precise numerical counters, review scores, named accreditations, treatment timelines, warranties, result claims, or phrases from the source.

# Responsive translation

At 1440 px, preserve the cinematic opening, then let broad light chapters and image-led specialist stories alternate. Keep display text and image subjects balanced rather than placing a wall of copy beside every photo. At 390 px, keep a direct consultation route visible in a compact header, use a subject-safe hero crop with legible copy, and stack each image/text chapter in a deliberate sequence. Turn treatment and case-story rows into individually readable panels; do not rely on a tiny horizontally clipped strip. Team profiles should be static or manually controlled, never autoplay. Make technology descriptions concise and practical. Put questions and contact information into the normal document flow and preserve all available actions without fixed overlays or page-level horizontal overflow.

# Signature elements

Carry forward these transferable mechanics in a new visual identity: an atmospheric dental-practice opening with a direct consultation action; an editorial specialist proposition supported by distinct image crops; a limited treatment-range selector; one clear technical/process explanation; and a detailed closing consultation and questions sequence. Use a single soft secondary color field to mark a meaningful change in the story, not a generic background for every other section. Motion can be limited to one user-controlled carousel or a restrained reveal; all content must remain present with motion disabled. The exact source wordmark, brush lettering, palette, specialists, credentials, patient case photos, before/after results, review panel, and copy are source-only.

# Prohibited patterns

Do not reuse Vivid Specialized Dentistry's logo, wording, fonts, colors, photographs, clinicians, patient images, before/after cases, reviews, credential marks, statistics, warranties, financing claims, service claims, or exact trade dress. Never invent specialist credentials, treatment outcomes, success rates, patient counts, prices, warranties, treatment timelines, financing, or medical guarantees. Do not present illustrative or generated faces as clinicians or patients. Do not show before/after images without client-provided and properly consented assets. Avoid oversized unsupported number counters, tiny low-contrast captions, a wall of nearly identical patient-case cards, or scroll effects that hide clinical explanations. Keep all service and patient-language factual, non-diagnostic, and based on verified client information. Never use an em dash in visitor-facing copy.

# Local content and verification

Use only the client's verified business name, specialty, accepted services, location or service area, phone, consultation process, clinicians, qualifications, and appointment route. Distinguish a specialty practice from a general dentist only when intake facts establish that scope. Explain the first consultation and what information a visitor may prepare without promising diagnosis or a specific result. Keep address and hours consistent with the structured data and visible page. Verify 1536 x 864 and 1366 x 768 desktop openings plus a 390 x 844 mobile render. Confirm the primary action works, services and questions are distinct, all imagery belongs to the client or an approved generated/stock asset set, image crops remain subject-safe, contrast is readable, motion is optional, and no overflow or unverified clinical claim remains.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **Vivid Specialized Dentistry: cinematic specialty story and case-led chapters**; family: `vivid-specialized-dentistry-editorial`; subject fit: dental, specialty dentistry, prosthodontics, dental implants. Archive-only: this refinement does not authorize production selection.
- Open the paired full-page captures: desktop: `screenshots/desktop.png`, captured viewport 1440 x 900; mobile: `screenshots/mobile.png`, captured viewport 390 x 844. Read the opening at its captured viewport and then inspect the whole page. A full-page image's total height is not CSS vh.
- Use this dossier alone for its route, not an average of the other candidates. Verified client facts, sealed content, accessibility, client font/palette choices and host runtime rules constrain the adaptation. Preserve the assigned composition, section order and signatures; if evidence and prose disagree, identify the conflict rather than silently rewriting the curated contract.
- Separate observed design from proposed client treatment. Do not claim an exact font, hex value, spacing measurement, interaction or animation was observed unless retained evidence supports it. Static captures do not prove scroll, hover or click behavior.

### Opening layout contract

**desktop:** no normalized opening topology is recorded. Read the paired capture and the original hierarchy/mobile notes before drawing this viewport's wireframe. Do not infer a split hero from the absence of a label.

**mobile:** no normalized opening topology is recorded. Read the paired capture and the original hierarchy/mobile notes before drawing this viewport's wireframe. Do not infer a split hero from the absence of a label.

These are relationship diagrams, not pixel specifications. Resolve alignment, proportions, whitespace and focal crop from the paired captures and original Visual hierarchy. Desktop header plus complete hero must fit 1536 x 864 at normal zoom, even if the source was captured at a taller viewport. Mobile may be content-height driven.

### Page rhythm and content mapping

Keep these assigned chapters in order; the numbers below describe actual page sequence, not decorative labels to add to the site:

1. **compact consultation header**
2. **atmospheric specialty hero**
3. **brief practice and qualification context**
4. **specialist proposition with image sequence**
5. **team portrait presentation**
6. **treatment-range selector**
7. **technology explanation**
8. **patient proof moment**
9. **case or process story sequence**
10. **consultation invitation**
11. **patient questions**
12. **dark contact and footer close**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: high-impact modern display paired with restrained script-like accent headings. Body character: neutral sans-serif for clinical explanation and navigation. Hierarchy: short hero statement, generous editorial section headings, concise patient-facing paragraphs. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: near-black; soft white; pale lavender. Contrast intent: high contrast at the image-led opening and footer, calm readable contrast in explanatory chapters. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: dark interior hero, portrait-led specialist chapter, technology details, and carefully sequenced case-story media. Crop guidance: wide cinematic hero, mid-size specialist portraits, modular treatment crops, vertical mobile story panels. Focal role: protect faces and clinical context; keep text on calm portions of the photograph. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: treatment-range selector followed by explanatory specialty chapters. Early action: consultation route in the header and after the specialist explanation, then contact after FAQs. Primary placement: request a consultation. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **sequential specialty-story panels with direct consultation action**. use a subject-safe hero crop and maintain text contrast; stack portraits and explanations with comfortable reading measure; show one treatment item at a time with labeled controls; replace case-image strips with fully readable vertical story panels; keep FAQs and contact in the normal flow without overlays.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: manual treatment/review controls with restrained chapter reveals. Reduced-motion contract: show all chapters statically with controls still available. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **atmospheric-specialty-opening** ([data-reference-signature=atmospheric-specialty-opening]): image-led specialty opening that establishes a distinct practice mood and one direct next step. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **treatment-range-selector** ([data-reference-signature=treatment-range-selector]): compact, navigable selector that distinguishes major treatment categories. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **specialty-story-chapters** ([data-reference-signature=specialty-story-chapters]): alternating image and explanation chapters, with a process alternative when client-approved case evidence is unavailable. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
