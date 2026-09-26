# Local client-site generation

Use `npm run generate:client-site` when an agent needs to exercise the local
site-generation path without opening the hosted onboarding form. Supply the
same post-upload JSON request shape sent by `OnboardingForm`. Its field names
and serialization are shared with the form and Worker through
`src/lib/client-intake-v2.mjs`.

```sh
npm run generate:client-site -- \
  --intake fixtures/local-client-intakes/rainline-plumbing.json \
  --out artifacts/local-client-generations/rainline-plumbing
```

The command validates the V2 request with `normalizeClientIntake`, writes a
review-only site build, generates local illustrative SVG assets, and captures
home and service pages at desktop and mobile sizes. `inviteToken` is replaced
with the local-only sentinel before the request is written to artifacts. The
command does not submit an intake, create a GitHub issue or client repository,
call external research/model/image providers, or deploy a site.

This is a local contract and rendering fixture. DataForSEO metrics are
unavailable in this mode and remain null, so production SEO readiness stays
blocked. The OpenRouter response is deterministic fixture content. This makes
the example safe to rerun while still exercising the same request fields,
normalizer, canonical brief, site-config generator, Astro routes, and browser
acceptance checks used by generation.

The normal hosted paths remain separate triggers for the same generator:

- `repository_dispatch` with event type `intake-submitted` receives the issue
  created by the Worker from an accepted form submission.
- The `Generate client site` `workflow_dispatch` takes an existing intake
  issue number and reads that issue's form-shaped, normalized JSON body.

The local command starts from the form payload directly, without needing the
client to revisit the hosted form.
