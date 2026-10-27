# Source foundation: colorlib-forecourt-showroom

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `colorlib-forecourt-showroom`
- Source: Colorlib Bootstrap Templates MIT and CC0 template
- Source URL: https://github.com/ColorlibHQ/bootstrap-templates/tree/f8b7fffcbee91bd8c24d4d57337c5cdb3435e1bf/forecourt
- Rights: `licensed`
- License: MIT
- Credit: Template adapted from Colorlib Bootstrap Templates MIT and CC0 template
- Source digest: `cf0544a82059e15e69c199ce87e6c242b03d702fc9d4a90641f3fed2dc94134e`
- Entrypoint: `source/index.html`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: `needs-adaptation`
- Sections: 8
- Content slots: 20
- Interactions: 1

Blockers:

- `interactive-section-needs-adaptation`: Section 'estimate' preserves an interactive source composition that needs adaptation. (`section`)
- `interactive-section-needs-adaptation`: Section 'finance' preserves an interactive source composition that needs adaptation. (`#finance`)
- `missing-services`: No services or portfolio section was detected.
- `network-script`: Foundation script contains a network, analytics, or tracking primitive; the foundation needs adaptation. (`script`)
- `unmapped-repeated-items`: Repeated hero items in 'hero' have no sealed content mapping. (`header`)
- `unmapped-section-content`: Section 'branches' has no supported content role. (`#branches`)
- `unmapped-section-content`: Section 'estimate' preserves source composition that needs adaptation. (`section`)
- `unmapped-section-content`: Section 'finance' preserves source composition that needs adaptation. (`#finance`)
- `unmapped-section-content`: Section 'stock' has no supported content role. (`#stock`)

## Normalization removals

- `source-form-removed`: Removed 2 source form(s); the shared lead form is the only conversion path.

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
