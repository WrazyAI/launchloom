# Site generation guidelines

This is the normative creative and conversion standard for LaunchLoom client
sites. The implementation evidence and reference-site observations live in
`local-business-design-direction.md`.

Pipeline integration: initial generation and quality refinement apply these
rules in `scripts/generate-site-config.mjs`. Both developer and client feedback
use `scripts/revision-engine.mjs`, which receives the current approved recipe
and business context. `scripts/sync-client-guidelines.mjs` ships this document
and an agent entry point into newly generated private repositories. Revision
workflows refresh the document while preserving existing client instructions.
These Markdown files stay outside deployed public assets. Prompt rules guide
the model; typed normalization, supported revision operations, and build checks
remain responsible for enforcement. Visual review is still required.

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

Use concise headings, readable contrast, stable spacing, descriptive links,
compact mobile actions, and accessible forms. Avoid stacked popups, overlapping
sticky controls, placeholder links, horizontal overflow, and text embedded in
images. Never use em dashes in generated or rendered content.

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

## Initial generation and revisions

Initial generation selects one recipe and keeps its section order, typography,
palette, imagery, and conversion path coherent. The model writes within the
typed site configuration; it does not generate unrestricted application code.

Revisions preserve approved content and composition outside the feedback. A
request such as adding testimonials, showing the brand name, or changing the
palette must map to a supported operation and a rendered acceptance check. If
the request cannot be fulfilled safely by the operation set, flag it for manual
attention instead of pretending it was completed.

Plan every submitted feedback item independently, including mixed batches.
Deterministic proof, brand, palette, and layout operations do not suppress
model planning for a copy request in the same item. Record each item as
fulfilled, partial, or manual. A partial or manual item blocks preview
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
