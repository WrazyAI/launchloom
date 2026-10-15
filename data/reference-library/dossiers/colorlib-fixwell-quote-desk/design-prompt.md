# Reference implementation brief: Quote-first home-service desk

## Scope and non-copy rule

Use the paired local captures to study a practical home-service journey where the quote form is integrated into the hero, service scope is quickly scannable, coverage can be checked, and process, work evidence, questions and contact follow in a clear sequence. The template is MIT licensed; its only bundled photograph is explicitly documented as CC0/Public Domain, and its other visual elements are CSS or interface graphics. Do not copy the Fixwell name, source wording, contact details, postcode, availability, prices, fee claims, guarantees, ratings, reviews, customer names, credentials or service promises. All business details and SEO language must come from verified client tokens.

## Visual hierarchy

Begin with a narrow, high-contrast utility strip only if the client has a useful verified message; otherwise omit it. Use a clean navigation row with the business name, a small set of useful anchors and one phone/quote action. The main scene is a direct problem-solving promise over a bright work-context image, paired with a concise quote form in the hero. Keep the form visually clear but secondary to the headline. Use a neutral white/soft-gray base and one strong blue or client-brand action color. The rest of the page uses plain service rows, short process steps and factual proof, avoiding a dashboard look.

## Page sequence

1. Compact call/coverage utility, navigation and quote action.
2. Problem-led hero with one short service promise, one practical sentence, and a quote form asking only for information needed to begin.
3. Scannable service choices organized by the customer's need; use client-provided prices only if accurate and approved.
4. Coverage check using only the client's actual service areas. If no lookup data exists, show a plain verified coverage list instead.
5. Short process sequence describing what the customer provides, what the business confirms, and what happens next.
6. Recent work only when client-approved photos document those jobs; otherwise show preparation guidance or explain how assessment works.
7. Reviews only when authentic, permissioned and sourced; otherwise omit them.
8. Practical FAQs and a closing call/request path.

## Responsive translation

At 390px, put the promise before the form, then keep the primary submit action visible without a floating layer. Make form labels explicit, controls full width and optional fields truly optional. Stack services into compact rows with enough touch space. Convert the coverage grid to a short list or a real postcode check. Present process steps as simple vertical statements. Pair each work image with its verified context. Keep FAQ answers readable and use native disclosure only when helpful. Verify at 390px and 320px with no horizontal overflow.

## Signature elements

- Hero-integrated quote desk that makes the next action immediate.
- Service list grouped by real customer problem rather than generic capabilities.
- Coverage checker or verified service-area list.
- Clear, short process sequence that reduces uncertainty.
- Practical question-and-contact close, with no false urgency.

The quote form should feel like a helpful intake tool, not a lead-harvesting panel. Keep the rest of the page useful even when the visitor is not ready to submit.

## Prohibited patterns

- Copying Fixwell's name, layout details, wording, demo form fields, sample call bar or image composition exactly.
- Inventing same-day availability, response times, service radius, call-out fee, minimum charge, hourly rates, insurance, certification, guarantees or review scores.
- Showing a map or exact local office inferred from a service area.
- Using stock work photography as proof of this client's completed work or using people as staff/customers.
- Repeating the same quote form after every section, hiding important scope in a long accordion, or adding a generic Why Us essay.
- Using decorative live counters, fake postcode validation, or a success state that does not reflect a real form response.

## Local SEO and conversion

Use the verified trade, common repair/install needs, and actual communities served in naturally written service explanations and practical FAQs. Avoid a city-name list replacing useful local context. Make the call link, request action and form endpoint functional. Ask for the customer's issue, service location and contact route only when needed. If pricing varies, explain the verified factors that affect a quote rather than publishing an invented starting price. Match LocalBusiness structured data to visible name, phone, address and hours; a service area alone is not a physical office.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **Fixwell quote-first service desk**; family: `colorlib-fixwell-quote-desk`; subject fit: home-services, handyman, home-repair, local-trades, plumbing, electrical. Production eligibility is unchanged.
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

These are relationship diagrams, not pixel specifications. Resolve alignment, proportions, whitespace and focal crop from the paired captures and original Visual hierarchy. Desktop header plus complete hero must fit 1536 x 864 at normal zoom, even if the source was captured at a taller viewport. Mobile may be content-height driven. The existing topology is medium-confidence: Screenshot shows overlapping layout mechanics; preserve the hybrid treatment rather than flattening it to this primary topology.

### Page rhythm and content mapping

Keep these assigned chapters in order; the numbers below describe actual page sequence, not decorative labels to add to the site:

1. **utility**
2. **navigation**
3. **hero**
4. **services**
5. **coverage**
6. **process**
7. **work-proof**
8. **faq**
9. **contact**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: bold practical grotesk. Body character: neutral readable sans. Hierarchy: short heavy problem statement, compact labels, body copy in small decision-ready blocks. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: white; light gray; soft work-context image. Contrast intent: high legibility with one blue action color and clear input borders. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: bright job-context hero with restrained overlay. Crop guidance: wide cover hero and smaller work-proof rectangles. Focal role: work setting supports but does not compete with the headline and quote form. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: problem-oriented service index with short scope explanations. Early action: inside hero, adjacent to the opening promise. Primary placement: quote submission integrated into hero. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **promise-first single column with inline quote path**. headline precedes the form; keep labels attached to full-width fields; stack services and process in reading order; replace map/grid with verified list if needed; do not fix overflow by clipping content.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: lookup and form state only when connected to a real endpoint. Reduced-motion contract: show static coverage guidance, all service options and native FAQ disclosure. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **hero-quote-desk** ([data-reference-signature=hero-quote-desk]): bounded quote form integrated into the opening scene. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **service-need-index** ([data-reference-signature=service-need-index]): service choices organized around visitor needs. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **coverage-checker** ([data-reference-signature=coverage-checker]): real coverage lookup or verified service-area list. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **work-process** ([data-reference-signature=work-process]): short practical sequence explaining what happens next. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
