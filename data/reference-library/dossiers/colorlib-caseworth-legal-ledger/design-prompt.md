# Reference implementation brief: Written-fee legal practice ledger

## Scope and non-copy rule

Use the paired captures to study a measured professional-services page where a concise positioning statement, a two-column practice-area ledger, human expertise, a transparent fee table, practical insights and an enquiry form form one decision path. The pinned source template is MIT licensed and its per-template photographs are documented as CC0/Public Domain. Do not reuse the Caseworth name, solicitor/accountant identities, images, offices, regulatory numbers, practice claims, rates, time estimates, article titles, contact details or fictional client facts. The source is a layout reference, not a legal authority or copy source.

## Visual hierarchy

Begin with a fine regulatory/utility strip only when the client has actual regulatory information, then a small wordmark and quiet navigation. The opening is a split editorial composition: a clear, accountable promise on the left and one portrait/statue or office image on the right. Use warm white, pale stone, a restrained deep-blue action, narrow rules and a calm serif for the principal heading. Keep the body neutral and the legal copy short. Present practice areas as two columns of ruled rows with one-sentence scope notes. Keep fees in a genuine table with explicit assumptions and a plain explanation of what a fee covers.

## Page sequence

1. Verified professional/regulatory utility information, brand and concise practice navigation.
2. Opening statement with a credible next step and a secondary fees route.
3. Practice-area ledger that helps visitors identify the right kind of matter.
4. Responsible people section only for named, approved professionals with verified roles and credentials.
5. Fees/process section with exact client-provided rates, scope and conditions. If pricing cannot be disclosed, explain the actual quoting process instead.
6. Insight notes or case explanations that are accurate and useful, not keyword filler.
7. FAQs on suitability, first contact, preparation and fees.
8. Enquiry form with only necessary fields and a clear confidentiality notice based on the firm's real policy.

## Responsive translation

At 390px, place the positioning statement and one action before the portrait. Convert the practice ledger into full-width rows, retaining one concise descriptor per practice. Ensure fees remain a readable two- or three-column comparison only if labels stay attached; otherwise use stacked matter/basis/amount rows. Keep regulatory language concise and visible where required. Stack the enquiry form and its preparation guidance. Do not let a sticky action cover advice or form controls. Verify at 390px and 320px without horizontal overflow.

## Signature elements

- Restrained professional header with optional verified regulatory strip.
- Clear editorial opening beside a relevant portrait or practice image.
- Ruled two-column practice area ledger rather than service cards.
- Published fee table or a plainly explained alternative quoting process.
- Enquiry form paired with calm preparation/confidentiality guidance.

## Prohibited patterns

- Copying legal copy, imagery, names, credentials, regulators, fees, timescales or guarantees from the template.
- Inventing SRA/ICA/CPA status, partner tenure, matter outcomes, fixed-fee offers, response guarantees or claims of privilege.
- Presenting stock/historical portraits as the firm's real lawyers or accountants.
- Publishing a fee table without current, client-confirmed scope and assumptions.
- Using a generic trust badge wall, fake testimonials, urgency timers, or a long About essay in the hero.
- Implying that a submitted form creates a solicitor-client relationship unless the firm explicitly confirms that process.

## Local SEO and conversion

Name the firm's real practice focus and physical location/area served in useful copy and metadata. Distinguish jurisdictions, licensed offices and remote availability using verified facts. Build FAQs around genuine local customer questions and authoritative client guidance; never paraphrase the template's legal advice. Keep visible address, phone, hours and structured data consistent. Primary action should invite an appropriate initial enquiry, and the form should collect only the facts the firm's process requires. For regulated businesses, all legal and disclosure language must come from client approval, not model invention.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **Caseworth written-fee professional ledger**; family: `colorlib-caseworth-legal-ledger`; subject fit: legal-services, law-firm, solicitor, professional-services. Production eligibility is unchanged.
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

**mobile: type-led-statement / copy-leads-opening**

```text
[ navigation ]
[ dominant typographic statement ]
[ supporting detail + action ]
```

Typography carries the opening. Preserve scale contrast and deliberate line breaks; do not add a stock-photo hero merely because image tokens exist.

These are relationship diagrams, not pixel specifications. Resolve alignment, proportions, whitespace and focal crop from the paired captures and original Visual hierarchy. Desktop header plus complete hero must fit 1536 x 864 at normal zoom, even if the source was captured at a taller viewport. Mobile may be content-height driven.

### Page rhythm and content mapping

Keep these assigned chapters in order; the numbers below describe actual page sequence, not decorative labels to add to the site:

1. **utility**
2. **navigation**
3. **hero**
4. **practice-ledger**
5. **people**
6. **fees**
7. **insights**
8. **faq**
9. **enquiry**
10. **footer**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: refined serif display. Body character: quiet humanist sans. Hierarchy: medium editorial heading, compact practice labels, readable fee metadata. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: warm white; pale stone; soft gray. Contrast intent: restrained professional tone with clear action/input contrast. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: single relevant portrait or practice image. Crop guidance: vertical image beside an open hero; small people crops later. Focal role: one calm subject anchors the opening without becoming a credential claim. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: two-column ruled practice-area ledger with concise scope note. Early action: next to the hero positioning statement. Primary placement: initial enquiry in the top navigation and closing form. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **single-column professional ledger**. put practice statement and action before portrait; stack practice rows with notes; convert fee table to labeled facts; pair enquiry form with preparation guidance; no horizontal overflow.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: small filter/disclosure state for practical tables and FAQs. Reduced-motion contract: static practice list, fee table and FAQ answers. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **professional-opening** ([data-reference-signature=professional-opening]): measured statement beside one relevant image. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **practice-area-ledger** ([data-reference-signature=practice-area-ledger]): two-column or ruled practice-area index. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **transparent-fee-surface** ([data-reference-signature=transparent-fee-surface]): accurate fee table or honest alternative explanation. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **matter-enquiry-sheet** ([data-reference-signature=matter-enquiry-sheet]): enquiry with matter context and useful preparation note. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
