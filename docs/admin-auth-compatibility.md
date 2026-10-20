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
- Transport decision after review: the installed toolkit's proxy fetches with
  default redirect following and its response allowlist forwards
  `set-auth-token`/`set-auth-jwt`, so `handleAuthProxyRequest` and
  `createAuthServer.getSession` could not satisfy the redirect, credential and
  cookie-update requirements. The adapter now owns a single-hop `fetch` with
  `redirect: "manual"` and uses the SDK only for its stable cookie primitives
  (`extractNeonAuthCookies`, `parseSetCookies`, `serializeSetCookie`,
  `NEON_AUTH_COOKIE_PREFIX`). Session shape/expiry validation is performed by the
  adapter. `processAuthMiddleware` is still intentionally not used: this task
  authenticates API requests through `readNeonSession`, not page middleware, and
  OAuth callbacks are not enabled in the baseline. Page-route protection belongs
  to Accounts Task 6 and the admin UI tasks.

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

Public interface (Task 6 consumes the session-read shape):

```ts
proxyAdminAuth(request: Request, env: AdminAuthEnv): Promise<Response>
readNeonSession(request: Request, env: AdminAuthEnv): Promise<{ session: VerifiedSession | null; setCookies: string[] }>
VerifiedSession = { subject, email, emailVerified, displayName, expiresAt }
```

`setCookies` carries sanitized provider renewal, clearing, or rotation cookies
that the caller must apply to the browser-facing response. The protected-read
path is deliberately read-only with respect to the Worker and returns cookies
instead of dropping them. The signed `session_data` cache is bypassed and never
minted by this adapter; `NEON_AUTH_COOKIE_SECRET` is required for readiness and
reserved for the session toolkit/membership integration, not used to sign a
protected-authorization cache here.

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
- Browser-facing successful responses are normalized to a deliberately public
  schema (`{ok,user:{id,email,emailVerified,name}|null,session:{expiresAt}|null}`).
  Provider `set-auth-token` / `set-auth-jwt` headers are never forwarded and
  bearer/session/refresh token fields are never returned, so cookie-only
  credentials are not readable from JavaScript.
- The upstream call is a single hop with `redirect: "manual"`. A provider
  redirect is never followed server-side; only a validated same-origin `/admin`
  `Location` (or the secure default) is emitted to the browser, and intermediate
  `Set-Cookie` headers are retained. Caller `Authorization`/`Host`/`Referer`
  headers are not forwarded.
- `readNeonSession` calls upstream `get-session` with
  `disableCookieCache=true`. The signed `session_data` cookie cache is never used
  for protected enforcement.
- A provider `200` must be valid JSON in a supported shape. Invalid JSON,
  non-object/array payloads, wrong shapes, and incomplete sessions (missing
  identity, email, or expiry) raise `AdminAuthDependencyError`
  (`code: dependency_unavailable`, HTTP 503). The only supported signed-out
  shapes are JSON `null` and `{session:null,user:null}`. A well-formed expired
  session is `null`. Provider `5xx`/`429`/transport failures/oversized responses/response-body
  stream failures (including reader aborts/resets) are also typed 503s, never a
  raw exception, a signed-out result, or an Access fallback.
- Forged headers such as `Cf-Access-Authenticated-User-Email`,
  `X-Forwarded-Email`, and `X-Auth-Request-Email` are ignored.
- No request body, password, cookie value, or provider error detail is logged by
  this adapter. The adapter does not use the toolkit logger.
- Sensitive routes have a bounded per-isolate fixed-window limiter (10 attempts
  per 60 seconds per Cloudflare client IP) as defense in depth. It is not a
  distributed rate limit; provider/edge limits and the live behavior remain part
  of the gate below.
- Known deferred gap: provider error-message passthrough for reset/sign-in is
  not normalized, so resistance to a provider that returns distinguishable
  account-existence responses is unproven. No local admin-membership lookup is
  performed or exposed.

## Synthetic verification completed

- Initial round RED observed before implementation: the focused suite could not
  import `../src/admin/neon-auth`.
- Fix-round RED observed: with the first committed implementation restored, the
  expanded review-fix suite failed **13 tests / 23 passed** (`task4-fix1-red.log`),
  covering malformed successes, credential leakage, manual redirect, and
  session-cookie return.
- GREEN: `npx vitest run --config vitest.worker.config.ts worker/test/admin-neon-auth.test.ts`
  passes **38 tests** in the actual Worker/workerd test runtime with all provider
  traffic intercepted by the existing MSW Worker harness. No live provider calls
  were made.
- The suite covers multiple `Set-Cookie` preservation, host/`HttpOnly`/`Secure`
  cookie rewriting, signed-out/expired/revoked rejection, malformed/wrong-shape/
  incomplete `200` payloads as typed dependency errors, explicit signed-out
  shapes, browser credential stripping (headers and body), manual redirect with
  an unfetched malicious target, validated absolute/relative admin `Location`,
  provider renewal/clearing cookies returned from the session read, provider 503
  typing, forged identity headers, unsafe/encoded/backslash/CRLF callbacks,
  partial configuration readiness, no Access fallback, origin/body/rate bounds,
  response-body stream failure normalization, password non-logging, generic
  provider failure output, and unproxied provider-admin paths.

Provenance note: an earlier report quoted a **774.06 KiB** dry-run bundle from a
stale log while the saved `task4-wrangler-final.log` recorded **723.04 KiB** for
the pre-fix build. The fix-round dry-run is **778.61 KiB / 164.14 KiB gzip**
(`/tmp/opencode/task4-fix1-wrangler-final.log`). `task4-check-final.log` records 0
errors/0 warnings/5 pre-existing unused-variable hints, not pristine output. No
bundle-size figure is used as security evidence.

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
  reset navigation, including provider cookie renewal/clearing returned by
  `readNeonSession`.
- Manual redirect behavior on the deployed Worker: the provider 3xx status and
  `Location` must be exposed without server-side following, and the browser must
  navigate only the validated admin destination.
- Expired/revoked session rejection and provider-outage behavior against the real
  provider.
- No double Access OTP on the tested path, and a rehearsed restricted Access
  rollback without deleting profiles or auth data.
- Chromium plus WebKit results. If WebKit is unavailable, compatibility remains a
  release blocker, not a pass.

No live compatibility, staging, browser, or production claim is made until the
above evidence exists. Normal-route Access cutover and membership authorization
remain master Tasks 10/11 and Accounts Task 6.

## Membership store and migration runbook (Accounts Task 5)

Status: durable membership, enrollment, profiles and owner safety are implemented
and verified against the isolated development database. The Neon Auth browser
session gate above is still blocked; no production or provider resource was
changed.

### Applying the private schema

`db/admin/001-membership.sql` is additive and idempotent (`CREATE ... IF NOT
EXISTS`, `CREATE OR REPLACE`, guarded singleton insert). Apply it with a
server-side operator connection, never from the browser and never with the
connection string in shell history:

```bash
psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -f db/admin/001-membership.sql
```

The schema is `launchloom_admin`; it contains `workspace_guard`, `members`,
`enrollments`, `membership_audit` and `legacy_identity_links`, plus the
application functions. The migration grants no privileges and creates no RLS
policies or Data API exposure. The Worker must connect as the dedicated
server-side role; `ADMIN_DATABASE_URL` is a private Worker binding and must never
be a `PUBLIC_*` variable or client asset.

**Least-privilege finding (open operator action).** The provisioned development
role `launchloom_admin` is not least privilege: it currently has `CREATEDB`,
`CREATEROLE`, `BYPASSRLS` and `REPLICATION`. It is not a superuser. Task 5 does
not alter roles; an operator must reduce those attributes (or provision a
dedicated app role with login and only the schema/table/function privileges it
needs) before production use.

### First-owner bootstrap

There is no open-first-user or app-startup bootstrap. Use the confirmed script:

```bash
# Dry run is the default and writes nothing.
node scripts/bootstrap-admin-owner.mjs \
  --subject <provider-auth-subject> \
  --email <operator-confirmed-verified-email> \
  --name "<display name>" \
  --database-url-file /path/to/private/url-file

# Explicit write; refuses when any active owner already exists.
node scripts/bootstrap-admin-owner.mjs ... --confirm
```

The script reads `ADMIN_DATABASE_URL` first, otherwise the private
`--database-url-file`. It prints the subject, email, name, mode and active-owner
count, but never the URL or an invitation token. It writes one audited
`owner_bootstrapped` membership. Existing allowlisted admins are enrolled through
invitations, not guessed or bootstrapped.

### Enrollment and profile operations

- An owner creates an invitation (`create_enrollment`). The store generates 32
  random bytes, returns the base64url token once in
  `/admin/login?enrollment=<token>`, stores only its SHA-256 hex digest, and sets
  a 72-hour expiry. The UI route that consumes the link is wired with the account
  UI/authorization task; the handler itself is implemented.
- Acceptance requires a verified provider session whose normalized email matches
  the invitation exactly. The token is claimed atomically once; repeated, expired
  and mismatched claims are typed refusals. Acceptance does not require an
  existing membership.
- Profile updates accept only display name (1 to 100 Unicode code points) and an
  approved local avatar key. Email, role, active state and actor are never
  accepted from the browser. `avatarKey: null` means "keep the current avatar"
  because the existing SQL function uses `coalesce`; clearing an avatar needs a
  separately reviewed additive migration.
- Membership changes are owner-only. The database locks the singleton
  `workspace_guard` row before counting owners; concurrent last-owner
  deactivation/demotion leaves at least one active owner and returns a safe
  conflict. Deactivation retains the member row and audit attribution.
- Typed store errors (`forbidden`, `last_owner`, `not_found`, `conflict`,
  `invalid`, `email_mismatch`, `enrollment_used`, `expired`,
  `dependency_unavailable`) map to safe JSON statuses. Raw SQL, constraint names
  and connection details are never returned.

The route handlers in `worker/src/admin/accounts-api.ts` are injectable and
accept an already-verified `AdminPrincipal`; they are intentionally not mounted
by `worker/src/index.ts` in this task. Task 6 must wire them behind
`requireAdmin`, keep the existing Access `/me` shape until cutover, and enforce
same-origin and active-membership checks. Acceptance still requires a verified
session but no existing membership.

### Verification commands

```bash
npx vitest run --config vitest.worker.config.ts worker/test/admin-membership.test.ts
npx vitest run tests/admin-membership-migration.test.ts tests/admin-membership-db.test.ts
ADMIN_DATABASE_URL="$(cat /path/to/private/url-file)" \
  npx vitest run tests/admin-membership-db.test.ts
npm run check:worker
npm run test:worker -- --maxWorkers=1
```

The live database suite creates `test-` members, enrollments and audit rows,
cleans them in `afterAll`, and asserts the existing development owner
(`4b4f068f-728c-468f-8247-ad3d4cbf7dbb`) is unchanged. It skips when
`ADMIN_DATABASE_URL` is absent. No live email, provider or production call is
made.
