# Reference implementation brief: timetable-first strength gym

## Scope and non-copy rule

Use the paired screenshots as a licensed reference for decision order, timetable mechanics, typographic weight, contrast, and mobile recomposition. The source template is licensed CC BY 4.0; its license and required attribution are retained in this dossier. Create a new brand expression. Do not reproduce its name, logo, source copy, prices, class data, equipment list, membership terms, staff, reviews, or hero art. Treat any sample numbers in the screenshots as fictional. All business statements, SEO copy, local modifiers, prices, schedules, opening hours, policies, contact routes, and testimonials must resolve from sealed verified client tokens. If a fact is missing, omit it or describe how to ask, never invent it.

## Visual hierarchy

Open with a thin utility line for verified hours or a concise membership policy, followed by a compact wordmark and short navigation. The hero is a dark, atmospheric equipment scene with a large condensed, multi-line training promise on the left and the equipment silhouette or generated/client-owned image on the right. A dark gradient should protect the text. Keep the lead message short, then offer two actions: view/join membership and arrange a first visit. Use one vivid accent for primary actions and selected states, not as a general decoration.

Place the weekly class schedule directly after the hero. It is a primary buying decision, not a supporting feature. Give it a clear time hierarchy, day controls that work with keyboard and touch, and an honest empty/full state only if the client provides live capacity data. Avoid implying live availability when the schedule is static.

## Page sequence

1. Verified hours/policy utility rail and compact navigation.
2. Dark equipment-led hero with membership and first-visit routes.
3. Weekly classes or training schedule, only if current client data exists.
4. Membership comparison with full price, billing interval, cancellation terms, and exclusions supplied by the client.
5. Facility/equipment inventory, using exact names and quantities only when verified.
6. First-visit induction or onboarding explanation that reduces intimidation without promising a particular staff member or outcome.
7. Coaches or instructors only when client-approved biographies and images exist.
8. Member feedback only from authentic, permissioned testimonials.
9. Concise FAQs about joining, access, classes, and preparation.
10. A functional enquiry or membership action connected to the client's real service.

Each section should answer a new visitor question; do not repeat the same reassurance in every section.

## Interaction and motion

The signature mechanic is the weekly schedule: visitors can switch the visible day without losing context. Use a restrained underline, high-contrast tab, or compact segmented control. A membership selector may reveal details only if all choices remain accessible without interaction. Avoid autoplay, scroll hijacking, fake seat counters, fabricated live queue/availability, and decorative motion that hides schedule content. Under reduced motion, render all essential information in a stable state.

## Responsive translation

At 390px, preserve the order promise → actions → schedule → membership terms. The schedule must become a legible day-filtered list or a semantic stacked table; never compress seven desktop columns into unreadable slivers. Stack memberships, place price and cancellation terms together, and use a two-column equipment list only if every item remains easy to scan. Keep controls at usable touch size and check 320px for overflow.

## Signature elements

Preserve the hours/policy rail, equipment-led typographic hero, early schedule surface, transparent membership terms, and reassuring first-visit explanation. The gym should feel operational and specific, not like a generic fitness-fashion campaign. Make the schedule the structural anchor and give the onboarding section a warmer, calmer treatment to balance the dark technical surface.

## Prohibited patterns

Do not carry over the source brand, source hero illustration, copy, fake prices, schedules, class capacities, opening hours, coach names, equipment counts, testimonials, membership policies, cancellation terms, or results. Do not create fake member counts, transformations, certifications, nutrition claims, health outcomes, or live availability. Avoid generic rounded-card bento grids, a large stock-photo athlete as a supposed employee/customer, sticky chat widgets that obscure content, horizontal mobile timetables, and motion-dependent disclosure of core facts.

## Local SEO and conversion

Use the researched local service area naturally in the title, opening context, relevant class/facility descriptions, and FAQs only when supported by the client. Separate service categories such as strength coaching, group classes, open gym, or personal training only when the business actually offers them. Use one primary join/enquiry action and one low-commitment visit action near the opening. Add accurate LocalBusiness/Gym schema, NAP, hours, and location/service area from verified client data; never infer a street address from a service radius. Every CTA must use the actual booking, phone, or form integration.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **Spicer timetable-first strength gym**; family: `spicer-gym-timetable-first`; subject fit: fitness, gym, strength-training, fitness-studio, personal-training. Production eligibility is unchanged.
- Open the paired full-page captures: desktop: `screenshots/desktop.png`, captured viewport 1440 x 900; mobile: `screenshots/mobile.png`, captured viewport 390 x 844. Read the opening at its captured viewport and then inspect the whole page. A full-page image's total height is not CSS vh.
- Use this dossier alone for its route, not an average of the other candidates. Verified client facts, sealed content, accessibility, client font/palette choices and host runtime rules constrain the adaptation. Preserve the assigned composition, section order and signatures; if evidence and prose disagree, identify the conflict rather than silently rewriting the curated contract.
- Separate observed design from proposed client treatment. Do not claim an exact font, hex value, spacing measurement, interaction or animation was observed unless retained evidence supports it. Static captures do not prove scroll, hover or click behavior.

### Opening layout contract

**desktop: media-overlay / copy-over-media**

```text
[ navigation ]
[ media field: copy + action over image ]
```

Keep copy inside the media field, not in a separate adjacent card. Choose a quiet crop or a local contrast plate/scrim; do not move copy outside the image to fix contrast.

**mobile: media-overlay / copy-over-media**

```text
[ navigation ]
[ media field: copy + action over image ]
```

Keep copy inside the media field, not in a separate adjacent card. Choose a quiet crop or a local contrast plate/scrim; do not move copy outside the image to fix contrast.

These are relationship diagrams, not pixel specifications. Resolve alignment, proportions, whitespace and focal crop from the paired captures and original Visual hierarchy. Desktop header plus complete hero must fit 1536 x 864 at normal zoom, even if the source was captured at a taller viewport. Mobile may be content-height driven.

### Page rhythm and content mapping

Keep these assigned chapters in order; the numbers below describe actual page sequence, not decorative labels to add to the site:

1. **hours-utility**
2. **navigation**
3. **equipment-hero**
4. **weekly-class-grid**
5. **membership-tiers-and-terms**
6. **equipment-inventory**
7. **first-visit-induction**
8. **trainer-profiles**
9. **member-objections**
10. **faq**
11. **join-form**
12. **footer**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: bold condensed athletic grotesk. Body character: neutral legible sans. Hierarchy: short uppercase eyebrow, compressed multi-line hero, clear medium-size section titles, compact timetable labels. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: near-black; charcoal; slightly lifted graphite. Contrast intent: reserve bright green for selected schedule state, membership emphasis and actionable controls; maintain readable body contrast. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: dark atmospheric strength-equipment interior. Crop guidance: wide hero cover crop with a dark copy-safe gradient. Focal role: equipment silhouette and subtle green practical light remain visible to the right; source artwork is not reusable client imagery. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: weekly schedule first, followed by explicit membership tiers and a factual equipment inventory. Early action: show the timetable immediately after the opening scene, before longer facility narrative. Primary placement: membership or trial/join path in the hero. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **vertical training decision sequence**. keep opening message and join/visit actions before the schedule; convert the week grid into readable day-selectable sessions rather than shrinking columns; stack membership tiers with terms adjacent to prices; present equipment groups in a vertical inventory; preserve large touch targets and zero horizontal overflow.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: visitor-controlled day selection for a weekly schedule with small, reduced-motion-safe state changes. Reduced-motion contract: render the schedule and all membership details statically with visible selected states. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **gym-hours-rail** ([data-reference-signature=gym-hours-rail]): a narrow hours/policy rail above the brand navigation using only verified client facts. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **timetable-hero** ([data-reference-signature=timetable-hero]): dark equipment-led poster hero with a compact service promise and visible next steps. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **week-grid-schedule** ([data-reference-signature=week-grid-schedule]): class schedule is an early, legible decision surface. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **membership-terms** ([data-reference-signature=membership-terms]): membership choices show client-approved price and terms without hidden exclusions. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **first-visit-induction** ([data-reference-signature=first-visit-induction]): specific, fact-grounded explanation of what a new visitor can expect. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
