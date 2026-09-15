# SEO research MVP

LaunchLoom now separates client-supplied search language from externally
validated research. The intake records both with explicit provenance. Search
phrases are ideas until DataForSEO returns evidence.

## Pipeline

1. The client confirms services, customer problem language, exclusions,
   priority locations, and optional competitor URLs.
2. `scripts/seo-research.mjs` plans grounded queries, makes at most one batched
   keyword-overview request and one organic SERP request, then validates the
   strategy against submitted services and locations.
3. `scripts/generate-site-config.mjs` consumes the sanitized dossier. It may use
   research for vocabulary and page decisions, but business claims still come
   only from confirmed intake facts.
4. A researched preview can be approved. A `context-only` or `baseline` preview
   remains available for review, but the review UI and approval API block
   production publishing.

## Configuration

- GitHub secrets: `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`
- GitHub variables: `SEO_RESEARCH_MAX_TASKS=2`,
  `SEO_RESEARCH_MAX_USD=0.10`
- Optional model override: `SEO_RESEARCH_MODEL`

The workflow records the provider-reported cost in the dossier and developer
handoff. It skips the second paid task when the configured allowance cannot
cover the reserve. Provider errors degrade to a reviewable preview instead of
breaking intake generation.

## Evidence and safety

The generated private client repository receives a sanitized dossier at
`.launchloom/seo-research.json`. The workflow retains the same dossier as a
14-day GitHub Actions artifact. Model-proposed services, locations, and queries
that cannot be tied to the confirmed brief are discarded.

Public output includes descriptive metadata, canonical URLs when a domain is
known, LocalBusiness structured data, `sitemap.xml`, and `robots.txt`. Review
builds set `PUBLIC_REVIEW_MODE=true`, adding `noindex, nofollow` and disallowing
crawlers. Production builds remain indexable.
