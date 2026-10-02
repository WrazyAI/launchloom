# Stage 2 of 4: Approved route inventory and page admission

Status: proposed, awaiting user approval. Depends on [Stage 1](seo-playbook-plan-1.md). Next: [Stage 3](seo-playbook-plan-3.md).

## Intended outcome

Compile one explicit route inventory from confirmed facts and the existing SEO page map. Use it to drive page creation, navigation, internal links, sitemap output, canonical expectations, and verification. Serving a city and approving a standalone city page must remain separate decisions.

Playbook mapping: Prompts 3, 6, 8, 10, 11, and 16. Estimate: 3–5 engineering hours, including migration tests and local rendering.

## Current foundation

Main already carries `seoPageMap` and preserves an empty v2 location selection. The location template now renders `site.locations` directly; the old coverage fallback observed in the earlier checkout is no longer present there. Keep and test this behavior. Service routes, sitemap output, and release checks still assemble route expectations in separate places; evaluate consolidation rather than assume the page map already owns all route behavior.

Authored inner-page support exists. Existing blog routes render when articles exist; retain approved article routes without creating initial filler articles. This stage establishes routing and content ownership, without replacing those hosts.

## Proposed route record

| Field group | Required meaning |
| --- | --- |
| Identity | Stable route ID, page type, normalized path, configuration/content source |
| Purpose | Visitor question, search-intent cluster, related service/location, admission reason |
| Approval | Proposed, approved, deferred, or explicitly omitted; evidence references |
| Discovery | Navigation placement, internal-link relationships, sitemap inclusion, indexability |
| Delivery | Canonical origin/path, required acceptance checks, optional legacy redirect mapping |

Record approval separately from generated/rendered/verified status. A proposed route must never become public merely because it appears in a research suggestion.

## Implementation steps after approval

1. Extend the existing page-map contract or compile a route inventory from it. Establish one owner and adapters for legacy client configurations; distinguish an absent legacy field from an explicitly empty approved list.
2. Add location-page admission: confirmed coverage, applicable services, a distinct visitor need, and supported local information. Defer pages with insufficient useful content while retaining truthful coverage on the main site. Do not generate a service-by-city Cartesian product.
3. Drive static paths, navigation/link targets, sitemap entries, and SEO gate expectations from approved records. Detect duplicate slugs, unresolved internal targets, unintended orphan routes, omitted routes returning content, and inconsistent indexability.
4. Support explicit approval or omission of overview, About, Contact, FAQ, privacy, and terms routes. Do not generate legal language. Approved supporting routes require supplied content or an explicitly reviewed draft; missing legal/client material remains visible in readiness. Coordinate actual rendering with Stage 3.
5. Capture existing-site URLs when supplied and produce a migration/redirect proposal. Retain the current Pages production-origin policy. Model a future verified custom-domain transition, but defer domain connection and redirect activation to separate release authorization.

## Likely implementation seams

`scripts/generate-site-config.mjs`, existing brief/page-map helpers, `templates/client-site/src/lib/site.ts`, service/location static paths, `Header.astro`, `Footer.astro`, `sitemap.xml.ts`, `robots.txt.ts`, `scripts/seo-release-gate.mjs`, and publishing origin selection. Avoid maintaining a parallel hand-written route list.

## Verification and acceptance

- Fixtures cover zero/one/multiple approved location pages, coverage without location pages, explicitly omitted routes, legacy configs, duplicate paths, excluded services, and pending supporting content.
- An explicit empty location list stays empty through config, static paths, sitemap, navigation, and gate expectations. Non-trade sites remain compatible with their existing coverage model.
- Every approved route has consistent discovery/canonical/indexability rules. Deferred, omitted, and preview-only routes are excluded from the production sitemap.
- Run affected SEO/coverage/route tests, Astro checks, and a production-mode fixture build. Inspect desktop/mobile navigation and crawlable links; no live provider requests are needed.
- Deliver the route schema, compatibility adapter, generated inventory, admission reasons, and redirect proposal. Stage 3 receives approved route records and their fact references.

## Policy and evidence

Local context must help a visitor, not satisfy a fixed paragraph or landmark quota. Similar regional pages with little independent value can create doorway risk: [Google spam policies](https://developers.google.com/search/docs/essentials/spam-policies). This is an editorial admission rule, not a promise of search rankings.

Preserve approved primary-city readiness and pending additional-city disclosure. Location-page admission adds content requirements without changing the standing coverage-research approval policy. No new blog campaign, live domain change, deployment, or customer messages are part of this stage.
