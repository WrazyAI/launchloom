# Local release check

Run the workflow's release gates on a local build before dispatching a
generation. The check builds the client template, verifies rendered contrast,
focus, forms, and route content, then runs the SEO release gate.

```bash
node scripts/local-release-check.mjs --config /path/to/site.config.json --build
```

Or through npm:

```bash
npm run verify:local-release -- --config /path/to/site.config.json --build
```

## What it does

1. Copies `templates/client-site` into a temporary workspace.
2. Copies the supplied site config into `src/site.config.json`.
3. Copies the referenced foundation when `design.experience.renderer` is
   `foundation`.
4. Builds with `PUBLIC_REVIEW_MODE=true` and a synthetic lead origin.
5. Runs `scripts/verify-rendered-revision.mjs` across desktop, compact, tablet,
   and mobile, including the synthetic form lifecycle.
6. Runs `scripts/seo-release-gate.mjs --mode review`.

The synthetic lead origin is `https://leads.invalid`. The rendered verifier
intercepts those requests, so no real lead is sent. If the config has no
`lead.apiUrl` or `lead.token`, placeholders are injected for the check only.

## Checking an existing build

```bash
node scripts/local-release-check.mjs --config site.config.json --dist dist
```

Use this after a workflow build or when reproducing a failure. The dist must be
built with `PUBLIC_REVIEW_MODE=true` and the same lead origin, otherwise the SEO
gate reports missing noindex and the form lifecycle cannot complete.

## Output

- `rendered_revision_verified=true` when the rendered gate passes.
- `SEO review release gate passed.` when the content gate passes.
- A JSON summary with the dist, screenshot directory, and report path.

## Failure handling

The workflow now deploys a noindex diagnostic preview when the SEO release gate
blocks a foundation or pack preview. Safety gates still fail the run: supported
facts, licensing credit, shared lead form, rendered contrast, and the em dash
check.

Use the diagnostic preview to review the design while route copy is fixed. It is
not a client-ready preview and must not be promoted.
