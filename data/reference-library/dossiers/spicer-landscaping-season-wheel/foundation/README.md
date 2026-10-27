# Source foundation: spicer-landscaping-season-wheel

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `spicer-landscaping-season-wheel`
- Source: Spicer Designs Landscaping website template
- Source URL: https://www.spicerdesigns.com/templates/landscaping
- Rights: `licensed`
- License: CC BY 4.0
- Credit: Template adapted from Spicer Designs Landscaping website template
- Source digest: `e6fb0374a2fb04392aa8c6bc4fe48c6589afcefc8ce55943afbf1e3ba31de60a`
- Entrypoint: `source/index.html`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: `needs-adaptation`
- Sections: 11
- Content slots: 34
- Interactions: 4

Blockers:

- `interactive-section-needs-adaptation`: Section 'estimate' preserves an interactive source composition that needs adaptation. (`#estimate`)
- `interactive-section-needs-adaptation`: Section 'seasons' preserves an interactive source composition that needs adaptation. (`#seasons`)
- `remote-stylesheet`: Removed a remote stylesheet: https://fonts.googleapis.com (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400;1,9..144,500&display=swap (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://fonts.gstatic.com (`link[href]`)
- `source-form-removed`: Removed 1 source form(s); the shared lead form is the only conversion path.
- `unmapped-repeated-items`: Repeated seasons items in 'seasons' have no sealed content mapping. (`#seasons`)
- `unmapped-section-content`: Section 'estimate' preserves source composition that needs adaptation. (`#estimate`)
- `unmapped-section-content`: Section 'seasons' preserves source composition that needs adaptation. (`#seasons`)

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
