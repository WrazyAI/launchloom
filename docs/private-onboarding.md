# Private client onboarding setup

## Required host and access setup

1. Use the dedicated `launchloom-onboarding` Cloudflare Pages project. The
   `pages.dev` root intentionally has no homepage; the only page is `/onboard/`.
   No custom domain or DNS change is needed. Set the GitHub repository variable
   `ONBOARDING_ORIGIN` to `https://launchloom-onboarding.pages.dev` with no
   trailing slash. The invitation manager creates one-use links under that
   origin.
2. Create a Cloudflare Access application covering the Worker host
   `api.launchloom.wrazyos.com` and protect both paths:
   `/admin/onboarding-invites*` and `/api/admin/onboarding-invites*`.
3. Set the same Access application audience in the GitHub variable
   `ONBOARDING_ACCESS_AUD`. Set `ONBOARDING_ADMIN_EMAILS` to a comma-separated
   allowlist of operator email addresses. The Worker checks both the Access
   audience and authenticated identity email before serving the admin page or
   invite API.
4. Set the GitHub secret `ONBOARDING_INVITE_SIGNING_SECRET` to a unique,
   high-entropy value. The deployment workflow installs it as a Worker secret.

The Access application and API custom domain are external Cloudflare
configuration; they are not changed by this repository workflow. The
onboarding Pages project is direct-uploaded by `deploy-platform.yml`. Do not
send a real intake until the Access application, onboarding Pages deployment,
API custom domain, and Pages certificate are active.

## Creating and using invitations

Open `https://api.launchloom.wrazyos.com/admin/onboarding-invites` while signed
in through the allowlisted Access identity. Create a link, optionally bind it
to the preview email, then copy and send that link directly to the client.
The link token is placed in the URL fragment, validated by the Worker, and
removed from the visible address after validation. Do not paste the signed
token into GitHub issues, workflow inputs, or logs.

Each invite is stored by a dedicated SQLite Durable Object with state
`unused`, `consumed`, `expired`, or `revoked`. The added
`v2-onboarding-invites` migration creates the new `OnboardingInvites` class;
the existing revision Durable Object and review tokens remain independent.
An accepted submission consumes the invite after the intake issue is safely
created. The same submission ID and content can retry without creating a
second intake issue or dispatching generation twice; changed content is
rejected. Generation dispatch and the receipt email are persisted in the
invitation Durable Object's SQLite outbox. Each task is attempted immediately
and retried by a Durable Object alarm after transient failures. Receipt retries
reuse the same Resend idempotency key and go to the client's preview email.
The receipt confirms that the details were received and processing has started;
it is not the website preview. The developer reviews the generated preview
before anything is published.

## Service suggestions and coverage lookup

The Worker uses the existing `GOOGLE_PLACES_API_KEY` for Places category and
location enrichment. The workflow also calls Google Geocoding to resolve
nearby service communities. Enable Geocoding API on that key. A lookup failure
retains the confirmed primary city and records a warning.

## Confirmed service coverage

The step 2 form resolves the client's main service city, enumerates nearby
municipalities inside the selected travel radius and asks the client to confirm
the places they truly serve. `POST /api/coverage-areas` (same onboarding origin
and private-invite authorization as `/api/places`) performs the lookup and never
consumes the invitation, creates an intake issue, dispatches generation or sends
email.

- Provider: Google Places API (New) Nearby Search with
  `includedTypes: ["locality"]` and `rankPreference: DISTANCE` (canonical city
  or town political entities, at most 20 results per call, no pagination token),
  plus Google Geocoding API for the unambiguous primary city, state and country.
  Both APIs must be enabled on `GOOGLE_PLACES_API_KEY`.
- Distance rule: straight-line statute miles from the resolved primary-city
  center to each municipality's representative coordinate. Driving distance,
  counties, ZIP codes, businesses and state names are never substituted.
- Radii: the existing 10/20/30/50/50+ options are preserved. 10/20/30 miles use
  one exact-radius search. 50 and the bounded 50+ interpretation use the primary
  circle plus eight overlapping 50 km satellite circles that provably cover the
  full 50-mile disc; "more than 50 miles" is never presented as unlimited.
- Honesty: a call that returns the provider maximum of 20 results sets
  `truncated`, a failed satellite circle sets `partial`, and both are shown in
  the form and recorded in the intake. Lookup failures are visible with retry
  and an explicitly confirmed primary-city-only fallback.
- Cost control: 600 ms debounce, in-memory and session caches keyed by city and
  radius, stale-response discard via `AbortController`, 12-second provider
  timeouts and a best-effort 40-lookups-per-10-minutes limit per invitation.

The lookup response contains `primary`, `radius`, `candidates`, `truncated`,
`partial`, `warnings` and a signed `reference`. The reference is an HMAC token
over the resolved primary city, radius and candidate ids, bound to the
invitation id and signed with `ONBOARDING_INVITE_SIGNING_SECRET`. The client
returns it with the ids it confirmed; the Worker verifies the signature and
rebuilds the confirmed coverage from the reference. Client-supplied labels,
coordinates and verification flags are never trusted.

### Intake coverage contract (v2)

New v2 submissions include three hidden fields:

- `primaryCity`: the resolved label (for example `Cookeville, TN`).
- `coverageAreas`: the confirmed labels, primary city first, in provider
  distance order.
- `coverageSelection`: JSON with `status: "confirmed"`, the signed `reference`
  and the selected `selectedIds`; or `status: "primary_city_only"` with a
  `reason` for the explicitly confirmed fallback.

The Worker replaces the submitted `coverageAreas` with server-derived labels
and persists a `coverageConfirmation` record in the intake issue containing the
status, source, primary city, radius, candidate/selected counts, selected ids,
truncation/partial flags, a short reference hash and the reference issue time.
The raw signed reference is never written to the issue. Stale or mismatched
selections are rejected instead of silently downgraded.

Backward compatibility: an older v2 intake with no `coverageSelection` remains
accepted. Its `coverageAreas` defaults to the primary city only and
`coverageConfirmation.status` is `legacy_unconfirmed` with source `unavailable`.
Integrators must not treat `legacy_unconfirmed` or `primary_city_only` coverage
as client-confirmed nearby coverage, and must not add cities the client
excluded. SEO enrichment that merges its own discovered areas over
`coverageAreas` must be updated before that path can be trusted for confirmed
coverage.

## Deployment variables and checks

The platform deployment workflow requires:

- Secret: `ONBOARDING_INVITE_SIGNING_SECRET`
- Variables: `ONBOARDING_ORIGIN`, `ONBOARDING_ADMIN_EMAILS`,
  `ONBOARDING_ACCESS_AUD`

The deployment workflow passes these non-secret values to Wrangler as Worker
variables. The onboarding route is `noindex, nofollow`; public navigation does
not link to it. The Worker denies validation, upload, and intake requests when
the invite, origin, expiry, email binding, or persistent invite state is
invalid.
