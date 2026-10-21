# Admin Accounts and Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide persistent invite-only admin profiles, verified sessions and owner-managed membership without weakening existing protected client/admin routes.

**Architecture:** Use Neon's framework-neutral server auth toolkit behind a same-origin Worker adapter, plus private application membership tables in Neon Postgres accessed only by the Worker. Check the upstream session and active membership on every protected request. Keep explicit `access` and `neon` modes; no automatic fallback. Provider resource provisioning and normal-route Access cutover are gated separately.

**Tech Stack:** TypeScript Workers, `@neondatabase/auth/server`, `@neondatabase/serverless`, private Postgres schema, existing Vitest/Playwright.

**Spec:** `docs/superpowers/specs/2026-10-19-admin-workspace-design.md`; shared types/order `docs/superpowers/plans/2026-10-19-admin-workspace.md`.

## Global Constraints

- Successful login is not authorization. Only approved active application members can access admin data/actions.
- Email/password is the baseline sign-in method, with email verification and password reset. Google sign-in is optional.
- No long-lived browser-localStorage tokens or dependence on untested third-party cookie behavior.
- Invitation creator and generation initiator are separate attributions; browser payloads cannot choose their own actor.
- No Access policy weakened before replacement auth is proved, and no double-login flow presented as the final account experience.
- Deactivation retains historical attribution; prevent deactivating/demoting the last active owner. Master Global Constraints also apply.

## Review Focus

1. Concurrent owners demoting/deactivating each other cannot produce zero owners (Task 2).
2. A valid but disabled, expired or revoked session must not pass cached display-role data or silently fall back to Access (Tasks 1/3).
3. Verification/reset callbacks, Unicode profile names, arbitrary redirects and upstream errors must remain safe/usable and non-enumerating (Tasks 1/3).
4. Public signup, a forwarded email header or forged actor JSON must never enroll/promote an admin (Tasks 2/3).
5. A partial provider configuration/outage must fail closed on new APIs while preserving the explicitly configured legacy mode and non-admin routes (Tasks 1/3).

## Task 4: Prove same-origin Neon sessions on the actual Worker runtime

**Files:** Create `worker/src/admin/neon-auth.ts`, `worker/test/admin-neon-auth.test.ts`, `docs/admin-auth-compatibility.md`; modify `package.json`, lockfile, `worker/src/index.ts`, `worker/src/index.ts` Env declaration, `vitest.worker.config.ts` test-only bindings; no Access policy changes.

**Interfaces:** Produce `proxyAdminAuth(request:Request,env:AdminAuthEnv):Promise<Response>`, `readNeonSession(request:Request,env:AdminAuthEnv):Promise<VerifiedSession|null>`; `VerifiedSession={subject,email,emailVerified,displayName,expiresAt}`. `AdminAuthEnv` requires `ADMIN_AUTH_MODE:'access'|'neon'`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET` and `ADMIN_PUBLIC_ORIGIN` in neon mode. Return a typed dependency error, not null, on upstream outage. New same-origin route prefix `/api/admin/onboarding-invites/auth/`; login page `/admin/login` is a public data-free shell. Secure default callback is `/admin/onboarding-invites`; `returnTo` accepts only validated same-origin admin paths.

- [ ] **Step 1: Write failing Worker integration tests.** Forward multiple Set-Cookie headers correctly; HTTPS cookies are HttpOnly/Secure and host-scoped; password is neither logged nor returned. Assert signed-out session yields null, expired/revoked session yields null, provider 503 raises dependency-unavailable, forged email headers do nothing, `https://evil.example` and `//evil.example` callbacks are rejected, and encoded/backslash/CRLF redirect tricks do not bypass validation. Empty cookie secret/base URL fails readiness; no automatic Access fallback. Verify request-body limits/rate limits and origin checks on sign-in/reset endpoints without leaking whether an email is an admin.

```ts
it('does not authenticate a forwarded email header', async () => {
  const request = new Request('https://api.example.test/admin/onboarding-invites',
    {headers:{'Cf-Access-Authenticated-User-Email':'owner@example.test'}});
  expect(await readNeonSession(request, syntheticNeonEnv)).toBeNull();
});
```

`syntheticNeonEnv` is a local fixture with an HTTPS test auth origin, 32+-character test cookie secret and no session cookie; its auth network responses are intercepted by the existing Worker network harness.
- [ ] **Step 2: Run** `npx vitest run --config vitest.worker.config.ts worker/test/admin-neon-auth.test.ts`; expect the absent adapter behavior to fail.
- [ ] **Step 3: Implement** the Web Standards toolkit adapter, not copied Next.js middleware. Current docs expose `handleAuthProxyRequest`, `createAuthServer`, `processAuthMiddleware` from `@neondatabase/auth/server`; verify installed exports/signatures before pinning the dependency. Adapt `RequestContext` to incoming cookies and response Set-Cookie; call uncached upstream `getSession({query:{disableCookieCache:'true'}})` for protected authorization. Honor middleware allow/login/OAuth callback variants if enabled. Allowlist only required auth paths/methods, set trusted upstream from env (never request URL), preserve verifier cleanup and CSRF protections, sanitize redirects/errors, and keep admin role management/impersonation/provider-admin endpoints unproxied. Do not use a generic open reverse proxy.
- [ ] **Step 4: Prove isolated live compatibility only after resource approval.** Confirm intended Neon project and authorize a synthetic development branch; configure trusted dev origin, verification/reset mail to operator-approved test recipients, and production-independent credentials. Run email signup/verification/login/logout/reset and cookie persistence on actual Worker staging with Chromium plus Safari/WebKit when available (otherwise record compatibility as a release blocker, not a pass). No Google requirement for baseline. Record exact SDK version and browser/cookie evidence in `docs/admin-auth-compatibility.md`; if the server toolkit/runtime or required session behavior fails, stop before implementation expansion/cutover and propose a provider alternative.
- [ ] **Step 5: Run** adapter suite and `npm run check:worker`; commit with `git commit -m "feat(admin): validate same-origin Neon session integration"`. No live Access adjustment or public signup privilege is enabled by this commit.

## Task 5: Durable membership, enrollment, profiles and owner safety

**Files:** Create `db/admin/001-membership.sql`, `worker/src/admin/membership-store.ts`, `worker/src/admin/accounts-api.ts`, `worker/test/admin-membership.test.ts`, `tests/admin-membership-migration.test.ts`, `scripts/bootstrap-admin-owner.mjs`; add private migration runbook to `docs/admin-auth-compatibility.md`; modify test bindings/network fixtures as needed.

**Interfaces:** `MembershipStore` methods: `findActive(subject:string):Promise<AdminPrincipal|null>`, `list():Promise<AdminMember[]>`, `createEnrollment(ownerId:string,email:string):Promise<{enrollmentId,url,expiresAt}>`, `acceptEnrollment(session:VerifiedSession,token:string):Promise<AdminPrincipal>`, `updateOwnProfile(subject:string,{displayName:string,avatarKey?:string|null}):Promise<AdminMember>`, `changeMember(ownerId:string,targetId:string,{role?:'owner'|'admin',active?:boolean}):Promise<AdminMember>`. `AdminMember` adds active/createdAt/updatedAt/initials avatar to principal fields. All writes are parameterized and audited. New account routes under `/workspace`: `GET /me`, `PATCH /me`, `GET /team`, `POST /team/enrollments`, `POST /enrollments/accept`, `PATCH /team/:id`. Enrollment accepts verified provider session plus valid one-use invitation; it does not require already-active membership.

- [ ] **Step 1: Write failing tests with a store fixture.** Assert `emailVerified:false` cannot claim enrollment; verified wrong email cannot claim; repeated/expired token cannot claim; an arbitrary signed-in user gets no membership; only owner can invite/promote/deactivate; admin can edit only their own name/avatar; attempted role/email update via profile API fails; Unicode display name round-trips as text (no HTML); deactivation keeps actor IDs/history. Concurrently deactivate/demote the last two owners and assert one operation conflicts and exactly one active owner remains. Verify the SQL migration reruns safely and grants no Data API/public table access.

```ts
it('serializes concurrent last-owner deactivation', async () => {
  // Fixture seeds exactly two active owners; exercise the real isolated DB too.
  const changes = await Promise.allSettled([
    store.changeMember(ownerA, ownerB, {active:false}),
    store.changeMember(ownerB, ownerA, {active:false}),
  ]);
  expect(changes.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  expect((await store.list()).filter(m => m.active && m.role === 'owner')).toHaveLength(1);
});
```
- [ ] **Step 2: Run** `npx vitest run --config vitest.worker.config.ts worker/test/admin-membership.test.ts` and `npx vitest run tests/admin-membership-migration.test.ts`; expect missing schema/store/guards to fail. Use mocked SQL unit fixtures plus real isolated-branch transaction tests; a mocked concurrency test alone cannot prove owner safety.
- [ ] **Step 3: Implement** private `launchloom_admin` tables `workspace_guard`, `members`, `enrollments`, `membership_audit`, and `legacy_identity_links`. Membership primary identity is stable provider subject; record verified normalized email unique per active membership, role constrained to owner/admin, and inactive state retained. Enrollment tokens use 32 random bytes, SHA-256 stored hashes, 72-hour expiry, one atomic verified-email claim, copy-once return; never persist/log the clear token. Limit name to 1–100 Unicode characters, avatar to initials or an approved local key (no arbitrary remote URL). Guard membership writes with a transaction locking the singleton workspace row before checking/changing the owner count. Use read-committed semantics or verified equivalent so concurrent requests see the committed owner state. No role assertion comes from a client or provider's generic authenticated role.
- [ ] **Step 4: Implement/verify bootstrap and transaction evidence.** `bootstrap-admin-owner.mjs --email <operator-confirmed> --dry-run` shows the intended verified-enrollment action without outputting secrets; real bootstrap is explicit, requires an empty owner set and audited operator-provided allowlisted identity, and never runs on app startup. Create pending invitations for existing allowlisted admins; ownership is confirmed, not guessed. Apply migration only to the approved development branch first, rerun it, and run real concurrent owner-safety/enrollment/deactivation tests through the actual driver. Use a least-privilege app DB role, private schema and no browser Data API access. Required connection binding is `ADMIN_DATABASE_URL`, server-only.
- [ ] **Step 5: Run** both test commands and Worker checks; commit with `git commit -m "feat(admin): persist profiles and invite-only workspace membership"`.

## Task 6: Central authorization, actor provenance and controlled migration

**Files:** Create `worker/src/admin/auth.ts`, `worker/test/admin-authorization.test.ts`; modify `worker/src/index.ts`, `worker/src/admin/{workspace-api,accounts-api}.ts`, `worker/test/{generation-admin,onboarding-admin}.test.ts`, `.github/workflows/deploy-platform.yml`, `worker-configuration.d.ts`, `docs/admin-auth-compatibility.md`.

**Interfaces:** Produce `requireAdmin(request:Request,env:Env,ctx:ExecutionContext):Promise<AdminPrincipal>` and `actorFromPrincipal(principal:AdminPrincipal):ActorSnapshot`. In `access` mode preserve the verified audience/allowlist logic and source-marked legacy ID; legacy owner-only membership administration is denied until explicitly enrolled/authorized. In `neon` mode verify upstream session and uncached active membership on every protected request; mismatch/deactivated returns 403, no cookie 401, provider/DB outage 503. `actorFromPrincipal` creates event-time snapshot; legacy-to-Neon association uses `legacy_identity_links` created only after verified enrollment to avoid rewriting history.

- [ ] **Step 1: Write failing auth matrix tests.** Table-drive anonymous, allowed Access, wrong Access audience, forged headers, active Neon admin, active owner, signed-in nonmember, unverified email, inactive membership, expired/revoked session and dependency outage. For neon mode, assert a valid Access context cannot rescue rejected Neon auth. For admin reads/mutations and private hero endpoints, assert identical protection; cross-origin writes remain denied. Test that two valid admins see the same global data; body-supplied actor/creator/role cannot override the server principal; deactivation takes effect on the next existing-session request. Existing review/intake/ingestion routes keep their distinct auth.

```ts
it('does not fall back to Access when Neon membership is denied', async () => {
  // Local request has no Neon session; context is a valid legacy Access admin.
  await expect(requireAdmin(request, {...testEnv, ADMIN_AUTH_MODE:'neon'}, validAccessContext))
    .rejects.toMatchObject({status:401});
});
```

`requireAdmin` throws a typed `{status,code,message}` denial/dependency error consumed by the admin router; it must not return a legacy principal in this case.
- [ ] **Step 2: Run** `npx vitest run --config vitest.worker.config.ts worker/test/admin-authorization.test.ts`; expect new mode/member/actor behavior to fail.
- [ ] **Step 3: Implement** a narrow admin-route guard and migrate every admin handler/alias/hero endpoint to it. Do not refactor unrelated Worker routes. Add guarded secret/config deployment for `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `ADMIN_DATABASE_URL`, `ADMIN_AUTH_MODE`, `ADMIN_PUBLIC_ORIGIN`: legacy access-mode deployments need no Neon resources, neon-mode readiness must reject partial configuration before cutover. Never log secret values. Ensure membership/profile responses are no-store, no signed URLs, with generic denied/outage responses and a trace ID rather than raw provider error data. Retain CSRF/origin and content bounds.
- [ ] **Step 4: Run** all authorization/legacy admin/ingestion/review/intake Worker tests plus `npm run check:worker`. In isolated live tests, deactivate one signed-in admin and verify immediate API denial while another owner remains active. Verify reset/logout expiration using real provider sessions. Document restricted Access rollback (explicit operator env/policy revert, no automatic online bypass). Production mode/policy changes remain master Task 11.
- [ ] **Step 5: Commit** with `git commit -m "feat(admin): enforce active membership across shared admin APIs"`.

## Current documentation evidence

Planning lookup: Context7 `/neondatabase/neon-js`, framework-neutral adapter guide/server toolkit, uncached `getSession` behavior; Neon production checklist and JWT guide. Docs explicitly list edge/Worker support, but live cookie/session integration is still Task 4's gate. Do not claim a docs example proves the integration works. Resource IDs, test recipients, production sender and owner are operator setup inputs, not guessed constants.
