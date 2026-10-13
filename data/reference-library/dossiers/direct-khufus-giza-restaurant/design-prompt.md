# Reference implementation brief: cinematic place-led dining

## Scope and non-copy rule

Use the official source captures only for visual mechanics: cinematic opening, image sequence, pacing, restrained navigation, and conversion placement. Do not copy the restaurant's name, logo, pyramid or site association, slogan, wording, menu, location, staff or founder identities, photography, award/ranking claims, or trade dress. The user's attestation permits internal capture and model visual-reference use, but these assets are not client-site assets. Use the client's own facts and images or separately cleared media. Avoid unverified claims about cuisine, heritage, people, setting, awards, or access.

## Visual hierarchy

Create an atmospheric, cinematic first scene with one short editorial headline, a minimal navigation layer, and a clear reservation or inquiry action. A broad landscape image and a carefully restrained palette should set the mood; keep all text over imagery readable with an intentional contrast treatment. Let subsequent chapters feel like distinct editorial moments instead of repeating the hero's layout. An image triptych can introduce the experience, an offset composition can hold real proof or craft detail, and a portrait or preparation image can provide a quieter change of pace. Balance larger quiet image fields with short useful copy. Use a high-contrast serif display for short titles and a legible sans for labels and practical information.

The reference relies on place, light, and sequence, not a dense grid of cards. Translate those mechanics to the client's real business: a restaurant might use a verified room, dish, or service moment; a boutique hotel might show an actual guest room and journey; a local hospitality business without distinctive scenery can use an editorial image essay with approved photography. Reserve any award/proof composition for verified facts only. Finish with a separate invitation scene and a dark, straightforward footer for contact and visit details.

## Page sequence

Use this sequence only when it serves the business: cinematic opening and primary action; place or experience triptych; one verified proof/craft chapter; concise point of view; photographic essay; verified people or service details; a change-of-light/atmosphere chapter; final reservation or inquiry scene; practical footer. A business without press, awards, public-facing staff, or a separate evening service should omit those pieces. Keep Services, FAQs, and Contact discoverable through appropriate navigation or section links. Do not fabricate an experience simply to maintain a reference sequence.

## Interaction and motion

The website's visual rhythm suggests scroll reveals and imagery changing by chapter. Implement at most one purposeful, measured scroll reveal or parallax if it materially helps the story. Use CSS or GSAP/ScrollTrigger with refresh and cleanup where required, but do not animate every heading or lock the scroll. Video backgrounds must have an authored still-image fallback, no audio, and a reduced-motion path. Galleries need visible previous/next controls, keyboard operation, and a static representation of the selected item. Keep reservation links and business details accessible even when motion is disabled.

## Responsive translation

At 1536 by 864, the first viewport should feel spare and cinematic with a short promise and reservation action. At 390 by 844, retain the mood but fully recompose for portrait: show a readable headline and direct action without asking visitors to rotate their device; stack triptych images; enlarge small labels and body copy; compress excessive blank intervals; and make image galleries touch-safe and understandable. Do not reproduce the source's very small mobile type or its orientation advisory. Verify no horizontal overflow and check the page in reduced-motion mode.

## Signature elements

Preserve a single atmospheric hero, a sequence of varied image scenes, one layered proof or craft composition, and a spacious closing invitation. Use deliberate negative space between major chapters, not blank stretches that make the page appear broken. A warm sand/stone field, deep text, and restrained metal accent can create a premium feel, but derive exact colors from the client brand. The desktop and mobile screenshots have different qualities: the desktop is the primary positive composition reference; the mobile capture is a cautionary reference and must be improved, not copied.

## Prohibited patterns

Never copy the source identity, words, photographs, logos, landmark setting, award/ranking data, people, credentials, reservation details, or menu. Do not claim the client has a landmark view, cultural lineage, award, chef, founder, hours, or availability without evidence. Do not reproduce mobile rotation gates, unreadable microcopy, major blank gaps, or swipe-only navigation. Avoid autoplay, scroll-jacking, a giant photo wall without service information, generic card grids, and unsupported luxury adjectives.

## Local SEO and conversion

Use the verified restaurant or lodging category, service area, address, phone, hours, menu, room or service details, access instructions, and booking path. Put the primary reservation or inquiry action near the opening promise and repeat it at relevant decision points. Add clear Services, FAQs, and Contact anchors, accurate title/meta data, canonical URL, and matching Restaurant/Hotel structured data only when appropriate. Keep visible location and operating facts aligned with structured data. Never add em dashes.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **Khufu's cinematic place-led dining story**; family: `direct-khufus-cinematic-place-led`; subject fit: fine-dining, restaurant, destination-restaurant, hospitality, bistro. Archive-only: this refinement does not authorize production selection.
- Open the paired full-page captures: desktop: `screenshots/desktop.png`, captured viewport 1536 x 864; mobile: `screenshots/mobile.png`, captured viewport 390 x 844. Read the opening at its captured viewport and then inspect the whole page. A full-page image's total height is not CSS vh.
- Use this dossier alone for its route, not an average of the other candidates. Verified client facts, sealed content, accessibility, client font/palette choices and host runtime rules constrain the adaptation. Preserve the assigned composition, section order and signatures; if evidence and prose disagree, identify the conflict rather than silently rewriting the curated contract.
- Separate observed design from proposed client treatment. Do not claim an exact font, hex value, spacing measurement, interaction or animation was observed unless retained evidence supports it. Static captures do not prove scroll, hover or click behavior.

### Opening layout contract

**desktop:** no normalized opening topology is recorded. Read the paired capture and the original hierarchy/mobile notes before drawing this viewport's wireframe. Do not infer a split hero from the absence of a label.

**mobile:** no normalized opening topology is recorded. Read the paired capture and the original hierarchy/mobile notes before drawing this viewport's wireframe. Do not infer a split hero from the absence of a label.

These are relationship diagrams, not pixel specifications. Resolve alignment, proportions, whitespace and focal crop from the paired captures and original Visual hierarchy. Desktop header plus complete hero must fit 1536 x 864 at normal zoom, even if the source was captured at a taller viewport. Mobile may be content-height driven.

### Page rhythm and content mapping

Keep these assigned chapters in order; the numbers below describe actual page sequence, not decorative labels to add to the site:

1. **cinematic-reservation-hero**
2. **place-led-triptych**
3. **recognition-or-proof-scene**
4. **restaurant-point-of-view**
5. **photographic-essay**
6. **verified-people-or-craft-chapter**
7. **day-to-evening-scene**
8. **centered-reservation-close**
9. **dark-practical-footer**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: refined high-contrast serif for short editorial statements. Body character: small neutral sans in the source, but generated work must increase practical copy to comfortably readable sizes. Hierarchy: large sparse chapter titles, concise uppercase labels, short supporting paragraphs; do not copy the source's tiny portrait-mobile type. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: warm desert sand; soft white; deep espresso; pale stone. Contrast intent: soft cinematic tone while keeping action, navigation, and practical details sharply legible. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: wide landscape opener, staggered triptych, offset recognition stack, monochrome kitchen/portrait details, and a closing image field. Crop guidance: mix of wide cinematic stills, portrait crops, small stacked photographs, and inset cards. Focal role: let place and light carry the emotional opening; use only approved client imagery or independently licensed atmosphere. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: restaurant services are woven into image-led editorial chapters; reservation is repeated at distinct decision points and the menu/visit paths live in practical links. Early action: reservation is the clearest first action; branch to a separate experience only when a real second service exists. Primary placement: reservation action within hero, repeated after proof and in the final invitation. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **portrait-first editorial stack that keeps the landscape mood but recomposes every scene into readable, ordered chapters**. retain a short readable headline and reservation action without an orientation gate; stack triptych and recognition imagery into intentional subject-led panels; eliminate excess blank intervals while preserving deliberate section breathing room; use comfortable body and label sizes instead of copying source microtype; make gallery state and navigation understandable without dragging or landscape rotation.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: cinematic scroll-paced reveals and image scene changes with user-controlled gallery navigation. Reduced-motion contract: replace video and scroll effects with still imagery and visible text; no horizontal lock or autoplay-dependent content. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **cinematic-place-hero** ([data-reference-signature=cinematic-place-hero]): one atmospheric place-led opening with short centered type and reservation action. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **editorial-triptych** ([data-reference-signature=editorial-triptych]): a controlled sequence of varied imagery rather than uniform cards. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **layered-proof-scene** ([data-reference-signature=layered-proof-scene]): offset proof or craft composition using only verified client material. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **final-invitation** ([data-reference-signature=final-invitation]): distinct spacious conversion scene before practical footer details. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
