# Generation activity

Observe-only diagnostic activity for a running generation. It answers "what is
happening right now?" without becoming a second source of truth for lifecycle,
delivery, cost or promotion.

## Scope

- V1 is **observe-only**. There is no pause, cancel, steering, approval or retry
  control. No new top-level dashboard surface.
- Activity lives inside the existing attempt inspector for legacy attempts and
  inside the operation detail panel for Postgres-backed operations.
- Diagnostic trace failures never change a generation outcome, and the trace is
  never used to decide whether a generation succeeded.
- The current model transport is non-streaming. The inspector records a dispatch
  immediately and shows "Waiting for the provider response". Visible output and
  reported usage appear when the response completes. This is not token
  streaming, and no UI animation implies otherwise.
- Private model reasoning is never recorded. Reasoning token counts are usage
  metadata only.

## Enablement

The feature is additive and off by default.

| Setting | Where | Effect |
| --- | --- | --- |
| `GENERATION_ACTIVITY_ENABLED=true` | Worker variable and workflow variable | Enables ingest, read capability and scheduled retention. |
| `OPERATIONS_DATABASE_URL` | Existing Worker secret | Required; trace tables live in the existing operations schema. |
| Migration `db/operations/008-generation-activity.sql` | Applied by the trusted schema owner | Creates the trace tables and privileged functions. |

The workflow reads the same variable into every generation job. If it is absent
or false, producers are no-ops and the inspector states that detailed activity is
not enabled.

Rollout order:

1. Apply `008-generation-activity.sql` as the trusted schema owner. The existing
   isolated `launchloom_operations_worker` role receives execute rights on the
   append, read and prune functions only. No table access is granted.
2. Set `GENERATION_ACTIVITY_ENABLED=true` for the Worker and the repository.
3. Run a normal, separately authorized generation and verify the live inspector.
4. Disable by removing the variable. Existing trace rows remain until retention
   removes them; the inspector reports that activity is not enabled.

Do not apply the migration or enable the flag merely to test the UI. A skipped
PostgreSQL suite is not database proof.

## What is recorded

Each event has an explicit identity namespace (`legacy` or `operations`), the
canonical attempt ID, a producer task context, a monotonic producer sequence, a
stable event ID, emitted and received times, and one allowlisted payload.

| Event | Meaning |
| --- | --- |
| `model_started` / `model_finished` | A real dispatch to a provider and its normalized terminal status. |
| `output` | Visible text returned by the model, after scrubbing. |
| `usage` | Provider-reported token and cost data for that dispatch, deduplicated by local call ID. |
| `action_started` / `action_finished` | A real orchestration action such as candidate authoring or rendering. |
| `task_started` / `task_finished` | A labelled unit of pipeline work. |
| `retry` | A bounded retry decision with its scope and attempt number. |
| `error` | A sanitized failure code and message. |
| `coverage` | Whether a boundary is instrumented, limited, unsupported or not applicable. |
| `heartbeat` | Producer liveness, not generation progress. |
| `producer_finished` | A producer stopped. Only `run_finalizer` closes the whole recording. |

`data/generation-activity-coverage.json` is the reviewed boundary inventory.
Model calls through `scripts/generation-inference.mjs`, creative authoring and
the run finalizer are instrumented. Several callers and scripts remain listed as
limited or unsupported, and the UI must not claim full coverage. Provider-internal
actions and GitHub queue time cannot be observed.

Distinguish **model-requested tool calls** from **pipeline actions**. The
generation pipeline is script-orchestrated; a script writing a generated file is
an action, not a model tool call. Provider-hosted tool execution is unsupported.

## Privacy

- Payloads are flat and allowlisted; free text is bounded and scrubbed before it
  reaches the spool, network or storage.
- Known secret values from the runner environment and any caller-supplied private
  values are removed by exact match before truncation, so a credential spanning
  the truncation boundary cannot leak a prefix. The site-config and authoring
  steps add the intake business phone, email and address as exact private values
  before model text is emitted.
- Contact-shaped values in failures and labels are replaced with
  `(email redacted)` / `(phone redacted)`. Public business contact copy in model
  output is retained for review, because that copy is intended for the site.
- Provider credentials, authorization headers, environment dumps, raw prompts,
  private intake contact fields, invitation/session/review tokens and private
  reasoning are not stored.
- URLs are removed unless they are known GitHub evidence links. Unsupported
  content is withheld with a reason rather than dumped.
- The browser renders every value as text. Markup in model output is never
  executed.

## Transport and limits

Producers flush every second or at 20 events, with a 3s delivery deadline and at
most two retries for transient failures. Authentication/validation rejections
(400/401/403/404) are not retried and never fall back to another channel.

| Limit | Value |
| --- | --- |
| Queue per producer | 1 MiB |
| Batch | 128 KiB / 100 events |
| Event | 16 KiB |
| Text payload | 8 KiB |
| Events per attempt | 10,000, reserving 32 metadata/control slots |
| Retained content per attempt | 10 MiB |
| Diagnostic retention | 30 days |
| Producer close ceiling | 10 seconds |

At the content limit, verbose events stop and a `trace.capacity` coverage entry is
recorded. Control evidence (errors, coverage, heartbeats, terminal events) keeps
its reserved capacity. Reasons are explicit; nothing silently pretends the trace
is complete.

Ingest derives the run identity from the GitHub Actions OIDC token. There is no
shared-secret fallback. Operations traces are additionally fenced by the
persisted workflow run binding; legacy traces require the attempt to already exist
and match the same verified run. An unknown attempt is denied, never created.

## Retention

`pruneGenerationActivity` runs from the existing scheduled reconciliation, at most
five batches of 100 expired traces per invocation. It deletes only trace rows,
their coverage and usage rows, and leaves a content-free `activity_expired`
tombstone. Lifecycle, cost, intake and accounting rows are never touched by
retention. A pruning failure is logged (`generation_activity_prune=failed`) and
never blocks reconciliation.

## Reading the inspector

- **Stage chips** follow the stages that actually emitted activity. They do not
  invent a linear percentage, and a later stage can run in parallel.
- **Feed rows** merge one model call or action into a single row. An unpaired
  start stays visibly "running" and is never shown as success.
- **Evidence** shows the call's start, terminal status, visible output, usage,
  sanitized error and context. Times are UTC.
- **Usage** is response-level and provider-reported. Unknown stays "Unknown";
  zero stays zero. Cost is labelled actual, estimated or unreported.
- **Follow** pauses while you read older rows and resumes with "Jump to latest".
- **Heartbeat warnings** appear after 30s and 60s of producer silence while the
  recording state is still `recording`. Silence is not a generation verdict.
- Historical states are distinct: `not_recorded` means the run predates the
  feature or never emitted, `expired` means retention removed the content, and
  `incomplete` means the finalizer reported an incomplete recording.

## Verification

Local proof without paid calls:

```bash
# Disposable loopback PostgreSQL required for the real SQL tests.
OPERATIONS_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:45723/launchloom_operations_test \
OPERATIONS_TEST_DISPOSABLE=1 npx vitest run tests/generation-activity-postgres.test.ts
OPERATIONS_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:45723/launchloom_operations_test \
OPERATIONS_TEST_DISPOSABLE=1 npx vitest run tests/generation-activity-e2e.test.ts

npx vitest run tests/admin-workspace-browser.test.ts -t "(activity|model calls)"
```

The end-to-end suite drives the real producer through signed ingest, the real
SQL store and the authorized read route. The browser suite serves the built admin
bundle with a synthetic trace and checks model/action/error rows, evidence,
filters, historical states and 390px layout. It does not perform a paid
generation.

A green local run is not production proof. Live proof requires a separately
authorized ordinary generation entered through the admin invitation and client
intake, observed during a model call and at completion, then reloaded to confirm
retained replay.
