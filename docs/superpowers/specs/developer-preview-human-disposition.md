# Developer Preview Human Disposition

## Goal

Let a developer review a safe diagnostic preview that missed automated visual or design-quality gates, then either accept it as the working baseline with feedback or explicitly override those gates and send that exact version to the client.

## Behavior

- A preview is eligible only when the existing diagnostic-preparation and rendered diagnostic checks pass. A hard source/build/safety failure still produces no send-to-client control.
- Failed visual/reference/diversity quality results remain unchanged in their machine reports. A developer decision is recorded separately as a human disposition bound to the exact repository, PR, head SHA, creative candidate, review session, and reviewer.
- The diagnostic preview has a clearly visible field-preview banner with separate feedback and send-anyway actions. The send-anyway action requires an explicit second confirmation.
- The developer email includes a clearly warned send-anyway action only when a safe diagnostic preview and valid signed review link exist. The email action opens the preview; it never publishes directly.
- Feedback records the candidate as a human-accepted working baseline and enters the existing developer revision queue. Feedback alone does not publish or email the client.
- Send-anyway may override visual/reference/design-quality gates only. Exact-head, signed developer identity, queue, SEO publication readiness, build, asset, form, content-integrity, and security checks remain enforced.
- The override is auditable and idempotent. It does not rewrite `promotionReady`, erase findings, or label the automated visual gate as passed.
- The review panel renders critical/major findings as red severity pills, minor findings as amber pills, and informational findings as neutral pills. Each pill keeps its textual severity label.

## Acceptance criteria

1. A diagnostic preview without a valid signed review token shows no review controls; with a valid token for that exact preview it shows the field-preview banner.
2. The email exposes the not-recommended action only when its URL is present; the text version includes the same destination and warning.
3. Feedback from an eligible diagnostic preview requires the invited developer email, is durable, queues the existing revision flow, and does not dispatch publication.
4. Send-anyway requires explicit confirmation, rejects stale/mismatched/unsafe sessions and active or halted revision queues, checks SEO readiness, records an auditable override, and dispatches the existing publication path for the exact reviewed commit.
5. Repeated/concurrent override submissions cannot create duplicate publication dispatches.
6. Findings have accessible severity labels and distinct semantic styling.
7. Existing passing-preview approval, client feedback, and one-time repair behavior remain intact.
