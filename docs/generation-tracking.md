# Generation tracking

The admin dashboard at `/admin/onboarding-invites` has two tabs:

- **Generations** tracks each client generation run: business, client email,
  status, preview and production links, hero screenshot, per-stage provider
  cost, and an event timeline.
- **Invitations** keeps the original private invite create and revoke flows.

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

## Setup

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
