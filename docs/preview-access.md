# Authenticated preview access

## Why preview emails asked for a Cloudflare login

Diagnostic and focused-test previews deploy to the dedicated
`launchloom-pipeline-preview` Cloudflare Pages project. The wildcard host
`*.launchloom-pipeline-preview.pages.dev` is still covered by the legacy
Cloudflare Access application that predates the Neon admin-auth cutover.

Cloudflare Access runs at the edge, before the Pages site or the Worker. A
preview link that pointed at the raw Pages host therefore asked for the old
Access one-time PIN. The Neon session on
`api.launchloom.wrazyos.com` could not satisfy it because it is a different
origin and a different authentication system.

Public client previews (`review-initial.<client>.pages.dev`) are not covered by
that Access application and continue to open directly.

## How developer preview links work now

Developer-facing preview emails and the admin workspace use the authenticated
preview entry:

```
https://api.launchloom.wrazyos.com/admin/preview/<preview-host>/<path>?<query>
```

1. The Worker requires an active Neon admin session and membership.
2. Signed-out visitors are redirected to `/admin/login` with a `returnTo` back
   to the exact preview path.
3. After authentication the Worker mints a one-hour HMAC token bound to the
   preview host and redirects to the dedicated preview origin
   (`PREVIEW_ORIGIN`, currently the existing workers.dev Worker host).
4. The preview origin exchanges the token for an HttpOnly, Secure, SameSite=Lax
   `__ll_preview` cookie and redirects to a clean path. The cookie is scoped to
   that origin and grants only preview access, never admin APIs.
5. The preview origin fetches the target Pages URL with the existing Cloudflare
   Access service token (`CF-Access-Client-Id` / `CF-Access-Client-Secret`), so
   the legacy Access application still protects the preview from anonymous
   access.
6. Same-site links, assets, styles, `srcset` entries, inline styles and
   same-host redirects are rewritten to `/admin/preview/<host>/...` on the
   preview origin. A `<base>` element keeps relative URLs stable. External
   links, anchors, `mailto:`, `tel:` and data URLs are left alone.
7. No CSP sandbox is applied. Module scripts, localStorage and normal browser
   APIs work. Isolation comes from the separate origin: the page runs on the
   preview host, while the Neon admin session is host-only on the API origin,
   so generated-site scripts cannot call admin APIs with the operator's
   cookies. Reload the original email link to refresh the preview cookie after
   expiry.

Binary assets stream through unchanged. The proxy never forwards browser
cookies or `Authorization` headers upstream, strips upstream `Set-Cookie` and
CSP headers, and always sends `Cache-Control: no-store`,
`X-Robots-Tag: noindex, nofollow, noarchive`, `X-Content-Type-Options:
nosniff` and `Referrer-Policy: no-referrer`.

## Which links are rewritten

- `scripts/preview-link.mjs` probes a developer-facing preview with a `HEAD`
  request. A redirect to `cloudflareaccess.com` or `/cdn-cgi/access/login`, or
  a `401`/`403`, selects the proxy link. A public preview stays direct.
- `scripts/send-preview-email.mjs` applies that decision only for
  developer-facing audiences. Client emails never receive an admin-only link.
- `scripts/run-pipeline-test.mjs` does the same for focused-test notification
  emails.
- `src/admin/format.ts` renders `previewHref()` for preview links in the admin
  workspace, so the Client dossier and attempt inspector open the same
  authenticated route. Production and published-site links stay direct.

## Configuration and failure behavior

- `ADMIN_PUBLIC_ORIGIN` (repository variable, also `LAUNCHLOOM_ADMIN_ORIGIN` in
  workflows) is the public Worker origin used for the preview entry and login.
- `PREVIEW_ORIGIN` (repository variable or `wrangler.jsonc` var, default
  `https://launchloom-api.dark-sound-e4eb.workers.dev`) is the separate preview
  origin. It is the existing `workers.dev` Worker host, so no new DNS record or
  custom domain is needed. It must be an https origin with no path or query.
  The preview origin only serves `/admin/preview/*`; every other path returns
  `404`, so generated-site scripts cannot reach Worker or admin APIs there,
  even if a legacy session cookie for that host still exists.
- `CLOUDFLARE_ACCESS_CLIENT_ID` and `CLOUDFLARE_ACCESS_CLIENT_SECRET`
  (repository secrets) are installed as Worker secrets by
  `deploy-platform.yml` when present.
- `PREVIEW_PROXY_HOSTS` (Worker) and `LAUNCHLOOM_PREVIEW_HOSTS` (email
  scripts) are optional and default to
  `launchloom-pipeline-preview.pages.dev`, the only host still covered by the
  legacy Access application. This is deliberately narrower than `pages.dev`:
  the Worker must never send the Access service token to an unrelated Pages
  site. Userinfo, ports and non-HTTPS targets are rejected.
- If the test Pages project moves, update both suffix settings together. The
  admin helper uses the shared default in
  `src/lib/preview-proxy-contract.mjs`.
- If the service token is missing, an Access-protected preview fails closed
  with `502` instead of showing the Access login page.
- The proxy only accepts `GET` and `HEAD`. Response HTML over 4 MB is rejected
  rather than served unrewritten.

## Verification

- `npm run test:worker` covers host validation, HTML/CSS/redirect rewriting,
  token mint/verify/expiry and host binding, cookie exchange, service-token
  forwarding, cookie stripping, method rejection, Access-redirect failure,
  binary pass-through, and API/preview-origin routing.
- `npx vitest run tests/preview-link.test.ts tests/pipeline-test-runner.test.ts
  tests/admin-view-model.test.ts` covers link selection, public-preview
  fallback, probe failure, focused-email selection and the admin helper.
- Production readback requires an authenticated admin session; anonymous
  requests to the API-origin preview entry must redirect to the Neon login, not
  Cloudflare Access. The preview origin serves the page only with the signed
  `__ll_preview` cookie.
