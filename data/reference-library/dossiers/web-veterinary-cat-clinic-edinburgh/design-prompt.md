# Visual hierarchy

Build for a verified feline-focused or specialist animal practice without assuming every clinic is cat-only. Combine two compact navigation levels only if the practice needs separate patient actions and section links. Use a calm opening with enough negative space for a short promise; on mobile, a close pet image may lead if the text and action remain legible. A small set of high-priority patient actions should follow the opening. Use a classic serif display with practical sans-serif labels and a gentle clinical palette chosen for the client, not copied from the reference.

# Page sequence

Move from a distinct service promise to a small patient-action gateway, a brief care-principles sequence, authentic patient or process proof, an editorial explanation, urgent information if verified, and a compact resource/contact close. Each gateway action must correspond to an actual route such as registration, booking, or urgent-help guidance. A numbered sequence should represent a real order or meaningful rationale. For a general veterinary clinic, use species-neutral content; do not imply feline-only expertise. Keep advertisements and third-party retail secondary to care access.

# Responsive translation

Desktop may use a large negative-space field or a separate image chapter; do not leave a vast empty column because a source asset is unavailable. On mobile, stack the title, patient image, and main action, then provide large touch-safe route panels. Keep important urgent information distinct from standard appointment links. Testimonials require a static alternative and manual controls. Collapse utility navigation into an accessible menu and avoid two full desktop nav bars on mobile.

# Signature elements

Use three appropriately scoped patient actions, a short care-principles sequence, and a separate patient-story or verified-proof chapter. Select actions according to the business: book, register, call, read visit guidance, or learn about verified services. Do not use invented patient stories or imply the reference's clinical approach is practiced by the new clinic. If proof is absent, use a process illustration or preparation guide instead.

# Prohibited patterns

Do not copy The Cat Clinic name, logo, exact palette, text, feline images, reviews, contact details, local advertisement, credentials, awards, hours, or emergency arrangement. Never claim feline-only status or specialist qualifications without evidence. Avoid source-specific numbered claims, source testimonials, a blank oversize desktop hero, auto-advancing carousel, or a red warning strip that overstates urgency. Never make a routine clinic sound like an emergency hospital.

# Local SEO and conversion

Use confirmed species, service scope, practice location, and appointment details in page title, H1, internal links, and structured data. Emergency guidance should accurately identify the provider and hours. Link registration and booking to the real platform supplied by the client. A service area must not be represented as a physical clinic. Use FAQs to explain visit preparation, animal types seen, and how to contact the clinic, without inventing care advice.

# Verification

Check desktop opening at 1536 by 864 and mobile at 390 by 844. Confirm all three gateway actions reach working destinations, emergency information is factual, the menu is keyboard accessible, and no important action is hidden behind a carousel. Check hero text over the mobile image, minimum touch targets, contrast, reduced motion, and horizontal overflow. Remove every unsupported species, credential, review, award, or clinical promise.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **Feline-only clinic with three-action service gateway and compact care sequence**; family: `veterinary-feline-calm-clinic`; subject fit: feline veterinary clinic, cat-only veterinary practice, independent veterinary clinic, cat hospital, veterinary. Production eligibility is unchanged.
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

**mobile: media-overlay / copy-over-media**

```text
[ navigation ]
[ media field: copy + action over image ]
```

Keep copy inside the media field, not in a separate adjacent card. Choose a quiet crop or a local contrast plate/scrim; do not move copy outside the image to fix contrast.

These are relationship diagrams, not pixel specifications. Resolve alignment, proportions, whitespace and focal crop from the paired captures and original Visual hierarchy. Desktop header plus complete hero must fit 1536 x 864 at normal zoom, even if the source was captured at a taller viewport. Mobile may be content-height driven.

### Page rhythm and content mapping

Keep these assigned chapters in order; the numbers below describe actual page sequence, not decorative labels to add to the site:

1. **dual-tier patient navigation**
2. **feline-first hero**
3. **three patient actions**
4. **numbered care principles**
5. **client story chapter**
6. **editorial clinic explanation**
7. **urgent information band**
8. **resource feature and footer**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: quiet traditional serif. Body character: precise small sans. Hierarchy: compact display, strong section labels, restrained numbered micro-headings. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: deep blue; pale aqua; clean white; muted warm alert. Contrast intent: gentle healthcare palette with clear text, borders, and distinct action states. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: close feline subject image within a calm environment. Crop guidance: large mobile poster crop and separated desktop image chapter. Focal role: show the animal comfortably and reserve readable title space; never depict the source team as the new clinic. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: three primary visit actions followed by three short care principles. Early action: three action gateway follows directly after the hero. Primary placement: book or register based on practice status. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **use a photographic feline opening, then stack three large actions and the care rationale**. preserve touch-sized register and appointment controls; keep emergency hours and eligibility accurate and explicit; make testimonials accessible without auto-advance; do not force desktop negative space into an empty mobile panel.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: optional client-story carousel with explicit previous, next, and position controls. Reduced-motion contract: present story items statically or with direct manual controls. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **patient-action-gateway** ([data-reference-signature=patient-action-gateway]): Three clearly distinct patient actions appear near the beginning, selected to match the actual practice. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **care-principles-sequence** ([data-reference-signature=care-principles-sequence]): A short ordered sequence explains clinic-specific care principles only when that order is meaningful. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **pet-story-chapter** ([data-reference-signature=pet-story-chapter]): A separate, visually distinct patient-story or factual proof chapter follows the immediate service actions. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
