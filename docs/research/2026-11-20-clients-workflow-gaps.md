# Clients workflow gaps

The Clients directory is a triage view, not a mirror of the GitHub Actions job graph. It shows the latest production-profile generation for the latest intake in a grouped row. Older intakes, reruns, and focused diagnostic profiles remain available. The most recent run can fail while an earlier verified site stays available.

| Priority | Gap | Next change |
| --- | --- | --- |
| 1 | The desktop graph now shows reconciled pass, fail, skip, and cancellation for allowlisted generation steps. Early job failures and expired step metadata can still lack a stage result. | Add coverage deliberately when workflow names change; preserve “not recorded” when no exact step evidence exists. |
| 2 | Known step failures now have a stable error code and a bounded diagnostic line constructed from the step label and conclusion. That identifies the step, not the root cause inside its runner output. | Emit richer, structured reason codes at the failing producer when there is a safe, actionable detail to share. Raw GitHub logs remain in GitHub. |
| 3 | The current Clients read model is backed by the legacy generation ledger. The stage recorder sends operations-identified events to the separate Operations path. The Clients graph does not merge those runs. Updates are on demand, not live. | Define a client-to-operation read projection before expanding traffic to that path. Then reuse the activity feed to update an open active run, with the last report time visible. Do not match by business name alone. |
| 4 | A green GitHub conclusion is not proof that a verified preview was delivered. The existing success-rate report groups by requested renderer, which can hide fallbacks. | Measure verified preview delivery separately from execution success. Report both requested and effective renderer, fallback reason, and preview/publication outcomes. |

**Verification snapshot, 2026-11-20:** the opening 100-run sample showed 23 workflow successes: 3/59 creative and 20/41 pack. This is workflow telemetry, not a preview-ready rate or evidence that the generation freeze has lifted.

References: [generation workflow](../../.github/workflows/generate-client.yml), [stage recorder](../../scripts/record-generation-stage.mjs), [generation tracking](../generation-tracking.md), and the [prior dossier and renderer audit](2026-11-19-dossier-coverage-and-renderer-audit.md).
