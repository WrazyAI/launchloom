# Reference implementation brief: deadline-led accountancy

## Scope and non-copy rule

Use the paired screenshots as a licensed reference for deadline hierarchy, fee transparency, switching guidance, and mobile calendar translation. The source template is CC BY 4.0 and its attribution/license remain in the dossier. Do not copy the source firm, brand, text, rates, tax advice, dates, services, reviews, software logos, staff, or hero art. All deadlines must be checked against an official source for the client’s jurisdiction; each date and applicability claim must be tied to that source. Every price, included service, professional registration, response commitment, and tax statement must be client-supplied and approved. Missing information means omit it, not invent it.

## Visual hierarchy

Start with a narrow deadline/status rail that states a verified upcoming obligation, followed by compact navigation. In the hero, use a clean practical proposition about fee clarity or compliance support beside a quiet client-owned or generated office still life. Put the fee/consultation path and switching guide beside one another. Do not use people as generic stock employees. The filing calendar should be the first major information surface after the hero, with dates and who they affect easy to scan.

## Page sequence

1. Verified deadline/status rail and compact navigation.
2. Clear-fee promise with consultation and switching routes.
3. Filing calendar with jurisdiction and client-type labels.
4. Transparent service/fee comparison, including meaningful exclusions.
5. Step-by-step process for switching from an existing accountant.
6. Common enquiry triggers, based on client-reviewed material only.
7. Software and client-sector fit only for actual tools and sectors served.
8. Genuine, permissioned proof and concise FAQs.
9. Short contact form and verified office/remote service details.

## Interaction and motion

Use a calendar filter only if it makes deadlines easier to understand by business type, and keep a complete fallback table. A fee comparison may use selected states but cannot hide exclusions. No live countdown, false compliance badge, savings calculator, auto-rotating FAQ, or fake urgency. Reduced motion leaves dates, fees, and process steps visible.

## Responsive translation

At 390px, make the calendar a stacked list with date, obligation, applicability, and jurisdiction. Fee options become vertical with price basis beside included/excluded services. Show switching steps in a single column. Keep the first action near the headline, make call/email use the real client route, and verify 320px has no overflow.

## Signature elements

Preserve the deadline-first rail, visible filing calendar, transparent fee comparison, and dedicated switching sequence. The feeling should be precise and calming, not alarmist. Use a small controlled palette and typographic labels to make dates easier to act on.

## Prohibited patterns

No copied dates, rates, tax advice, sample deadlines, source logo, software partner marks, claims, fictional testimonials, or staff. Never invent tax deadlines, filing status, savings, penalties avoided, switching timelines, professional credentials, guarantees, client counts, or response windows. Do not show a countdown without current verified data. Avoid generic card walls and decorative financial charts that convey no real decision value.

## Local SEO and conversion

Use the client’s verified town, service area, registrations, and jurisdiction naturally in titles, service pages, FAQs, and contact details. Separate bookkeeping, VAT, payroll, accounts, and tax planning only when offered. Add accurate Accountant/AccountingService/LocalBusiness markup. Put fee clarity and a real consultation route early; the enquiry form requests only necessary contact information and makes no guaranteed-outcome claims.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **Spicer deadline-led accountancy calendar**; family: `spicer-accountant-deadline-calendar`; subject fit: accounting, accountant, accountancy, bookkeeping, tax-accounting. Production eligibility is unchanged.
- Open the paired full-page captures: desktop: `screenshots/desktop.png`, captured viewport 1440 x 900; mobile: `screenshots/mobile.png`, captured viewport 390 x 844. Read the opening at its captured viewport and then inspect the whole page. A full-page image's total height is not CSS vh.
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

1. **deadline-status-rail**
2. **navigation**
3. **fixed-fee-hero**
4. **filing-calendar**
5. **fee-tiers**
6. **switching-guide**
7. **enquiry-triggers**
8. **software-and-client-fit**
9. **proof**
10. **faq**
11. **contact-form**
12. **footer**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: bold clean sans with compact uppercase financial labels. Body character: high-legibility neutral sans. Hierarchy: oversized short promise, compact dates/fees, readable explanatory notes. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: warm paper; deep evergreen; soft mint. Contrast intent: dates and actions receive accent; tables and fee notes keep accessible text contrast. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: subdued accounting-desk still life rather than stock people. Crop guidance: wide hero with quiet image contrast, later small documentary details. Focal role: the calendar and fee structure carry primary visual weight; image is secondary. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: chronological filing calendar followed by transparent fixed-fee tiers and switching guidance. Early action: calendar and fee tiers appear before firm-history copy. Primary placement: consultation/fee route beside the opening proposition. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **chronological finance checklist**. stack each calendar row as date, obligation, applicability and status; stack fee tiers and keep inclusions/exclusions adjacent; number switching steps vertically; show jurisdiction next to each date; no horizontal overflow.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: small calendar filters that explain obligations for a selected client type. Reduced-motion contract: complete static table without motion dependency. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **deadline-status-rail** ([data-reference-signature=deadline-status-rail]): concise, fact-checked deadline context before primary navigation. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **filing-calendar** ([data-reference-signature=filing-calendar]): dated obligations with verified jurisdiction and applicability. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **fee-transparency** ([data-reference-signature=fee-transparency]): client-approved pricing or honest fee-setting explanation. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **switching-guide** ([data-reference-signature=switching-guide]): practical switching process based on actual firm operations. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
