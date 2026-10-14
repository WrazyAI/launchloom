# Visual hierarchy

Use the paired screenshots and Reference DNA as evidence for the pacing of a serious professional-services homepage: compact navigation, a strong positioning statement, one contextual image, and an immediate way to find the right professional. Keep the client's own facts and brand separate from the source. The source's angled city crop and restrained line geometry can inform spatial framing, but its wordmark, exact red slashes, skyline, portraits, page copy, case stories, statistics, quotes, credential marks, and trade dress are not client assets. Use high-contrast typography; the captured desktop hero title is pale against white and that weakness must not be repeated.

# Page sequence

Translate the source's journey into a clear professional promise, a useful discovery or contact action, a concise index of current insights where the client has real content, a human story or practice explanation, verified evidence, and an organized contact close. A news index can help visitors understand the firm's current work, but never fabricate articles or legal results. Any legal practice area, biography, award, client quote, ranking, office, case outcome, and statistic must be provided or independently verified. Describe the process plainly and do not imply that a visitor will obtain a specific result by contacting the firm.

# Responsive translation

On desktop, let a broad contextual image balance a restrained copy field. If angled geometry is used, keep the image recognizable and let decorative lines stay behind text. At mobile widths, stack the image and promise deliberately, keep the contact action close to the opening, and convert article links into a simple vertical index with clear dates or categories. Preserve the distinction between news, firm explanation, proof, and contact. All controls must be touch sized, all text must remain high contrast, and the page must stay within the viewport width. Respect reduced motion and keep navigation usable without hover.

# Signature elements

Preserve the contrast between a visual opening, a linked information index, an editorial feature, and a clean closing region. Build those areas from client-owned assets and verified facts. Use an abstract city or local-context image only when it honestly represents the client's work and location; otherwise choose a neutral architectural or documentary image that does not imply an office or client relationship. Keep quotes and outcomes out unless supported. Use a dark footer only if it remains readable and carries confirmed contact details.

# Prohibited patterns

Do not reproduce the source's identity, wordmark, exact red graphic, skyline, portrait, headlines, memorial story, quotations, cases, settlement figures, rankings, awards, offices, or client relationships. Do not invent verdicts, testimonials, credentials, response times, legal specialisms, locations, or outcomes. Avoid low-contrast gray headlines on white, decorative geometry over copy, generic card grids, and a search field that pretends to find professionals when the client has no working directory. Keep the page useful without source material and ensure generated content contains no em dash.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **Robins Kaplan litigation firm homepage**; family: `direct-robins-kaplan-law`; subject fit: law firm, trial litigation, professional services, legal-services. Production eligibility is unchanged.
- Open the paired full-page captures: desktop: `screenshots/desktop.png`, captured viewport 1536 x 900; mobile: `screenshots/mobile.png`, captured viewport 390 x 844. Read the opening at its captured viewport and then inspect the whole page. A full-page image's total height is not CSS vh.
- Use this dossier alone for its route, not an average of the other candidates. Verified client facts, sealed content, accessibility, client font/palette choices and host runtime rules constrain the adaptation. Preserve the assigned composition, section order and signatures; if evidence and prose disagree, identify the conflict rather than silently rewriting the curated contract.
- Separate observed design from proposed client treatment. Do not claim an exact font, hex value, spacing measurement, interaction or animation was observed unless retained evidence supports it. Static captures do not prove scroll, hover or click behavior.

### Opening layout contract

**desktop: split-media / side-by-side-fields**

```text
[ navigation ]
[ copy + action | separate media field ]
```

Keep copy and the focal media region as distinct adjacent fields on desktop. Match their hierarchy and relative occupancy to the capture; do not default to equal-width columns, a boxed copy card or centered copy over the focal subject. The original observations clarify any background image extending beyond its focal region.

**mobile: editorial-stack / vertical-copy-media-stack**

```text
[ navigation ]
[ copy + action ]
[ distinct media chapter ]
```

Keep the vertical copy/media relationship and chapter boundaries. Do not collapse the stacked narrative into a conventional split hero.

These are relationship diagrams, not pixel specifications. Resolve alignment, proportions, whitespace and focal crop from the paired captures and original Visual hierarchy. Desktop header plus complete hero must fit 1536 x 864 at normal zoom, even if the source was captured at a taller viewport. Mobile may be content-height driven.

### Page rhythm and content mapping

Keep these assigned chapters in order; the numbers below describe actual page sequence, not decorative labels to add to the site:

1. **navigation**
2. **angled city and positioning hero**
3. **headline index**
4. **editorial firm story**
5. **client quote**
6. **large outcome statement**
7. **social, office, and credential footer**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: condensed editorial sans for short headings. Body character: neutral sans for firm description. Hierarchy: large opening statement, broad section titles, compact news metadata. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: white; pale blue-gray; charcoal. Contrast intent: clear dark text on light fields with one dark closing panel; improve the pale desktop hero title contrast. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: city and professional portrait within angled geometric frames. Crop guidance: wide urban opening followed by a contained portrait feature. Focal role: keep skyline detail and portrait subject inside the unmasked image area. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: news and insight index followed by proof-led feature chapters. Early action: news and story links follow directly after the opening. Primary placement: professional-search action in the hero. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **image-first editorial sequence with stacked discovery and story chapters**. put the city image before the positioning text; keep search and contact controls visible and touch sized; stack news items with clear date hierarchy; maintain readable feature copy after the portrait; avoid horizontal overflow.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: fine geometric linework and restrained image reveal. Reduced-motion contract: show complete static image masks and keep all news and story links available. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **angled-city-stage** ([data-reference-signature=angled-city-stage]): large city or context image framed by deliberate diagonal geometry. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **headline-index** ([data-reference-signature=headline-index]): compact linked insight index with clear hierarchy. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **editorial-feature** ([data-reference-signature=editorial-feature]): portrait or context-led story paired with a readable editorial column. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **professional-close** ([data-reference-signature=professional-close]): dark, organized closing area with verified contact and office information. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
