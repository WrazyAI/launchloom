# SEO market research and page map

The private intake records business facts and confirmed services. LaunchLoom
owns query selection, research, competitor structure, page architecture, and
content opportunity selection. Research never changes a business fact or adds
an unconfirmed service.

## Pipeline

1. A private one-use invitation opens the three-step Business, Services, and
   Brand intake. Google Places can prefill business details and category.
   Suggestions remain unchecked until the client confirms them.
2. `scripts/coverage-areas.mjs` resolves a bounded list of nearby communities
   from the confirmed city and radius. Those communities are coverage facts,
   not automatic location pages.
3. `scripts/seo-research.mjs` researches only confirmed services and the
   confirmed primary city. It writes `.launchloom/seo-research.json` as the
   machine-authoritative map and `.launchloom/seo-map.md` as its operator
   report.
4. `scripts/compile-canonical-site-brief.mjs` combines confirmed business
   facts, coverage evidence, verified assets, and the measured SEO map. The
   generator and design author consume this brief rather than raw intake form
   data.
5. `scripts/generate-site-config.mjs` creates service pages from confirmed
   services. Location pages are allowed only when the map has search evidence
   and verified local facts. The blog routes are built when articles exist;
   the initial site does not create filler articles.

## Research stages

- **Market snapshot:** local Google Ads search volume, CPC, and competition for
  grounded service/city variants; DataForSEO Labs search intent and Keyword
  Difficulty are captured separately with provenance.
- **Competitor structure:** local organic SERPs record query, rank, title, URL,
  and domain. Competitor page patterns inform structure only; competitor copy
  is not reused.
- **Service page set:** every page starts from a client-confirmed service.
  Tightly related variants support that page; they do not add unsupported
  offerings.
- **Fan-out questions:** DataForSEO People Also Ask and related-keyword data
  are marked as measured evidence. Additional useful questions are marked as
  reasoned gaps.
- **Existing site quick wins:** ranked-keyword evidence is included when an
  existing website is supplied and the provider returns ranking data.
- **Blog opportunities:** up to five evidence-backed informational topics are
  proposed. They are not generated as articles during initial site creation.

Missing provider values stay `null` or are listed as unavailable. The report
shows warnings, the configured task/cost limits, and DataForSEO-reported spend.
The research task limit is hard-bounded to 32 and the USD limit to $2 even if
an operator sets higher values. A provider-reported final-task overrun blocks
publishing and prevents additional tasks from starting.
If a completed or failed provider task has no reported cost, the task cost is
recorded as unavailable, further paid tasks stop, and production approval stays
blocked rather than presenting an invented $0 total.

## Configuration

GitHub Actions secrets in `WrazyAI/launchloom`:

- `DATAFORSEO_LOGIN`
- `DATAFORSEO_PASSWORD`
- `GOOGLE_PLACES_API_KEY` with Places API (New) and Geocoding API enabled

GitHub Actions variables:

- `SEO_RESEARCH_MAX_TASKS` defaults to `16`
- `SEO_RESEARCH_MAX_USD` defaults to `0.25`
- Optional location overrides: `SEO_RESEARCH_LOCATION_NAME` and
  `SEO_RESEARCH_LABS_LOCATION_NAME`

The generated client repository retains the JSON map, Markdown report,
business enrichment, and canonical brief under `.launchloom/`. Production
approval remains fail-closed unless the stored research map is version 2,
`publishReady` is true, all required measurement stages completed, every
confirmed service has a successful SERP snapshot, and at least three ranking
domains were found. A preview can still be reviewed when provider data is
missing, but it cannot be published as production.

The operator Access setup and one-use invitation secret are documented in
[`private-onboarding.md`](private-onboarding.md). No SEO metric, competitor
rank, or search intent is fabricated to make a map appear complete.
