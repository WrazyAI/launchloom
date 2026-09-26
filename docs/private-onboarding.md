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
second intake issue; changed content is rejected. Once the intake dispatch is
accepted, LaunchLoom sends a receipt email to the client's preview email,
confirming that the details were received and processing has started. Retries
reuse the same email idempotency key. The receipt is not the website preview;
the developer reviews the generated preview before anything is published.

## Service suggestions and coverage lookup

The Worker uses the existing `GOOGLE_PLACES_API_KEY` for Places category and
location enrichment. The workflow also calls Google Geocoding to resolve
nearby service communities. Enable Geocoding API on that key. A lookup failure
retains the confirmed primary city and records a warning.

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
