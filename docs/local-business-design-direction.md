# LaunchLoom local-business design direction

Research date: 2026-09-07. This document records the reference review and the design rules implemented in the client-site template.

## Inspection scope

Read both reference homepages, plus Skylift Fremont and Dublin pages. Inspected browser screenshots of both homepages and Fremont at 1440px and captured 390px screenshots. Visually reviewed both homepage mobile captures. No form submissions, analytics access, ranking assessment, complete accessibility audit, or measured performance audit. Screenshot captures are temporary files in /tmp with versailles, skylift, and skylift-fremont prefixes. Playwright browser installed locally for inspection.

## Reference observations

- [Versailles](https://versailleshealthwellness.com/): dark photographic hero, cream header, gold accents, serif display type (Cormorant Garamond) and Inter body text. A specific offer, consultation and phone actions, qualification questions, service packages, practitioner information, supplied photographs/results, FAQs and visit information create a coherent consultation journey. These are observed website claims, not independently verified business facts. Mobile sticky actions and chat occupy substantial bottom-screen space.
- [Skylift homepage](https://skyliftgaragedoorservice.com/): white navigation, bold Chivo/Public Sans typography, blue actions, photographic repair hero, phone emphasis, benefit strip, service categories, project gallery and testimonials. Homepage title is the bare domain in the inspected browser. One phone-labelled anchor resolves to #. Do not assume claims about customers, credentials or availability are independently established.
- [Fremont](https://skyliftgaragedoorservice.com/fremont/) and [Dublin](https://skyliftgaragedoorservice.com/dublin-ca/): symptom-led headline, service breakdown, process and locality sections are useful structural ideas. Much of the language is duplicated with locality substitutions. Both claim the business is based in that city; the footer identifies Fremont. Verify actual branches before making such statements. Fremont's captured dark text over its blue hero appears difficult to read; no numerical contrast measurement performed.

## Recommended design system

Keep Astro. Establish two genuinely distinct page recipes sharing dependable components:

1. Care and consultation: editorial hierarchy, restrained palette, real people/practice imagery, services, authentic trust, process, relevant questions and consultation action. Adapt home care separately from aesthetics; do not reuse treatment language for caregiver services.
2. Local trades: bold readable hierarchy, service/problem and coverage immediately apparent, real work imagery, prominent phone action, short quote form, service breakdown, proof and practical next steps.

Start with about twelve section families: header, hero, trust strip, services, about/team, results/gallery, reviews, process, offer, FAQ, coverage/visit, contact. Provide a few purposeful variants rather than arbitrary combinations. Each configured section needs a stable ID, type, variant and typed content. Full-page recipes set coherent ordering, spacing and typography.

Use real business assets first. Classify fallback assets by specific service and subject, not merely wellness or trades. Never imply stock people are actual employees or customers. Required proof must come from supplied or verified sources.

For conversions, put one primary action and one secondary action near the opening promise, then repeat actions at useful decision points. Make all call and form actions functional, and keep sticky controls compact. Avoid excessive chat, popups and overlapping banners. Build reviewable content that explains service scope, customer suitability, the process, known pricing or quoting factors, and practical concerns. Do not invent prices, timelines, guarantees, qualifications or reviews.

## SEO architecture and primary-source guidance

Use a conversion homepage plus substantive core service pages, about/contact information and a coverage overview. Add location pages selectively where actual local information supports them. Do not automatically multiply every service by every city.

- Google flags substantially similar location pages that funnel visitors as possible [doorway abuse](https://developers.google.com/search/docs/essentials/spam-policies#doorway-abuse). Shared layouts are fine; each page should provide useful business-specific information and truthful coverage statements.
- Google describes local ranking in terms of [relevance, distance and prominence](https://support.google.com/business/answer/7091?hl=en). Website design cannot guarantee local/map placement. Maintain accurate business profile details alongside website facts.
- [Helpful-content guidance](https://developers.google.com/search/docs/fundamentals/creating-helpful-content) supports original substance and expertise, with particular care around health/safety. Expand useful content, not arbitrary word counts.
- Add accurate [LocalBusiness structured data](https://developers.google.com/search/docs/appearance/structured-data/local-business), descriptive titles, canonical URLs, sitemap, indexable public pages, internal links and matching visible business details. Keep review environments out of search indexing.
- On-site reviews support customer decisions, but [self-serving business reviews](https://developers.google.com/search/blog/2019/09/making-review-rich-results-more-helpful) do not qualify the business for Google's review stars, including third-party review widgets.
- Keep FAQs useful without promising rich results: Google's [FAQ eligibility](https://developers.google.com/search/blog/2023/08/howto-faq-changes) is restricted.
- Follow [page experience guidance](https://developers.google.com/search/docs/appearance/page-experience): fast loading, stable mobile layouts, secure pages and restrained overlays. Performance does not guarantee rankings.

## Implemented template direction

The client-site template now provides two complete fictional demonstrations: a home-care business with a homepage and detailed care pages, and a garage-door business with a homepage, detailed service pages, and carefully worded location pages. `npm run build:design-demos` builds both into separate output roots for desktop and mobile review.

New sites receive a controlled page recipe with stable section IDs and variants. The generator selects a care, local-trades, or general editorial recipe from verified intake facts, requests richer decision-support copy, keeps client service and location names authoritative, and records source and license details for the specific home-care and garage-door stock packs. Client images still take precedence.

Legacy revisions continue to synchronize only the files required by the approved revision operation. They do not opt an existing client site into the new recipe layout.

Quality acceptance: distinctive business-appropriate design; useful non-repeated copy; contextual imagery; verified claims; visible requested sections; functional calls/forms; readable contrast; stable mobile controls; no em dashes; and no unrelated visual regression during revision. These are proposed gates, not claims of completed implementation.
