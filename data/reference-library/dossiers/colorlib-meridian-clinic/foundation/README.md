# Source foundation: colorlib-meridian-clinic

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `colorlib-meridian-clinic`
- Source: Colorlib Bootstrap Templates, Meridian MIT/CC0 template
- Source URL: https://github.com/ColorlibHQ/bootstrap-templates/tree/f8b7fffcbee91bd8c24d4d57337c5cdb3435e1bf/meridian
- Rights: `licensed`
- License: MIT
- Credit: Template adapted from Colorlib Bootstrap Templates, Meridian MIT/CC0 template
- Source digest: `e3201c136a8150aa73e4aea1b5fce50bb3bd2215fafc3bb0afacdea0a5e9f824`
- Entrypoint: `source/index.html`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: `needs-adaptation`
- Sections: 8
- Content slots: 18
- Interactions: 2

Blockers:

- `network-script`: Foundation script contains a network, analytics, or tracking primitive; the foundation needs adaptation. (`script`)
- `unmapped-repeated-items`: Repeated hero items in 'hero' have no sealed content mapping. (`header`)

## Normalization removals

- `source-form-removed`: Removed 3 source form(s); the shared lead form is the only conversion path.

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
