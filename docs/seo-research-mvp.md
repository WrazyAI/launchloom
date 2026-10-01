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

When DataForSEO credentials are absent, or a configured DataForSEO stage fails
before the measured map can be completed, the generation workflow can use the
already-configured `OPENROUTER_API_KEY` for a bounded live-search fallback.
That path runs at most the configured number of queries (default 3, hard maximum
5), caps each query at four web results and one model-visible web-search tool
call, records provider-reported search-request usage when available, and stops
when provider-reported spend reaches the fallback budget (default $0.05, hard
maximum $0.25). If a completed
request does not report cost, LaunchLoom keeps that request's cited evidence but
does not issue another fallback query because the budget can no longer be
enforced. The dossier records fallback spend and budget state separately from
DataForSEO cost. It stores only provider-returned URL citations: query, source
URL, title, extracted snippet, retrieval time, provider, and provenance.
Model-authored prose is discarded and is never treated as search evidence. The
fallback status is explicit: `complete`, `partial`, `empty`, `failed`, or
`unavailable` (with `not-needed` when measured research succeeds without a
fallback); a separate stop reason records timeout, budget, cost-reporting, or
empty-citation conditions.

Fallback web observations remain separate from confirmed business facts and
measured SEO fields. They do not create search volume, Keyword Difficulty,
intent, ranking positions, competitor-rank claims, services, or locations.
A site with fallback web evidence is still `context-only` and
`publishReady: false`; the preview can be reviewed, but the production SEO
release gate remains blocked until the measured DataForSEO requirements pass.
If OpenRouter is unavailable or not configured, the result stays explicitly
degraded/context-only and is not described as researched.

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
- `OPENROUTER_API_KEY` (already required for generation; also supplies the
  bounded web-search fallback when DataForSEO is absent)
- `GOOGLE_PLACES_API_KEY` with Places API (New) and Geocoding API enabled

GitHub Actions variables:

- `SEO_RESEARCH_MAX_TASKS` defaults to `16`
- `SEO_RESEARCH_MAX_USD` defaults to `0.25`
- `SEO_FALLBACK_MAX_QUERIES` defaults to `3` and is hard-capped at `5`
- `SEO_FALLBACK_MAX_USD` defaults to `0.05` and is hard-capped at `0.25`
- `SEO_FALLBACK_SEARCH_MODEL` defaults to `openai/gpt-6-luna`
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
