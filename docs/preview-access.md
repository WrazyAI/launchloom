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
preview proxy:

```
https://api.launchloom.wrazyos.com/admin/preview/<preview-host>/<path>?<query>
```

1. The Worker requires an active Neon admin session and membership.
2. Signed-out visitors are redirected to `/admin/login` with a `returnTo` back
   to the exact preview path.
3. The Worker fetches the target Pages URL with the existing Cloudflare Access
   service token (`CF-Access-Client-Id` / `CF-Access-Client-Secret`), so the
   legacy Access application still protects the preview from anonymous access.
4. The authenticated HTML is rewritten to short-lived, host-bound signed URLs
   (`/admin/preview/<token>/<host>/...`) for every same-site link, asset, style,
   `srcset`, inline style and same-host redirect. The token is required because
   a CSP-sandboxed document has an opaque origin and does not send session
   cookies for subresources. It is signed with `REVIEW_SIGNING_SECRET`, expires
   after one hour, is bound to the preview host, and cannot access admin APIs.
   A `<base>` element keeps relative URLs inside the token path. Reload the
   original email link to mint a fresh token after expiry.
5. External links, anchors, `mailto:`, `tel:` and data URLs are left alone.
6. The proxied document is served with a CSP `sandbox` directive that gives it
   an opaque origin. Generated sites are untrusted input; without that
   isolation their scripts would run on the admin origin and could call admin
   APIs with the operator's cookies.

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
  workflows) is the public Worker origin used for the proxy link.
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
  service-token forwarding, cookie stripping, method rejection, Access-redirect
  failure, binary pass-through, and router authorization.
- `npx vitest run tests/preview-link.test.ts tests/pipeline-test-runner.test.ts
tests/admin-view-model.test.ts` covers link selection, public-preview
  fallback, probe failure, focused-email selection and the admin helper.
- Production readback requires an authenticated admin session; anonymous
  requests must redirect to the Neon login, not Cloudflare Access.
