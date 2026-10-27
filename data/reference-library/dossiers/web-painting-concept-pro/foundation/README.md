# Source foundation: web-painting-concept-pro

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `web-painting-concept-pro`
- Source: Concept Pro Painting South Florida official website
- Source URL: https://www.conceptpropainting.com/
- Rights: `permission-cleared`
- License: permission-cleared
- Credit: Template adapted from Concept Pro Painting South Florida official website
- Source digest: `e439f8dbfe1b3fbdc9384e70db4558f74f4dd1edeb4dccf7855b4e7d12424642`
- Entrypoint: `source/index.html`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: `needs-adaptation`
- Sections: 14
- Content slots: 56
- Interactions: 1

Blockers:

- `interactive-section-needs-adaptation`: Section 'estimate-2' preserves an interactive source composition that needs adaptation. (`#estimate`)
- `interactive-section-needs-adaptation`: Section 'estimate' preserves an interactive source composition that needs adaptation. (`section`)
- `interactive-section-needs-adaptation`: Section 'home' preserves an interactive source composition that needs adaptation. (`#home`)
- `interactive-section-needs-adaptation`: Section 'onecrew' preserves an interactive source composition that needs adaptation. (`#oneCrew`)
- `unmapped-repeated-items`: Repeated estimate items in 'estimate-2' have no sealed content mapping. (`#estimate`)
- `unmapped-repeated-items`: Repeated estimate items in 'home' have no sealed content mapping. (`#home`)
- `unmapped-repeated-items`: Repeated estimate items in 'onecrew' have no sealed content mapping. (`#oneCrew`)
- `unmapped-section-content`: Section 'estimate-2' preserves source composition that needs adaptation. (`#estimate`)
- `unmapped-section-content`: Section 'estimate' preserves source composition that needs adaptation. (`section`)
- `unmapped-section-content`: Section 'home' preserves source composition that needs adaptation. (`#home`)
- `unmapped-section-content`: Section 'onecrew' preserves source composition that needs adaptation. (`#oneCrew`)
- `unmapped-section-content`: Section 'why' preserves source composition that needs adaptation. (`#why`)

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
