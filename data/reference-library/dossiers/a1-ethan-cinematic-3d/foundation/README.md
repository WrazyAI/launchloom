# Source foundation: a1-ethan-cinematic-3d

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `a1-ethan-cinematic-3d`
- Source: Ethan Suero digital studio website
- Source URL: https://www.ethansuero.com/
- Rights: `permission-cleared`
- License: permission-cleared
- Credit: Template adapted from Ethan Suero digital studio website
- Source digest: `c653bc724510b549848d6f94f87a8c3bc42722083b5e7d89a58add0e99bd11e6`
- Entrypoint: `source/index.html`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: `needs-adaptation`
- Sections: 15
- Content slots: 51
- Interactions: 1

Blockers:

- `css-parse-failed`: Could not scope inline style: <css input>:6:7: Unclosed block (`style`)
- `unmapped-repeated-items`: Repeated hero items in 'hero' have no sealed content mapping. (`header`)
- `unmapped-section-content`: Section 'seasons' preserves source composition that needs adaptation. (`section`)
- `unmapped-section-content`: Section 'unknown-2' has no supported content role. (`section`)
- `unmapped-section-content`: Section 'unknown-3' has no supported content role. (`section`)
- `unmapped-section-content`: Section 'unknown-4' has no supported content role. (`section`)
- `unmapped-section-content`: Section 'unknown' has no supported content role. (`section`)

## Normalization removals

- `remote-stylesheet`: Removed a remote stylesheet: https://www.ethansuero.com/ (`link[href]`)
- `remote-asset`: Removed a remote embedded asset: blob:https://www.ethansuero.com/980b97b0-b8de-4d06-ad89-b42e697d9a85 (`[src]`)
- `remote-asset`: Removed a remote embedded asset: https://suero-studio.b-cdn.net/website/abatable/abatable-web-loader.mp4 (`[src]`)
- `remote-asset`: Removed a remote embedded asset: https://suero-studio.b-cdn.net/website/abcs/abcs_scroll-main.mp4 (`[src]`)
- `remote-asset`: Removed a remote embedded asset: https://suero-studio.b-cdn.net/website/moneda/moneda_scroll-main.mp4 (`[src]`)
- `remote-asset`: Removed a remote embedded asset: https://suero-studio.b-cdn.net/website/uniserve/uniserve-web-showcase.mp4 (`[src]`)
- `remote-asset`: Removed a remote embedded asset: https://suero-studio.b-cdn.net/website/quoti/quoti_scroll-main.mp4 (`[src]`)
- `remote-asset`: Removed a remote embedded asset: https://suero-studio.b-cdn.net/website/fn/fn_scroll-main.mp4 (`[src]`)

## Files

- `manifest.json`: source digest, section map, content slots, assets,
  interactions, license, and blockers.
- `source/`: normalized HTML, scoped CSS, local scripts, and reference assets.
- `source/foundation.js`: extracted safe interactions, when present.

## Use

1. Read the manifest and the source files.
2. Bind every required slot to sealed client content.
3. Replace reference-only assets with approved client or contextual assets.
4. Adapt the sections marked `needs-adaptation`.
5. Render and verify at desktop, compact desktop, and mobile widths.
6. Keep the license credit visible when the license requires it.

Generated with `scripts/compile-source-foundation.mjs`.
