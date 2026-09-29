# Branch reconciliation, 2026-09-29

This records how the requested branch tips were incorporated into `main`. A
branch being left open does not mean its old commits should be replayed.

| Requested branch | Disposition |
| --- | --- |
| `feat/complete-client-intake-seo-pipeline` | PR #68 merged into the onboarding branch, then PR #66 brought it to `main`. |
| `feat/simplify-client-onboarding` | PR #66 merged into `main`. |
| `fix/client-intake-refinements` | The remote is named `fix/client-intake-refinements-20260926`; PR #71 merged into `main`. |
| `feat/local-intake-matches-online-form` | PR #72 merged into `main`. |
| `fix/lead-email-delivery-20260929` | PR #77 merged into `main`; failed delivery returns HTTP 503 rather than a success receipt. |
| `fix/diagnostic-preview-link-mainline` | PR #75 merged into `main`; the browser verifier and developer-preview contract were reconciled with the dirty checkout. |
| `feat/reference-library-v2-30` | PR #65 merged into `main` with 84 selectable references across 14 niches. Its PR title reflects an earlier 30-reference stage. |
| Local `feat/pr65-reference-replacement-30` | Superseded by PR #65's larger dossier library. Its prompt-context deduplication and bounded repair response behavior were already present in PR #65; its older 30-reference inventory was not replayed. |
| Local `codex/global-aesthetic-preference` | The aesthetic design spec, FAL documentation, and compatible reference capture/archive tooling are retained. The unimplemented preference policy remains a future task. Its older broad pipeline rewrite was not merged: a trial integration produced duplicate declarations and 131 failing tests against the newer reference and workflow contracts. |

The dirty main checkout was backed up before integration and left untouched.
Its two dossiers absent from PR #65, Grlica Law and Khufu's, were added to the
archive with `productionEligible: false` because their own reviews record
visual or mobile-reference defects. The 84-reference production selector was
not reduced. Requester attestations remain explicitly unverified by a source
owner and apply only to internal reference use.

The reference library intentionally fails closed for unsupported niches. The
fixture suite now records the broad wellness example as a coverage rejection;
it continues rendering and checking supported business examples. A new
accounting fallback mapping preserves that specific reference niche while
using its reviewed advisory image.
