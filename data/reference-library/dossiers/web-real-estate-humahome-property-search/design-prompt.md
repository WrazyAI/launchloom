# Visual hierarchy

Create a warm, editorial home-search experience focused on the buyer's fit and process. A rust-toned segmented nav sits above a full-width interior photograph. Place an oversized, contrast-rich serif promise in a quiet area of the image, add one short supporting sentence, and give the visitor a direct search or consultation action. The page should then explain how a buyer's brief becomes a useful property selection through a small numbered process, a story about decision criteria, and an example of how a personalized property report could look. Use an accent-color band as a visual breath before returning to useful proof and a simple contact close. Keep listing imagery secondary to the buyer journey.

# Page sequence

Preserve the observed sequence of: property-led buyer hero; concise explanation of how the client searches or advises; a short buyer process; a section about matching preferences or criteria; a strong visual statement between chapters; a sample selection or property report artifact; practical questions or market information; and a final next step. If the client only offers brokerage or management, reframe the journey around that verified process rather than claiming a buyer's-agent service. Keep every step distinct and useful. The sample report must be clearly illustrative unless it contains client-approved live property data. Provide seller, tenant, landlord, or buyer branches only when they match actual services.

# Responsive translation

At desktop size, allow the oversized headline to sit over calm architecture imagery, with generous but controlled line breaks. Use asymmetrical image placement in later chapters and one contrasting full-width statement band. At 390 px, reduce the type fluidly, stack the process steps, simplify image overlaps, and show the sample property artifact at readable scale. Keep buttons at comfortable touch size and do not make the horizontal red band the only way to reach a CTA. Preserve a reduced-motion static sequence and test the complete mobile page for clipping and overflow.

# Signature elements

- `buyer-fit-hero`: one concise buyer-matching promise over a large, relevant home scene.
- `guided-search-process`: a short step sequence explains how the client moves from intake to a useful property decision.
- `personalized-property-preview`: a report, email, or selection artifact demonstrates the next stage using only verified client content or an explicit sample label.

One gentle scroll transition may connect the process and its example artifact. Do not make timing, selection, or content depend on a scroll animation. Keep the action and labels in HTML, not baked into a screenshot. Use locally relevant client-provided property imagery where possible, otherwise create an original image that does not imply ownership of a real listing.

# Prohibited patterns

Do not copy source identity, text, photography, interface screenshots, Spanish market details, prices, guarantees, selection frequency, service timing, or claims. Do not promise access to every listing source or a particular response time without client evidence. Never invent local expertise, buyer results, fees, property selection, review quotes, agent credentials, or advisory scope. Avoid a generic luxury broker template, a listing-card wall, a fake inbox notification, or oversized type that forces the opening below the first viewport. Do not use inaccessible color-only status markers.

# Local SEO and conversion constraints

Use the client's verified business type, services, service areas, contact methods, customer language, and SEO research. A buyer's agent, listing broker, apartment manager, developer, and investor need different search terms and decision support. Put the primary action near the hero and repeat it only after the process or property evidence. Make each service or location page answer a real question with unique, factual local context. Use accurate titles, headings, canonical URLs, internal links, and real-estate schema where required facts exist. Never state unverified price, inventory, timing, outcome, coverage, physical office, or licensing. Keep forms accessible and privacy-aware.

<!-- launchloom:design-guidance:start -->

## Agent implementation brief

This refinement translates the existing dossier and manifest into an implementation checklist, guided by Anthropic's frontend-design skill retained at `docs/design-guidance/anthropic/frontend-design/SKILL.md`. It is not a new screenshot measurement or a change to curation. Original observations above remain evidence; the guidance below describes how to use them.

### Reference reading and priority

- Assigned reference: **HumaHome: guided buyer matching and personalized property selection**; family: `real-estate-guided-buyer-search`; subject fit: real estate, real-estate, property buying service, buyer's agent, residential property search. Production eligibility is unchanged.
- Open the paired full-page captures: desktop: `screenshots/desktop.png`, captured viewport 1440 x 1000; mobile: `screenshots/mobile.png`, captured viewport 390 x 844. Read the opening at its captured viewport and then inspect the whole page. A full-page image's total height is not CSS vh.
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

1. **home search hero**
2. **market scan explanation**
3. **buyer step sequence**
4. **fit criteria story**
5. **market perspective band**
6. **sample personalized selection**
7. **service timing promise**
8. **contact footer**

For each chapter, put in the design contract its content purpose, actual copy/media arrangement, surface transition, alignment, spacing relative to neighboring chapters, and required client token. Use the capture to distinguish full-bleed stages, inset editorial rows, ruled lists, image gateways and real cards. Do not apply one card wrapper or one identical padding/shadow/radius to every chapter. Map services to `#services`, questions to `#faqs`, and the next step to `#contact` when authoring a production candidate; keep real service-detail links. Source reviews, people, portfolios and metrics are not client facts: use verified content in their assigned role, or flag a required chapter lacking truthful content for review. Never fabricate proof just to fill the sequence.

### Type, surfaces and image roles

- Display character: editorial contrast serif. Body character: quiet modern sans. Hierarchy: very large fluid opening, medium process headings, small practical labels. Translate these roles to the host's local font catalog and honor client-selected heading/body families. Specify a responsive scale, line-height and intentional wrapping; keep body lines under about 80 characters. Do not copy source font files or fetch remote fonts.
- Source surface cues: muted sage; warm ivory; terracotta; soft white. Contrast intent: subtle residential color with decisive CTA contrast and readable image overlays. Propose 4-6 named client-compatible color tokens with hex values in the contract, labeled as implementation choices, not measured source colors. Bind them to the host's accessible per-surface palette roles rather than overriding client brand variables.
- Media role: warm lived in architecture interiors with offset crops. Crop guidance: wide hero room, small regional/property inserts, and layered family-home photography. Focal role: use the space and lived experience as context while leaving the heading area quiet. Map opening/secondary/detail placements to the available client image tokens. Preserve role, focal point and mobile crop without using reference screenshots as site assets. If the right media is absent, use an allowed contextual asset or deliberate graphic treatment, and flag any signature that cannot be met; never imply stock people or spaces belong to the client.
- Service presentation: guided buyer intake and matching process. Early action: guided buyer intake action inside hero. Primary placement: start a guided property search. Name the actual client next step; repeat it at decision points, not mechanically after every chapter.

### Mobile and interaction translation

Recorded mobile strategy: **buyer promise then compact matching steps and sample selection**. reduce headline size without clipping its serif contrast; turn process steps into a vertical list; stack image and copy chapters while preserving selective offsets; keep the inquiry route visible before the footer.

Record separately what stacks, reorders, changes crop, wraps, becomes a menu or becomes a touch control. Do not just shrink desktop. Keep the primary action, visible focus, labels and form controls usable without hover or motion; no horizontal overflow or competing sticky overlays. Recorded interaction opportunity: scroll linked matching sequence. Reduced-motion contract: render all process steps and selection artifacts in a static order. Implement only the justified documented interaction, with equivalent static content. Do not add repeated fade-up entrances, autoplay or section pinning to compensate for an unclear layout.

### Visible signature acceptance

- **buyer-fit-hero** ([data-reference-signature=buyer-fit-hero]): One concise buyer-matching promise appears over a large, contextual home scene. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **guided-search-process** ([data-reference-signature=guided-search-process]): The service is explained as a brief buyer journey rather than a feature-card grid. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.
- **personalized-property-preview** ([data-reference-signature=personalized-property-preview]): A sample selection or property brief is shown as a designed artifact using only client-approved facts. Render this relationship using client content; annotate its section in the contract and verify it in desktop and mobile screenshots. A marker on an empty, hidden, or unrelated element does not satisfy it.

### Plan, build and critique

Before code, use the existing contract stage to state the client's audience and primary task, choose the token system, draw desktop/mobile wireframes, map chapters to content, and name one memorable reference-led element. Check against this family's composition and prohibited patterns; revise any choice that could belong to an unrelated generic page. Source-required cream/serif, dark accents, uppercase navigation, cards or rules are legitimate when they serve this specific reference, not automatic reasons to redesign it.

Build from the revised contract. Then inspect rendered desktop, compact desktop and mobile, including menu/form/disclosure states. Compare actual geometry, section rhythm, image roles and every signature with the paired references, not just DOM markers. Verify contrast, working calls/links/forms, keyboard focus, reduced motion, truthful content and no em dashes in rendered copy. Remove decoration that does not serve the brief. Report any unmet signature or unavailable evidence; do not claim rendered fidelity from a successful build alone.

<!-- launchloom:design-guidance:end -->
