# Local client-site generation

Run a deterministic, review-only site build from the same string fields and
uploaded-asset URL map sent by the current online onboarding form:

```sh
npm run generate:client-site -- \
  --intake fixtures/local-client-intakes/rainline-plumbing.json \
  --out artifacts/local-client-generations/rainline-plumbing
```

The form, Worker, and local command share the field allowlist in
`src/lib/client-intake-contract.mjs`. The command applies the production site
configuration normalizer, then builds the existing client-site template and
captures the home page and first service page at desktop and mobile sizes.
The output contains the static site, screenshots, normalized site config, and a
receipt marked `publishReady: false`.

This command is an offline rendering fixture. It uses deterministic fallback
copy, blocks external browser requests, and does not call SEO, OpenRouter, FAL,
Google, or GitHub services. It may download the locked Astro build dependencies
from npm when building the isolated copy. It does not create a client
repository, deploy a site, or publish a preview. Its config is not a substitute
for the provider-backed `generate-client.yml` workflow, and a passing local
build does not validate cloud generation.

Choose a new output directory for each run. The command refuses to overwrite
an existing directory. The checked-in Rainline Plumbing payload contains only
example contact details and no uploaded assets.
