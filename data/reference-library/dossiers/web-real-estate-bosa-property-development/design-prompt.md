# Visual hierarchy

Treat the site as a developer's project portfolio with several distinct property sectors, not as an agent's home search. Begin with a panoramic built-environment image, a short development statement, and a clear portfolio route. Let project browsing be organized by real property type or stage, then separate residential from commercial, industrial, retail, office, or hospitality work only when the client actually does those things. A corporate mission and operating model should explain how the work moves from planning into property delivery or management. Close with a real contact and location path. Use substantial architecture imagery as evidence of place, not as a substitute for project facts.

# Page sequence

Follow an institutional property narrative: short development thesis; portfolio filters; current or completed projects; distinct property sectors; development, leasing, or management capabilities; a concise company-purpose chapter; one human-scale built-place story; careers or partnerships if relevant; and a complete contact/footer. Keep the actual project inventory central. Clearly distinguish proposed, in-progress, available, and completed work based on confirmed status. An emerging property firm may replace a large portfolio with one or two documented projects and a transparent process. Never mimic another company's project count or scale.

# Responsive translation

On desktop, use a wide image with little overlay copy, a visible filter or project selector, and varied project image scales so the portfolio feels curated rather than repetitive. At phone width, collapse sector controls into an accessible selector and stack projects in one column with status and location visible. Project images must have safe crops, alt text, and a stable poster state when video is used. Keep the company thesis compact and contact controls reachable. Avoid a wide category ribbon that forces the page to scroll sideways.

# Signature elements

- `sector-project-switcher`: visitors can select a real asset sector, location, or project stage.
- `development-portfolio`: the main visual section presents actual property projects as distinct, useful entries.
- `purpose-and-operating-model`: a separate chapter explains the client's verified relationship between development and property operations.

One slow transition between architectural scenes may support the story, but project state and text must not depend on animation. Use real client photography or approved project renders, and preserve a static render fallback. Keep building images focused on the work and avoid obscuring typography with facades or texture.

# Prohibited patterns

Do not copy the source company name, logo, project names, renderings, locations, metrics, claims, plans, or property photography. Do not infer a project is completed or available because a related image looks finished. Do not invent units, development area, returns, sustainability targets, financing, occupancy, or awards. Do not represent a general contractor or investor as a developer unless verified. Avoid turning different property types into identical service cards or using a fake filter that cannot change content.

# Local SEO and conversion constraints

Anchor headings and structured data to the client's true development, leasing, management, or brokerage role. Use submitted locations and verified project details, with accurate page titles, canonical links, internal links, sitemap entries, and appropriate real-estate structured data. Each project page needs distinctive, current information rather than location-swapped filler. Put the proper inquiry route near the portfolio and again where a decision is made. Use only current status, pricing, availability, energy claims, credentials, contact details, and property data approved by the client. Keep the mobile page accessible and free from horizontal overflow.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **Bosa Properties: sector-switching development portfolio**; family: `real-estate-development-portfolio`; subject fit: real estate, real-estate, property development, residential development, commercial property. Production eligibility is unchanged.
- Open the paired full-page captures: desktop: `screenshots/desktop.png`, captured viewport 1440 x 1000; mobile: `screenshots/mobile.png`, captured viewport 390 x 844. Read the opening at its captured viewport and then inspect the whole page. A full-page image's total height is not CSS vh.
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

1. **developer manifesto**
2. **project portfolio filter**
3. **residential portfolio**
4. **commercial and industrial sectors**
5. **property operating model**
6. **built place story**
7. **career invitation**
8. **contact and locations**
9. **subsidiary links**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: architectural neo grotesk. Body character: neutral modern sans. Hierarchy: measured mission headline, clear sector headings, small project-state labels. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: white; cool gray; deep blue-gray. Contrast intent: corporate readability with image-first project moments and strong text contrast. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: built environment renders and finished places. Crop guidance: wide development hero followed by medium project images and sector thumbnails. Focal role: keep building form and public realm visible without overlay copy obscuring architecture. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: sector and project portfolio index. Early action: portfolio exploration control in the hero. Primary placement: explore the verified property portfolio. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **sector selector then vertically stacked project cards**. show sector choices before a long project inventory; make project names and current status readable; stack cards in a single column and avoid desktop-only hover filters; keep corporate contact and accessibility links easy to reach.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: slow project film transitions. Reduced-motion contract: poster image and accessible static portfolio filters. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **sector-project-switcher** ([data-reference-signature=sector-project-switcher]): Portfolio browsing distinguishes asset sectors or project stages before showing results. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **development-portfolio** ([data-reference-signature=development-portfolio]): The main content has a real project inventory with client-verified project status and context. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **purpose-and-operating-model** ([data-reference-signature=purpose-and-operating-model]): A separate company-purpose chapter explains the relationship between development and property operations. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
