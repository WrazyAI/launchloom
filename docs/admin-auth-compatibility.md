# Admin auth compatibility (Neon same-origin sessions)

**Status: implementation and synthetic Worker proof complete. LIVE PROVIDER/BROWSER COMPATIBILITY IS BLOCKED and is not claimed.**

This record covers Accounts Task 4 only. It does not authorize or claim Neon
resource provisioning, an Access policy change, `ADMIN_AUTH_MODE=neon` in a
deployed environment, membership authorization, or production login.

## Installed SDK and export evidence

- Package: `@neondatabase/auth` pinned exactly to `0.6.0-beta` in `package.json`
  and `package-lock.json`.
- Installed package version read from `node_modules/@neondatabase/auth/package.json`:
  `0.6.0-beta`.
- Runtime export check from the installed package:

```bash
node -e "import('@neondatabase/auth/server').then(m => console.log(typeof m.handleAuthProxyRequest, typeof m.createAuthServer, typeof m.processAuthMiddleware))"
# function function function
```

- Installed type signatures:
  - `createAuthServer(config: NeonAuthServerConfig): NeonAuthServer`
  - `handleAuthProxyRequest(config: AuthProxyConfig): Promise<Response>`
  - `processAuthMiddleware(config: AuthMiddlewareConfig): Promise<MiddlewareResult>`
  - `RequestContext` provides `getCookies`, `setCookie`, `getHeader`, `getOrigin`,
    and `getFramework`.
- The package documents and ships a framework-neutral adapter path
  (`BUILDING-AN-ADAPTER.md`, `dist/server/index.d.mts`). The implementation uses
  the Web Standards `Request`/`Response` surface, not the Next.js adapter.
- The SDK is dynamically imported only for an explicit neon-mode auth request so the default access-mode deployment does not evaluate the auth toolkit during Durable Object/legacy-route startup.
- `processAuthMiddleware` is intentionally not used: this task authenticates API
  requests through `readNeonSession`, not page middleware, and OAuth callbacks are
  not enabled in the baseline. Page-route protection belongs to Accounts Task 6
  and the admin UI tasks.

Dependency-resolution note: adding `@neondatabase/auth` briefly allowed npm to
downgrade the existing TypeScript 6.0.3 install to 5.9.3 through a transitive
peer range. The existing compiler version is preserved with an exact dev
dependency plus an override (`typescript: 6.0.3`). No unrelated package upgrade
was accepted, and plain `npm ci` succeeds with the committed lockfile.

## Implemented Worker boundary

Files:

- `worker/src/admin/neon-auth.ts`
- `worker/test/admin-neon-auth.test.ts`
- `worker/src/index.ts` (narrow route wiring and `Env` fields)
- `vitest.worker.config.ts` (test-only bindings; default mode is `access`)
- `package.json` / `package-lock.json`

Public interface:

```ts
proxyAdminAuth(request: Request, env: AdminAuthEnv): Promise<Response>
readNeonSession(request: Request, env: AdminAuthEnv): Promise<VerifiedSession | null>
VerifiedSession = { subject, email, emailVerified, displayName, expiresAt }
```

Configuration in neon mode:

- `ADMIN_AUTH_MODE=neon` (default deployment remains `access`; no automatic
  fallback)
- `NEON_AUTH_BASE_URL` (HTTPS, no credentials/query/hash)
- `NEON_AUTH_COOKIE_SECRET` (at least 32 characters)
- `ADMIN_PUBLIC_ORIGIN` (HTTPS origin only; the trusted Worker/admin origin)

Routes:

- `/api/admin/onboarding-invites/auth/*` is handled only when
  `ADMIN_AUTH_MODE=neon`. In `access` mode the prefix remains `404`.
- Allowlisted paths only: `sign-up/email`, `sign-in/email`, `sign-out`,
  `get-session`, `request-password-reset`, legacy `forget-password`,
  `reset-password`, `send-verification-email`, `verify-email`,
  `change-password`.
- No generic reverse proxy. Provider administration, role, impersonation,
  organization, session-token, and user-listing paths are not proxied.
- `/admin/login` is a public, data-free baseline shell only in neon mode. It
  contains no account records, no tokens in `localStorage`, and is expected to be
  replaced by the designed admin UI.

Security boundary:

- Mutations require an exact `Origin` match with `ADMIN_PUBLIC_ORIGIN`. The
  request origin must also equal that trusted origin.
- JSON bodies are bounded to 16 KiB, must use `application/json`, and callbacks
  are validated before forwarding. The default callback is
  `/admin/onboarding-invites`.
- `returnTo` / `callbackURL` / `redirectTo` accept only decoded, same-origin
  `/admin` paths. Absolute URLs, protocol-relative URLs, backslashes, encoded
  slash/backslash tricks, CRLF/control characters, fragments, and non-admin paths
  are rejected.
- Multiple upstream `Set-Cookie` headers are preserved individually (no comma
  merging). Only Neon Auth cookies are forwarded. Cookies are rewritten as
  host-scoped (`Domain` removed), `Path=/`, `Secure`, `HttpOnly`,
  `SameSite=Lax`; `Partitioned` is removed.
- Upstream `Location` is not trusted. Redirect responses are rewritten to a
  validated admin destination or the secure default.
- `readNeonSession` calls `getSession({query:{disableCookieCache:'true'}})`
  against the configured provider. A valid signed session token is required; the
  signed `session_data` cookie cache is never used for protected enforcement.
- Missing/expired/revoked sessions return `null`. Provider `5xx`, rate limiting,
  transport failures, malformed provider responses, and unexpected toolkit errors
  raise `AdminAuthDependencyError` (`code: dependency_unavailable`, HTTP 503),
  never a signed-out result and never an Access fallback.
- Forged headers such as `Cf-Access-Authenticated-User-Email`,
  `X-Forwarded-Email`, and `X-Auth-Request-Email` are ignored.
- No request body, password, cookie value, or provider error detail is logged by
  this adapter. The toolkit logger is resolved at `silent` for this boundary.
- Sensitive routes have a bounded per-isolate fixed-window limiter (10 attempts
  per 60 seconds per Cloudflare client IP) as defense in depth. It is not a
  distributed rate limit; provider/edge limits and the live behavior remain part
  of the gate below.

## Synthetic verification completed

- RED observed before implementation: the focused suite could not import
  `../src/admin/neon-auth`.
- GREEN: `npx vitest run --config vitest.worker.config.ts worker/test/admin-neon-auth.test.ts`
  passes 28 tests in the actual Worker/workerd test runtime with all provider
  traffic intercepted by the existing MSW Worker harness. No live provider calls
  were made.
- The suite covers multiple `Set-Cookie` preservation, host/`HttpOnly`/`Secure`
  cookie rewriting, signed-out/expired/revoked rejection, uncached session
  enforcement, provider 503 typing, forged identity headers, unsafe/encoded/
  backslash/CRLF callbacks, partial configuration readiness, no Access fallback,
  origin/body/rate bounds, non-enumerable reset responses, password non-logging,
  generic provider failure output, and unproxied provider-admin paths.

This proves the adapter against synthetic provider responses on the Worker
runtime. It does **not** prove a real Neon Auth project, real browser cookie
behavior, email delivery, or deployed staging behavior.

## LIVE GATE: still pending

Step 4 of the brief is **BLOCKED**. The controller verified that no Neon CLI or
Neon/DATABASE configuration exists locally and that no Neon project, branch,
trusted domain, test mailbox set, or owner/resource authorization has been
approved. A local read-only check also reports:

```text
neon CLI: absent
NEON_AUTH_BASE_URL: unset
NEON_AUTH_COOKIE_SECRET: unset
ADMIN_DATABASE_URL: unset
DATABASE_URL: unset
NEON_PROJECT_ID: unset
```

Required operator inputs before the live gate can run:

1. Intended Neon project ID and an authorized synthetic development branch.
2. The branch's Neon Auth base URL (HTTPS).
3. The trusted staging Worker/admin origin (HTTPS, exact origin, no path).
4. A fresh `NEON_AUTH_COOKIE_SECRET` of at least 32 random characters, delivered
   as a deployment secret and never printed.
5. Operator-approved test mailboxes and the provider sender/verification/reset
   mail configuration. Production mailboxes and client data are out of scope.
6. A production-independent staging deployment target/commit and explicit
   authorization to set `ADMIN_AUTH_MODE=neon` there only.
7. Available Chromium and Safari/WebKit test environments, or an explicit record
   that WebKit is unavailable and therefore a release blocker.

Exact live evidence still required:

- Email signup, verification-email delivery, verified sign-in, logout, and
  password reset on the deployed Worker.
- Cookie persistence and host scope across reloads and top-level verification and
  reset navigation.
- Expired/revoked session rejection and provider-outage behavior against the real
  provider.
- No double Access OTP on the tested path, and a rehearsed restricted Access
  rollback without deleting profiles or auth data.
- Chromium plus WebKit results. If WebKit is unavailable, compatibility remains a
  release blocker, not a pass.

No live compatibility, staging, browser, or production claim is made until the
above evidence exists. Normal-route Access cutover and membership authorization
remain master Tasks 10/11 and Accounts Tasks 5/6.
