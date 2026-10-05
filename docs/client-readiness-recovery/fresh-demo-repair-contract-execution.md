# Bounded repair recovery execution evidence

## Shipped implementation

PR [#139](https://github.com/WrazyAI/launchloom/pull/139) merged final reviewed `02e7825` into `63f6f3e5e283e9210700b87865059bb18b14a0b3`. CI [37289640720](https://github.com/WrazyAI/launchloom/actions/runs/37289640720) passed 1,382 application tests, 111 Worker tests, all three full rendered recipe matrices, Astro/Worker checks and build. TestSprite `fc2f0be2-f68c-4c9c-88a7-45b297038c58` passed31/31 through both forms and final locality assertion; local synthetic server confirmed zero real deliveries.

Deployment [37291569893](https://github.com/WrazyAI/launchloom/actions/runs/37291569893) succeeded. Both Pages canonical production records identify `63f6f3e`; Worker version `a63086f8-1217-4c1f-a26e-c29cffdc6c1e` independently active at100%. Live platform/onboarding smoke passed1440/390 with HTTP200, no overflow/errors/mutating requests. API GETlead405. This proves the shared implementation, not client promotion or delivery.

## Single experiment: terminal before provider calls

| Fictional site | Approved run | Terminal result |
| --- | --- | --- |
| Velvet Fern Skin Studio,134 | [37292020140](https://github.com/WrazyAI/launchloom/actions/runs/37292020140) | Reuse manifest rejected before rendered repair. |
| Voltline Climate Works,135 | [37292028303](https://github.com/WrazyAI/launchloom/actions/runs/37292028303) | Reuse manifest rejected before rendered repair. |

Each was dispatched once with preview-only/internal-QA/reuse/experiment enabled. No rerun. Actual repair-provider calls0, actual client form submissions0, receiving-provider delivery unverified. Workflow failure notifications are separate from client test leads.

Both admitted sets matched original offline sources:20 authored files and3 image files each, canonical briefs and inspiration packs byte-identical. Asset-manifest differences were only historical generatedAt/reused metadata. The saved hero URI was then replaced by empty original intake `assets.photoOne` during transport enrichment. Exact before/after manifest differences are `values.hero.image` and its digest; refreshed lead token is intentionally outside that sealed contract. The unchanged validator correctly rejected. Pre-dispatch checks missed this workflow transformation. Private admitted snapshots remain intact.

## Deterministic correction

PR [#140](https://github.com/WrazyAI/launchloom/pull/140) adds `--preserve-assets true` during candidate reuse: leave asset/image bindings intact while refreshing transport tokens. Default/false normal intake behavior is unchanged. RED2/5 reproduced direct and actual-workflow binding loss; GREEN4files/32 tests. Complete reuse validation after corrected enrichment passes both real frozen sets, including historical root/route manifests, source/session/dossier bindings. Each contains2 candidates, not a complete3-candidate set. No provider call.

Independent focused review found no Critical/Important issues; the one Minor stale-status note is corrected here and in the plan. Final CI and deployment of this correction remain pending.

## Remaining scope

The failed private review branches now contain the empty hero binding. A future approved recovery must restore the exact admitted configuration/image bindings first, validate the complete enrichment/reuse path offline, then use the same capped calls and unchanged gates. No further recovery dispatch is part of this stopped experiment. Gate-passing client previews, desktop/mobile client acceptance, one real enquiry per site and correlated receiving-provider verification remain unfinished. Historical-client migration blockers remain separately recorded in `docs/seo-playbook-integration/existing-client-migration-readiness.md`. Nifty parent/delivery/migration stay open.
