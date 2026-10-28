# Source foundation: web-real-estate-humahome-property-search

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `web-real-estate-humahome-property-search`
- Source: HumaHome official website
- Source URL: https://humahome.com/
- Rights: `permission-cleared`
- License: permission-cleared
- Credit: Template adapted from HumaHome official website
- Source digest: `a3a3c95ff4182fb6f5e572d93368a3d5e10bf76c33e56937248c7d9e201186b1`
- Entrypoint: `source/index.html`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: `needs-adaptation`
- Sections: 10
- Content slots: 26
- Interactions: 2

Blockers:

- `interactive-section-needs-adaptation`: Section 'selection' preserves an interactive source composition that needs adaptation. (`#selection`)
- `missing-services`: No services or portfolio section was detected.
- `unmapped-repeated-items`: Repeated estimate items in 'selection' have no sealed content mapping. (`#selection`)
- `unmapped-section-content`: Section 'estimate' preserves source composition that needs adaptation. (`section`)
- `unmapped-section-content`: Section 'how' preserves source composition that needs adaptation. (`#how`)
- `unmapped-section-content`: Section 'market' has no supported content role. (`#market`)
- `unmapped-section-content`: Section 'selection' preserves source composition that needs adaptation. (`#selection`)
- `unmapped-section-content`: Section 'unknown' has no supported content role. (`section`)

## Normalization removals

- None.

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
