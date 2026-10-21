# Admin workspace discovery

Date: 2026-10-19. Source baseline: `origin/main` `8f15d300`.
Nifty: `ti9WNOpGL2`. Status: discovery, not an approved implementation design.

## Confirmed user requirements

- Every admin can see all clients who used invitation links and all generation attempts, including failures and failure reasons.
- Attribute invitation creation and generation initiation separately to the responsible identity.
- Add persistent admin profiles and a fuller account experience instead of relying solely on emailed one-off codes.
- Include truthful placeholders for a future GoHighLevel connection; no actual integration requested yet.
- Redesign using the supplied Anthropic frontend-design guidance, rather than restyling the existing oversized form.

## Current source evidence

| Area | Current behavior | Consequence |
| --- | --- | --- |
| Dashboard | Worker-generated inline HTML/CSS/JavaScript in `worker/src/admin-dashboard.ts`; two tabs, invitation form, generation cards and a detail drawer | This is not an existing Next.js admin app. Build on the current Astro/React and Worker stack rather than assuming a framework migration. |
| Authentication | `accessAdminEmail()` in `worker/src/index.ts` checks Cloudflare Access audience, verified identity, and `ONBOARDING_ADMIN_EMAILS` | Authentication already exists, but there is no application admin-profile or membership model. Replacing the login requires a controlled Access/auth transition. |
| Shared visibility | Authorized admins read the same named invitation and generation Durable Objects, without a per-admin ownership filter | Preserve this shared workspace; attribution must not accidentally become row-level isolation between admins. |
| Invitations | `worker/src/onboarding-invites.ts` stores invited/submitted email, issue and submission references, but not creator identity | Creator attribution cannot be recovered reliably from current invitation rows alone. Do not invent historical attribution. |
| Generations | `worker/src/generation-ledger.ts` upserts one record keyed by intake/issue; no workflow-run or run-attempt key | Later attempts can replace earlier status/failure fields. This is a client lifecycle summary, not a complete per-attempt history. |
| Event identity | Cost events use `(generation_id, event_key)` upserts; `scripts/generation-cost-summary.mjs` uses keys such as `cost:authoring` | Reruns can replace earlier cost-event values too. Attempt identity must scope event idempotency. |
| Failures | Full generation workflow posts failures through `scripts/record-generation-event.mjs`; reason is usually generic; posting is best-effort | Existing failure reporting is useful but does not establish complete or diagnostic-quality coverage. |
| Early failures/cancellations | Full-run start reporting follows dependency/browser setup and secret validation; failure reporting uses `failure()`; prerequisites run in separate jobs | A cancellation, early setup failure or prerequisite failure is not guaranteed to be recorded with a terminal state. Use independent reconciliation rather than relying on a final step inside the failing job. |
| Focused runs | No generation-tracking references found in `test-generation.yml` or `run-pipeline-test.mjs` | Focused profile history is not integrated with the current admin ledger. Distinguish internal QA from client runs rather than mixing them without labels. |
| Pagination | Invitation list is limited to 100; admin generation route requests 200; no cursor exposed | An “all clients/all runs” promise requires server-side pagination/search and full-dataset counts, not just browser filters over recent records. |
| Database | `wrangler.jsonc` binds SQLite Durable Objects and R2; no Neon application driver/auth configuration found in reviewed source | Having a Neon console account does not mean this app already uses Neon. No live Neon project configuration was inspected. |

These are source observations, not a live-data completeness audit or runtime test results.

## Preliminary recommendation, pending design approval

1. Keep the existing hosting, intake coordinator and generation engine. Do not couple the UI improvement to a wholesale operational database migration.
2. Evaluate Neon managed Better Auth for durable admin accounts, using email/password and optional Google sign-in. Keep application membership/authorization separate from successful login; only approved active admins may access the workspace. Existing admins need an explicit enrollment and account-linking policy using verified identities.
3. Prove secure session integration with the actual Worker deployment before changing Access. Use secure browser sessions, server-side membership checks, CSRF/origin protection, trusted domains and production email/OAuth configuration. Keep an explicit recovery/rollback path and test denied/deactivated-user access. Merely hiding public registration in the UI is not authorization.
4. Model distinct entities: admin identity/membership, client, invitation, generation attempt, attempt event. Store stable actor IDs and event-time attribution; never trust a browser-supplied actor. A client submission is a client-initiated run, not an action automatically attributed to the inviting admin. Preserve creator and initiator separately, including system/GitHub provenance when no verified admin mapping exists.
5. Create a durable queued attempt before dispatch where possible; correlate workflow run ID and run attempt; retain terminal outcomes without overwriting earlier attempts. Reconcile independently for missed events, cancellations and runner/setup failures. Distinguish failed, cancelled, skipped, stale/unknown, and completed outcomes rather than guessing.
6. Show redacted stage-level failure summaries and secure run/evidence links. Historical backfill should preserve provenance and label missing creator/initiator as not recorded.
7. Design around browsing clients and attempts, with readable dense records, clear status/actor columns and focused detail views. This is an operations workspace, not a marketing page or a grid of decorative KPI cards. GHL must clearly remain not connected, with no fake sync times or working-looking connect action.

## Documentation consulted

- User-supplied frontend-design guidance: https://raw.githubusercontent.com/anthropics/skills/refs/heads/main/skills/frontend-design/SKILL.md
- Neon SDK documentation via Context7 `/neondatabase/neon-js`: accounts, sessions, email/password, OAuth, server authorization.
- https://neon.com/docs/auth/guides/plugins/jwt.md: browser sessions remain the default; JWTs are for separate services; cross-domain cookie constraints must be considered.
- https://neon.com/docs/auth/production-checklist.md: production trusted domains, email delivery, own OAuth credentials, verified email and development-domain controls.

## Pending

- User review of visual direction and a full written design, including admin enrollment/permissions and migration boundaries.
- Actual Neon project selection, integration compatibility proof and provisioning approval.
- Product implementation, tests, desktop/mobile browser verification, integration and deployment. None performed during discovery.
