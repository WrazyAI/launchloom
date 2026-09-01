# LaunchLoom

LaunchLoom is a private website-production app for local businesses. It creates a client-specific private GitHub repository and Netlify preview from a verified onboarding brief, then accepts login-free feedback and approval links.

## What ships now

- A custom Astro/Tailwind operator experience and multi-step Netlify onboarding form.
- Google Places API prefill with explicit client confirmation before generation.
- Two config-driven website presets: a single-page wellness funnel and a multi-page home-services site.
- OpenRouter generation using `z-ai/glm-5.3-flash` with structured JSON output, low-effort first pass, and one high-effort retry.
- Netlify event functions for verified intake, Places lookup, feedback, and exact-commit approval.
- Central GitHub Actions workflows that create private client repositories, deploy Netlify previews through the API, apply supported revisions, and publish approved sites.
- Netlify Forms for onboarding and generated-site lead collection.

## One-time setup

Do not put any credential in a source file or chat message. Revoke the previously exposed credentials and add replacements directly to GitHub/Netlify.

### GitHub Actions secrets in `WrazyAI/launchloom`

| Secret | Purpose |
| --- | --- |
| `NETLIFY_AUTH_TOKEN` | Creates and deploys Netlify projects through the API. |
| `NETLIFY_PLATFORM_SITE_ID` | Existing Netlify project ID for the LaunchLoom platform itself. |
| `NETLIFY_ACCOUNT_SLUG` | The Netlify team/account slug that owns client projects. |
| `OPENROUTER_API_KEY` | Calls GLM 5.3 Flash only in Actions. |
| `LAUNCHLOOM_GITHUB_ORG_TOKEN` | Creates and updates private client repositories. GitHub reserves secret names beginning with `GITHUB_`. |
| `REVIEW_SIGNING_SECRET` | A high-entropy random string shared with the LaunchLoom Netlify project. |
| `RESEND_API_KEY` | Sends one preview-ready email after a public preview is built. |

`GITHUB_ORG_TOKEN` must be a WrazyAI fine-grained token with repository Administration, Contents, Pull requests, and Issues set to read/write, and access to current and future organization repositories.

### Netlify environment variables for the LaunchLoom project

| Variable | Purpose |
| --- | --- |
| `GOOGLE_PLACES_API_KEY` | Server-side Places API (New) lookups. Restrict this key to Places API and set a quota. |
| `GITHUB_ORG_TOKEN` | Creates the private intake issue and dispatches the central workflows. |
| `REVIEW_SIGNING_SECRET` | Must exactly match the Actions secret. |
| `LAUNCHLOOM_GITHUB_REPOSITORY` | `WrazyAI/launchloom` |
| `LAUNCHLOOM_PUBLIC_URL` | Public LaunchLoom URL, used to create review links. |

Set `LAUNCHLOOM_PUBLIC_URL` as a GitHub Actions variable too. Enable Netlify Forms after the first platform deploy.

### GitHub Actions variables

| Variable | Purpose |
| --- | --- |
| `LAUNCHLOOM_PUBLIC_URL` | The public LaunchLoom URL, injected into generated previews for review requests. |
| `LAUNCHLOOM_FROM_EMAIL` | A Resend-verified sender. This project uses `LaunchLoom <info@wrazyos.com>`. |

Email delivery is intentionally one-shot: when a newly created preview responds publicly, the client receives one review link from `info@wrazyos.com`. If Netlify returns a protected response, the client is not emailed; one operational email goes to `zahemen9900@gmail.com` with the exact Netlify visibility page and preview URL. After making it public, run **Notify client preview** with the intake issue number. Each accepted client feedback item also emails `david@maigreeks.com` with the client as Reply-To, while the pull-request comment remains the durable source of truth.

Create one empty Netlify project for LaunchLoom, copy its Project ID into `NETLIFY_PLATFORM_SITE_ID`, then run the **Deploy LaunchLoom platform** workflow. Client projects are created automatically after that.

## Local development

```sh
npm install
npm run dev
```

Validate the platform with:

```sh
npm run check
npm test
npm run build
```

The reusable generated-site template lives in `templates/client-site`. It can be validated independently with `npm install`, `npm run check`, and `npm run build` from that directory.

## Operating flow

1. A client submits `/onboard`; Netlify verifies the form and opens a private intake issue.
2. The intake workflow generates a typed `site.config.json`, creates a private WrazyAI client repo, opens a review pull request, and creates a Netlify draft deploy by API.
3. A public preview automatically emails its signed, direct review link to the client. The in-site banner collects email-matched feedback and supports exact-version approval.
4. Feedback is written to the pull request. The next revision action only modifies supported site configuration fields.
5. Approval verifies the token’s pull-request SHA before merging and triggers a production Netlify deploy.

Custom domains remain an operator handoff in this MVP; see [custom-domain-handoff.md](docs/custom-domain-handoff.md). GHL work is intentionally deferred in [ghl-integration.md](docs/ghl-integration.md).
