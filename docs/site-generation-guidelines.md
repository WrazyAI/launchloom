# Site generation guidelines

This is the normative creative and conversion standard for LaunchLoom client
sites. The implementation evidence and reference-site observations live in
`local-business-design-direction.md`.

Pipeline integration: truth, SEO, business facts, and structured content are
compiled through `scripts/generate-site-config.mjs`. New creative homepages are
authored by Luna as isolated JSX/CSS/motion candidates, rendered in the real
Astro shell, and promoted only after reference-fidelity and visual-quality
gates pass. Developer and client feedback still uses
`scripts/revision-engine.mjs` for factual copy, FAQs, services, and typed
conversion features, while visual/composition feedback on a creative candidate
is routed back through the selected candidate's Luna source-repair loop.
`scripts/sync-client-guidelines.mjs` ships this document and an agent entry
point into newly generated private repositories. Revision workflows refresh the
document while preserving existing client instructions. These Markdown files
stay outside deployed public assets. Visual review remains mandatory.

## Shared standard

Every site should make four things clear near the top of the page: who the
business helps, what it provides, where it operates when location matters, and
what the visitor should do next. Use one primary action and one useful
secondary action. Repeat actions after meaningful decision sections rather
than after every paragraph.

Write from verified client facts, then add useful decision support. Good copy
explains scope, suitability, process, preparation, quoting factors, and the
next step. It does not pad the brief with slogans or repeat one differentiator
through the hero, proof strip, and About section. Preserve submitted service
names, contact details, areas served, offers, and supplied assets.

Use proof only when its source is supplied or verified. Never fabricate
testimonials, review ratings, credentials, results, guarantees, prices,
response times, staff, or office locations. Describe an area as served unless
the intake confirms a physical office there.

Use client logos and photographs first. A fallback image must come from a
curated commercial-use pack whose recorded subject matches the business kind
and its placement. If no suitable asset exists, use deliberate brand art or a
graphic treatment. Do not use an attractive but unrelated photograph. Stock
people cannot be described as the business's team, patients, or customers.

When a client has a missing or partial image set, the contextual-asset stage may
keep up to three draft images globally across all inspiration routes through
the server-only FAL adapter. Existing matching assets are reused before any new
provider request, and each route keeps its own prompt and manifest provenance.
Client media always wins for its matching placement. Generated prompts may use the
verified business kind, services, service areas, SEO vocabulary, customer
questions, and the submitted visual direction, but must not include private
contact fields or invent a storefront, people, credentials, outcomes, or
readable text. Generated images are local WebP assets with a prompt hash and
provider provenance in the private review repository. The FAL provider URL must
never be emitted into the public site config or deployed HTML. If generation
times out, returns an invalid image, or is unavailable, retry once and retain a
reviewed stock or deliberate brand-art fallback. A missing FAL key must never
make an intake fail. Generated imagery is draft material and requires human
approval before production publication.

Use concise headings, readable contrast, stable spacing, descriptive links,
compact mobile actions, and accessible forms. Avoid stacked popups, overlapping
sticky controls, placeholder links, horizontal overflow, and text embedded in
images. Never use em dashes in generated or rendered content.

At desktop widths, size opening typography and vertical spacing against both
viewport width and height. The header and complete hero must fit within a
1536 by 864 viewport at 100% browser zoom. Do not rely on browser zoom to reveal
the opening copy, actions, or primary image. Mobile openings may remain
content-driven when their copy and image stack vertically.

Treat the opening as a hook, not an inventory. Keep the hero heading to roughly
4-10 memorable words, the hero body to one useful sentence, and service-card
descriptions to one distinct sentence. Put supporting detail on the service
page. Do not add decorative ordinal numbers to service or proof cards. Reserve
numbering for a sequence where the order communicates a real process.

## Conversion tools

New sites receive a guided qualifier, a scripted quick-answer assistant, and,
only when the client supplied a real offer, a restrained desktop exit offer.
These are typed configuration features rather than unrestricted scripts.
Qualification options must match the business kind, answers must persist while
moving backward and forward, and failed submissions must never be shown as
successful.

Quick answers may use only the site's verified FAQs, services, hours, offer,
and next-step language. Never describe the scripted assistant as a live person.
Exit offers appear at most once per browser session after meaningful
engagement. Suppress conversion overlays after a lead starts, on small screens,
and during developer or client review. Only one overlay may be open at a time.

## Care and consultation language

The `care-editorial` recipe is calm, reassuring, and personal. Use expressive
editorial headings, restrained color, generous space, authentic people or
practice imagery, and a consultation path that earns trust before asking for
details.

Frame services around the person's routines, concerns, and available support.
Explain how the first conversation works, what a family may want to prepare,
and how the team will determine an appropriate next step. Keep home care,
clinical wellness, and aesthetics language distinct. Never imply a diagnosis,
credential, treatment result, or care outcome that the client did not supply.

Typical sequence: opening promise, reassurance, care options, approach or team,
process, authentic proof, relevant imagery, family questions, consultation.

## Local trades language

The `local-trades` recipe is direct, practical, and easy to scan. Use strong
contrast, service photography, an obvious phone or quote action, and immediate
clarity about the problem solved and coverage area.

Organize services around recognizable problems and next steps. Explain what
the customer should observe or prepare, how coverage is confirmed, and what
happens after a request. Use safety language only where it is broadly valid and
avoid promises about arrival times, pricing, warranties, or availability that
the client did not provide.

Typical sequence: service opening, proof, problem-led services, process,
authentic customer proof, recent work, coverage, practical questions, quote.

## Local SEO pages

Create substantive service pages that answer a real customer question and link
to related services and the primary action. Create location pages only for
submitted service areas. Each location page must state coverage truthfully and
provide useful local context from verified facts. Do not multiply thin pages
by combining every service with every city or create interchangeable city-swap
copy.

Keep visible business details consistent with structured data. Review sites
must remain out of search indexing. Public sites need descriptive titles,
canonical URLs, internal links, a sitemap, and accurate LocalBusiness data
where the required facts exist.

When the submitted primary action is `Get directions`, add a dedicated map
section only if the verified intake contains a retained Place ID or a
street-level address. The primary action should move the visitor to that
section, and the section must include a separate Google Maps directions link.
Do not embed a map for a city, service area, remote business, or inferred
location. A map is location context, not evidence of a storefront.

## Initial generation and revisions

Initial generation keeps truth/configuration separate from visual authorship.
GLM owns verified business facts, SEO, FAQs, and visitor-facing copy. Luna
authors independent creative candidates against one authoritative Reference DNA
capsule per route. Each candidate renders inside the production Astro shell at
desktop, compact desktop, and mobile viewports. The rendered-reference judge,
technical checks, final visual-quality gate, and bounded repair loop decide
whether a candidate may become the selected `creative-candidate` renderer.
Failed creative authorship never falls back to stale legacy output.

The selected candidate's `Experience.jsx`, `styles.css`, and `motion.js`
are stored in the private client repository together with the candidate
evidence/Reference DNA needed for later refinement. Older legacy or
experience-pack sites remain supported for their existing bounded revision
path, but new creative sites must not be converted back to those renderers just
to satisfy a revision.

Treat reference prompts as design evidence, not application architecture.
LaunchLoom keeps Astro, shared SEO rendering, shared forms, provenance, review
controls, and verification. It does not reproduce reference brands, exact
copy, proprietary fonts, hotlinked media, unsupported statistics, or customer
logos. Avoid splash screens that delay useful content, autoplay media without
a fallback, excessive motion, and effects that obscure text or actions.

Revisions preserve approved content and composition outside the feedback. A
request such as adding testimonials, showing the brand name, or changing the
palette must map to a supported operation and a rendered acceptance check. If
the request cannot be fulfilled safely by the operation set, flag it for manual
attention instead of pretending it was completed.

For a selected creative candidate, the revision path is hybrid. Structured
content and shell-level conversion changes remain typed configuration
operations. Requests that affect composition, hierarchy, palette presentation,
brand treatment, social-proof presentation, imagery treatment, navigation,
motion, responsive behavior, or explicit UI features are sent to Luna against
the currently selected candidate source. The candidate is rerendered through
the normal reference and visual gates, then a separate human-revision gate
checks the exact triggering reviewer request against the new screenshots. A
revision is not complete merely because the page remains attractive; the
specific request must be visibly satisfied or the bounded repair loop continues.

Human delivery order is invariant:

1. Every initial generated preview goes to the developer first.
2. Developer feedback may repeat through the revision loop until the developer
   approves the exact reviewed SHA.
3. Only developer approval can publish and create the client review link.
4. Client feedback creates an internal client-revision branch and revised
   preview, but that preview returns to the developer first.
5. The client receives the revised production site only after the developer
   approves that client-requested revision.
6. Every revision email sent back to the developer includes the feedback text
   that triggered that refinement loop plus its revision outcome.
7. While a revision is active or failed and unresolved, approval remains
   blocked.

Plan every submitted feedback item independently, including mixed batches.
Deterministic proof, brand, palette, and layout operations do not suppress
model planning for a copy request in the same item. Record each item as
fulfilled, creative, partial, or manual. `creative` means the structured
planner intentionally deferred a visual request to the authored source-repair
lane; it is accepted only after `creativeSourceRepairVerified.pass` is written
by the rendered human-feedback gate. A partial or manual item blocks preview
deployment and the completion email.

Supported structural revisions may enable or disable optional sections,
reorder existing sections without changing their stable IDs, select an
allowlisted section variant, or choose bounded spacing and typography
treatments. Apply these operations only when layout or section feedback asks
for them. A minor copy, color, or brand request must not opt a legacy site into
a new page recipe. Explicit requested colors take precedence over a generic
preset palette, with readable action text selected for the resulting brand
color.

Revision acceptance checks both the built HTML and a real browser render at
desktop and mobile widths. The requested section, order, variant, treatment,
copy, and colors must be visible; calls and fragment links must work; primary
actions must retain readable contrast; and the page must not overflow
horizontally. Keep the resulting screenshots with the workflow evidence.

Every initial preview and every developer or client revision must also pass the
GLM visual quality gate before deployment. Give the gate only a redacted public
content manifest plus the desktop and mobile screenshots. It may automatically
apply at most three allowlisted layout operations: section variant, section
order, and density or typography treatment. It must never rewrite facts, copy,
contact details, assets, reviews, claims, or credentials.

For new authored creative candidates, rendered repair is author-owned rather
than a shared layout rewrite. The repair loop must rebuild and capture desktop,
compact-desktop, and mobile evidence after every Luna repair. A source change is
not accepted until the rendered reference judge and final visual quality gate
pass again. Production promotion remains blocked unless the bakeoff report is
`promotionReady`; v2 screenshot diversity remains authoritative and structural
fingerprints remain diagnostic only.

When the gate applies a safe correction, rebuild once and run both deterministic
render verification and the GLM verification pass again. An unresolved critical
content-integrity, industry-fit, imagery, conversion, overflow, or obstruction
defect blocks deployment and email delivery. Preserve both gate reports and the
screenshots as workflow evidence. Major aesthetic recommendations that cannot be
safely expressed by the operation set remain visible in the report rather than
being converted into invented content or unrestricted code changes.

## Acceptance checklist

- The opening identifies the service, intended customer, location when
  relevant, and next action.
- Sections add distinct information and do not repeat the same claims.
- Images match the business and have source/license metadata.
- Claims, proof, locations, and contact details have valid provenance.
- Calls and forms work, and mobile controls do not obscure content.
- Service and location pages are useful enough to stand on their own.
- Requested revision artifacts are visible in the rendered page.
- Desktop and mobile layouts are readable and free of horizontal overflow.
- Rendered output contains no em dashes or placeholder values.
