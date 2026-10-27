# Source foundation: web-veterinary-perry-paws-mobile

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `web-veterinary-perry-paws-mobile`
- Source: Perry Paws Mobile official website
- Source URL: https://www.perrypawsmobile.com/
- Rights: `permission-cleared`
- License: permission-cleared
- Credit: Template adapted from Perry Paws Mobile official website
- Source digest: `b244b09b9d94bbf8744c10a095e7edfea5a391a147d11d67969bb17a186f1919`
- Entrypoint: `source/index.html`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: `needs-adaptation`
- Sections: 8
- Content slots: 28
- Interactions: 2

Blockers:

- `unmapped-repeated-items`: Repeated hero items in 'hero' have no sealed content mapping. (`header`)
- `unmapped-section-content`: Section 'unknown' has no supported content role. (`section`)

## Normalization removals

- `remote-stylesheet`: Removed a remote stylesheet: https://www.perrypawsmobile.com/ (`link[href]`)

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
