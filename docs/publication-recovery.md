# Ordered publication and recovery

Publication is coordinated by the existing per-client RevisionCoordinator
Durable Object, keyed by lowercase repository name. Its additive `publications`
SQLite table binds an operation UUID to repository, reviewed PR and reviewed
head SHA. Approval returns the existing operation on identical retries.

The operation moves through `reserved`, `queued`, `running`, `published`,
`failed` and `attention`. Active or unresolved failed revisions prevent a new
publication. A reserved publication owns a bounded merge lease; duplicate
approvals cannot merge concurrently. A lost merge response retains that
reservation. Its alarm reads the exact PR and main ref, and dispatches only
when the reviewed head owns the current merged commit. An unconfirmed or
superseded merge requires attention. The alarm never merges a PR itself.

Dispatch uses a durable outbox and bounded leases. An ambiguous dispatch may
be sent again; only one workflow can claim the operation. Both revision
workflows and publication share `site-revision-<repository>` concurrency with
cancellation disabled. The Durable Object owns ordering; GitHub scheduling
order does not provide that guarantee.

Before upload, publication checks the current main commit and renews its
ownership check. Direct uploads target the main branch and carry
`LaunchLoom publication <operation UUID>` as their commit message. Recovery
paginates Cloudflare deployments and matches this marker plus the exact
commit and production environment. It refuses a matching deployment that a
newer production deployment superseded. This uses the Pages project API’s
`canonical_deployment` field, which identifies the current production deployment. A crash after upload therefore
recovers the original deployment instead of uploading again. The recorded
Pages ID, public origin and commit are immutable.

Local contrast, SEO and route gates still run before upload. Destination route
verification must succeed before the workflow marks publication complete. The
reviewed source is not rewritten. Developer visual overrides use the same
publication operation while retaining their explicit decision audit and gates.

Client delivery is a separate durable email outbox. The workflow renders the
existing lifecycle email to a private envelope and queues it after deployment
verification. Email retries use one stable provider idempotency key, preserve
the envelope and never redeploy. Each provider call has a bounded timeout.
Successful delivery is retained and never sent again. Automatic retries stop
before [Resend's 24-hour idempotency window](https://resend.com/docs/dashboard/emails/idempotency-keys) expires; an unknown result
then requires provider reconciliation. `published` means the verified site is
live; `deliveryState` records pending, sending, sent or attention separately.

Feedback received during publication remains queued with its original review
SHA, stage, page and comment. Multiple requests are retained. Successful
publication records their base commit atomically before releasing them in
order. Requests against a merged PR are accepted only while the matching
publication still owns that client. A failed publication pauses the queue.
A publication retry never discards queued feedback.

## Operator actions

Use the authenticated `/api/internal/publications` endpoint through
`scripts/publication-client.mjs`. Keep its secret in the existing secret
binding; do not put signed review links, email envelopes or credentials into
public logs. Required environment variables are `CLIENT_REPO`,
`PUBLICATION_ID`, `REVISION_COORDINATOR_SECRET` and `PUBLICATION_ACTION`.
`status` reads the operation. Inspect its workflow and provider deployment
before recovery. `retry` queues a known approved commit again only for the
latest unresolved operation. A reservation with no confirmed merge must be
reconciled by retrying its exact signed approval link. `dismiss` explicitly
abandons a failed/attention operation and releases preserved feedback. Never
dismiss an operation whose upload is still executing.

Workflow callbacks (`claim`, `authorize-upload`, `uploaded`, `published`,
`fail`) include the workflow run and attempt identity. A callback from an old
workflow cannot overwrite a newer owner. An upload callback includes its
recorded deployment; completion includes the private rendered delivery
envelope. Repeated completion does not reset successful delivery.

Existing published sites remain served. Legacy dispatches without an operation
ID cannot claim the upgraded workflow. Recover those through exact-version
approval after checking whether their older workflow already published;
never adopt a historical deployment based only on a public commit hash.
