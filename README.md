# LaunchLoom

Generated client sites follow the design, conversion, asset, and local SEO
rules in [the site generation guidelines](docs/site-generation-guidelines.md).
The reference-site research and implemented recipe direction are recorded in
[the local-business design direction](docs/local-business-design-direction.md).

LaunchLoom creates private, config-driven Astro websites for local businesses. The operator platform, API, and generated client sites deploy to Cloudflare; GitHub Actions remains the private automation control plane.

## Architecture

- **Cloudflare Pages Direct Upload** serves the Astro platform and every generated static client site. Cloudflare never reads the private GitHub repositories.
- **One Cloudflare Worker** at `api.launchloom.wrazyos.com` handles onboarding intake, Google Places lookup, R2 uploads, review feedback, exact-commit approval, and client lead forms.
- **R2** stores customer-uploaded logos and photos under an opaque submission prefix. Generated sites use `assets.launchloom.wrazyos.com` URLs.
- **GitHub Actions** runs OpenRouter generation, creates a private WrazyAI repository and review pull request, uploads built files to Pages, processes feedback, and publishes after approval.
- **Resend** sends initial and revised preview links only to the developer. Once the developer approves an exact commit, it sends the client a production review link from `LaunchLoom <info@wrazyos.com>`. Client-feedback notifications go to `david@maigreeks.com` with the client as Reply-To.

There is deliberately no database, separate backend host, login system, Redis, GHL workflow, or Cloudflare Git integration.

Generated Pages-project names are capped at 39 characters. This is intentional: the internal preview address adds the `review-initial.` branch alias, and the shorter project label keeps preview TLS reliable in this Cloudflare account.

Each new Pages project first receives a neutral, `noindex` preparation page on its production hostname. It exists solely to provision the Pages preview certificate; no client content is deployed there or emailed before developer approval.

## Required configuration

GitHub Actions secrets in `WrazyAI/launchloom`:

| Secret                                           | Purpose                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` | Direct Pages deploys, Worker deploy, and R2 binding.                |
| `LAUNCHLOOM_GITHUB_ORG_TOKEN`                    | Private client repositories, issues, pull requests, and dispatches. |
| `OPENROUTER_API_KEY`                             | GLM 5.3 Flash generation in Actions only.                           |
| `FAL_KEY`                                        | Optional server-only contextual image generation for missing client media. |
| `GOOGLE_PLACES_API_KEY`                          | Places API (New) lookup in the Worker.                              |
| `REVIEW_SIGNING_SECRET`                          | HMAC review and approval links; exactly the Worker value.           |
| `LEAD_SIGNING_SECRET`                            | HMAC client lead-form claims; exactly the Worker value.             |
| `RESEND_API_KEY`                                 | Preview, feedback, and lead email delivery.                         |
| `LAUNCHLOOM_FEEDBACK_EMAIL`                      | `david@maigreeks.com`.                                              |

GitHub Actions variable:

| Variable                     | Value                           |
| ---------------------------- | ------------------------------- |
| `LAUNCHLOOM_FROM_EMAIL`      | `LaunchLoom <info@wrazyos.com>` |
| `LAUNCHLOOM_DEVELOPER_EMAIL` | `david@maigreeks.com`           |

The Cloudflare token must be scoped to the account and permit Workers Scripts edit, Pages edit, and R2 edit. Because `wrangler.jsonc` attaches the ready API Worker to `api.launchloom.wrazyos.com`, it also needs Workers Routes edit and Zone DNS edit for `wrazyos.com` on the first deployment.

## Deploy order

1. Confirm the Pages platform and R2 custom domains are active, and add the required application secrets above. Add `FAL_KEY` only when contextual image generation is enabled; it is optional and never blocks an intake.
2. Run **Deploy LaunchLoom platform**. It writes Worker secrets, deploys `launchloom-api`, attaches the API custom domain, then direct-uploads the platform to the existing `launchloom` Pages project.
3. Confirm `https://launchloom.wrazyos.com/onboard/` can call `https://api.launchloom.wrazyos.com/api/places` and submit an intake.
4. Use a fictional intake first. The generation action creates a private client repository and a private-source / public-URL Pages project, deploys `review-initial.<project>.pages.dev`, then emails only the developer. Developer approval merges and publishes that exact commit before the client is invited. Client feedback creates another internal developer preview; only a further developer approval can update production.

Existing Netlify sites are intentionally untouched during this migration. Keep them live until the fictional wellness and home-services flows pass: onboarding, R2 image upload, generation, preview email, feedback, revision, approval, production deploy, and a lead-form email.

## Security model

The Worker only accepts platform-origin intake/upload/Places calls. Review and lead requests use signed, expiring claims and must be sent from an origin embedded in the claim; review feedback additionally requires the exact invited email. Both forms include honeypots and strict request/data limits. Add a Turnstile site key and `TURNSTILE_SECRET_KEY` when ready—the Worker already verifies Turnstile when that secret is present. Use the single free-plan WAF rate rule for `/api/*` as an account-wide baseline.

## Local development

```sh
npm install
npm run check
npm test
PUBLIC_LAUNCHLOOM_API_URL=http://localhost:8787 npm run dev
npx wrangler dev
```

The generated template lives in `templates/client-site`; validate it independently with `npm ci && npm run check && npm run build` there. Client custom-domain steps are in [custom-domain-handoff.md](docs/custom-domain-handoff.md). GHL remains deferred in [ghl-integration.md](docs/ghl-integration.md).
