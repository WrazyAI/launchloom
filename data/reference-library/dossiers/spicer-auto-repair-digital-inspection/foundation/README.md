# Source foundation: spicer-auto-repair-digital-inspection

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `spicer-auto-repair-digital-inspection`
- Source: Spicer Designs Auto Repair CC BY 4.0 template
- Source URL: https://www.spicerdesigns.com/templates/auto-repair
- Rights: `licensed`
- License: CC BY 4.0
- Credit: Template adapted from Spicer Designs Auto Repair CC BY 4.0 template
- Source digest: `18c9f66c5a153b82570c726b9daf86f4464ca60b3ed9e4b65d3cfe79da8c8b03`
- Entrypoint: `source/index.html`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: `needs-adaptation`
- Sections: 11
- Content slots: 26
- Interactions: 2

Blockers:

- `unmapped-repeated-items`: Repeated seasons items in 'seasons' have no sealed content mapping. (`section`)
- `unmapped-section-content`: Section 'inspection' has no supported content role. (`#inspection`)
- `unmapped-section-content`: Section 'seasons' preserves source composition that needs adaptation. (`section`)
- `unmapped-section-content`: Section 'symptoms' has no supported content role. (`#symptoms`)
- `unmapped-section-content`: Section 'unknown-2' has no supported content role. (`section`)
- `unmapped-section-content`: Section 'unknown' has no supported content role. (`section`)

## Normalization removals

- `remote-stylesheet`: Removed a remote stylesheet: https://fonts.googleapis.com (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://fonts.gstatic.com (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400;1,9..144,500&display=swap (`link[href]`)
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
