# Operations run authorization

Status: implemented and tested locally. **Not enabled in production.** No
production credentials, database, workflow dispatch or deployment were used.

## Trust boundary

New-mode generation runs use a GitHub Actions OIDC token as the only caller
identity. `worker/src/operations/github-auth.ts` verifies the token signature
against GitHub's published key set at
`https://token.actions.githubusercontent.com/.well-known/jwks`, then requires all
of the following:

| Claim or condition | Required value |
| --- | --- |
| `iss` | `https://token.actions.githubusercontent.com` |
| `aud` | the deployment audience, default `launchloom-operations` |
| `repository` | `WrazyAI/launchloom` |
| `repository_id` | the configured immutable repository ID (`1352728020` verified on 2026-10-28) |
| `sub` | `repo:WrazyAI/launchloom:ref:refs/heads/main` |
| `workflow_ref` | `WrazyAI/launchloom/.github/workflows/generate-client.yml@refs/heads/main` |
| `job_workflow_ref` | absent or the same trusted workflow reference |
| `ref` / `ref_type` | `refs/heads/main` / `branch` |
| `event_name` | `workflow_dispatch` |
| `run_id` / `run_attempt` | positive numeric run identity |
| `iat`, `nbf`, `exp` | short-lived token, no less than 10 minutes old, not expired |

The run identity returned to the rest of the Worker is only
`{ repositoryId, runId, runAttempt }` from those verified claims. Body fields
such as `runId`, `repositoryId` or `runAttempt` are rejected, not trusted.
Unknown key IDs, malformed keys, network failures and unconfigured deployments
fail closed with no fallback to an earlier or unsigned identity.

## Required deployment settings

- `OPERATIONS_OIDC_AUDIENCE` - must equal the audience the workflow requests.
- `OPERATIONS_OIDC_REPOSITORY_ID` - the immutable repository ID above, not the
  repository name.
- `OPERATIONS_DATABASE_URL` - the isolated operations role, already required by
  the acceptance and dispatch paths.

The workflow reads optional repository variables
`LAUNCHLOOM_OPERATIONS_API_URL` and `OPERATIONS_OIDC_AUDIENCE`; neither carries a
secret. It obtains the short-lived token from the Actions OIDC endpoint, so no
static workload credential exists for an operator to copy or rotate.

## Endpoints

- `POST /api/internal/operations/claim` with `{ operationId, requestId?,
  attemptId? }`. The Worker calls `claim_run` with the verified identity and
  returns opaque IDs only. `claimed`, `duplicate` and `attention` are distinct;
  duplicate and attention responses contain no intake content.
- `GET /api/internal/operations/intakes/:id`. The database function returns the
  intake only when the same verified run owns the dispatched operation and the
  attempt is still running and confirmed. Unknown IDs and other runs receive
  `404` with no existence detail. Responses are `Cache-Control: no-store`.
- `POST /api/internal/operations/events` with sanitized event codes. The same
  identity predicate fences the write; a non-owner receives `attention`.

## Workflow ordering

The `generate` job mints an OIDC token and claims the operation as its first run
step after checkout, before dependency installation, intake retrieval, model
calls, private repository creation, Pages setup or deployment. A duplicate or
non-owning dispatch exits there. New mode retrieves the payload through the
Worker and writes it to a private temporary file; the client never prints the
payload. Legacy issue-driven dispatches keep their existing issue path and do
not request an OIDC token.

## Public log boundary

The LaunchLoom repository is public. New-mode `generate` steps run through
`scripts/private-run.sh`, which redirects every run-step stdout/stderr stream to
a mode-0600 ephemeral runner file, redirects `GITHUB_STEP_SUMMARY` to another
private file, and prints only `private_step=ok` or
`private_step=failed status=N`; both files are deleted immediately and are never
uploaded. Client values are not written to step outputs, environment variables
or substituted script text. `::add-mask::` lines are swallowed with stdout in new
mode and are not relied on as a privacy control. Review and repair capabilities are stored in private
runner files. The public launch-history record receives a sanitized business
object containing only a generic label; pack, fingerprint and route rotation
identity are preserved. Legacy runs pass through the original shell behavior.

## Activation boundary

Enabling new-mode dispatch still requires all of the following, none of which
this task performs:

1. Apply migrations `001` through `004` to a confirmed non-production target.
2. Set the three deployment settings above in a staging environment.
3. Obtain one real non-production workflow token and verify a claim plus intake
   read without printing the token or payload.
4. Complete the reconciliation and terminal evidence work before any client
   generation is enabled.
5. Obtain separate explicit authorization for production activation.

Until then `OPERATIONS_DISPATCH_MODE`, `OPERATIONS_CLAIM_GATE` and
`OPERATIONS_INTAKE_MODE` remain disabled.
