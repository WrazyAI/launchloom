# Stage 3 of 4: Substantive page briefs and authored inner pages

Status: implemented, user-reviewed, merged and deployed on 2026-10-02 through [PR #131](https://github.com/WrazyAI/launchloom/pull/131) at source `b0cf6525ba4ff2c88b11a575a27ec3c6c9a26738`. Release CI passed 1227 application tests, 111 Worker tests, Astro/types and build. Deployment and live desktop/mobile/API checks passed. See [the page-brief contract](page-brief-contract.md). Client regeneration and paid authoring remain outside this release. Depends on [Stage 2](seo-playbook-plan-2.md). Next: [Stage 4](seo-playbook-plan-4.md).

## Intended outcome

Give each approved route enough distinct, supported content to answer its visitor's questions. Separate concise homepage card copy from full page copy and metadata. Extend existing service/location candidate hosts and shared runtime instead of introducing another renderer.

Playbook mapping: Prompts 7–15, especially individual service and service-area prompts. Estimate: 5–8 engineering hours, including synthetic fixtures, local rendered checks, and revision compatibility. Any authorized model canary adds separately reported provider time and cost.

## Proposed content contracts

| Page | Structured information |
| --- | --- |
| Service | Scope, suitability, problems addressed, supported approach/options, preparation, service FAQs, related services, approved proof, media assignment, metadata |
| Location | Verified coverage, services available there, supported local context, local questions, relevant proof/media, links, metadata |
| Supporting | Approved purpose, section content, evidence references, CTA, media, metadata; supplied policy language where applicable |

Each optional field can be absent with a reason. Do not fill missing proof, prices, timelines, options, or local experience with invented material. Research questions can guide what to answer but cannot establish the business's answer.

## Implementation steps after approval

1. Define versioned page briefs keyed to approved route IDs. Keep short card descriptions independent from page introductions and meta descriptions. Connect every factual claim and media assignment to Stage 1 evidence.
2. Compile one bounded brief per page from verified facts, the existing keyword-to-page map, and fan-out questions. Select related services by relevance rather than array order. Reuse company-wide process only when applicable and identify where page-specific information is missing.
3. Extend existing authored service/location hosts to consume richer content through sealed bindings. Retain deterministic legacy compatibility and the shared lead/FAQ/contact primitives. Add controlled treatments such as a real process, supported comparison, or approved project showcase when content warrants them.
4. Render approved supporting routes from the Stage 2 inventory. Reuse site tokens, shell, and conversion behavior. Preserve supplied policy content and label unapproved drafts in review; never imply legal approval. Keep imagery contextual and licensed, with per-page assignments and fallback provenance.
5. Extend bounded revisions so a service FAQ, page image, local detail, or route-specific copy request changes the intended route without overwriting unrelated approved pages. Begin with two service briefs and one supported location brief plus a deferred-location negative control.

## Likely implementation seams

`scripts/generate-site-config.mjs`, `templates/client-site/src/lib/site.ts`, service/location route templates, `ServiceCandidateHost`, `LocationCandidateHost`, creative content/runtime contracts, `scripts/production-experience-author.mjs`, source-binding validators, revision planning, and contextual-asset manifests. Inspect exact current ownership before editing.

The three creative homepage alternatives remain a design bakeoff. They are not counted as verification of three URL routes.

## Verification and acceptance

- Two service fixtures have distinct customer questions, introductions, FAQs, relevant links, and supported decision content. Shared facts may repeat; page-specific substance must remain independently useful.
- A location fixture includes supported local value, while an evidence-poor location remains deferred. No offices, reviews, projects, local reasons, or service availability are fabricated to satisfy a layout.
- Run affected generation, authoring, inner-page, and revision regressions; run client-template checks/builds in generated fixtures. Inspect initial HTML plus hydrated desktop/mobile output, CTAs/forms, contrast, focus, overflow, media, and em dashes.
- A route-targeted revision changes only its approved scope. Existing clients without rich briefs keep truthful functioning routes through the explicit compatibility path.
- Deliver page-brief schema, renderer integration, fixture screenshots, acceptance findings, and actual validation results. Stage 4 receives route-specific expected content and media inventories.

## Creative and cost boundaries

Keep care/editorial and trades/problem-led language distinct. Do not mandate video, 1920×1080 imagery, full-height heroes, four local reasons, or uniform layouts across all sites. Existing reference fidelity, diversity, visual, source, and promotion gates remain in force.

Use synthetic business fixtures and mocked provider responses first. A bounded real authoring experiment requires an approved client or synthetic brief, explicit budget, and recorded model/session provenance. No large paid bakeoff or publishing is authorized by this plan.

## Local implementation evidence

- Approved route-keyed page briefs, supporting hosts, sealed service/location bindings and bounded route/field revisions are implemented. See [the contract](page-brief-contract.md).
- Frozen full application suite: 1226/1226. Final affected suite after the added hero contrast regression: 405/405; Worker full suite 111/111 and approval replay 8/8. Astro/Worker types/platform build passed. The shallow-checkout migration fixture was verified separately after final review.
- Three synthetic matrices passed 36 initial/hydrated desktop/mobile views plus six revised-FAQ views. Other service input and rendered HTML stayed byte-identical; supplied policy text stayed intact; deferred city remained 404. Corrected contrast/focus acceptance rejects definite failures and unresolved findings. All Stage 3 routes passed at 1536/1366/390 widths.
- TestSprite stable replay passed with 11 inspected trace steps. CodeRabbit findings were reproduced/verified and resolved, including the final shallow-history migration test dependency.
- Trades/care legacy homepages retain recorded contrast/focus findings; full production readiness is blocked for those fixtures. The synthetic authored fixture passed its full contrast sweep, but it has no real-model authoring, reference-fidelity or promotion evidence. During the local implementation phase, no merge, deployment, paid authoring or client regeneration was performed. The subsequent authorized platform release is recorded above.

User review and shipping approval are complete. Stage 4 remains unapproved. Existing clients were not regenerated.
