# Stage 3 page brief contract

`pageContent` is keyed by the approved Stage 2 route ID, such as `service:drain cleaning` or `location:testville`. `compilePageBriefs(config)` derives the version 1 report from current inputs and route admission. A stored report cannot grant approval or bypass missing evidence. Empty or absent rich inputs retain explicitly labelled legacy behavior; existing clients are not regenerated.

## Input and evidence

```json
{
  "pageContent": {
    "service:drain cleaning": {
      "introduction": { "text": "Describe the affected drains before discussing scope.", "evidenceIds": ["drain-intro"] },
      "metadata": {
        "description": { "text": "Prepare a focused drain cleaning enquiry with the affected fixtures and relevant observations.", "evidenceIds": ["drain-meta"] }
      },
      "scope": [{ "text": "Discuss the affected fixtures and access needed.", "evidenceIds": ["drain-scope"] }],
      "faqs": [{ "question": "What should I describe?", "answer": { "text": "Describe which fixtures are affected.", "evidenceIds": ["drain-answer"] } }]
    }
  },
  "pageEvidence": [
    { "id": "drain-intro", "value": "Describe the affected drains before discussing scope.", "source": "client-confirmed service notes", "kind": "client_supplied", "confirmed": true, "public": true, "routeIds": ["service:drain cleaning"] }
  ]
}
```

This abbreviated example needs matching evidence records for every referenced ID before it is ready. Confirmation and public-display permission come from the operator/client workflow, not from a model. Accepted claim kinds are `client_supplied`, `verified_business_fact`, and `reviewed_copy`. Every reference must match the supplied wording and be scoped to the route. Stage 1 private-location redaction and fact readiness remain in force. These checks establish supplied provenance, not independent verification of the claim's truth or semantic relevance.

Full introductions cannot repeat short service-card descriptions. Rich services and locations need separately supplied metadata. Optional supported arrays are `scope`, `suitability`, `problems`, `approach`, `options`, `preparation`, `nextStep`, `localContext`, `proof`, `comparison`, and `projects`. Missing material has an omission reason. Research fan-out questions stay unanswered until a supported answer is supplied.

A rich location requires useful supported `localContext`, and lists only services admitted for that location. Company process is reused only with `companyProcess.applicable: true` and matching per-step `evidenceIds`; otherwise supply route-specific `process` claims. `relatedServices` records contain an approved service `routeId` and an evidence-backed `reason`; array adjacency does not establish relevance.

Media records contain `src`, `alt`, `evidenceId`, and optional `placement`. They must refer to a safe downloaded `/images/` asset in `assetReport.used`. The source and approved alt must match confirmed public route-scoped `client_asset` or `reviewed_stock_pack` evidence; stock also requires a license. Rich pages omit unassigned imagery. Legacy image behavior remains a compatibility path. Host-approved remote assets must be downloaded and recorded before becoming page assignments.

Approved About, Contact, Services, FAQ and policy hosts consume supported briefs using the existing shell. Supplied policy bodies remain intact; the brief contract does not establish legal review. Unapproved brief IDs appear only as excluded draft summaries in developer review and never become model/page bindings.

## Rendering and revisions

Existing service/location hosts pass `brief` alongside sealed conversion, support and media bindings. Rich authored source must import the shared `PageBriefSections` from `@launchloom/runtime` and bind it to `service.brief` or `location.brief`. The source validator and initial/hydrated content checks work together; an import alone does not prove visible content. Existing reference, identity, diversity, visual and promotion gates remain unchanged.

`set_page_content` supports `introduction`, `metadataDescription`, `faqs`, `localContext`, and `media` on an existing approved, ready rich route. It reuses preconfirmed evidence and changes only that route input plus derived reporting. New FAQ questions must also match a confirmed public route-scoped evidence value; existing approved questions may be reused. A model cannot introduce an unsupported claim in a question while borrowing a supported answer. Empty FAQ/media removal and new unconfirmed claims require manual attention. Expected artifacts carry the exact URL. Static revision checks require the matching page map; browser checks open native FAQ disclosures and inspect desktop/mobile text, metadata, images and overflow.

## Reproduce local evidence

```bash
node scripts/verify-page-briefs.mjs
```

The owned synthetic fixtures cover two distinct services, one supported city, a deferred-city negative control, supporting pages and supplied policy language. The matrix builds/checks trades and care static hosts plus synthetic authored inner hosts, checks initial HTML and hydration at 1440/390 pixels, opens native FAQs with the keyboard, records images/forms/call links, and rebuilds a route-specific FAQ revision. The other service's input and rendered HTML must remain byte-identical.

`artifacts/stage3/<scenario>/` contains briefs, screenshots, builds and the full contrast/focus report. The Stage 3 contrast verdict covers all generated inner/supporting routes. The full-site verdict is recorded separately, including homepage findings; it cannot be used as a production approval when unresolved. Synthetic source is compatibility evidence, not a model authoring run or reference-fidelity/promotion result. No paid model canary or publication is included.
