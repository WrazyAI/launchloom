# Visual hierarchy

Translate the observed Dentologie home page into an original, fact-grounded dental-practice experience. The source uses a calm ivory field, a small restrained header, a centered two-line editorial promise, one concise location/service sentence, and two equally legible next-step actions before a large practice photograph. Let the first screen feel open and considered, not like a standard medical SaaS page. Keep the hero photograph distinct from the copy block, then use asymmetric image-and-copy pairings to move into a small set of recognizable services. Use typography with a refined display voice and a highly legible sans-serif for navigation, labels, and body copy. A gentle warm-neutral foundation can support one cool or fresh accent and one warm accent, but choose client-specific values rather than reproducing Dentologie's colors. The source identity, copy, logos, photos, people, insurance marks, reviews, service claims, and exact trade dress are not reusable.

# Page sequence

The observed rhythm is: quiet navigation; centered promise and paired book/call actions; large photo of the practice; concise practice philosophy beside a human-scale image; three primary service choices with image and short labels; a controlled testimonial moment; a distinct reassurance band; a neighborhood/location image strip; a second concise practice-story chapter; a compact secondary service index; useful patient questions; and a direct contact/footer close. Treat that order as a reference, not a mandatory template. For a new client, preserve the information jobs: clarify who the practice serves and where, present its verified services, reduce a real patient concern, explain the next step, answer common questions, and make contact simple. Keep Services, FAQs, and Contact directly navigable. Do not repeat the same reassurance sentence in the hero, philosophy, and footer.

Use service photography only when the client supplies approved images or the image-generation stage creates a relevant, locally stored asset. Keep the primary services as a small photo-led set with short, distinct labels; place less central offerings in a compact textual index rather than a second wall of cards. A testimonial carousel is optional and may contain only approved, attributable client reviews. If reviews are unavailable, replace the proof moment with a practical first-visit or process explanation. An insurance or financing band is included only when those facts are verified. Use an image strip for real locations only when a client has supplied the relevant locations and images; otherwise substitute a non-factual practice-detail or process chapter.

# Responsive translation

At a 1440 px desktop width, keep the masthead compact and let the opening statement, primary and secondary action, and first practice image read as one composed introduction. Preserve generous space around the typography, but make sure the image and the promise are both visible without requiring zoom. On mobile, retain the centered headline and direct actions, place the hero image immediately after them, and turn all image-and-copy pairs into a clear single-column sequence. Convert any service carousel into one visible item at a time with explicit, labeled controls and a touch-safe swipe alternative; never crop neighboring cards so far that their controls or meaning disappear. Allow insurance marks to wrap, turn the location strip into an intentional compact gallery, and keep FAQ disclosures at least 44 px tall. No element may create page-level horizontal overflow or cover a call, booking, or form control.

# Signature elements

Carry forward these transferable mechanics in a fresh visual identity: a short centered editorial opening followed by a large real-practice image; an asymmetric philosophy chapter with a human-scale photograph; a small number of photographic service choices rather than a uniform grid; one restrained testimonial or reassurance moment; and a distinct colored chapter that resets the page rhythm before practical questions and contact. Use at least two of these mechanics, including one image-led signature. Keep motion subordinate: a manually controlled review carousel or modest image reveal is enough. The page must remain complete if animation is disabled. The source's exact serif, colors, rounded card radii, wordmark, image subjects, slogans, review content, insurance marks, office imagery, and other identity cues must not be replicated.

# Prohibited patterns

Do not reproduce Dentologie's logo, source wording, staff or patient images, practice photography, reviews, rating counts, insurance-provider marks, location details, services, prices, hours, credentials, booking URLs, or overall trade dress. Do not use a cookie/privacy banner as a visual centerpiece. Do not repeat a statement under multiple headings, turn every service into an identical rounded card, or make the mobile page an endless stack of oversized cards. Never invent patient outcomes, reviews, ratings, credentials, providers, prices, insurance participation, appointment availability, locations, or response times. Use client-provided assets first, and keep every generated asset contextual and locally stored. Never present a stock or generated person as an actual client, clinician, or employee. Do not use an em dash in visitor-facing copy.

# Local content and verification

Write for one actual dental practice using its verified business name, services, service area, appointment route, and contact details. The opening should communicate the practice type and location when relevant, followed by one primary action and one useful secondary action. Build substantive service explanations from approved facts; FAQs should answer the client's actual patient questions and avoid medical diagnosis or treatment promises. Keep visible business details consistent with LocalBusiness structured data. Capture the candidate at 1536 x 864, 1366 x 768, and 390 x 844 before judging its opening fit. Verify the complete page at desktop and mobile for working appointment/call actions, accessible carousel and FAQ controls, readable contrast, loaded contextual images, no horizontal overflow, no obscured controls, and no unsupported medical or commercial claim.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **Dentologie: airy neighborhood studio with warm color and service photography**; family: `dentologie-modern-neighborhood-studio`; subject fit: dental, dental practice, family dentistry, cosmetic dentistry. Archive-only: this refinement does not authorize production selection.
- Open the paired full-page captures: desktop: `screenshots/desktop.png`, captured viewport 1440 x 900; mobile: `screenshots/mobile.png`, captured viewport 390 x 844. Read the opening at its captured viewport and then inspect the whole page. A full-page image's total height is not CSS vh.
- Use this dossier alone for its route, not an average of the other candidates. Verified client facts, sealed content, accessibility, client font/palette choices and host runtime rules constrain the adaptation. Preserve the assigned composition, section order and signatures; if evidence and prose disagree, identify the conflict rather than silently rewriting the curated contract.
- Separate observed design from proposed client treatment. Do not claim an exact font, hex value, spacing measurement, interaction or animation was observed unless retained evidence supports it. Static captures do not prove scroll, hover or click behavior.

### Opening layout contract

**desktop:** no normalized opening topology is recorded. Read the paired capture and the original hierarchy/mobile notes before drawing this viewport's wireframe. Do not infer a split hero from the absence of a label.

**mobile:** no normalized opening topology is recorded. Read the paired capture and the original hierarchy/mobile notes before drawing this viewport's wireframe. Do not infer a split hero from the absence of a label.

These are relationship diagrams, not pixel specifications. Resolve alignment, proportions, whitespace and focal crop from the paired captures and original Visual hierarchy. Desktop header plus complete hero must fit 1536 x 864 at normal zoom, even if the source was captured at a taller viewport. Mobile may be content-height driven.

### Page rhythm and content mapping

Keep these assigned chapters in order; the numbers below describe actual page sequence, not decorative labels to add to the site:

1. **quiet navigation and centered promise**
2. **practice-interior image**
3. **asymmetric practice-philosophy chapter**
4. **three photo-led primary services**
5. **patient proof or first-visit reassurance**
6. **distinct reassurance band**
7. **neighborhood/location image strip**
8. **secondary narrative chapter**
9. **compact secondary service index**
10. **patient FAQs**
11. **contact and footer close**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: high-contrast editorial serif with occasional italic emphasis. Body character: compact neutral humanist sans-serif. Hierarchy: short centered hero, quiet utility labels, comfortable paragraph measure, restrained chapter headings. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: warm ivory; soft neutral; fresh green-blue; muted terracotta. Contrast intent: quiet text on light fields with saturated chapter surfaces used sparingly for hierarchy. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: large real-practice interior image followed by human-scale and service-photo crops. Crop guidance: wide studio image, rounded medium image in paired chapters, compact service crops, panoramic location strip. Focal role: retain room architecture or the relevant service context while keeping overlaid copy on calm areas. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: a small photo-led primary service set followed by a compact secondary service index. Early action: both routes appear beside the opening promise, with appointment actions repeated after service decisions. Primary placement: book online. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **centered opening followed by single-column editorial chapters**. place the hero image directly after the opening controls; stack philosophy image and copy without overlap; make one service item visible per carousel state with labeled controls; wrap insurance or trust marks only when verified and supplied; keep location imagery compact and prevent page-level horizontal overflow.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: manual review carousel with restrained image/section reveals. Reduced-motion contract: render all content statically and retain direct carousel controls. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **centered-promise-practice-image** ([data-reference-signature=centered-promise-practice-image]): short centered editorial promise and two useful actions followed by one large practice image. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **photo-led-service-choices** ([data-reference-signature=photo-led-service-choices]): a small set of primary service choices using contextual photography. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **tonal-reassurance-band** ([data-reference-signature=tonal-reassurance-band]): one saturated surface chapter that resets the page rhythm before later decisions. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
