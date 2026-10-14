# Visual hierarchy

Use the supplied direct-site screenshots and Reference DNA as visual evidence for composition and rhythm only. Do not reproduce the source practice's name, wordmark, exact copy, colors, portraits, photography, team members, testimonials, fonts, service details, or trade dress. Build a distinct, trust-led neighborhood dental experience with a compact factual opening, elegant practice identity, and editorial type hierarchy. In the source, a concise service/location statement sits apart from a very large serif identity; a portrait image balances the wordmark and the navigation is a delicate horizontal section rail rather than a conventional header card. Translate that into a new client's brand: keep a readable headline, short intro, and one clear book/contact action at the top. Use warm, calm surfaces with a single strong accent and small mono or utility labels. Preserve enough contrast and large type for quick scanning.

# Page sequence

The reference sequence moves from practice identity to a concise about statement, alternating photographic and text chapters, a small team introduction, an accordion-like service index, a featured family or pediatric service, testimonial/photo pairings, and a deep green closing footer with contact details and a repeated identity mark. For a generated client site, select only sections that match verified client facts: Hero, Services, FAQs, Contact, plus one or two helpful trust/process sections when evidence exists. Keep copy short. Use service-specific descriptions and direct answer-first FAQ content rather than generic claims. Place the primary CTA near the opening and at service decision points. A full-page desktop render should preserve the dramatic typographic identity and section changes; a mobile page should turn desktop paired sections into a deliberate single-column story without losing the closing CTA. The reference page is a real dental practice, but this prompt must not copy or imply its actual location, services, providers, testimonials, pricing, operating details, or health claims.

# Responsive translation

At 1440 px, retain the large typographic wordmark, the image-as-chapter rhythm, the thin in-page nav rail, and a spacious but controlled page width. Pair image and copy with careful alternation, not an identical two-column grid in every section. Keep service disclosures as large, ruled touch targets with concise supporting text. On 390 px, stack each chapter in a clear reading order, reduce display scale before cropping faces, retain comfortable side padding, and make the full nav and booking links thumb-friendly. Use image crops that preserve context and faces, avoid tiny body copy, and keep every section visible in a full-page capture. Ensure FAQ disclosures operate by keyboard, nav anchors land below any fixed rail, and reduced motion still exposes all content. Do not allow page-level horizontal overflow.

# Signature elements

Preserve these design mechanics: an oversized practice wordmark with an editorial serif voice; a slim in-page navigation strip that appears between identity and content; warm pale sections punctuated by deeper colored fields; alternating room/team/clinical photography and compact copy; services presented as a simple expanding index; and a recognizable final identity/contact close. Use a meaningful, verified local dental headline, not the reference's exact phrase. Do not re-use source photographs or upload source-image files from the captured page. Prefer client assets; otherwise generate route-specific images from the supplied business brief. A featured pediatric or specialty service is optional and must reflect the actual client. Use no stock or generated people as actual staff or patients.

# Prohibited patterns

Do not rebuild the screenshot one-to-one, reproduce its name/logo/fonts/photography/team/reviews, use the exact source wording, or invent local addresses, appointment hours, staff, credentials, ratings, dental pricing, claims, guarantees, insurance acceptance, or treatment outcomes. Avoid generic service card grids, long why-us essays, fake clinical authority, anonymous patient quotes, and decorative buttons with no action. Do not overstuff SEO phrases or place small text over busy imagery. Never use an em dash in rendered copy. External source screenshots are reference-only; they do not replace a client's own verified facts or permission-cleared imagery.

# Content and SEO constraints

Bind the actual practice name, city/service-area wording, main service, booking route, contact information, treatment list, and FAQ answers to verified intake/research tokens. Use a unique title and meta description, one H1, semantic H2s for Services, FAQs, and Contact, descriptive alt text, and visible NAP only where supplied. Keep service and location phrases natural and specific. Do not turn the source's actual provider facts into the generated client's content. Production structured data and canonical URLs remain owned by the client-site shell.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **One Manor Place: botanical editorial dental practice**; family: `attested-omp-dental-editorial`; subject fit: dental clinic, neighborhood dentist, dental. Production eligibility is unchanged.
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

1. **hero identity**
2. **practice statement**
3. **about with interior image**
4. **team introduction**
5. **services index**
6. **featured specialty**
7. **testimonial photo chapters**
8. **contact close**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: high-contrast editorial serif. Body character: compact humanist/mono-influenced text. Hierarchy: large wordmark, restrained utility labels, short paragraphs. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: warm cream; pale yellow; deep botanical green. Contrast intent: soft atmosphere with readable dark text and confident closing contrast. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: large portrait plus alternating practice/people photography. Crop guidance: desktop wide room crops and vertical portrait crops on mobile. Focal role: faces and clinic context remain primary. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: ruled expandable list paired with short scope copy. Early action: visible in initial identity band and nav rail. Primary placement: booking link in hero/navigation. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **single-column editorial chapters**. stack portrait and wordmark without overlap; keep service disclosures wide and touchable; retain a direct booking path; keep display type readable; avoid page-level horizontal overflow.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: scroll reveals, a small team carousel, and native disclosure controls. Reduced-motion contract: show all content in normal flow and retain direct carousel controls. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **editorial-wordmark** ([data-reference-signature=editorial-wordmark]): large serif identity balanced with one photographic portrait. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **section-rail** ([data-reference-signature=section-rail]): thin in-page navigation rail after the hero identity. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **ruled-services** ([data-reference-signature=ruled-services]): expandable ruled treatment list instead of service cards. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **deep-contact-close** ([data-reference-signature=deep-contact-close]): distinct dark footer/identity close with contact information. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
