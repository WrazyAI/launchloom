# Source foundation: colorlib-caseworth-legal-ledger

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `colorlib-caseworth-legal-ledger`
- Source: Colorlib Bootstrap Templates Caseworth
- Source URL: https://github.com/ColorlibHQ/bootstrap-templates/tree/f8b7fffcbee91bd8c24d4d57337c5cdb3435e1bf/caseworth
- Rights: `licensed`
- License: MIT
- Credit: Template adapted from Colorlib Bootstrap Templates Caseworth
- Source digest: `c7f38110a3b04d88d7948f2a44a98793b794dc0c2f54b2e2f0cbdb33d430b917`
- Entrypoint: `source/index.html`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: `needs-adaptation`
- Sections: 9
- Content slots: 20
- Interactions: 2

Blockers:

- `network-script`: Foundation script contains a network, analytics, or tracking primitive; the foundation needs adaptation. (`script`)
- `unmapped-repeated-items`: Repeated contact items in 'enquiry' have no sealed content mapping. (`#enquiry`)
- `unmapped-repeated-items`: Repeated hero items in 'hero' have no sealed content mapping. (`header`)
- `unmapped-repeated-items`: Repeated unknown items in 'fees' have no sealed content mapping. (`#fees`)
- `unmapped-section-content`: Section 'fees' has no supported content role. (`#fees`)

## Normalization removals

- `source-form-removed`: Removed 1 source form(s); the shared lead form is the only conversion path.

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
