# Stage 1 business facts and research contract

This contract extends the existing canonical brief and shared readiness policy.
It does not change the primary-city research approval policy, add routes, or
relax any source, reference, visual, contrast, or promotion gate.

## Private canonical brief

`CanonicalSiteBrief` version 2 adds `factBrief` version 1 and a value-free
`factReadiness` summary. Each fact records its key, normalized value, state,
source, public-display permission, affected requirements, and reason.

| State | Meaning | Publication |
| --- | --- | --- |
| `confirmed` | A value was supplied by the client | Eligible subject to other gates |
| `missing-deferrable` | An optional value is absent or UNKNOWN | Omit it; preview/review remains available |
| `contradictory` | Supplied instructions conflict | Block until the client resolves it |
| `launch-blocking` | A required fact is absent | Block until supplied |

Client testimony is not independent verification of a credential, review,
history, or business result. The original claim must remain grounded in its
source. `UNKNOWN`, `N/A`, and `Not provided` are omission markers, never copy.
Required facts are business name, phone, preview email, lead destination, and
at least one offered service. Address, hours, domain, year established,
credentials, and offers may be omitted. A supplied service listed as excluded
is contradictory. A directions action for a private location is contradictory;
the preview uses a contact action and keeps the publication blocker visible.

`factBrief` and `businessTruth` retain operational values only in the private
canonical artifact. They are omitted from model-generation payloads and public
site configuration. The public summary contains states and reasons, not fact
values or alternative claims. Fix unresolved facts in the canonical source and
regenerate the report; do not remove the report or toggle `launchReady` manually.

## Address visibility and compatibility

New intake submits `addressVisibility: public | private`. V2 intake may omit
the street address; legacy required-field handling is retained. An absent
visibility field means `public` to preserve previously approved clients.
An invalid visibility value is rejected rather than guessed.

Private addresses and business map identifiers remain available in protected
intake/canonical operational records. Public flattened fields, generated
configuration, shared site/runtime content, JSON-LD, maps, directions links,
and copy/model projections omit them. Repeated exact/case-varied or URL-encoded
mentions of known private location values are removed from projected notes and
candidate copy. This is a text boundary, not detection of addresses embedded in
uploaded photos or inferred from unrelated facts; asset approval still applies.

The shared runtime sanitizes a private location even when an older config
still contains it. Release checks reject private location fields remaining in
the public config. Existing site configs without a fact-readiness report retain
legacy approval compatibility; newly generated configs carry the report.

## Shared readiness and developer disclosure

`business-facts.mjs` owns classification/projection and report validation.
`seoResearchReadiness` uses that validation before applying its existing
research checks. Worker approval, review-banner controls, and production SEO
checks therefore share the same business-fact blocker. Review generation is
still permitted when a fact needs attention.

The developer banner distinguishes business-fact blockers from research
blockers, discloses private address omission, and counts deferred optional
facts. Signed review authorization and existing exact-commit approval checks
remain unchanged.

## Research evidence

`researchLanguageCode` defaults to English for compatibility and flows to the
supported Google Ads volume, difficulty, SERP, related-keyword, and ranked-keyword
requests. Research metadata/report retains the chosen language. The search-intent
endpoint retains its documented keyword-based request; no unsupported language
parameter is added. Client search language is not a promise of website
translation. [Google Ads volume request documentation](https://docs.dataforseo.com/v3/keywords_data/google_ads/search_volume/live/),
[Search intent request documentation](https://docs.dataforseo.com/v3/dataforseo_labs/google/search_intent/live/).

Already-localized service queries do not receive the city twice. Empty successful
measured responses remain incomplete. Measured metrics, qualitative fallback
citations, unknown metrics/costs, and pending additional-city records retain
their existing provenance and budget checks. Primary-city sufficiency can permit
approval while additional cities remain explicitly pending under shared budgets.
No live provider canary or paid research is needed for local regression tests.

## Verification handoff

Behavior is covered at canonical/config seams, intake serialization, research
requests, release checks, and Worker approval. Desktop/mobile onboarding checks
exercise persistence and submission using synthetic network responses. Built
client fixtures scan raw HTML/client assets and inspect hydrated pages for
private-location omission and developer notices. Public-address and blocker
fixtures are separate negative/compatibility controls. Actual results and
artifact locations are recorded in the daily progress ledger.

Stage 1 shipped with user authorization through PR #129 at source merge
`7f361c8fc43eeaa864eb1284f3b488bd5f412a16`. CI passed 1162 application tests,
109 Worker tests, type checks, and the production build. Deployment workflow
`37042047431` succeeded for that exact SHA. Live onboarding assets and synthetic
desktop/mobile preference controls were verified without real submission.
Existing client sites were not regenerated; paid provider canaries remain outside
this release scope.
