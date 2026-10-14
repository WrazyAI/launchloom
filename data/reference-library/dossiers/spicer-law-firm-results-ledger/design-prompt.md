# Reference implementation brief: evidence-led law firm

## Scope and non-copy rule

Use the paired screenshots as a licensed visual reference for measured legal typography, proof-led composition, practice-area navigation, outcome tables, and short consultation flow. The source is licensed CC BY 4.0; its license and attribution are retained in this dossier. Do not copy the source firm, marks, lawyers, case data, claims, testimonials, prices, imagery, or wording. The screenshot contains fictional demo evidence. All practice descriptions, jurisdictions, attorney credentials, outcomes, fees, contact channels, disclaimers, and SEO content must come from sealed, researched, client-approved facts. When a claim lacks documentation or publication permission, omit it.

## Visual hierarchy

Begin with a thin, restrained contact/availability line and compact navigation. Use a dark navy field with a concise, clear legal-practice proposition on the left and a small structured proof or matter ledger on the right. Avoid the default courthouse-column image or dramatic gavel cliché. The primary action is a short consultation request; any claim about confidentiality, response time, or payment arrangement must be explicitly approved by the client and consistent with local bar rules.

Use the next section as an oversized practice-area index: large, numbered editorial rows, each pairing the matter type with a short scope description and optional qualifier. A second tabular surface may show selected outcomes only if the firm supplies documented, attributable outcomes and the applicable disclaimer. If not, replace it with a process, matter-fit, or publication surface rather than inventing proof. Attorney profiles should use client-approved names, roles, credentials, and photos; otherwise use typographic layout, not fictional monograms or fabricated people.

## Page sequence

1. Verified contact utility and compact navigation.
2. Practice-positioning hero balanced with a small proof/matter index.
3. Practice-area rows with verified scope and direct page anchors.
4. Documented case outcomes only when client evidence and publication approval exist; otherwise use a truthful process explanation.
5. Attorney or team profiles only from approved data.
6. A concise case-process sequence explaining the real intake and engagement stages.
7. Client feedback only from genuine, permissioned testimonials.
8. Short consultation request with minimum necessary information and an honest disclaimer.
9. FAQs based on client-reviewed intake questions and jurisdiction-specific answers.
10. Footer with verified contact, office/service region, and required legal notices.

Do not repeat an outcome claim in the hero, results section, and testimonials. Every proof unit should have a source and a reason to be present.

## Interaction and motion

The signature mechanics are the practice-area index and its direct anchors, plus a calm, static results ledger. Native FAQ disclosure is sufficient; do not add novelty motion to sensitive legal information. Make consultation actions clear and reachable without obstructing the content. Avoid timers, urgency, auto-rotating results, scroll locks, fake case counters, and unsubstantiated lead guarantees. Under reduced motion, all information remains static and available.

## Responsive translation

At 390px, stack the practice promise before any ledger. Convert tabular outcomes into labeled vertical rows that keep the case context and qualifying note together. Stack practice-area entries, attorney profiles, and process stages in reading order. Keep legal disclaimers directly adjacent to the claims they qualify; do not hide them in collapsed mobile content. Use a compact menu with accessible controls, readable line lengths, and no horizontal overflow down to 320px.

## Signature elements

Preserve the balanced opening statement/proof ledger, large practice-area index, a clearly auditable results-or-process surface, and a short consultation sheet. Use square corners, fine rules, generous whitespace, dark navy, warm white, and restrained muted-gold labels. Ensure the typography, not decorative imagery, establishes authority.

## Prohibited patterns

No copied firm identity, attorney names, practice claims, case facts, awards, testimonials, prices, case outcomes, photographs, or source copy. Never invent a verdict amount, success rate, credentials, jurisdiction, years in practice, response promise, contingency arrangement, client relationship, or confidentiality guarantee. Never imply that submitting the form creates representation. Do not place fake awards, trust badges, invented client logos, generic lawyer portraits, a gavel/library hero, or aggressive “we win” language. Avoid representing the source template’s fabricated case results as real or anonymizing them and reusing the amounts.

## Local SEO and conversion

Use only client-verified city, state, service-area, and jurisdiction language. Build natural practice-area/location page paths from researched demand and actual firm coverage; do not claim offices or bar admissions the firm does not have. Add accurate LegalService/Attorney structured data only where all fields are verified. Primary CTA goes to the real consultation route. Keep the form short, avoid requesting detailed confidential facts before the firm’s approved intake notice, and route submissions to the client’s authorized system.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **Spicer law-firm results ledger**; family: `spicer-law-firm-results-ledger`; subject fit: legal-services, law-firm, attorney, lawyer, professional-services. Production eligibility is unchanged.
- Open the paired full-page captures: desktop: `screenshots/desktop.png`, captured viewport 1440 x 900; mobile: `screenshots/mobile.png`, captured viewport 390 x 844. Read the opening at its captured viewport and then inspect the whole page. A full-page image's total height is not CSS vh.
- Use this dossier alone for its route, not an average of the other candidates. Verified client facts, sealed content, accessibility, client font/palette choices and host runtime rules constrain the adaptation. Preserve the assigned composition, section order and signatures; if evidence and prose disagree, identify the conflict rather than silently rewriting the curated contract.
- Separate observed design from proposed client treatment. Do not claim an exact font, hex value, spacing measurement, interaction or animation was observed unless retained evidence supports it. Static captures do not prove scroll, hover or click behavior.

### Opening layout contract

**desktop: type-led-statement / copy-leads-opening**

```text
[ navigation ]
[ dominant typographic statement ]
[ supporting detail + action ]
```

Typography carries the opening. Preserve scale contrast and deliberate line breaks; do not add a stock-photo hero merely because image tokens exist.

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

1. **utility-contact-line**
2. **navigation**
3. **practice-promise-and-proof-ledger**
4. **practice-area-index**
5. **documented-results-ledger**
6. **attorney-profiles**
7. **case-process**
8. **client-proof**
9. **consultation-form**
10. **faq**
11. **footer**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: editorial serif or high-authority restrained grotesk, with large practice rows. Body character: neutral legal-service sans. Hierarchy: measured headline, spacious area titles, small uppercase matter labels, tabular figures with legible notes. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: deep navy; ink blue; lifted blue-gray. Contrast intent: gold is reserved for rules and factual figures; small body copy remains comfortably legible against dark surfaces. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: proof-led page that can function without photography. Crop guidance: use geometric monogram/attorney plates only when approved headshots are unavailable and label no person as a real lawyer unless verified. Focal role: the contrast between the opening matter ledger and large practice index carries hierarchy; avoid generic law-library imagery. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: large numbered practice-area rows with concise matter-fit scope, followed by a tabular case-outcome ledger only when the firm supplies documented, publishable outcomes. Early action: show practice areas and the type of matters accepted before firm history or long bios. Primary placement: short consultation action alongside the opening practice statement. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **single-column proof-to-practice legal flow**. put practice proposition and consultation action before the case ledger; convert results to labeled rows with outcome and context kept together; stack practice entries and attorney plates in reading order; turn horizontal process steps into a vertical sequence; keep disclaimers beside the claim they qualify; no horizontal overflow.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: restrained anchor navigation and native FAQ disclosure; proof remains static and auditable. Reduced-motion contract: all matter, practice and intake information remains fully visible without animation. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **law-opening-ledger** ([data-reference-signature=law-opening-ledger]): legal positioning statement balanced by a compact, factual matter or proof ledger. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **practice-area-index** ([data-reference-signature=practice-area-index]): large, scan-friendly practice-area index with short verified scope. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **documented-results-surface** ([data-reference-signature=documented-results-surface]): auditable client-supplied outcomes, or an explicitly non-results proof/process substitute when none are approved. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **short-consultation-form** ([data-reference-signature=short-consultation-form]): brief consultation request that avoids implying representation or guaranteed confidentiality. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
