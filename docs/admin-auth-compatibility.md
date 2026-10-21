# Admin auth compatibility (Neon same-origin sessions)

**Status: production Neon cutover is enabled on the public Worker origin
`https://launchloom-api.dark-sound-e4eb.workers.dev`.** The Worker uses a
dedicated least-privilege production database role; David's verified owner
account reached `/workspace/me` and `/workspace/team` in a real production
Chromium sign-in. The old branded `api.launchloom.wrazyos.com` admin path is
still behind Cloudflare Access and is not the Neon entry point. Remaining
release work is WebKit proof, live mailbox delivery/expiry proof, the public
branded redirect deployment, history backfill, and the Access policy transition
with rollback.

This record documents the authorized Worker-origin cutover. It does not
authorize an Access policy change, Neon access through the old branded API host,
or use of development credentials in production.

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

## DEV GATE: passed locally; production gate still pending

The isolated development project is provisioned (project `launchloom-admin`,
branch `main`, managed Better Auth) and the following were verified against the
real provider and database:

- email/password sign-up and `get-session` with a secure HttpOnly cookie;
- Worker `/workspace/me` and `/workspace/team` with the real owner membership;
- two-session deactivation (admin 403, owner 200) and provider sign-out (401);
- Chromium sign-in, profile/team rendering, and sign-out;
- real database enrollment, owner-safety, and atomic legacy-link tests.

Completed before and during the Worker-origin cutover:

1. Real production Chromium sign-in, `/workspace/me` owner/active/neon, and
   `/workspace/team` with both owners.
2. A dedicated `launchloom_worker_prod` role with function execute only and
   direct table access denied.
3. Production `NEON_AUTH_COOKIE_SECRET` and `ADMIN_DATABASE_URL` stored as GitHub
   deployment secrets and never printed.
4. The public Worker admin origin registered as a trusted Neon Auth domain.
5. A real production owner account and owner membership for
   `david@maigreeks.com`.
6. A canonical password-reset request accepted by the provider on the deployed
   Worker origin.

Still pending after the Worker-origin cutover:

1. Public branded `/admin` redirect deployment and WebKit proof.
2. Live mailbox reset delivery, token redemption, and expiry proof against the
   production account.
3. The Access policy transition and rollback rehearsal for the old branded API
   host.
4. Authorized retained-history backfill and reconciliation evidence.

The old branded API host remains Access-protected and must not be presented as
the Neon entry point until its policy transition is completed. WebKit must pass,
or compatibility remains a release blocker.

Exact live evidence still required:

- Email verification delivery, verified sign-in, logout, and password reset
  through a real mailbox on the deployed Worker.
- Cookie persistence and host scope across reloads and top-level verification and
  reset navigation, including provider cookie renewal/clearing returned by
  `readNeonSession`.
- Manual redirect behavior on the deployed Worker: the provider 3xx status and
  `Location` must be exposed without server-side following, and the browser must
  navigate only the validated admin destination.
- Expired/revoked session rejection and provider-outage behavior against the real
  provider.
- A rehearsed restricted Access rollback without deleting profiles or auth data.
- Chromium plus WebKit results. Chromium production sign-in is recorded; WebKit
  remains a release blocker.

The local provider, database, Worker and production Chromium proof is recorded.
Normal-route Access cutover remains master Tasks 10/11.

## Membership store and migration runbook (Accounts Task 5)

Status: durable membership, enrollment, profiles and owner safety are implemented
and verified against the isolated development database. The Neon Auth browser
session gate above is still blocked; no production or provider resource was
changed.

### Applying the private schema

The admin schema is additive and idempotent (`CREATE ... IF NOT EXISTS`,
`CREATE OR REPLACE`, guarded singleton insert). Apply all three ordered
migrations with a server-side operator connection, never from the browser and
never with the connection string in shell history:

```bash
psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -f db/admin/001-membership.sql
psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -f db/admin/002-legacy-identity-link.sql
psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -f db/admin/003-atomic-legacy-link.sql
```

`001` includes the legacy-link function for fresh installs; `002` and `003`
remain idempotent upgrades for existing databases and carry the latest atomic
acceptance/bootstrap definitions.

The schema is `launchloom_admin`; it contains `workspace_guard`, `members`,
`enrollments`, `membership_audit` and `legacy_identity_links`, plus the
application functions. Every function is `SECURITY DEFINER` with
`SET search_path = launchloom_admin, pg_temp`; the migration revokes PUBLIC
access and conditionally grants only schema `USAGE` plus function `EXECUTE` to
`launchloom_worker` when that role exists. No table or sequence grants, RLS
policies or Data API exposure are created. A fresh apply therefore supports a
worker role that can call the functions but has no direct table privileges. The
function-owning migration role remains the privileged boundary, so apply this
with the controlled migration credential, not the Worker credential.

`ADMIN_DATABASE_URL` is a private Worker binding and must never be a `PUBLIC_*`
variable or client asset.

**Least-privilege finding (open operator blocker; not solved).** The provisioned
development roles are not least privilege. `launchloom_admin` has `CREATEDB`,
`CREATEROLE`, `BYPASSRLS` and `REPLICATION` and is a member of
`neon_superuser`; `launchloom_worker` has the same attributes and inheritance.
Neither is a superuser, but both inherit `pg_read_all_data`/`pg_write_all_data`
and are unsuitable as production Worker credentials. Task 5 deliberately does
not alter roles or rotate credentials. Production must use an operator-created
role with login, no role attributes, schema `USAGE` and function `EXECUTE` only,
with DDL on a separate migration role. Keep the development URL out of
production.

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
`--database-url-file`. `--dry-run` is accepted explicitly and remains the
default. It prints the subject, email, name, mode and active-owner count, but
never the URL or an invitation token. It writes one audited `owner_bootstrapped`
membership. Existing allowlisted admins are enrolled through invitations, not
guessed or bootstrapped.

### Allowlisted-admin invitations

Create one bounded one-use invitation per invocation with the operator CLI. It
requires an explicit active owner subject, refuses an active-owner mismatch,
sends no mail, and writes the copy-once link to a new private file instead of
printing it:

```bash
# Dry run is the default and writes nothing.
node scripts/invite-admin.mjs \
  --owner-subject <active-owner-subject> \
  --email <verified-allowlisted-email> \
  --out /path/to/private/invite-link \
  --database-url-file /path/to/private/url-file

# Explicit write; refuses to overwrite an existing output file.
node scripts/invite-admin.mjs ... --confirm
```

The confirmed command writes the URL with mode `0600` using create-exclusive
semantics, prints only the enrollment ID, email, expiry and output path, and
never prints the token, hash or database URL. The link expires after 72 hours
and is claimed once by the matching verified email. If the database write fails,
the script removes the just-written file. Do not place this file in the
repository, logs or a shared drive.

### Enrollment and profile operations

- An owner creates an invitation (`create_enrollment`). The store generates 32
  random bytes, returns the base64url token once in
  `/admin/login#enroll=<token>`, stores only its SHA-256 hex digest, and sets
  a 72-hour expiry. The fragment is not sent in the request path or logs; the
  sign-in route also accepts the legacy `?enrollment=` form but never generates
  it. The UI route that consumes the link is wired with the account
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
  `workspace_guard` row before re-reading the actor and counting owners, so a
  simultaneously deactivated owner cannot finish an invite or membership change
  with a stale authorization. Concurrent last-owner deactivation/demotion leaves
  at least one active owner and returns a safe conflict. Deactivation retains the
  member row and audit attribution. The real two-owner proof runs in the isolated
  `launchloom_admin_test` database, not against the development owner.
- Typed store errors (`forbidden`, `last_owner`, `not_found`, `conflict`,
  `invalid`, `email_mismatch`, `enrollment_used`, `expired`,
  `dependency_unavailable`) map to safe JSON statuses. Raw SQL, constraint names
  and connection details are never returned.

The route handlers in `worker/src/admin/accounts-api.ts` are injectable and
accept an already-verified `AdminPrincipal`; they are wired by Accounts Task 6
behind the central guard described below. Same-origin, verified-session and
active-membership checks are enforced at that boundary. Acceptance requires a
verified session but no existing membership.

### Verification commands

```bash
npx vitest run --config vitest.worker.config.ts worker/test/admin-membership.test.ts
npx vitest run tests/admin-membership-migration.test.ts tests/admin-membership-db.test.ts
npx vitest run tests/admin-membership-owner-safety.test.ts tests/admin-invite.test.ts
ADMIN_DATABASE_URL="$(cat /path/to/private/url-file)" \
  npx vitest run tests/admin-membership-db.test.ts tests/admin-membership-owner-safety.test.ts
npm run check:worker
npm run test:worker -- --maxWorkers=1
```

The live database suite creates `test-` members, enrollments and audit rows,
cleans them in `afterAll`, and asserts the existing development owner
(`4b4f068f-728c-468f-8247-ad3d4cbf7dbb`) is unchanged. It is a proper skipped
suite when `ADMIN_DATABASE_URL` is absent, so `npm test` does not fail in CI.
The owner-safety suite derives the sibling `launchloom_admin_test` database
(override with `ADMIN_TEST_DATABASE_URL`), clears any interrupted `test-`
leftovers, and refuses to run if that isolated database is not empty. No live
email, provider or production call is made.

## Central authorization and live membership wiring (Accounts Task 6)

Status: implemented and verified in the local Worker runtime against the
isolated development database and a real Neon Auth `get-session` read using a
saved synthetic session. No deployment, staging/production, browser matrix,
email delivery, Access policy change or role remediation was performed.

### Guard contract

`worker/src/admin/auth.ts` is the single admin boundary:

```ts
requireAdmin(request, env, ctx): Promise<AdminPrincipal>
actorFromPrincipal(principal): ActorSnapshot
```

`requireAdminContext` additionally returns the sanitized provider `setCookies`
and the membership store; `withAdminCookies` appends them to the browser
response. Denials and dependency failures are typed `AdminAuthError`
(`status`, `code`, `message`) and are rendered as safe JSON with a random trace
id. Raw provider, SQL, constraint and connection text is never returned.

- `access` mode keeps the existing Access audience plus allowlist check and the
  source-marked legacy principal (`access:<sha256(email)>`,
  `authSource: "cloudflare-access"`). An unauthenticated Worker request is still
  denied as 403 because Cloudflare Access terminates the sign-in flow outside
  the Worker in a real deployment.
- `neon` mode re-reads the upstream session with `disableCookieCache=true` and
  then re-reads the active membership on every protected request. There is no
  principal or role cache and no fallback to Access.
- Neon denials: no session 401; unverified email 403; missing/inactive
  membership 403; stored membership email differing from the verified session
  email 403; partial configuration 503; provider or membership store outage 503.
- Provider renewal/clearing cookies returned by the session read are attached
  to successful and denied browser responses.
- Owner/admin role checks use the fresh store principal. The browser cannot
  supply `actor`, `role`, `email`, `subject` or `active`.

### Mounted routes

All account routes stay under the existing workspace prefix
`/api/admin/onboarding-invites/workspace`:

- `GET /me`: membership principal in neon mode; the unchanged Task 9 Access
  principal shape in access mode.
- `PATCH /me`: display name and approved avatar key only; neon mode only.
- `GET /team`: active members only; owner and admin may read.
- `POST /team/enrollments`: owner only, returns a copy-once invitation link.
- `PATCH /team/:id`: owner only, role and active state.
- `POST /enrollments/accept`: verified provider session plus one-use token; no
  existing membership required; same-origin; bounded by the shared fixed-window
  auth limiter (10 attempts per 60 seconds per client address).

Operational reads (`/health`, `/clients`, `/attempts`, `/invites`) and the
legacy invite, generation-list and private hero routes use the same central
guard. Their Access-mode behavior and distinct review/intake/ingestion secrets
are unchanged. In access mode, profile changes and membership management are
denied because there is no provider account identity; no second login is added.
Hero responses are `no-store` so deactivation cannot leave a cached private
artifact usable by role.

`:id` route parameter decoding, JSON body bounds (8 KiB), same-origin write
checks and typed membership errors remain owned by `accounts-api.ts`.

### Configuration and deployment guard

`ADMIN_AUTH_MODE` defaults to `access`. Neon mode requires all of
`NEON_AUTH_BASE_URL` (HTTPS), `NEON_AUTH_COOKIE_SECRET` (at least 32
characters), `ADMIN_PUBLIC_ORIGIN` (HTTPS origin) and `ADMIN_DATABASE_URL`
(private binding). The deployment workflow validates that set before writing
secrets or deploying; access-mode deployments do not require or write any Neon
resource. `ADMIN_PUBLIC_ORIGIN` additionally accepts a loopback HTTP origin
(`localhost`, `127.0.0.1`, `[::1]`, origin only) for local `wrangler dev`; it is
not reachable from the public internet. Production origin and mode changes
remain master Task 11.

### Local Worker proof

Command (private `.dev.vars` created with mode 0600, ignored by git, removed
after the run):

```bash
npx wrangler dev --port 8787 --ip 127.0.0.1
node /tmp/opencode/launchloom-task6-live-proof.mjs
```

Observed without printing cookies or the provider/database URLs:

- owner session -> `GET /workspace/me` 200 with subject
  `4b4f068f-728c-468f-8247-ad3d4cbf7dbb`, role `owner`, `active: true`,
  `authSource: "neon"`;
- `GET /workspace/team` 200 with one active member (the same owner) and no
  inactive rows;
- the same request without a session cookie -> 401;
- the development owner row was not modified.

This proves the local Worker -> Neon Auth session read -> membership store ->
route wiring. It does not prove a deployed Access cutover, a real browser
cookie lifecycle, email delivery, or production behavior.

### Access rollback

Rollback is an explicit operator action, not an online bypass:

1. Set `ADMIN_AUTH_MODE=access` (repository variable) and deploy the Worker.
   Access mode requires no Neon resource and reads no membership store.
2. Re-apply/restore the restricted Cloudflare Access application and policy for
   `/admin/*` and `/api/admin/*`.
3. Keep Neon Auth accounts, memberships, enrollments, audit rows and
   `legacy_identity_links` intact. Re-enrolling or resetting provider sessions
   is not part of rollback.
4. Verify the deployed commit and policy before claiming the rollback is live.

There is no automatic fallback from neon to access inside a request.

### Remaining limits

- The provisioned development database roles remain over-privileged; production
  needs the least-privilege operator role described above. Task 6 did not alter
  or rotate credentials.
- No deployed/staging/production, browser cookie matrix, email delivery or
  Access-policy cutover was tested.
- Provider account-existence error normalization for reset/sign-in remains
  unproven from Task 4.
- Password reset and real session-expiry verification remain blocked on an
  approved test mailbox. Deactivation and logout are proven by the live
  two-session proof in the fix sections below.

## Task 6 fix round 1: cookie propagation, legacy links and live two-session proof

Status: review findings 1-5 were addressed for their scoped criteria and
re-verified locally. Password reset and real session expiry remain blocked on
the missing approved test mailbox. No deployment, staging/production,
Access-policy or role change was made.

### Central response wrapper for provider cookies

`guardedAdminRoute(request, env, ctx, handler)` in
`worker/src/admin/auth.ts` now owns the protected-route flow: it resolves the
central guard, runs the handler, and applies the sanitized provider
`setCookies` to the handler response, including successful invite list/create,
generation list/detail and private hero responses. Denials and handler
exceptions also keep the cookies. Legacy handlers no longer call
`requireAdmin` directly, so a success path cannot return a bare `Response` and
silently drop a renewal or clearing cookie.

`sign-out` is now forwarded as a JSON request. The live provider returns HTTP
415 for a bodyless sign-out and 200 with `{}`; the adapter route table and its
focused test were updated accordingly.

### Legacy identity association

`db/admin/002-legacy-identity-link.sql` adds
`launchloom_admin.link_legacy_identity(p_legacy_id, p_subject)`, a
`SECURITY DEFINER` function with `search_path = launchloom_admin, pg_temp`.
It accepts only `access:<64 lowercase hex>`, requires an active member, inserts
the link once, is idempotent for the same subject, refuses to overwrite a link
owned by another subject, and audits only the first association. PUBLIC execute
is revoked; `launchloom_worker` receives execute only when that role exists.

Apply it after the membership migration:

```bash
psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -f db/admin/002-legacy-identity-link.sql
psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -f db/admin/003-atomic-legacy-link.sql
```

The Worker computes the legacy ID only from the already-verified normalized
session email and passes it into the enrollment acceptance or owner bootstrap
call. It never accepts a legacy ID, subject or actor from the browser. The
`link_legacy_identity` function remains available for idempotent repair and
backfill. Round 1 initially called it in a second query after acceptance;
round 2 moved the insert into the acceptance/bootstrap transaction so a missing
function or conflict cannot leave an active unlinked member with a spent token.

### Live two-session deactivation and logout proof

Local `wrangler dev` on `127.0.0.1:8787` used a temporary mode-0600 `.dev.vars`
with the isolated development DB, Neon Auth base URL, cookie secret, JSON
origin and `ADMIN_AUTH_MODE=neon`. `--local-upstream localhost:8787
--upstream-protocol http` kept the request origin aligned with the trusted dev
origin. The `.dev.vars` file was removed and the server stopped after the run.

Observed with a saved owner session plus a second synthetic user
`dev-admin@launchloom.test` (cookies and secrets never printed):

- owner `/me` 200 owner; admin sign-up/sign-in 200
- owner-created invitation accepted by the admin 200 role `admin`
- `legacy_identity_links` contained exactly the `access:<sha256>` ID for the
  verified admin email and the admin subject
- owner deactivated the admin 200, `active: false`
- admin `/me` on the next request 403 `forbidden`; owner `/me` 200 owner
- provider sign-out 200, then the same owner cookie `/me` 401 `signed_out`
- cleanup removed the test membership, enrollments, links and audit rows;
  readback `members=0`, `enrollments=0`, `links=0`, `active owners=1`
- the synthetic auth user `dev-admin@launchloom.test` remains in the provider
  for repeat tests and is documented; no client or production user was touched

The development auth project did not have sign-up verification disabled: the
new provider user initially reported `emailVerified: false`. For this synthetic
test only, the dev provider row for `dev-admin@launchloom.test` was marked
verified directly in `neon_auth."user"` before acceptance. The dev owner row was
not modified. This is local test setup, not an application bypass.

Password reset and session expiry against a real mailbox were not exercised:
the dev project has no approved test mailbox. That remains an explicit
verification blocker, not a pass.

### Fail-closed mode and login method handling

`resolveAdminAuthMode` accepts only `access` and `neon`; an unset mode keeps the
Access default, while any other value produces a safe 503
`auth_not_configured` from the guard, workspace routes, page route and auth
proxy. `/admin/login` now accepts only GET and HEAD; other methods return 405
with `Allow: GET, HEAD`. Access mode remains unchanged and there is still no
online fallback from Neon to Access.

## Task 6 fix round 2: atomic legacy link

Status: the non-atomic link defect is fixed and re-verified. No deployment,
staging/production or production data change was made.

### Transactional acceptance and bootstrap

`db/admin/003-atomic-legacy-link.sql` supersedes the original acceptance and
bootstrap signatures:

- `accept_enrollment(p_token_hash, p_subject, p_email, p_display_name DEFAULT
  NULL, p_legacy_id DEFAULT NULL)`
- `bootstrap_owner(p_subject, p_email, p_display_name DEFAULT NULL, p_legacy_id
  DEFAULT NULL)`

Both validate `p_legacy_id` as `access:<64 lowercase hex>` or NULL and call
`link_legacy_identity` inside the same database transaction, after the member
row is written and before acceptance consumes the token. A conflicting link,
invalid ID or missing link function raises, rolling back the member insert and
token consumption together. An exact existing link for the same subject is
idempotent.

PostgreSQL cannot change an argument list with `CREATE OR REPLACE`, so the
migration drops only the old four-argument `accept_enrollment(text,text,text,
text)` and three-argument `bootstrap_owner(text,text,text)` overloads. It drops
no table, row, index or sequence and recreates the explicit PUBLIC revoke plus
conditional `launchloom_worker` execute grant. `db/admin/001-membership.sql`
carries the same atomic definitions for fresh installs. Apply 002 followed by
003 on databases created before this round.

`worker/src/admin/membership-store.ts` now calls `accept_enrollment` once with
the server-derived legacy ID; the separate post-acceptance
`link_legacy_identity` query is removed. `scripts/bootstrap-admin-owner.mjs`
computes the same `access:<sha256(lower email)>` ID and passes it to
`bootstrap_owner`, so first owners are linked atomically. The 002
`link_legacy_identity` function remains for idempotent repair and backfill.

### Atomic rollback evidence

The real-DB suite creates a conflicting link for the invitee's legacy ID, then
attempts acceptance with a fresh one-use token. It asserts the call returns
`conflict` 409, no member row exists for the invitee, and `consumed_at` remains
NULL. After removing the conflict, the same token succeeds and creates the
member plus the correct link. Live bootstrap is also exercised in the isolated
`launchloom_admin_test` database: `bootstrap_owner` with a legacy ID creates the
owner and matching link, then the fixture is removed before the two-owner
safety tests.

The local two-session Worker proof was rerun after the atomic change and again
showed: admin accepted and linked, owner deactivated the admin (next `/me` 403),
owner remained 200, provider sign-out then owner 401, and cleanup readback
`members=0`, `enrollments=0`, `links=0`, one active owner.

### Remaining limits

- Least-privilege DB roles remain an operator blocker.
- No deployed/staging/production, Access-policy cutover/rollback, browser cookie
  matrix or email delivery test.
- Password reset and real session expiry still require an approved test mailbox.
- Deferred minors remain deferred: synthetic-wrapper cookie test instead of
  routed handlers, trace-ID logging, durable limiter, job-wide secret scoping,
  saved cookie cleanup, and link consumers in history views.
