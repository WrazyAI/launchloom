# Stage 2 route inventory

`templates/client-site/src/lib/route-inventory.mjs` owns route identity, approval,
location admission, discovery, sitemap/indexability rules and migration proposals.
The canonical brief carries operator/client `routePolicy` and `supportingPages`.
Generated configurations include a `routeInventory` report. Runtime and approval
recompile current policy/content, so an old report cannot grant publication.

## Approval and compatibility

A missing `routePolicy` means an existing legacy configuration unless a stored
explicit inventory shows it belongs to the new contract; removing the policy from
that configuration blocks admission/readiness. Its current
service pages, About, Contact and services overview remain available. Selected
trade location pages remain compatible; non-trade coverage does not create
location pages. A selected empty location array stays empty.

New canonical/config generation creates `routePolicy: { version: 1, decisions: [] }`.
The existing supported core pages remain defaults when their content is present.
Location records default to proposed. Research suggestions never approve a city
page. Coverage remains visible even when there are no approved location routes.
No service-by-city product is generated. Supplied articles remain supported;
research opportunities do not create filler articles.

Decision keys are `pageType:normalized target`, for example
`service:drain cleaning`, `location:lakewood`, or `about:`. Decisions specify
`pageType`, optional `target`, and `status`: proposed, approved, deferred or omitted.
An explicitly requested approval that lacks required content becomes deferred and
blocks publication. A proposed or intentionally deferred page can stay out of the
build without blocking the rest of the site. The homepage is required.

```json
{
  "version": 1,
  "decisions": [
    { "pageType": "about", "status": "omitted" },
    {
      "pageType": "location",
      "target": "Lakewood",
      "status": "approved",
      "reason": "Client confirmed coverage and reviewed useful access instructions.",
      "evidence": ["operator review of client notes"],
      "admission": {
        "services": ["Drain cleaning"],
        "visitorNeed": "Understand property access before arranging a visit.",
        "distinctValue": "Client supplied access preparation for this service area.",
        "localFacts": [
          {
            "value": "Ask the property owner about side gate access before the visit.",
            "source": "client supplied service notes",
            "provenance": "client_supplied_local_information"
          }
        ]
      }
    }
  ],
  "existingUrls": [
    {
      "url": "https://previous.example/old-drains/",
      "routeId": "service:drain cleaning"
    }
  ]
}
```

This example is synthetic. Actual local instructions must be supplied and reviewed.
Admission needs confirmed coverage, at least one applicable non-excluded service,
a distinct visitor need/value, supported local information beyond coverage, and
approval evidence. `verified_business_fact` and `client_supplied_local_information`
are supported local fact sources. Client testimony is not independent verification.
Local admission notes flow to rendered location context. Editorial review must
judge whether the facts help a visitor; the compiler does not judge semantic value
or verify a citation merely because its fields are present.

## Supporting pages and discovery

Overview, About, Contact, FAQ, privacy and terms may be explicitly omitted.
FAQ/privacy/terms default to omitted and require `supportingPages.<type>` with
`body`, `source`, and `reviewed: true` before requested approval can render.
The host escapes supplied text into paragraphs; it generates no legal language.
Stage 3 can expand page content without changing approval ownership.

Optional decisions set `navigation` to header, footer or contextual, `internalLinks`
to approved route IDs, `indexable: false`, or `previewOnly: true`. The compiler
records default relationships and validates targets. Footer/header discovery uses
approved records. Service links fall back to the actual configured homepage
section when their standalone page is omitted; coverage without approved location
pages stays text. Sealed authored/reviewed card content contains only services and locations with approved link destinations. Canonical service facts and business coverage remain intact. Bakeoff inner-page probes use the same selection. Authored hosts retain their current source and conversion runtime;
actual rendered links must pass the release gate, including author-supplied links.

Approval is separate from generation/render/verification: inventory delivery flags
start false. A compiled record does not prove a page has rendered. Production
canonical origin is supplied by the approved Pages build, never inferred from an
intake domain. Nonindexable routes retain their canonical and receive noindex;
preview-only routes are absent from production. Neither enters the sitemap. A shared build-mode rule keeps preview-only cards
available in review and diagnostic experiences. Review
builds have an empty sitemap and noindex pages.

## Migration and verification

`existingUrls` accepts full HTTP(S) URLs and optional approved destination route IDs.
The inventory produces inactive `proposed` or `needs-mapping` redirect proposals.
No redirects are activated. Custom-domain transition remains deferred until domain
connection, canonical review and a separate authorized release.

Revision synchronization installs inventory dependencies and conditional route hosts.
It retires old static About/Contact/overview files only when their bytes match a
recorded generated baseline. Edited client files require manual attention before
any template copy. Existing custom layouts remain protected by baseline checks.

```bash
node scripts/compile-route-inventory.mjs --config path/to/site.config.json --out path/to/route-inventory.json
node scripts/verify-route-inventory.mjs
```

The verification script builds six synthetic fixtures (zero, multiple approved,
omitted, legacy, pending content, preview-only production omission), runs SEO gates and checks all rendered pages at
1440 and 390 pixels. The release gate compares expected sitemap URLs, actual HTML
routes, canonical/indexability metadata, links, anchors and incoming discovery.
It rejects duplicate paths, unresolved targets, orphans and unapproved/omitted HTML.
Shared Worker/developer readiness blocks unresolved requested approval before merge
or publication dispatch. Existing primary-city research and pending additional-city
policy remain unchanged. No paid research, live domain action or real submissions
are part of this stage's verification.
