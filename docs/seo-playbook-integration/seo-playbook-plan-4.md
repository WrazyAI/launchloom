# Stage 4 of 4: Route verification and production handoff

Status: user approved; local implementation and final verification in progress. Shipping is not authorized. Depends on [Stage 3](seo-playbook-plan-3.md).

## Intended outcome

Verify every approved route against its page brief and record pass, fail, or not verified with evidence. Preserve existing gates while closing the gap between homepage visual quality and whole-site readiness.

Playbook mapping: Prompts 13–20, especially raw HTML, integration lifecycle, remnant sweeps, and destination verification. Estimate: 5–8 engineering hours for local checks and workflow integration, excluding approval, external review queues, and deployment.

## Implementation steps after approval

1. Extend the release gate to consume the Stage 2 route inventory. Check initial HTML for unique meaningful metadata, expected H1/body content, consistent canonicals/indexability, crawlable links, valid schema, and absence of client remnants or unauthorized placeholders. Include route-correct Open Graph URLs and approved absolute image URLs. Check schema type/property suitability and stable business identity without fabricating an address to satisfy a rich-result validator. Keep word count as a smoke check, not editorial sufficiency.
2. Add page-specific content checks from Stage 3: supported claim coverage, relevant questions and links, correct media, and local differentiation. Compare page-specific content after excluding shared shell text. Calibrate similarity diagnostics against useful shared business facts; do not make an unvalidated similarity score the sole promotion authority.
3. Extend browser verification to every approved route at desktop/mobile sizes and representative page types at compact desktop/tablet sizes. Exercise direct loads, refresh, navigation, back/forward, focus, disclosure, overflow, reduced motion, script failures, and console/network errors. Test invalid slugs and real host HTTP behavior separately.
4. Verify forms through rendering, initialization, synthetic test delivery, and failed-delivery behavior. Native forms and any future embeds get distinct lifecycle checks. Wire changed routes into existing CI and relevant existing TestSprite coverage; report unavailable checks as unverified and keep required failures blocking.
5. Produce a developer handoff with route inventory, fact gaps, content/media provenance, local/browser evidence, integration results, and readiness. Only after explicit shipping authorization, reconcile current main, rerun affected checks, publish the approved commit, and verify workflow/deployed SHA and destination routes.

## Evidence record

| Dimension | Required record |
| --- | --- |
| Identity | Route ID/path, tested commit, config/brief version, environment |
| Technical/content | Check result, expected artifact, actual observation, failure detail |
| Browser | Viewport, screenshot reference, interaction result, runtime errors |
| Conversion | Rendering, initialization, test submission, delivery result, destination |
| Readiness | Pass/fail/not verified, blocker owner, exact remaining dependency |

Distinguish local static builds, browser checks, mocked integrations, authorized provider tests, staging, and production. A local success or upload completion is not destination evidence. Retain artifacts privately and exclude tokens, private addresses, and client lead data from reports.

## Likely implementation seams

`scripts/seo-release-gate.mjs`, `scripts/verify-rendered-revision.mjs`, `scripts/run-creative-bakeoff.mjs`, current inner-page QA helpers, `SiteLayout.astro`, SEO routes, generate/revision/publish workflows, and existing developer review reports. Reuse current gates rather than add an independent approval authority.

## Verification and acceptance

- Negative fixtures detect duplicated metadata, absent raw-HTML content, wrong canonicals, public private-address leakage, broken internal links, thin city substitutions, stale business identifiers, missing assets, and invalid-route soft 404s.
- All approved routes have terminal local technical/content results and required browser evidence. Required failures or unverified checks block completion of that verification scope.
- Form tests use a mock or authorized test recipient. Production lead submissions, customer emails, and prospecting outreach are never implied by QA authorization.
- Run focused tests, affected Worker types/tests, Astro checks, production fixture builds, relevant existing TestSprite checks when authorized, and required code review. Broaden checks only for integration changes or unresolved failures.
- Release work remains pending until explicitly authorized. If authorized later, verify the approved production commit, public HTML, canonicals/sitemap, route HTTP status, and essential interactions on the deployed origin before marking production complete.

## Policy guardrails

Preserve the current reviewed Pages-origin policy; a custom-domain transition requires verified connection, origin regeneration, and its own release approval. Review pages must remain non-indexable while allowing crawlers to observe `noindex`: [Google noindex guidance](https://developers.google.com/search/docs/crawling-indexing/block-indexing).

Keep Astro prerendered HTML; request-time SSR is not required to adopt these checks: [Google JavaScript SEO guidance](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics). Schema should be appropriate and factual, not a promise of rich results or rankings. Do not weaken existing fidelity/diversity/content/promotion gates.

A2P widget preparation, prospecting automation, ongoing SEO campaigns, analytics dashboards, domain connection, and legal policy authoring are outside these four stages. Any later integration gets its own approved scope.

## Final handoff

Provide the implemented contracts, actual checks and artifacts, pending client/provider dependencies, migration instructions, and remaining release actions. Complete Nifty and append the task receipt only for the verified scope; never mark deferred release or implementation work complete merely because a plan or local report exists.
