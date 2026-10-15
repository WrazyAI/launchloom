# Reference implementation brief: trust-first local accountancy

## Scope and non-copy rule

Use the paired screenshots as a permission-attested visual reference for the trust-first hero, utility contact strip, service catalog, sector taxonomy, and process/proof rhythm. No source-owner grant was uploaded; the requester attested to retaining full-page screenshots and sending them to the pipeline model. Do not reproduce Alex & Co’s name, logo, office, ACCA statement, fees, staff, testimonials, copy, claims, images, or contact links. All client facts, registrations, service scope, local areas, prices, reviews, and contact details come only from sealed verified sources.

## Visual hierarchy

Open with a compact utility strip for verified phone/email, then a crisp white navigation bar. Set a wide darkened business-context image behind a large serif headline and short plain-language explanation. One colored action invites a conversation; a quieter second action leads to services. Immediately below, show no more than four concise proof points, and only if the client has evidence for each. Orange marks a decision rather than decorating every element.

## Page sequence

1. Utility contact route and concise practice navigation.
2. Photo-led practice promise with primary conversation and secondary service route.
3. Short verified trust strip.
4. Service catalog grouped by client need, with direct page paths.
5. Sector-fit area for only industries the practice serves.
6. What working together looks like, using the actual onboarding process.
7. A concise differentiation section with at most three evidence-backed points.
8. Genuine, permissioned testimonial or other verifiable proof.
9. Conversation/contact close with accurate location and coverage.

## Interaction and motion

Direct service/sector links are primary. A testimonial rail can be visitor-controlled but never auto-advances. Use one clear CTA style and a quieter secondary treatment. Avoid animated counters, fake chat availability, artificial ratings, and motion that makes financial information harder to read. Reduced motion keeps the complete page static.

## Responsive translation

At 390px, stack promise, actions, trust details, and service groups in that order. Use a text-safe image crop; do not shrink the hero to preserve desktop line breaks. Turn sector chips into a readable list and avoid tiny proof text. Keep contact routes reachable from compact navigation; check 320px for overflow.

## Signature elements

Preserve the dark photo-led serif opening, compact proof strip, categorized service catalog, sector-fit band, and practical process. Use independent client colors, logo, imagery, and type. Keep the visual tone human and accessible, not a financial dashboard.

## Prohibited patterns

No copied firm identity, local address, contact data, professional membership, fixed fee, staff headshot, testimonial, financial outcome, service promise, or source photo. Do not invent accreditations, savings, years, response times, customer counts, reviews, software affiliations, or tax results. Do not show unverified proof as a badge wall or stock people as client staff.

## Local SEO and conversion

Use verified city/service-area details in titles, service descriptions, contact details, and accurate LocalBusiness/AccountingService data. Create dedicated service pages only for real capabilities. Let researched local terms appear naturally in service copy and FAQs. Put one primary meeting/enquiry path beside the opening promise and connect it to the client's real booking/contact system.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **Alex & Co local practice trust-first accountancy**; family: `direct-alex-co-trust-first-practice`; subject fit: accounting, accountant, accountancy, bookkeeping, chartered-accountant. Production eligibility is unchanged.
- Open the paired full-page captures: desktop: `screenshots/desktop.png`, captured viewport 1440 x 900; mobile: `screenshots/mobile.png`, captured viewport 390 x 844. Read the opening at its captured viewport and then inspect the whole page. A full-page image's total height is not CSS vh.
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

1. **contact-utility**
2. **navigation**
3. **practice-promise-hero**
4. **trust-bites**
5. **service-catalog**
6. **sector-fit-band**
7. **work-process**
8. **why-this-practice**
9. **client-proof**
10. **contact-close**
11. **footer**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: classic high-contrast serif headline. Body character: clear modern sans. Hierarchy: large two-line practice promise, concise body, small proof labels, readable service text. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: deep navy; paper white; pale warm grey. Contrast intent: orange marks actions; body and proof remain legible over image and light surfaces. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: darkened office/document context in the opening, followed by consultation/process scenes. Crop guidance: wide hero background and medium rectangular editorial images. Focal role: the type and action remain primary while the image signals business context. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: categorized service groups with short descriptions, followed by a separate sector-fit taxonomy. Early action: show proof details before the full service taxonomy and process narrative. Primary placement: conversation CTA inside the opening promise. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **stacked trust-to-service flow**. stack promise, actions and trust details before catalog; use text-safe image cropping; stack service groups in reading order; avoid cramped chips and tiny testimonial text; keep contact routes reachable; no horizontal overflow.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: visitor-controlled testimonial rail or small transitions, never autoplay. Reduced-motion contract: static proof and service content. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **practice-trust-hero** ([data-reference-signature=practice-trust-hero]): plain-language practice promise over restrained business-context imagery. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **verified-proof-strip** ([data-reference-signature=verified-proof-strip]): up to four concise proof details with verified provenance. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **service-catalog** ([data-reference-signature=service-catalog]): distinct service categories with clear descriptions and direct paths. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **sector-fit-field** ([data-reference-signature=sector-fit-field]): sector routing limited to client-confirmed specialties. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
