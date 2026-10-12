# Reference implementation brief: Portfolio-led landscaping with a season wheel

## Scope and non-copy rule

Use the paired, locally rendered captures as visual evidence for composition, information order, seasonal service exploration and estimate presentation. The source template is licensed under Creative Commons Attribution 4.0 and the source credit must remain attached to this dossier. Translate its design mechanics into the actual client's visual identity; do not reproduce the Stonefield Landscape demo name, logo, copy, locations, phone number, project names, prices, guarantees, reviews, metrics, coverage claims or image art. The demo's only raster image is identified by the source README as AI-generated placeholder art. Its remaining project illustrations are inline SVG and CSS. Do not present any of those fictional details as client facts.

Use only verified intake, research and client-provided content tokens for service names, geography, seasonal timing, rates, availability, estimate rules, warranties, customer proof and contact details. Keep the SEO layer substantive but factual. A service area is not a business address, a price calculator is not a binding quote unless the client says so, and illustrative project images are not proof of completed work.

## Visual hierarchy

Lead with finished work and project imagery, not a generic list of services. Establish a quiet wordmark and direct contact/estimate route in a compact top bar. Build an editorial hero with a large serif promise and a restrained botanical accent, over a muted landscape field. Preserve the reference's layered project-mosaic idea: let several illustrated or client-approved landscape scenes form the hero's visual texture, with a pale wash behind text and enough quiet space for the headline to read. Keep the opening breathable and fit the promise, one useful sentence and primary estimate action inside the initial desktop view.

Use an off-white and pale-sage base, dark evergreen copy, and one bright natural accent for action or active state. Typography should contrast an expressive editorial serif with a highly readable sans. Use compact uppercase labels and careful metadata rather than oversized decorative numerals. The visual character should feel botanical and considered, not rustic clip-art and not a generic cream-and-green card kit.

## Page sequence

1. Compact navigation with only useful section links and a clear call route.
2. Project-led hero with the primary estimate request and secondary portfolio path.
3. A filterable project index. Each project can show service type and scope only when verified; avoid unsupported square footage, schedules, client names or before/after claims.
4. A seasonal planning interaction that changes useful advice by season, but only when business-specific timing is verified. Without timing research, make it a four-season overview with no claims about exact windows.
5. A maintenance-plan comparison with a shared list of inclusions. Do not invent tiers, rates, visit counts, contracts or materials.
6. A property estimate tool, if the business supplies a defensible formula. If not, use the same composition for a request-preparation checklist and label it clearly rather than displaying a fabricated price.
7. A concise service-area ledger, populated only from confirmed areas served.
8. Project evidence or verified testimonials, with provenance attached to every claim.
9. Practical FAQs and a clear contact close. Preserve useful answers in the page rather than hiding all detail in accordions.

## Responsive translation

At 390px, retain the wordmark and phone route, then stack the hero promise before its project imagery. The mosaic should become a deliberate one-column or staggered sequence, not a tiny desktop collage. Let project filters wrap into compact controls. Make the season selector thumb-friendly and keep the selected season's explanation visible. Transform the desktop plan matrix into labeled mobile rows or grouped comparisons with each plan name repeated; never rely on a sideways table to communicate inclusions. Place the estimate result immediately beside or below its form, keep every control reachable, and verify at 390px and 320px with no page-level horizontal overflow.

## Signature elements

- Work-led hero with restrained landscape mosaic or client-approved project image composition.
- Filterable project index with concise, fact-backed project labels.
- Four-part season selector that changes practical guidance without hiding the full fallback content.
- Maintenance comparison matrix that names inclusions clearly.
- Property-size or scope estimate interaction only when its calculation is verified.
- A factual route/coverage ledger that distinguishes service areas from office locations.

Give each signature element a different composition. Do not turn the page into a wall of identical rounded cards. Favor thin rules, broad image fields, clear white space and repeated green marks as a system rather than repeating decorative landscape illustrations everywhere.

## Prohibited patterns

- Reusing Stonefield Landscape, Spicer Designs' logo, the source headline, source wording or its demo imagery as a client's own brand.
- Copying the source's fabricated phone, staff/customer names, ratings, properties, price values, dates, coverage list, guarantees or performance metrics.
- Calling the AI-generated hero art a real client property or completed project.
- Inventing landscaping qualifications, plant warranties, service windows, route capacity or seasonal dates.
- Treating the lot-size slider as a quote when no verified price formula exists.
- Drawing a map or implying a staffed local office from a service-area list alone.
- Using a stock person or generated person as the company's employee or customer.
- Hiding all service scope or FAQ answers behind interactions, autoplaying scenery, or adding scroll-lock effects that interrupt the estimate path.

## Local SEO and conversion

Use the actual primary service, verified service area and customer language from the research brief in the hero, service descriptions, project labels and FAQs. Organize terms around real intent such as landscape design, garden maintenance, planting, hardscape, irrigation or lawn care only if the client offers those services. Avoid substituting dozens of city names into one page. Put one primary estimate/consultation action near the opening promise and repeat it after the plan or estimate decision. Form fields should request only what is needed to prepare a useful follow-up. The demo's forms do not submit to a service; connect only to the client's approved lead endpoint.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **Landscaping portfolio with seasonal planning wheel**; family: `spicer-landscaping-season-wheel`; subject fit: landscaping, garden-design, lawn-care, property-maintenance, local-trades, home-services. Production eligibility is unchanged.
- Open the paired full-page captures: desktop: `screenshots/desktop.png`, captured viewport 1440 x 1000; mobile: `screenshots/mobile.png`, captured viewport 390 x 844. Read the opening at its captured viewport and then inspect the whole page. A full-page image's total height is not CSS vh.
- Use this dossier alone for its route, not an average of the other candidates. Verified client facts, sealed content, accessibility, client font/palette choices and host runtime rules constrain the adaptation. Preserve the assigned composition, section order and signatures; if evidence and prose disagree, identify the conflict rather than silently rewriting the curated contract.
- Separate observed design from proposed client treatment. Do not claim an exact font, hex value, spacing measurement, interaction or animation was observed unless retained evidence supports it. Static captures do not prove scroll, hover or click behavior.

### Opening layout contract

**desktop: modular-image-field / coordinated-image-windows**

```text
[ navigation ]
[ promise + coordinated media windows ]
```

Treat the image windows as one coordinated composition with distinct crops and spatial hierarchy, not as an interchangeable card grid.

**mobile: modular-image-field / coordinated-image-windows**

```text
[ navigation ]
[ promise + coordinated media windows ]
```

Treat the image windows as one coordinated composition with distinct crops and spatial hierarchy, not as an interchangeable card grid.

These are relationship diagrams, not pixel specifications. Resolve alignment, proportions, whitespace and focal crop from the paired captures and original Visual hierarchy. Desktop header plus complete hero must fit 1536 x 864 at normal zoom, even if the source was captured at a taller viewport. Mobile may be content-height driven. The existing topology is medium-confidence: inspect the documented hybrid composition before applying the label rigidly.

### Page rhythm and content mapping

Keep these assigned chapters in order; the numbers below describe actual page sequence, not decorative labels to add to the site:

1. **navigation**
2. **portfolio-hero**
3. **project-filter-and-grid**
4. **season-planning-wheel**
5. **maintenance-plan-comparison**
6. **lot-size-estimator**
7. **route-coverage-ledger**
8. **project-proof**
9. **questions**
10. **attribution-footer**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: expressive editorial serif with italic botanical accent. Body character: neutral sans serif. Hierarchy: large fluid hero headline, restrained uppercase section labels, compact but readable project metadata. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: warm off-white; pale sage; muted leaf green. Contrast intent: calm natural contrast with dark green actions and sufficiently dark body text. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: soft AI-generated landscape atmosphere paired with hand-drawn inline-SVG project mosaics. Crop guidance: wide hero image with a text-safe wash; project diagrams use consistent landscape cards. Focal role: quiet landscape color and planting geometry, never an identifiable client property or person. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: portfolio first, then seasonal job selector, then a maintenance comparison matrix. Early action: before service details, immediately after the promise. Primary placement: estimate request in the opening and beside the estimator. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **stacked editorial portfolio and practical service flow**. keep hero promise and estimate action before the project tiles; collapse the mosaic into a readable single-column project rhythm; wrap or scroll filter controls without page-level horizontal overflow; convert the plan matrix into labeled mobile rows; keep the estimate total visible beside or directly below its form.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: category filtering, season selection, and progressive estimate updates. Reduced-motion contract: keep the entire project set, season text, pricing rows and estimate explanation visible without transitions. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **landscape-portfolio-opening** ([data-reference-signature=landscape-portfolio-opening]): project imagery or an approved landscape visual leads the page rather than a service-card grid. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **season-planning-wheel** ([data-reference-signature=season-planning-wheel]): seasonal work selector whose copy and timing come from verified business inputs. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **maintenance-comparison** ([data-reference-signature=maintenance-comparison]): plan comparison with a shared feature column and explicit inclusions. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **property-estimator** ([data-reference-signature=property-estimator]): bounded estimate tool using verified service rates and visitor-supplied property size. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **route-coverage-ledger** ([data-reference-signature=route-coverage-ledger]): clear coverage list derived from verified service areas, not inferred offices. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
