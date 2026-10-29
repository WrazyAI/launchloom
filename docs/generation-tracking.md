# Generation tracking

## Current operations versus Legacy History

New-mode Postgres operations use opaque `{ intakeId, requestId, attemptId, operationId }`
references and the authenticated **Operations** view. The Worker never exposes the
private payload, consent or client email in its list/detail projection. Workflow
dispatch inputs carry operation/request/attempt IDs only; claim supplies the intake
ID before a TLS/OIDC-protected read. Numeric intake issues are not created or invented.

The older DO/issue reporting described below is **Legacy History**. Keep it readable
and separate, without bulk migration or redelivery. Legacy producers and in-flight
legacy recovery may still write their original authority; read-only describes the
history UI/API, not a shutdown of legacy execution. Private client PR/feedback issue
numbers used by review/revision/publication are real artifacts, not intake IDs.

The authenticated workspace `/me` bootstrap returns only the server-derived
`capabilities.operationsRead` boolean. Operations navigation and rendering are
disabled by default, including for older responses with no capability. Reads are
advertised only with `OPERATIONS_RECONCILE_MODE=observe-v1` and a nonblank operations
connection configured on the server; no connection details cross the response.
Disabled direct Operations URLs fall back to Legacy History without requesting the
operations API. The capability is availability metadata, not authorization, health
proof or a flag switch; the API independently enforces the same configuration and
existing admin authorization.

New-mode telemetry is mandatory: callbacks are fenced to the authenticated elected
run and stable event keys. Callback failure marks telemetry incomplete and blocks the
handoff attestation even when a workflow step was best-effort for legacy compatibility.
GitHub success alone cannot show preview-ready: the authenticated handoff must bind
the selected client build after the existing build/deployment/rendered/delivery gates.
Costs retain actual/estimated/unreported kind and incomplete coverage; a known subtotal
is not a complete bill. Diagnostics cannot claim client delivery.

The intake mode flag only chooses a new reservation. Persisted routing owns retries
across forward cutover and rollback; a DB outage never falls back to issue creation.
See [operations recovery](operations-recovery.md) for the exact dependency inventory,
stalled/unknown-owner handling, retention/restore approval gates, staging evidence and
rollback that preserves accepted Postgres work. This implementation does not authorize
database provisioning, activation, dispatch, deployment or cutover.

Local synthetic integration evidence is provided by
`tests/operations-integration.test.ts`. Its shell tests run without a DB; its cross-layer
cases require an explicitly disposable loopback `OPERATIONS_TEST_DATABASE_URL` and
`OPERATIONS_TEST_DISPOSABLE=1`. Skipped DB cases are not a pass. That proof uses real
PostgreSQL migrations/service-role calls and real RSA verification with synthetic
keys, plus desktop/mobile Chromium against a loopback dashboard API backed by that
database. The browser admin principal, invitation persistence and GitHub/cron/provider
behavior are simulated, not staging or production evidence.

## Legacy reporting contract

The original admin dashboard at `/admin/onboarding-invites` used two tabs.
These describe the legacy data contract, not the current workspace navigation:

- **Invitations** creates and revokes private invite links. Each row shows the
  client email and, once the invite is consumed, the linked intake issue.
- **Generations** tracks each client generation run: business, client email,
  status, preview and production links, hero screenshot, per-stage provider
  cost, and an event timeline. Selecting a client email or a generation card
  opens a per-client detail panel with the hero preview, site links, cost by
  stage, and the full timeline.

Data is stored in the `GenerationLedger` Durable Object
(`worker/src/generation-ledger.ts`). Generation records are keyed by
`issue:<number>`, with the intake submission id kept as a field. Cost and
status events are keyed by `(generation_id, event_key)`, so a retried workflow,
a second repair round, or a revision appends evidence instead of double
counting. Hero thumbnails are stored as bounded WebP blobs inside the same
ledger and are only served through the Cloudflare Access protected admin API.
No review or approval token is ever stored.

## Pipeline reporting

Generation reporting is best-effort and can never block or fail a generation.
`scripts/generation-cost-summary.mjs` normalizes the artifacts a run already
produces, and `scripts/record-generation-event.mjs` posts the result to the
Worker.

| Stage | Source | Kind |
|---|---|---|
| seo_research | `seo-research.json` cost and fallback cost | actual |
| site_config | `--usage-out` sidecar from `generate-site-config.mjs` | actual |
| reference_dna | `--usage-out` sidecar from `analyze-reference-dna.mjs` | actual |
| reasoning_preflight | `reasoning-preflight.json` usage with `costSource` | actual or estimated |
| images | `.launchloom/generated-assets.json` count and `FAL_IMAGE_USD_PER_IMAGE` | estimated |
| authoring | `.launchloom/generated-experiences/creative-run.json` | actual |
| repair_qa | creative repair `repair-usage.json` and visual gate reports | actual |
| revision | revision visual gate reports and creative repair usage | actual |
| publish | Cloudflare Pages deploy outcome | unreported |

Providers that do not report a per-run price are marked `unreported` and the
summary reports `incomplete` rather than inventing a number. Set the repository
variable `FAL_IMAGE_USD_PER_IMAGE` to show a labeled image estimate.

### Hero screenshot failure

The preview-ready path encodes the desktop screenshot as a bounded WebP and
retries at smaller widths and lower quality when the first result exceeds the
1.8 MB ledger limit. If every attempt is still too large, or the upload is
rejected, the preview remains deliverable but the generation and attempt are
recorded as `attention` with a bounded failure reason. The tracking step also
exits nonzero so the Actions run shows a visible warning; the preview handoff
continues because thumbnail capture is diagnostic, not a release gate.

## Existing legacy setup (not activation authorization)

The following records the existing legacy configuration. It does not authorize
secret changes, provisioning or Postgres activation as part of this migration.

1. Create the repository secret `GENERATION_TRACKING_SECRET` with a unique
   high-entropy value. `deploy-platform.yml` pushes it to the Worker when
   present. Until it is set the internal ingestion API reports itself
   unconfigured and generation continues unchanged.
2. No Cloudflare Access change is required for the dashboard: it reads through
   `/api/admin/onboarding-invites/generations` and
   `/api/admin/onboarding-invites/generation-hero`, which are already covered
   by the existing `/api/admin/onboarding-invites*` Access path. The clean
   `/api/admin/generations` and `/api/admin/generation-hero` routes stay
   available for when the Access application is widened to `/api/admin/*`.
3. Optional: set the repository variable `FAL_IMAGE_USD_PER_IMAGE` to the
   currently published per-image price of the configured `FAL_IMAGE_MODEL`.

## Endpoints

- `POST /api/internal/generations` with `Authorization: Bearer
  <GENERATION_TRACKING_SECRET>` accepts `start`, `event`, and `complete`
  actions with a bounded generation object and up to 50 idempotent events.
- `POST /api/internal/generations/hero?id=<generation>` stores a WebP, PNG, or
  JPEG thumbnail up to 1.8 MB.
- `GET /api/admin/onboarding-invites/generations` (list) and `?id=` (detail),
  plus `/api/admin/onboarding-invites/generation-hero?id=<generation>` for the
  private hero preview, require the verified Cloudflare Access administrator
  identity. The equivalent `/api/admin/generations` and
  `/api/admin/generation-hero` routes exist for direct use once Access covers
  them.

## Verification

- `npm run test:worker` covers ledger idempotency and rollups, ingestion auth
  and validation, hero bounds, and admin access.
- `npx vitest run tests/generation-cost-summary.test.ts` covers cost
  normalization and unreported handling.
- For a live check, send a `start` and a `complete` payload with the secret and
  open the Generations tab; the record, hero, and cost chips should appear.
