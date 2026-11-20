# Clients workflow gaps

The Clients directory is a triage view, not a mirror of the GitHub Actions job graph. It shows the latest production-profile generation for the latest intake in a grouped row. Older intakes, reruns, and focused diagnostic profiles remain available. The most recent run can fail while an earlier verified site stays available.

| Priority | Gap | Next change |
| --- | --- | --- |
| 1 | Stage coverage is incomplete. Many steps only report completion, and events are best-effort. A failed or cancelled run can leave a stage with a start and no result. Older runs may have no stage events at all. | Define an ordered stage plan per renderer. Emit explicit terminal outcomes, including conditional skips and cancellations. Reconcile missing outcomes without marking unobserved work as passed. |
| 2 | In-dashboard diagnostics are limited to the recorded failure category, summary, next step, and stage details. GitHub-only failures may still have no actionable detail inside Clients. | Attach a stable error code and a bounded, redacted log excerpt to each terminal failure. Keep full logs out of the directory response. |
| 3 | The current Clients read model is backed by the legacy generation ledger. The stage recorder sends operations-identified events to the separate Operations path. The Clients strip is not a complete picture of that path. Updates are on demand, not live. | Define a client-to-operation read projection before expanding traffic to that path. Then reuse the activity feed to update an open active run, with the last report time visible. Do not match by business name alone. |
| 4 | A green GitHub conclusion is not proof that a verified preview was delivered. The existing success-rate report groups by requested renderer, which can hide fallbacks. | Measure verified preview delivery separately from execution success. Report both requested and effective renderer, fallback reason, and preview/publication outcomes. |

**Verification snapshot, 2026-11-20:** the opening 100-run sample showed 23 workflow successes: 3/59 creative and 20/41 pack. This is workflow telemetry, not a preview-ready rate or evidence that the generation freeze has lifted.

References: [generation workflow](../../.github/workflows/generate-client.yml), [stage recorder](../../scripts/record-generation-stage.mjs), [generation tracking](../generation-tracking.md), and the [prior dossier and renderer audit](2026-11-19-dossier-coverage-and-renderer-audit.md).
