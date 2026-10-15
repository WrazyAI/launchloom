# Visual hierarchy

For a substantial clinic or specialist practice, use an institutional editorial system that makes patient access easier instead of borrowing a university or hospital identity. A compact utility line may serve genuinely distinct audiences such as new patients and referring professionals, with the main navigation kept separate. Begin with one credible care image, a concise statement, and a real appointment or urgent contact route. Pair a small number of major practice updates as editorial stories. Use classic serif display, a clear sans-serif body, clean pale surfaces, and a deep blue structural color only if the client brand supports it.

# Page sequence

Move from audience utility and opening care access to two distinct practice stories, practical patient education, recent updates, authentic people or patient imagery, a useful subscription or resource route, and an organized footer. For a small independent practice, reduce this to the sections it truly needs; do not imitate an institutional site map. Specialist services should be grouped by real visitor intent, not dumped as a keyword cloud. Patient guidance, care access, community work, and fundraising are different content purposes and should never be conflated.

# Responsive translation

On desktop, the hero can be a wide documentary image with a subtle text field or a strong image-and-copy composition. Keep the main action legible and independent of photo contrast. On mobile, compress utility navigation and make care access the first deliberate action. Stack paired feature stories, convert update rails into readable lists, and group secondary footer links into semantic disclosures. Preserve photo subjects and avoid shrinking body copy to fit a dense desktop directory. Carousels remain manually controlled and optional.

# Signature elements

Use a compact audience utility system only where the client has genuinely different audiences, an editorial pair of care stories, and a separate education band linked to verified services. Each is a layout mechanic, not a mandate to invent pages. Choose photos from client-cleared assets or approved generated images; do not reuse clinicians, patients, equipment, or institutional marks from the reference. Make the action route obvious before any education or community material.

# Prohibited patterns

Do not reproduce the source institution name, crest, staff, patient imagery, awards, accreditation, research, funding, ratings, statistics, wording, logos, typography files, or exact palette. Do not invent specialties, board credentials, emergency level, capacity, charitable programs, or referral relationships. Avoid dense two-row navigation on a small screen, hiding appointments behind audience menus, and using medical education as personalized advice. Do not make an independent office appear to be a teaching hospital.

# Local SEO and conversion

Use the submitted practice name, confirmed service locations, and verified specialty terms in metadata, H1, service links, and local pages. A referral route exists only if the clinic confirms it. Explain what a new patient needs to do and where; do not imply a physical address from a broad service area. Keep the emergency phone and hours consistent with the source facts supplied by the client. Internal links should connect services, visit preparation, FAQs, and contact.

# Verification

Review desktop at 1536 by 864 and mobile at 390 by 844. Test audience routes, primary appointment links, phone links, navigation menus, and every education or story destination. Verify text contrast over any photograph, proper heading order, keyboard operation, and no horizontal overflow. Audit clinical credentials, specialty labels, metrics, and patient proof against explicit evidence; omit anything unsupported.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **Institutional animal hospital with public education and specialty pathways**; family: `veterinary-institutional-specialty-atlas`; subject fit: animal medical center, specialty veterinary hospital, veterinary emergency hospital, veterinary clinic, veterinary. Production eligibility is unchanged.
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

1. **audience utility navigation**
2. **clinical-team hero**
3. **two institutional features**
4. **public education band**
5. **latest updates**
6. **social image triptych**
7. **newsletter**
8. **institutional sitemap**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: classic editorial serif. Body character: precise institutional sans. Hierarchy: moderate title with strong section labels and compact utility copy. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: white; cool pale blue; deep institutional blue; charcoal. Contrast intent: information-dense navigation and education stay readable with clear hierarchy. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: documentary team and animal-care images paired with editorial feature cards. Crop guidance: wide opening crop followed by consistent landscape and square crops. Focal role: keep people and patients visible; preserve room for hero title. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: specialty and care pathways organized as an information atlas, not a sales card grid. Early action: a single direct action appears within or just below the hero. Primary placement: urgent contact or appointment according to the verified practice. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **compress utility navigation, then sequence image, action, feature stories, education, and news vertically**. keep urgent contact distinctly available when clinically applicable; stack paired editorial features without shrinking body copy; turn latest updates into an accessible vertical list; retain sitemap groups as compact accordions with expanded-state semantics.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: small news and social image carousel controls. Reduced-motion contract: show an ordered static row and keep all content in the document. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **audience-utility-navigation** ([data-reference-signature=audience-utility-navigation]): When the client serves genuinely distinct audiences, a compact utility system makes their routes clear without crowding the main navigation. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **editorial-care-features** ([data-reference-signature=editorial-care-features]): The first supporting chapter pairs a small number of image-led feature stories with explanatory text. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **education-band** ([data-reference-signature=education-band]): A distinct educational section provides useful visitor guidance linked to confirmed services. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
