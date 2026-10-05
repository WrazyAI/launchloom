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

Independent focused review found no Critical/Important issues; the one Minor stale-status note is corrected here and in the plan. Final CI `37293418355` passed1,387 application tests,111 Worker tests, all three rendered recipe matrices, Astro/Worker checks and build on reviewed `f1830b4`. PR#140 merged into `bafedf95416f9be5de349bcb4133098478d4def4`; deployment `37295178289` succeeded. Both Pages production records identify that source; Worker `f7960b70-2c6a-40d0-a13f-628bc670cb42` independently active100%. Live platform/onboarding1440/390 smoke passed. Follow-up TestSprite `66cc62f8-2e35-4852-a719-00c1e59119aa` passed20/20, final trace covering both form cycles and locality; fake-provider readback realDeliveries0.

## Explicitly approved resumption: terminal numeric-budget rejection

The user reviewed the correction and offline one-field restorations and answered “Resume after verified deployment.” Both private hero references were restored after deployment, with current transport tokens retained. Exact config readback and all frozen source/image/reference hashes passed. The complete reuse validator passed both sets; no new initial authoring, SEO or image-generation calls.

| Site | Resumed run | Actual completion fetches | Exact rejection |
| --- | --- | --- | --- |
| Velvet Fern,134 | [37295716396](https://github.com/WrazyAI/launchloom/actions/runs/37295716396) |1 on candidate-b |6 edits; one styles replacement7,086 characters exceeds6,000. Total original-plus-replacement28,123 also exceeds24,000. |
| Voltline,135 | [37295724468](https://github.com/WrazyAI/launchloom/actions/runs/37295724468) |1 on candidate-c |9 edits; all replacements individually within6,000, but total original-plus-replacement35,412 exceeds24,000. |

Both stopped immediately on the first rejected response. No rerun. Total2 actual repair fetches, within the approved4-fetch experiment ceiling. Private `qa-provider-calls.json` confirms counts; rejection payloads were retained without truncation and SHA256 verified. Every returned span ID is valid against the admitted source. All20 authored files per site remain byte-identical after rejection. Both responses passed exact-source selection, but numeric budget feasibility still depended on prose. No candidate promoted; no real client form enquiry or receiving-provider verification. Failure-notification emails are separate from form leads.

## Proposed budget follow-up specification

The doubtful assumption is that valid source IDs plus prose numeric limits reliably produce a patch within the global budget. Current span response schema specifies IDs/types but no replacement length or edit-count bounds. [OpenRouter's primary guidance](https://github.com/openrouterteam/docs/blob/main/guides/features/structured-outputs.mdx) says strict enforcement varies by endpoint and not every JSON Schema keyword is universally supported. [Provider routing](https://github.com/openrouterteam/docs/blob/main/guides/routing/provider-selection.mdx) recommends `require_parameters:true` to filter endpoints supporting the supplied parameters; this does not prove every string-length keyword or rendered result.

The smallest proposed trial is a conservative request budget for the opt-in experiment only. LetF be the largest trusted find-window length, R=6,000, and K=min(12,floor(24,000/(F+R))). Request1..K edits and advertise replacement length bounds; continue measuring actual UTF16 code units with the unchanged compiler/literal/source guards. Once the existing per-fragment bounds pass, even the largest allowed K edits fit the total budget. Do not claim schema compliance guarantees JavaScript string length or provider support. Unsupported routing/schema must fail closed, without an unbounded retry or fallback.

Actual catalog profiles:134a F1,999/K3/worst23,997;134b F3,491/K2/worst18,982;135b F2,000/K3/worst24,000;135c F3,129/K2/worst18,258. This reduces each request's edit capacity; it may not fix enough findings in one cycle. Complete source/dossier/constraint/measurement context and all rendered/contrast/reference/promotion gates remain mandatory. Normal automatic and human-feedback behavior stay unchanged until separately validated for broader adoption.

Original hard limits remain1–12 edits,6,000 per find/replacement,24,000 total,80,000 per full file and400,000 textual prompt. Same fictional identities, recipients, assets, source baselines and reference cohorts. A future approved experiment remains one cycle, one actual completion fetch per candidate,two/site,four total including failed fetches/retries; stop on any rejection. Success counts must also be committed into private client evidence, including explicit zero-call runs. No public payload/artifact upload. The [three-stage follow-up plan](fresh-demo-repair-budget-plan-2.md) is implemented and shipped through PR141 and the opt-in routing correction PR142. Its single approved experiment stopped at provider routing; actual client readiness remains unfinished.

## Remaining scope

Gate-passing client previews, desktop/mobile client acceptance, one real enquiry per site and correlated receiving-provider verification remain unfinished. The two stopped experiment pairs remain distinct; the newly approved budget experiment may proceed once the implementation is verified deployed. Historical-client migration blockers remain separately recorded in `docs/seo-playbook-integration/existing-client-migration-readiness.md`. Nifty parent/delivery/migration stay open.


## Approved budget experiment terminal result and routing correction

Budget implementation PR141 shipped as91ca6155ce9e0dc3ff8bfbecc447ebaa814f27aa. Final CI37308549834 passed1407 application tests,111 Worker tests,three rendered recipe matrices,Astro/check/build. Deployment37310536533 passed; both production Pages report91ca615 and Worker03d5cf26-dbc4-442a-a9e9-325839d65208 is100%. Live1440/390 platform/onboarding passed; API GETlead405. TestSprite10fd6198 passed20/20 synthetic native/authored503→200 and Testville FAQ checks with0realDeliveries.

The single newly approved pair ran once:134run37311100809,135run37311108980. Both stopped before any model response with OpenRouter HTTP404, `failed_routing_step: Filter by Parameters`. Exact private receipts each report1candidate-b fetch,2total across both runs. Both512-character raw error payloads are retained privately, untruncated and SHA256verified. No new dispatch, retry or actual enquiry. Unused capacity is not a fresh experiment allowance.

Live [Luna endpoint metadata](https://openrouter.ai/api/v1/models/openai/gpt-6-luna/endpoints) advertises7endpoints and no temperature support. The existing request still supplied temperature0.35 alongside the new required parameter-support filter, which excludes every advertised endpoint. [Primary routing guidance](https://openrouter.ai/docs/guides/routing/provider-selection) confirms unsupported parameters are excluded under require_parameters. This is a request compatibility defect, not evidence the numeric schema failed.

The bounded correction omits optional temperature only for the opt-in budget request; ordinary automatic and scoped-human requests retain0.35. Frozen reasoning, full source/dossier/measurement context, cache hints, token limits, provider.require_parameters, structured-output bounds and every local/rendered/promotion gate stay present. The new routing behavior is verified offline; actual provider acceptance requires a separately approved new experiment. No live provider success is claimed by the correction.

Client promotion, actual desktop/mobile client acceptance, labelled real enquiries and correlated receiving-provider delivery remain unfinished. Nifty parent/delivery remain open; historical-client migration remains separate. No gate passing client proof can be inferred from platform or synthetic tests.


## Verified corrective release and remaining authorization

PR142 merged asb66f9eb88efb1f08be2ee0a185d79bde38953840. Final CI37320416119 passed1407application/111Worker tests,all three rendered recipe matrices,Astro301files0errors/0warnings/4hints,Worker check and build. TestSprite007c6e7d-9afb-4672-bf06-d7caac897b9b passed20/20 steps, native/contact and authored/service503→200 plus Testville locality; its intercepted server recorded0realDeliveries. Four complete frozen adapter/compiler/enrichment/reuse replays passed with0additional provider calls. Request generation fields fit at least one advertised endpoint profile; this is offline compatibility evidence, not an accepted live completion.

Deployment37322871280 succeeded. Independent provider readback confirms platform Pages92f789af-ce74-41c0-8442-d7f51a6db3cc and onboarding Pages5b01486f-f64a-4f61-ac8c-e99928543227 both production/success/exactb66f9eb. Worker10002847-40fd-4ebb-9d77-8aa40f19dd66 is active100%. Live1440/390 platform/onboarding each returned200 without overflow/runtime errors/mutating requests; API GETlead returned405. Code shipping is verified. These platform and synthetic results do not qualify either fictional client for a real enquiry.

The approved budget experiment remains terminated: issue134run37311100809 and issue135run37311108980,1candidate-b fetch/site,2total,0model responses. Current private heads59256448d701ffc1ffef1116dc44cd5b02143671 and1d5606e3c651b8601f4d73884568661d297075d6 retain exact receipts and raw routing errors. All10JSX/CSS/JS source files and3generated images per site, hero,brief,reference pack,session and recipient were verified unchanged. No new dispatch or real form enquiry. Nifty parent/delivery are open; a premature parent completion was corrected because only1of3subtasks was complete.

Proposed next verification, **not executed or newly authorized**: one fresh capped pair on the same frozen issues134/135 after review of this deployed correction. Keep one cycle,one actual repair fetch per candidate,two/site,four total including failed attempts; stop on routing/schema/contract rejection and never restart automatically. Keep all source/content/contrast/reference/rendered/promotion gates. Only passing sites receive actual-preview desktop/mobile/route acceptance, followed by at most one labelled real enquiry/site to the already authorized recipient and correlated read-only receiving-provider verification. The previous unused call capacity does not authorize this new pair; the approved plan allowed exactly one dispatch per site.

Execution rulings and costs if wrong:

| Ruling | Reason | Cost if wrong |
| --- | --- | --- |
| Use Task headings in the plan | The execution helper recognizes TaskN | Bookkeeping ambiguity |
| Enforce the derived edit ceiling locally for opt-in requests | Provider schema claims cannot replace the request contract | Rejecting otherwise globally valid QA patches |
| Use the documented bounded replacement pattern | Native primary guidance positively lists pattern support | Endpoint refusal within the existing call ceiling |
| Archive prior private evidence and initialize current counts before preflight/authoring | Stale counts must not become current-run evidence | Additional private storage |
| Omit optional temperature only on the strict opt-in request | Every advertised Luna endpoint omits temperature support | Another routing refusal if other parameters remain incompatible |

Independent final review's Important stale-receipt and Minor stale-status findings were fixed. No minor review finding is deferred. Provider acceptance, client promotion and real delivery remain explicit unverified dependencies.
