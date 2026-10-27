# Operations dispatch and recovery

## Activation is not authorized

This implementation is disabled unless **both** `OPERATIONS_DISPATCH_MODE=claim-gated-v1`
and `OPERATIONS_CLAIM_GATE=verified-v1` are explicitly configured. Neither is enabled
in the root Worker configuration. There is **no production cron**. Do not enable,
deploy, run production migrations, or dispatch real generation as part of this task.

The `operations-dispatch-local` Wrangler environment records a one-minute UTC cron
(`* * * * *`) for local simulation only. It has no route, no public workers.dev
endpoint, no database binding/credential and disabled flags. **Never deploy this
environment.** A production schedule and target need separate approval after the
Task 4 authenticated workflow claim gate is implemented and verified end to end.

The eventual target must explicitly supply `OPERATIONS_DISPATCH_REPOSITORY`,
`OPERATIONS_DISPATCH_WORKFLOW`, `OPERATIONS_DISPATCH_REF`, the isolated operations
database connection, and a suitably scoped dispatch credential. There is no
fallback to the existing generation workflow or a guessed repository/ref. The
claim adapter must verify the expected repository ID, workflow/ref, audience,
expiry and operation/attempt ownership. IDs are not bearer credentials. A flag
asserts readiness; it cannot prove that the remote workflow contains a claim gate.

## Durable scheduling

Apply `001-operations.sql`, `002-acceptance-recovery.sql`, then `003-dispatch.sql`
only to an approved isolated fixture/staging target as its schema owner. Migration
003 grants only function execution to the pre-existing operations service role;
it provisions no login and gives workflows no direct database access.

Each tick handles at most ten entries. Each lease is a separate committed SQL
statement using `FOR UPDATE SKIP LOCKED`, explicit confirmed-intake eligibility,
and a monotonically increasing fence. The GitHub request runs **outside** the
database transaction with a 15-second timeout and no redirect following. A sender
lease lasts two minutes. The result writer checks both fence and lease expiry.
Claim election also increments the fence so a late sender cannot overwrite a
running owner's state. A database failure stops the tick, rather than sending
more work whose result cannot be persisted.

GitHub 200/204 records dispatch acceptance, **not** execution ownership or
success. The API is pinned to `2026-03-10`, whose 200 response supplies run
details; legacy 204 is accepted too. Response bodies are deliberately not
projected as owner identity: only a trusted workflow claim can elect the owner.
Only operation/request/attempt IDs are sent, never the intake payload.
No run ID is fabricated from a response that does not provide one. A first
authenticated claim binds the numeric GitHub repository ID, run ID and run
attempt; `workflow_repository` currently stores that repository **ID**, despite
its historical column name. The attempt remains waiting until that claim.

## Retry versus unknown

- HTTP 429 is an explicit non-acceptance: retain `waiting_to_start` and retry
  durably after 60, 120, 240, 480, 960, 1920, then 3600 seconds. The eighth
  rate-limited send goes to `attention` (`dispatch_retries_exhausted`).
- HTTP 400/401/403/404/422 goes to attention (`dispatch_rejected`): fix the
  configuration/authorization through a reviewed recovery, not an endless loop.
- Network failure, timeout, unexpected response or HTTP 5xx is ambiguous. Even a
  5xx can follow acceptance. Record `dispatch_unknown`, preserve the unbound run
  identity and go to attention. **Never automatically redispatch.**
- A crashed sender's expired lease becomes attention (`dispatch_lease_expired`)
  on a later cron tick. An accepted dispatch without a claim after ten minutes
  becomes attention (`run_claim_missing`). Each sweep locks at most fifty rows.
- A response lost after acceptance can still yield a first legitimate claim
  from those three specific unknown-dispatch attention states. This is not
  ownership transfer: the attempt must still be waiting and never owned.

This deliberately conservative first release does not automatically resume an
ambiguous outage, even after GitHub recovers. Only proven non-acceptance (429)
retries automatically. Improving recovery from 5xx/timeouts requires Task 5's
trusted run correlation and side-effect reconciliation, not assuming a failed
HTTP response means no run exists. Unknown is visible as attention, not success.

## Ownership and operator recovery

`claimRun` is a one-time election. Exactly one caller gets `claimed`; all other
runs, including a replay of the same run or a GitHub rerun attempt, get
`duplicate` and **must exit before any intake read or external side effect**.
An attempt marked attention for unknown prior side effects returns `attention`.
There is no lease-expiry takeover and no API here that clears/reassigns an owner.
One trusted run identity cannot own two operations.

A lost claim response also fails closed: retrying the election cannot give a
second permission to execute. The workflow must stop and escalate, not retry
side effects. Task 4 must implement this gate before intake retrieval, model
calls, repository/Pages creation or deployment, and fence all later callbacks
to the elected identity. Task 5 must reconcile missing/expired owners; this task
does not infer liveness or undo external effects.

For attention, an authorized operator must check GitHub run identity/status and
the actual external-effect evidence. Record actor, timestamp and evidence before
any reviewed resolution. Do not clear state or use a generic retry button while
liveness or effects are unknown. No such resolution mutation is implemented here.

## Local verification

Worker boundary tests (including the actual exported scheduled handler) run with:

```sh
npx vitest run --config vitest.worker.config.ts worker/test/operations-dispatch.test.ts
npm run check:worker
```

Real SQL tests require an **already disposable loopback**
`launchloom_operations_test[_suffix]` database with all three migrations and the
operations service role. Set `OPERATIONS_TEST_DISPOSABLE=1` and the private
`OPERATIONS_TEST_DATABASE_URL` in the test process environment, then run:

```sh
npx vitest run tests/operations-dispatch-postgres.test.ts
```

These tests use `psql` and service-role SQL for application calls. Assertions
cover locks/fences, retained confirmed state, fresh scheduled-handler store
instances after a quiet period, concurrent run claims, unknown outcomes and
bounded backoff. The restart proof reconstructs application stores on the same
persistent test database; it is a **simulated Worker restart**, not an actual
Cloudflare deployment/process eviction. The Neon HTTP transport and GitHub API
are synthetic in that test. Live OIDC/workflow, browser, deployment and production
verification remain separate gates.
