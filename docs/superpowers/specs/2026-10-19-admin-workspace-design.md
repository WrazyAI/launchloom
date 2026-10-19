# LaunchLoom shared admin workspace

Date: 2026-10-19. Nifty: `ti9WNOpGL2`.
Branch: `codex/launchloom-admin-workspace`, discovery baseline `8f15d300`.
Status: proposed full design, awaiting user approval. Visual direction and palette are approved; implementation is not.

## Intent and agreed direction

LaunchLoom needs a shared place to answer: which clients used our links, what happened on every generation attempt, why did an attempt fail, and who initiated the work?

The user selected **A: Operations studio**, then selected **the existing LaunchLoom palette**, not the iris rebrand. Preserve the public site's colors. The admin workspace should look like a designed part of the same product, not an oversized invitation form and not an unrelated generic SaaS kit.

Confirmed requirements:

- All authorized admins see all clients, invitations and generation attempts.
- Failed attempts remain visible, with useful reasons.
- Invitation creator and generation initiator are separate attributions.
- Persistent admin accounts/profiles replace the current one-off-code-only experience.
- A truthful future GoHighLevel connection area is included, without implementing a CRM integration.

The remaining choices below are proposed builder decisions, not statements the user already made. Approving this document adopts them as the implementation scope.

## Goals, non-goals and anti-goals

### Goals

- Make Generations the landing view, with fast scanning, filtering and a focused selected-attempt inspector.
- Preserve each actual execution attempt rather than overwriting the last intake status.
- Show clients even when their submission has no successful generation or dispatch is still pending.
- Give every new admin-originated action a server-verified actor identity; retain client/system provenance accurately.
- Introduce durable profiles and invite-only application membership, with a safely verified auth transition.
- Keep existing operational data and client workflows intact while improving the admin model.

### Not part of this project

- Public-site redesign/recoloring, generated-client template changes, creative-gate recalibration, model/provider changes or client regeneration.
- GHL OAuth, CRM writes, field mapping, real sync, notifications or billing dashboards.
- New client logins, multiple workspaces, sales-role permissions, arbitrary data exports or admin impersonation.
- New one-click generation/rerun controls. Existing confirmed intake-recovery actions remain available, but tracking improvements must never dispatch or rerun client work by themselves.
- Moving the invitation coordinator, generation engine, R2 assets and all historical operations into a new database.

### Must not happen

- No failed attempt disappearing because a later attempt succeeds.
- No invented historical actors, failure reasons, costs or progress.
- No public signup granting admin access; no browser-supplied identity treated as attribution.
- No global data filtered to the current admin by accident.
- No fake GHL connection button or sync timestamps.
- No Access policy weakened before replacement auth is proved, and no double-login flow presented as the final account experience.

## User experience

### Shared shell and navigation

Use A's desktop layout: narrow vertical navigation, compact heading/actions, a readable attempt ledger and selected-attempt inspector. Sections: Generations, Clients, Invitations, Team, Integrations and Settings. Current-admin profile lives in the shell. Use consistent real-data loading, empty, stale and error states; keep refresh state separate from dataset state.

- All views make shared scope clear. Attribution filters are optional filters, not access boundaries.
- On smaller screens the navigation becomes a compact scrollable menu. Tables may scroll inside their own region; the page itself must not overflow. The inspector becomes a focused drawer or below-ledger panel, with an explicit selected-attempt heading.
- Keep keyboard-operable rows/buttons, visible focus, labeled controls, logical reading order, proper modal focus management and reduced-motion support. Avoid live refresh stealing focus or changing selection.
- Use URL-addressable sections and attempt/client detail so admins can share the same item with another authenticated admin. Return to the previous filters and selection after opening details.

### Generations

Default to newest attempts across the workspace, with real full-dataset counts and a small attention summary. The table exposes client/attempt, execution or delivery state, initiator, link creator and start/update time. Search/filter by client, attempt/run reference, status, initiator, invitation creator, date and execution profile. Pagination and filtering run server-side, not only over the most recent 200 records.

The selected-attempt inspector shows:

- Stable attempt reference, client, profile, workflow run/attempt references and elapsed time.
- Actual execution status and any separately recorded delivery state.
- Structured failure category/stage, a redacted plain-language summary, measured evidence links and a conservative next step. If the cause is not known, say so and link to the run; never invent a diagnosis.
- Creator and initiator, trigger/source, timestamps, stage events and actual/estimated/unreported costs.
- Only legitimate preview/production/evidence links. Review/signing tokens must not be embedded in the public UI bundle or persisted in the tracking ledger.

Any successful or near-miss preview is a delivery fact, not proof the workflow or all quality gates passed. A failed attempt with a diagnostic preview remains failed, with its diagnostic delivery clearly labeled. An earlier published/approved site is not demoted by a later failed attempt.

### Clients

Show clients derived from accepted/consumed invitation submissions, including a client with no workflow result yet. A client dossier links original invitation, verified business/contact details, inviting admin, current site/review links, and complete attempt history including failures, cancellations and retries. Pending/unused invitations stay in Invitations; do not call a mere link validation/open a completed client onboarding.

Client identity is a stable explicit record associated with verified invite/submission/intake references. Do not merge clients solely because an email address or business name happens to match. Preserve linked IDs through retries. Any ambiguous legacy association stays separate/unknown rather than being guessed.

### Invitations

Retain private single-use link creation, copy-once behavior, revoke, expiry, email binding and existing confirmed intake recovery. Add immutable creator attribution, consumed/submitted status, associated client and attempts. Capture the creator from the authenticated server context. No need to add tracking pixels or pretend link-open analytics exists.

### Team and profiles

Profiles have a stable identity, display name, verified email, optional avatar and active/deactivated state. Initial avatars use accessible initials; arbitrary remote avatar fetching is not required. Updates to a display name never rewrite historical actor identity.

Proposed two roles:

- **Owner:** the same workspace visibility plus invite/deactivate admins and manage membership.
- **Admin:** see every client/run/invite, create/revoke client invitations, use existing recovery actions and edit their own display name/avatar. No admin can self-promote or activate another admin by changing browser data.

Owner selection is an explicit deployment/bootstrap input from the existing verified admins. Do not guess it from repository authorship or the first public login. Prevent deactivating the last active owner. Deactivation keeps historical identity and invalidates application access for existing sessions.

### Integrations and settings

GHL displays **Not connected / Planned** with a short description of future contact matching and generation milestones. No credentials, OAuth flow, active connect action, fake test connection or sync activity.

Settings includes the current profile, verified email read-only in the first release, sign-in/password reset/logout controls and workspace visibility explanation. Account email changes and identity-provider account linking are not self-service scope in this release.

## Visual system

Preserve actual site tokens from `src/styles/global.css`:

| Role | Value |
| --- | --- |
| Forest ink / main actions | `#10251f` |
| Muted foreground | `#587069` |
| Warm ivory canvas | `#f4f2ea` |
| Paper surface | `#fffefa` |
| Sage support | `#bad8c8` |
| Lime highlight, used sparingly | `#d9f06b` |
| Divider | `#d9ddd1` |

Use A's approved typography and density: Manrope for headings, Source Sans 3 for data/body, appropriate licensed self-hosted assets and system fallback. Admin styling is scoped; do not replace global public-site typography as a side effect. Use forest/ivory/sage for structure and focus; reserve red/amber/green for failures, attention and delivery states, with text labels so meaning never depends only on color. Treat palette values as a brand starting point, not permission to skip measured contrast checks; adjust paired local tones where required.

Keep the existing LaunchLoom brand identity; the prototype's woven mark is illustrative and does not authorize a company-wide logo replacement. Use the current wordmark/mark unless a local admin-only treatment is clearly derived without a rebrand.

## Proposed technical and auth boundary

### Keep the current platform

The source app is Astro/React plus a Cloudflare Worker. Admin HTML currently comes from `worker/src/admin-dashboard.ts`, with Access-verified handlers in `worker/src/index.ts`. Invitations and generation data live in SQLite Durable Objects. Do not introduce Next.js or replatform hosting just for this dashboard.

Serve the workspace and APIs on the existing Worker/admin origin, preserving `/admin/onboarding-invites` as a compatible entry/redirect and the current protected API aliases during transition. Build the richer frontend as maintainable typed modules/components with the existing toolchain. Precise bundling and protected asset routing are left to the builder; private records must only come from authorized APIs, never from a public/static bundle.

### Proposed provider: Neon managed Better Auth

Use Neon for persistent admin identity/session storage and a small application membership/profile model, not as a mandatory replacement for operational Durable Objects. No new database/project has been provisioned or selected. Before implementation provisioning, identify the user's intended Neon account/project and obtain the appropriate resource authorization; use an isolated development branch with synthetic data.

- Email/password is the baseline sign-in method, with email verification and password reset. Google sign-in is optional and can follow if production OAuth credentials are not ready; it must not block the baseline account experience.
- Successful login is not authorization. Every admin API verifies the session and active application membership server-side. A new external account with no approved membership cannot see clients or invoke admin actions even if the provider permits account creation.
- Invitations/enrollment bind membership only to a verified identity matching an approved email. Existing admins receive explicit enrollment, not speculative account linking. Avoid an open-first-user owner bootstrap.
- Browser auth uses secure HTTP-only session cookies through a same-origin integration/proxy appropriate to the actual Worker runtime. No Next.js-only SDK copy/paste; no long-lived browser-localStorage tokens or dependence on untested third-party cookie behavior.
- Preserve origin/CSRF checks on mutations. Review cookie scope, logout, reset, session revocation, profile updates, trusted domains, production mail delivery and production/development separation.
- Validate any external service token issuer/audience/signature/expiry and still check active membership. Never rely solely on a stale role claim for deactivation enforcement.

First prove this boundary in isolation. If Neon cannot support the required production-safe session/authorization behavior on the existing platform, pause and propose an alternative; do not silently substitute providers or weaken protection.

### Transition and recovery

Keep the existing Access-protected path working during development and enrollment. Stage the new login separately; test the new shell/API as allowed/denied/deactivated users without changing public intake, review-link, private asset or internal ingestion security. The eventual admin-route Access cutover is an explicit deployment checkpoint after replacement protection is verified, not a preliminary setup step.

The final normal login must use the new persistent account flow, not require both Access OTP and the new password. Keep an explicitly restricted recovery/rollback path while transitioning; its actor provenance is distinct and audited. Rehearse access rollback without deleting profiles, invites or attempts. No Access change is authorized by mockup/color approval alone.

## Operational data and attribution

### Separate records

- **Admin identity/membership:** stable auth subject, verified email, profile and role/activity state; owned by Neon/application membership storage.
- **Client:** stable explicit linkage to invitation/submission/intake and current lifecycle summary.
- **Invitation:** creator stable identity and event-time display snapshot, immutable once registered.
- **Generation attempt:** one queued/executed generation attempt with stable attempt ID, client/intake/profile, creator link, initiator identity/source, dispatch correlation, workflow repository/run ID/run attempt, timestamps and result fields.
- **Attempt event:** stage status/cost/failure evidence keyed by attempt plus event identity. A retry must not overwrite another attempt's event.

Keep new operational tables in the existing coordinator/ledger storage boundaries. Legacy generation summary APIs remain compatible while the new UI moves to attempt-aware APIs. Existing revision/publish updates may update the client lifecycle summary, but must not mutate the original execution outcome of an earlier generation attempt.

Attribution sources:

- An admin-created invitation records that admin as creator.
- A client submitting it initiates a **client** attempt; the creator remains visible separately.
- Existing authenticated recovery records the recovering admin as initiator of the recovery/dispatch operation, without rewriting the original submitter.
- Direct GitHub Actions dispatch/rerun records verified GitHub triggering-actor provenance. Map it to an admin only using an explicit verified mapping, never by matching display names.
- Automated work is system-initiated with its source. Legacy unknowns say **Not recorded**.

Store stable actor IDs and event-time snapshots. Details can show current profile name with the recorded name when it differs; deactivating a profile never removes attribution. Browser payloads cannot choose their own actor. Internal workflow metadata must be verified/trusted, scoped to the intended run and cross-checked when reconciled.

### Execution identity and missed-event coverage

Create a durable queued record before intake dispatch where possible; carry its correlation ID through the existing outbox without changing dispatch idempotency. Bind it once to the executed workflow identity. The canonical executed-attempt uniqueness is repository + GitHub run ID + run attempt. Reusable workflow/component paths are metadata, not a reason to duplicate the same execution. A rerun with a new run attempt gets a new history row. Unmatched queued records stay pending/stale until verified; do not match ambiguous runs by time proximity alone.

Include real generation profiles: full, full-preview, creative-only and seo-only. Clearly label/filter internal QA profiles, but make them available in the shared history. Exclude content-free access-only smoke and platform-deploy/validation jobs. Revision/publish work remains associated client activity, not a new initial-generation attempt unless it actually invokes a new generation execution.

Model execution status independently from delivery/review status:

- Execution: queued, running, succeeded, failed, cancelled, skipped or unknown/stale.
- Delivery: none, diagnostic, needs attention, preview ready or published, based on actual evidence.

Use stage callbacks for timely progress and an independent workflow-completion/reconciliation path with paginated GitHub metadata readback for cancellation, setup failures, prerequisite failures, absent callbacks and reruns. The reconciler cannot invoke a generation or send client notifications. It must be idempotent, least-privilege and bounded, and record last synchronization time/errors. Prefer explicit unknown/stale when neither callbacks nor GitHub confirms the outcome.

No generation depends on the dashboard being available. Reconciliation, outbox state and tracking-health UI provide recoverability instead of failing client work solely because a tracking post failed. Operational service degradation must be visible rather than silently showing a complete-looking dataset.

### History, pagination and costs

- Add cursor pagination, deterministic ordering and server-side filters/counts across the full retained dataset. Preserve selected records not present on the current page via direct detail lookup.
- Start reliable actor/attempt capture at rollout and backfill retained GitHub generation-run metadata plus existing verified invite/issue links through an idempotent bounded job. No workflow dispatch or model call is needed.
- Backfill cannot recover data no longer retained. Show the documented coverage start/window and mark legacy merged/imported records and missing evidence honestly. Completion must not claim a full historical reconstruction when source evidence is unavailable.
- Cost idempotency is scoped to an attempt. Separate actual, estimated and unreported amounts; missing cost is not zero. Do not add legacy client-level totals to imported attempt totals and double count them.
- Preserve original private data/hero assets. Do not move binaries or signing tokens into the auth database. Redact failures and never display credentials, signed intake/review URLs or raw private source in the shared activity feed.

## Acceptance and verification

Implementation is complete only with evidence for the actual integrated flow, not just these mockups:

1. Two real test admin accounts in an isolated environment see the same clients and attempts; each new link/action shows the correct creator/initiator. Client-originated and mapped/unmapped GitHub activity remain distinguishable.
2. A client can consume an invitation and appear before a successful generation. The existing create/copy/revoke/recover flow remains safe and functional.
3. A synthetic intake with multiple runs and a rerun retains every attempt; success after failure does not erase the failure. Duplicate callbacks/reconciliation do not create duplicate attempts/events or charges.
4. Setup failure, prerequisite failure, cancellation and missed-callback cases become visible through independent reconciliation; stale/unknown is not falsely reported as success/failure.
5. Failure details show the actual failing stage/reason when available, plus safe run/evidence links. A diagnostic/near-miss preview cannot masquerade as production approval.
6. More than 200 attempts/100 invitations remain reachable and searchable with correct full-dataset counts.
7. Neon signup/sign-in/enrollment, email verification/reset, logout, expiration, deactivation, last-owner protection, unauthorized access, forged actors, CSRF/origin checks and no-access membership cases pass real integration checks. Confirm no unintended public/static data exposure.
8. Inspect rendered desktop/tablet/mobile output, actual interactions, keyboard navigation/focus, loading/errors/empty states, text/control contrast and body overflow. Use licensed font assets and verify the brand palette without altering public/client sites.
9. GHL stays visibly not connected and makes no provider calls. Tracking/backfill/reconciliation produces zero client generation, email or CRM side effects.
10. Relevant unit/integration/Worker tests, application/Worker type checks, production build, existing repository review gates and exact deployed-commit verification pass before reporting shipment. Any real-client generation, mail delivery or Access/provider provisioning remains separately scoped and authorized.

## Decisions left to the implementation planner

- Exact component extraction, asset build route and UI state library, favoring the existing stack and minimal new dependencies.
- Concrete additive schemas/indexes/cursors, event redaction implementation and read interfaces between existing Durable Objects.
- Independent reconciliation scheduling/webhook mechanism and bounded paging/checkpoint strategy, preserving least privilege and all above semantics.
- Provider configuration resource IDs, production sender/OAuth settings, bootstrap-owner identity and Access recovery/cutover specifics must be discovered/confirmed with the operator during setup; no credentials in the design or repository.
- Break implementation into reviewable slices: tracking correctness/data compatibility, identity/profile integration, shared UI, then rollout/backfill and deployed verification. Do not ship a complete-looking UI while the required shared data/history/auth is only mocked.

## Supporting evidence

- `docs/admin-workspace-discovery.md`: current source gaps and authoritative files.
- `docs/admin-workspace-mockup-notes.md`: visual exploration, actual palette tokens and prototype-only validation.
- Local browser companion screens and screenshots are design artifacts, not production app evidence. Session keys are ignored and must not be committed.
- Current Neon docs consulted during discovery: managed auth production checklist, session/JWT boundaries, accounts, email/password and optional OAuth. Integration must retrieve current documentation again when planning implementation.
