# Confirmed service coverage: implementation handoff

Original intake implementation: `codex/launchloom-confirmed-coverage-intake`
(commit `b7ced97`), base `origin/main` `23e3712`. Integration is now implemented
in PR #127 on `codex/launchloom-coverage-seo-integration`. Confirmed coverage is
preserved through enrichment, per-city SEO research, the canonical brief and
site configuration. Verification and deployment status are recorded in the
current daily progress ledger.

## What changed

- `src/lib/coverage-contract.mjs` + `.d.mts`: shared radius rules, distance
  math, search plan, candidate collection, signed-reference helpers and the
  confirmed-coverage derivation used by the Worker and v2 normalization.
- `worker/src/coverage-areas.ts`: Google Geocoding primary-city resolution,
  Places API (New) Nearby Search enumeration, signed reference, per-invite
  lookup limiter.
- `worker/src/index.ts`: `POST /api/coverage-areas` route plus intake
  verification that replaces client labels with server-derived coverage and
  persists `coverageConfirmation`.
- `src/lib/client-intake-v2.mjs` + `.d.mts`: new form fields
  (`primaryCity`, `coverageAreas`, `coverageSelection`), sync shape validation
  for confirmations, legacy fallback, and `coverageConfirmation` in the issue
  allowlist.
- `src/components/OnboardingForm.tsx` + `src/styles/global.css`: accessible
  confirmation pills, debounce/cache/stale-response handling, explicit single
  confirmation, visible failure/retry, and primary-city-only fallback.
- Tests: `tests/coverage-contract.test.ts`, `worker/test/coverage-areas.test.ts`,
  updated `tests/client-intake-v2.test.ts`, `tests/local-client-generation.test.ts`
  fixture, and the extended `scripts/verify-onboarding-ui.mjs` browser flow.
- `docs/private-onboarding.md`: provider, radius, signing and compatibility
  contract.

## API request and response

`POST /api/coverage-areas` with `Origin: <ONBOARDING_ORIGIN>`:

```json
{
  "inviteToken": "<signed one-use invite token>",
  "primaryCity": "Cookeville, TN",
  "serviceRadius": "10"
}
```

Success (`200`):

```json
{
  "ok": true,
  "primary": {
    "city": "Cookeville",
    "state": "TN",
    "country": "US",
    "label": "Cookeville, TN",
    "placeId": "ChIJ...",
    "latitude": 36.1628,
    "longitude": -85.5016
  },
  "radius": { "selection": "10", "miles": 10, "label": "10 miles" },
  "candidates": [
    { "id": "ChIJ...", "name": "Algood", "state": "TN", "label": "Algood, TN", "distanceMiles": 3.74 },
    { "id": "ChIJ...", "name": "Baxter", "state": "TN", "label": "Baxter, TN", "distanceMiles": 7.95 }
  ],
  "reference": "<base64url payload>.<hmac signature>",
  "source": "google_places_locality",
  "truncated": false,
  "partial": false,
  "warnings": []
}
```

Failures keep `ok: false` with `code` in `ambiguous_city`, `unresolved_city`,
`provider_failure`, `unsupported_radius`, `rate_limited`, `not_configured`,
`invalid_invite`. HTTP status is `200` for ambiguous/unresolved outcomes,
`400` unsupported radius, `403` invalid invite, `429` rate limit, `502`
provider failure, `503` not configured.

Rules: straight-line miles from the resolved primary center; boundary cities
included; out-of-radius excluded; primary city never listed as a nearby
candidate; labels carry the state so same-name cities stay distinct; each call
returns at most 20 localities, so hitting 20 sets `truncated`; a failed
satellite circle sets `partial`; 10/20/30 miles use one exact-radius search and
50/50+ use the primary plus eight 50 km satellite circles covering the whole
50-mile disc.

## Persisted intake schema

Form submission adds `primaryCity`, `coverageAreas` (newline separated), and
`coverageSelection` (JSON). The Worker re-derives labels and adds to the intake
issue JSON:

```json
{
  "primaryCity": "Cookeville, TN",
  "serviceRadius": 10,
  "coverageAreas": ["Cookeville, TN", "Algood, TN"],
  "coverageConfirmation": {
    "status": "confirmed",
    "source": "google_places_locality",
    "primaryCity": "Cookeville, TN",
    "radiusSelection": "10",
    "radiusMiles": 10,
    "candidateCount": 2,
    "selectedCount": 1,
    "selectedIds": ["ChIJ..."],
    "truncated": false,
    "partial": false,
    "referenceHash": "0123456789abcdef",
    "confirmedAt": 1759000000
  }
}
```

The raw signed reference is never written to the issue. `referenceHash` and
`confirmedAt` are deterministic, so retry hashes stay stable.

Backward compatibility: an older v2 intake with no `coverageSelection` is
accepted with `coverageAreas` = primary city only and
`coverageConfirmation: { status: "legacy_unconfirmed", source: "unavailable" }`.
The confirmed primary-city-only fallback uses
`status: "primary_city_only"` with `source: "client_confirmed_primary_city_only"`.
Neither may be treated as client-confirmed nearby coverage. Stale city/radius
references, invented ids, and relabelled selections are rejected with `400`
(`coverage_primary_mismatch`, `coverage_radius_mismatch`,
`coverage_selection_mismatch`, `coverage_reference_invalid`).

## Representative Tennessee example (10 miles)

Cookeville, TN center `36.1628, -85.5016`. Distances below were computed with
the shipped straight-line rule from public municipal coordinates; live provider
responses are mocked in automated tests to bound spend.

- Suggested: `Algood, TN` (3.74 mi), `Baxter, TN` (7.95 mi).
- Excluded by radius: `Monterey, TN` (13.06 mi), `Sparta, TN` (16.50 mi),
  `Livingston, TN` (18.20 mi).
- Client deselects `Baxter, TN`.
- Confirmed coverage: `Cookeville, TN`, `Algood, TN`.
- Confirmed JSON: `{"status":"confirmed","reference":"<signed>","selectedIds":["<algood id>"]}`.
- Persisted `coverageAreas`: `["Cookeville, TN", "Algood, TN"]`; Baxter and
  Monterey are absent from the issue.

## Verification performed

- `npx tsc -p worker/tsconfig.json` and `tsc -p worker/test/tsconfig.json`: pass.
- `npx astro check`: 0 errors, 0 warnings (1 pre-existing hint).
- `npx vitest run --dir tests`: 1013 passed / 76 files.
- `npx vitest run --config vitest.worker.config.ts`: 107 passed / 13 files,
  including 16 new coverage endpoint/intake tests.
- `npm run build` with the onboarding verify env: pass.
- `node scripts/verify-onboarding-ui.mjs`: pass across desktop (1440 px) and
  mobile (390 px), including keyboard pill operation, blocked advance without
  confirmation, radius-change invalidation, deselection, provider-failure
  fallback, back-navigation persistence, submitted payload contents, and no
  horizontal overflow. Screenshots:
  `dist/onboarding-ui-check/coverage-review-desktop.png` and
  `dist/onboarding-ui-check/coverage-review-mobile.png`.

## Provider setup, limits and gaps

- Enable both Geocoding API and Places API (New) on the existing
  `GOOGLE_PLACES_API_KEY` Worker secret. No new secret or binding is required.
- Places Nearby Search (New): 20 results per call, no pagination token, 50 km
  radius maximum; `locality` is a Table A filter type. Lookup cost is one
  geocode plus 1 call for 10/20/30 miles or 9 calls for 50/50+ per uncached
  lookup.
- The per-invite rate limit is best-effort inside one Worker isolate, not a
  distributed guarantee.
- Provider entries only include municipalities Google knows; very small
  hamlets may be absent, and a full 20-result call is reported as truncated
  rather than claimed complete.
- No live provider call was made locally during this task; the integration
  agent should run one bounded real lookup per supported radius during review.

## Integrated downstream seams

1. `scripts/coverage-areas.mjs` still enumerates by reverse-geocoding ring
   samples with a 15-area cap and no confirmation. It is called by
   `.github/workflows/generate-client.yml` before `seo-research.mjs`. It must
   stop overriding a confirmed selection and preserve `coverageConfirmation`.
2. `scripts/seo-research.mjs` `main()` currently does
   `intake.coverageAreas = enrichment.coverageAreas` when `--enrichment` is
   passed, overwriting the client-confirmed list with enrichment discovery.
   `normaliseSeoIntake` also unions `serviceAreas` with `coverageAreas` and
   slices to 20. This is the highest-risk re-add path.
3. `scripts/compile-canonical-site-brief.mjs` merges `enrichment.coverageAreas`
   into the client areas and slices to 20 before building the page map, so it
   can re-add excluded cities and create location pages for them.
4. `scripts/generate-site-config.mjs` reads `intake.coverageAreas` for the
   site's service areas; it should keep reading the confirmed list only.
5. `confirmedPageMap` trusts local facts with provenance
   `client_confirmed_coverage`; when wiring its source, use the
   `coverageConfirmation` record rather than enrichment discovery.

Completion means the form discovers cities, lets the client confirm coverage,
and persists that selection exactly; it does not mean SEO already researches
every confirmed city.

Integration resolution: `confirmedCoverageFromIntake` validates the canonical
Worker-persisted selection; `applyCoverageEnrichment` preserves it in the SEO
CLI; the coverage CLI avoids rediscovery for confirmed intakes; canonical brief
compilation excludes suggestions when a confirmation exists. Multi-city research
uses a shared budget and the Worker/template readiness validator preserves
primary-city approval rules while checking any city claimed complete. Pending
secondary-city research is disclosed rather than silently marked complete. See `docs/seo-research-mvp.md`. The original seam descriptions
above are retained as historical context for the incoming branch.
