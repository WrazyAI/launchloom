# Contextual Image Generation

LaunchLoom uses FAL to create draft image assets when an intake does not provide
usable imagery for a site placement. This is separate from the creative site
authoring model and does not create or edit website code.

## Which component does what

- The **image stage** is the Node program
  [`scripts/generate-contextual-assets.mjs`](../scripts/generate-contextual-assets.mjs).
  It calls FAL through the repository's `@fal-ai/client` 1.10.1 dependency,
  downloads and normalizes the returned image, and writes the asset manifest.
- The **workflow step** is `Generate or reuse contextual imagery` in
  [`.github/workflows/generate-client.yml`](../.github/workflows/generate-client.yml).
  It invokes that script before `Author independent experience candidates`.
- The **creative author** is Luna, called through OpenRouter in later authoring
  stages. Luna writes the site's JSX, CSS, and motion. It does not call FAL and
  does not receive the FAL API key. It uses generated image paths through the
  site's sealed asset/content bindings.

FAL therefore runs as a distinct server-side pipeline stage inside the same
GitHub Actions workflow. It is an SDK integration called by application code,
not an MCP tool or an image-generating role within the Luna agent.

## Credentials and configuration

In GitHub Actions, `FAL_KEY` is read from the `WrazyAI/launchloom` repository
secret and is exposed only to the contextual-image workflow step. Do not put a
key in source, intake content, command-line arguments, prompt evidence, client
configuration, or generated HTML.

Current defaults in the workflow and script:

| Setting | Default | Meaning |
| --- | --- | --- |
| `FAL_KEY` | unset/optional | Server-only credential. Without it, the stage skips generation and keeps the existing fallback. |
| `FAL_IMAGE_MODEL` | `fal-ai/minimax/image-01` | FAL model used for image requests. |
| `FAL_IMAGE_MAX_IMAGES` | `3` | Global cap on retained generated images across routes. |
| `FAL_IMAGE_MAX_REQUESTS` | `6` | Global request budget, allowing one retry per image at the default image cap. |
| `FAL_IMAGE_TIMEOUT_MS` | `120000` | Per-generation and image-download timeout budget. |

The model and image/request budgets are set from LaunchLoom repository
variables in `generate-client.yml` (`FAL_IMAGE_MODEL`,
`FAL_IMAGE_MAX_IMAGES`, and `FAL_IMAGE_MAX_REQUESTS`). The timeout defaults to
120 seconds and can be overridden through `FAL_IMAGE_TIMEOUT_MS` in a direct
script environment. The key is a GitHub Actions secret, not a repository
variable.

## Generation flow

1. Intake, business configuration, and the inspiration pack are prepared.
2. The workflow creates or updates the private client review repository.
3. The asset script inspects client image slots. Client-provided media wins; only
   missing placements are eligible for FAL generation.
4. Prompts describe one standalone, crop-safe scene. They use sanitized
   business/service context and the selected route's family, Reference DNA,
   image treatment, crop, and palette intent. Prompts prohibit website
   screenshots, UI, readable text, logos, watermarks, signage, branded
   products, people, and implied staff or customers.
5. Matching prior assets are reused when their prompt hash and file are still
   valid. Otherwise, FAL is asked for one image per request. Each placement can
   be retried once, within the global request cap.
6. The image is downloaded only from HTTPS, checked for an image content type
   and a maximum 8 MB source size, checked for readable dimensions of at least
   640 by 360 pixels, and processed with Sharp into WebP. The final optimized
   file must be no larger than 2.5 MB.
7. The generated image and private provenance manifest are committed to the
   review branch. Creative authorship then runs separately and consumes the
   resulting site image slots.

The script currently caps the hero image at 1600 pixels wide and supporting
images at 1200 pixels wide. Placement aspect ratios are 16:9 for the hero, 4:3
for secondary imagery, and 3:2 for tertiary imagery.

## Outputs and provenance

Images are written under the configured output directory, normally
`public/images/generated/`, with prompt-hash-based names. The manifest is
normally `.launchloom/generated-assets.json`; it records the provider/model,
route and family, placement, prompt hash, request ID, output digest, dimensions,
and generation status. The manifest stays in the private review repository.
Provider URLs and credentials must not be copied into public configuration or
deployed HTML.

Generated imagery is draft material. It appears in the private developer
preview and requires human approval before production publication. Client
assets remain higher priority than generated assets.

## Local invocation

Install repository dependencies and supply `FAL_KEY` through a local secret
manager or environment injection. Do not save the secret in a file tracked by
Git or paste it into the command line. With a prepared site config and
inspiration pack, run:

```sh
node scripts/generate-contextual-assets.mjs \
  --config src/site.config.json \
  --inspiration .launchloom/inspiration-pack.json \
  --output public/images/generated \
  --manifest .launchloom/generated-assets.json
```

The command updates the supplied config with generated image paths and asset
provenance. A controlled no-provider dry run can use `--dry-run true`; it must
not be used to claim that an image was generated.

## Failure behavior

- Missing `FAL_KEY`, exhausted request/image budgets, provider errors, invalid
  downloads, and timeouts are recorded in the asset report.
- The script retains the existing reviewed placement image when available. A
  FAL failure does not fail intake and does not route the site to a legacy
  renderer.
- If no suitable fallback exists, the report still records the skipped
  placement so the missing image is visible to review.
- Check `assetReport` in the private site config and
  `.launchloom/generated-assets.json` for generation/reuse/skip details.

## Implementation references

- Runtime implementation: [`scripts/generate-contextual-assets.mjs`](../scripts/generate-contextual-assets.mjs)
- Workflow ordering and secret scope: [`.github/workflows/generate-client.yml`](../.github/workflows/generate-client.yml)
- Creative-stage overview: [`docs/creative-compiler.md`](creative-compiler.md#image-generation)
- Asset and client-media requirements: [`docs/site-generation-guidelines.md`](site-generation-guidelines.md)
- Required secret summary: [`README.md`](../README.md#required-configuration)
