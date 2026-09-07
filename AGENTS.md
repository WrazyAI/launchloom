# LaunchLoom agent instructions

These instructions apply to the whole repository.

## Generated-site direction

Read `docs/site-generation-guidelines.md` before changing the client-site
template, generation prompts, revision engine, fixtures, or visual quality
checks. `docs/local-business-design-direction.md` records the reference-site
research behind those rules.

Treat the configured page recipe as a coherent design language. Care and
consultation sites use the calm editorial recipe. Local trades use the direct,
problem-led recipe. Do not flatten both into the same generic card layout or
mix their vocabulary, imagery, form questions, and calls to action.

Preserve verified facts and client assets. Never invent reviews, credentials,
prices, guarantees, locations, timelines, staff, or business outcomes. A
service area is not a physical office. Stock imagery may only come from a
reviewed, licensed pack whose subject matches the business kind. Client assets
take precedence, and stock people must never be presented as employees or
customers.

Generated copy must help a visitor decide and act. Explain service scope,
customer concerns, process, preparation, and the next step without repeating
the same claim across sections. Keep one primary action and one secondary
action near the opening promise, then repeat actions only at useful decision
points.

Never use em dashes in generated content or rendered client pages.

## Revision safety

Apply feedback as a bounded change to the current approved site. Preserve the
page recipe and unrelated sections. Structural requests must use a supported,
verifiable operation or be flagged for manual attention. Never claim feedback
was addressed unless its requested artifact is present in the rendered build.

## Verification

For generated-site changes, run the relevant configuration and recipe tests,
Astro checks, and a production build. Inspect rendered desktop and mobile
output for the requested sections, contextual imagery, readable contrast,
working calls/forms, layout overflow, and em dashes. A successful workflow or
HTML marker alone does not prove the visual result is acceptable.
