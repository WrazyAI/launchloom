# Source foundation: web-accounting-goodman-jones

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `web-accounting-goodman-jones`
- Source: Goodman Jones accountancy advisory official website
- Source URL: https://www.goodmanjones.com/
- Rights: `permission-cleared`
- License: permission-cleared
- Credit: Template adapted from Goodman Jones accountancy advisory official website
- Source digest: `5959e197f30a761368418b9db9e9181ae655ad173d42c122187e34a094eec2c9`
- Entrypoint: `source/index.html`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: `needs-adaptation`
- Sections: 1
- Content slots: 9
- Interactions: 1

Blockers:

- `missing-hero`: No hero section with an h1 was detected.
- `missing-services`: No services or portfolio section was detected.

## Normalization removals

- `remote-stylesheet`: Removed a remote stylesheet: https://www.goodmanjones.com/ (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://www.goodmanjones.com/public/special_images/JtWyI/favicon-96x96.png (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://www.goodmanjones.com/public/special_images/sxZEl/favicon.ico (`link[href]`)

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
