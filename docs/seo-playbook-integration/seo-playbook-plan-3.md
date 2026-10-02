# Stage 3 of 4: Substantive page briefs and authored inner pages

Status: proposed, awaiting user approval. Depends on [Stage 2](seo-playbook-plan-2.md). Next: [Stage 4](seo-playbook-plan-4.md).

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
