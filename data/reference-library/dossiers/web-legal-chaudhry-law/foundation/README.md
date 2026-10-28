# Source foundation: web-legal-chaudhry-law

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `web-legal-chaudhry-law`
- Source: ChaudhryLaw trial practice official website
- Source URL: https://chaudhrylaw.com/
- Rights: `permission-cleared`
- License: permission-cleared
- Credit: Template adapted from ChaudhryLaw trial practice official website
- Source digest: `d8b8529d0fcae9143cf5c98dfce45a08cdc88e7c872720efeaf4c6705cbb77d5`
- Entrypoint: `source/index.html`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: `needs-adaptation`
- Sections: 1
- Content slots: 8
- Interactions: 1

Blockers:

- `missing-hero`: No hero section with an h1 was detected.
- `missing-services`: No services or portfolio section was detected.

## Normalization removals

- `remote-image`: Removed a remote image: https://chaudhrylaw.com/wp-content/uploads/2024/12/NMSDC-Logo-Transparent-white-type-300x210.png (`img[src]`)

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
