# Reference implementation brief: Asymmetric architecture fieldnotes

## Scope and non-copy rule

Use the paired direct-site captures to study the architecture practice's visual mechanics: a vivid opening canvas, compact editorial statement, deliberately uneven project wall, mixed notes and project imagery, a short service index, and a quiet closing enquiry. The website itself is the cleared visual source; the gallery listing is only a discovery citation. Do not reproduce Mesh's brand, orange, wordmark, photographs, projects, labels, copy, drawings, testimonials, awards or exact content. The prompt translates composition, not its trade dress. Every client-specific fact and SEO phrase must come from verified research and sealed content tokens.

## Visual hierarchy

Open with a single strong color field and a large graphic mark or abstract sequence that establishes the practice before the content begins. Treat any number or symbol as decorative identity only; never make it look like a project count, award, metric, or claim. Move into warm paper with a concise architectural statement and a small action. Let projects arrive in a loose, editorial grid: alternate image sizes, short project facts, process notes, and intentional negative space rather than repeating a uniform tile. On wide desktop, allow one slim secondary rail for research/process imagery only if it does not compete with the main reading column. Keep the main contrast between the graphic opening and tactile portfolio field.

## Page sequence

1. Small, functional wordmark/navigation with Projects, Services, FAQs, and Contact; preserve the required local-business conversion path.
2. A full-viewport brand-color introduction with abstract signal graphic and no invented counter.
3. A brief statement that says who the practice serves, what it designs, and where it works, followed by a modest project/studio link.
4. An asymmetric portfolio sequence mixing approved project photography, short captions, small diagrams, and concise observations.
5. A few verified practice principles or process notes set as editorial text, not benefit-card copy.
6. A service list with clear, factual names; use direct rows or type-led labels.
7. Verified geographic/service coverage and concise FAQs that address project fit, preparation, process, and the next step.
8. A dark or otherwise distinctly surfaced contact close with one useful enquiry route, business contact details and footer navigation.

## Responsive translation

At 390px, scale the opening mark and keep its graphic recognizable without letting it push the actual service promise below an unreasonable scroll. Stack the asymmetric project layout in an intentional rhythm, preserving alternating image/text balance through size and whitespace rather than side-by-side desktop columns. Remove any secondary rail from the reading flow or interleave its notes between projects. Make labels and controls touch-safe. Services and FAQs stay readable in the page, and the contact close remains a proper action rather than a tiny footer link. Test 390px and 320px for overflow and clipped type.

## Signature elements

- A graphic full-screen color/signal opening before the editorial statement.
- Project sequence with intentionally varied image scales and alternating evidence/annotation.
- One narrow research/process rail or its mobile in-flow equivalent.
- Service list expressed as typography and rules, not a bento/card grid.
- Dark, decisive enquiry close that resolves the otherwise airy portfolio.

## Prohibited patterns

- Copying the Mesh name, giant numeric artwork, signature orange, source images, project labels or copy.
- Turning a graphic opening marker into a false statistic, portfolio count, ranking or award.
- Claiming work, clients, planning approval, project outcomes, qualifications or awards without verified evidence.
- Replacing the intentionally varied sequence with a symmetric split hero or repeated rounded cards.
- Hiding service scope, area served, FAQs or contact details behind motion or hover-only interactions.
- Making the secondary rail sticky if it compromises reading, mobile, reduced motion, or keyboard access.

## Local SEO and conversion

Use the actual business specialty and service area in the opening statement and page metadata. Explain services using the client-provided scope and the questions surfaced by keyword research; do not add a city list in place of useful local detail. Portfolio locations are not offices. Keep NAP and LocalBusiness data aligned with verified contact information. A primary project consultation/enquiry should be clear near the opening and repeated after the portfolio decision point. Include concise FAQs and a functional contact route; avoid fabricated social proof or keyword stuffing.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **Mesh asymmetrical architecture fieldnotes**; family: `lapa-mesh-architects-editorial`; subject fit: architecture, architectural-design, interior-design, residential-architecture, design-studio. Production eligibility is unchanged.
- Open the paired full-page captures: desktop: `screenshots/desktop.png`, captured viewport 1440 x 1000; mobile: `screenshots/mobile.png`, captured viewport 390 x 844. Read the opening at its captured viewport and then inspect the whole page. A full-page image's total height is not CSS vh.
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

**mobile: image-led-stage / media-leads-copy**

```text
[ navigation ]
[ dominant media stage ]
[ supporting promise + action ]
```

Let the media lead the opening. Keep supporting copy subordinate and maintain the source's visual pause before the next chapter; do not substitute equal-weight text/image columns.

These are relationship diagrams, not pixel specifications. Resolve alignment, proportions, whitespace and focal crop from the paired captures and original Visual hierarchy. Desktop header plus complete hero must fit 1536 x 864 at normal zoom, even if the source was captured at a taller viewport. Mobile may be content-height driven.

### Page rhythm and content mapping

Keep these assigned chapters in order; the numbers below describe actual page sequence, not decorative labels to add to the site:

1. **graphic-opening**
2. **practice-statement**
3. **project-collage**
4. **annotation-rail**
5. **featured-project**
6. **service-index**
7. **coverage**
8. **faq**
9. **contact-close**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: bold expressive grotesk with compact editorial serif accents. Body character: neutral humanist sans. Hierarchy: large graphic brand mark, concise practice statement, small project captions and fine service labels. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: signal orange; warm cream; charcoal. Contrast intent: graphic opening contrast transitions to readable warm editorial project chapters. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: loose project collage interleaved with annotations and line drawings. Crop guidance: mixed tall and wide crops with varied image scale. Focal role: architectural space and material detail, never inferred client proof. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: type-led service index following an irregular portfolio sequence. Early action: small consultation action directly after the practice statement. Primary placement: project enquiry in the opening statement and dark closing panel. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **stacked asymmetric project journal**. scale the graphic opening without presenting it as a metric; interleave side-rail notes between project entries; preserve alternation between image and short text; keep service and contact routes visible; no horizontal overflow.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: subtle reveal of project notes and image groupings. Reduced-motion contract: all project and service content visible in static order. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **graphic-opening-field** ([data-reference-signature=graphic-opening-field]): strong graphic field before the concise local practice statement. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **asymmetric-project-wall** ([data-reference-signature=asymmetric-project-wall]): varied project imagery and short factual annotations. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **practice-annotation-rail** ([data-reference-signature=practice-annotation-rail]): secondary research or process notes, responsive to mobile flow. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **type-service-index** ([data-reference-signature=type-service-index]): services expressed as a compact typographic index. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
