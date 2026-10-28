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

Automatic retry depends on what the response proved, never on an assumption
that a missing response means no run exists.

- HTTP 429 is an explicit non-acceptance: retain `waiting_to_start` and retry
  durably after 60, 120, 240, 480, 960, 1920, then 3600 seconds. The eighth
  rate-limited send goes to `attention` (`dispatch_retries_exhausted`). A 429
  never elects a run: `claimRun` rejects a pending entry that has only a
  `github_rate_limited` history.
- A rate-limited HTTP 403 is recognized only from safe headers: a
  `x-ratelimit-remaining: 0` count, a `retry-after` delay, or GitHub's secondary
  limit form. The delay is parsed from seconds, an HTTP date, or
  `x-ratelimit-reset`, clamped to 1..3600 seconds. Malformed or absent values
  fall back to the persisted exponential backoff. An ordinary 403 with a
  non-zero remaining count remains `attention` (`dispatch_rejected`); it is an
  authorization/configuration failure, not a temporary limit.
- HTTP 400/401/404/422 goes to attention (`dispatch_rejected`): fix the
  configuration through a reviewed recovery, not an endless loop.
- Network failure, timeout, unexpected response or HTTP 5xx is ambiguous. Even a
  5xx can follow acceptance. **Outside the verified gate** it records
  `dispatch_unknown` and goes to attention, and is never automatically
  redispatched.
- **Inside the verified gate only** (`OPERATIONS_DISPATCH_MODE=claim-gated-v1`
  and `OPERATIONS_CLAIM_GATE=verified-v1`) an ambiguous result or a crashed
  sender lease is re-queued as `waiting_to_start` with the same stable
  operation ID and a new fence. The retry uses the same bounded 60, 120, 240,
  480, 960, 1920, then 3600 second backoff. A gated replay is marked durably
  (`uncertain_replay`) so a genuine run from the earlier ambiguous send can win
  the atomic claim during backoff. After eight attempts the entry becomes
  visible `attention` (`dispatch_unknown` for an ambiguous send,
  `dispatch_retries_exhausted` for a limit); it never loops forever or hides
  the terminal state.
- The gate is what makes a duplicate dispatch safe: the workflow calls
  `claimRun` before any side effect, exactly one run becomes `claimed`, and all
  duplicates exit. Until Task 4 implements and independently verifies that
  pre-effect gate, both flags stay disabled and the conservative attention path
  above applies.
- A crashed sender's expired lease becomes `attention`
  (`dispatch_lease_expired`) outside the gate. Inside the gate it is requeued
  for automatic recovery, bounded as above. An accepted dispatch without a
  claim after ten minutes remains `attention` (`run_claim_missing`); that is an
  accepted run with unknown liveness, not an uncertain send, so it is not
  auto-replayed. Each sweep locks at most fifty rows.
- A response lost after acceptance can still yield a first legitimate claim
  from those three specific unknown-dispatch attention states. This is not
  ownership transfer: the attempt must still be waiting and never owned.
  Same-run replay and rerun attempts receive `duplicate`; an attempt marked
  attention for unknown side effects receives `attention`.

## Ownership and operator recovery

`claimRun` is a one-time election. Exactly one caller gets `claimed`; all other
runs, including a replay of the same run or a GitHub rerun attempt, get
`duplicate` and **must exit before any intake read or external side effect**.
An attempt marked attention for unknown prior side effects returns `attention`.
A claimed/running attempt is never taken over: its run ID is already bound, so a
lease expiry or a late sender cannot replace it. The only additional claimable
pre-owner state is a gated uncertain replay (`pending` plus `uncertain_replay`),
where a real run from the ambiguous send may still be the first owner. One
trusted run identity cannot own two operations.

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
bounded backoff. They also exercise an outage followed by recovery, a lost
accepted response with a duplicate job, a crashed sender lease, exact retry
exhaustion, and the rule that a claimed/running attempt is never re-leased or
repeated. The restart proof reconstructs application stores on the same
persistent test database; it is a **simulated Worker restart**, not an actual
Cloudflare deployment/process eviction. The Neon HTTP transport and GitHub API
are synthetic in that test. Live OIDC/workflow, browser, deployment and production
verification remain separate gates.
