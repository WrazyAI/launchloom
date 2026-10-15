# Visual hierarchy

Design a property and investment narrative that opens as a quiet architectural film, with very little interface layered over it. Set a brief visual thesis over the image and keep the wordmark and utility navigation small. The next light, clay-toned surface should introduce the verified property or investment role in two readable columns, then use a single wide property or landscape image as a breath between statement and expertise. The expertise area should feel like a small set of image-led editorial chapters with generous white space, not a dense services grid. Close with a clear invitation and a darker, restrained footer. Keep essential text and interaction independent of video.

# Page sequence

The transferable sequence is: atmospheric property image and promise; compact property or investment introduction; one large contextual image; a concise overview of the client's real areas of expertise; distinct capability chapters; a project or development story if verified; a focused contact invitation with one real next step; and an expanded but organized footer. Choose sections that explain the client's actual role. A broker, investor, developer, property manager, and architect have different responsibilities; do not blend them merely because the reference does. Replace any unsubstantiated investment claim with neutral process information or omit it. Do not imply the client designed, owns, manages, or guarantees a property without verification.

# Responsive translation

On desktop, start with a full-bleed landscape image and place large type in a quiet, high-contrast region. The introduction may use two columns with a broad image beneath, while the expertise chapters can scroll horizontally only if their controls remain obvious. At mobile width, preserve the top image and short headline as a poster, stack the thesis columns, and turn expertise into an accessible vertical sequence. Keep imagery large enough to show architectural detail without pushing the contact route far below unrelated copy. Supply reduced-motion stills and verify both screenshot heights and horizontal widths.

# Signature elements

- `architecture-film-opening`: one full-width landscape or built-space moment introduces the property context.
- `integrated-expertise-chapters`: capabilities are explained in distinct image-and-copy chapters with a sense of editorial pacing.
- `estate-investment-contact-close`: a clear inquiry follows the expertise narrative rather than appearing as a floating generic banner.

A single gentle crossfade or restrained scroll transition may connect property scenes. It must never hide copy, stall first paint, or create a dependency on sound. Use client-provided media first; otherwise use a newly generated, content-token-bound image or a static graphic treatment. The purpose is an architectural point of view, not a replica of the source's exact film, landscape, or color arrangement.

# Prohibited patterns

Do not copy the source's wordmark, images, properties, project locations, staff, colors, phrases, claim language, investment metrics, or trade dress. Never guarantee returns or imply a particular increase in value. Do not reuse source seals, legal marks, or decorative certification language. Avoid text over visually busy footage, forced autoplay with no poster, repeated empty capability cards, or generic luxury terminology unsupported by the client. Do not present a service area as the client's physical office.

# Local SEO and conversion constraints

All copy must come from sealed business facts and client-grounded SEO research: actual services, confirmed market areas, property types, investment or management scope, customer questions, contact method, and verified assets. Use a concise, keyword-natural title and heading hierarchy, a canonical URL, accurate internal links, appropriate LocalBusiness or real-estate structured data, and only useful service or location pages. Each page should answer a decision question and point to the next real step. Keep one primary CTA and one supporting route in the opening. Do not manufacture property inventory, claims, financial outcomes, testimonials, licensing, prices, staff, or development status.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **LUV Estate: architecture-led property and investment story**; family: `real-estate-integrated-investment`; subject fit: real estate, real-estate, property investment, property development, luxury real estate. Production eligibility is unchanged.
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

1. **cinematic estate film**
2. **property investment thesis**
3. **image led expertise chapter**
4. **vision statement**
5. **integrated development process**
6. **investor value chapter**
7. **architecture quality chapter**
8. **contact invitation**
9. **expanded group footer**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: geometric modern sans with restrained editorial contrast. Body character: clean small sans. Hierarchy: large two-line opening, small chapter labels, comfortable body measure. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: soft clay; warm ivory; near black. Contrast intent: warm low-saturation scenes with controlled high-contrast text and buttons. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: slow architectural film and project stills. Crop guidance: full-bleed landscape opening, wide aerial property view, then image-led capability moments. Focal role: hold the landscape, architecture, and spatial detail as the visual subject. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: image led expertise chapters. Early action: contact invitation after expertise story. Primary placement: contact the real estate or investment team. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **cinematic stacked image and expertise story**. replace sideways expertise movement with a vertical or touch-safe sequence; use a poster rather than requiring video playback; stack the closing contact text and client-provided image; keep body text and controls readable over warm surfaces.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: slow architectural film crossfade. Reduced-motion contract: use an approved still and preserve every capability and contact link. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **architecture-film-opening** ([data-reference-signature=architecture-film-opening]): Atmospheric architecture or landscape introduces the promise before details. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **integrated-expertise-chapters** ([data-reference-signature=integrated-expertise-chapters]): Capabilities are expressed as image-and-narrative chapters, not an identical tile grid. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **estate-investment-contact-close** ([data-reference-signature=estate-investment-contact-close]): A compact closing inquiry follows a small set of distinct proof or expertise chapters. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
