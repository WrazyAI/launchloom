# Source foundation: web-hvac-city-wide-austin

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `web-hvac-city-wide-austin`
- Source: City Wide Services diagnostic HVAC route official website
- Source URL: https://citywideaustin.com/
- Rights: `permission-cleared`
- License: permission-cleared
- Credit: Template adapted from City Wide Services diagnostic HVAC route official website
- Source digest: `1b6755e37a16e5963d4e6bf2043683b5075bd6b7cfeecd7c840c5735639cb78f`
- Entrypoint: `source/index.html`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: `needs-adaptation`
- Sections: 14
- Content slots: 37
- Interactions: 2

Blockers:

- `missing-css`: Missing local stylesheet(s): /assets/index-Dz2yYBqC.css (`link[rel=stylesheet]`)
- `unmapped-repeated-items`: Repeated plans items in 'plans' have no sealed content mapping. (`section`)
- `unmapped-repeated-items`: Repeated unknown items in 'unknown' have no sealed content mapping. (`section`)
- `unmapped-section-content`: Section 'plans' preserves source composition that needs adaptation. (`section`)
- `unmapped-section-content`: Section 'unknown' has no supported content role. (`section`)

## Normalization removals

- `remote-stylesheet`: Removed a remote stylesheet: https://citywideaustin.com/favicon.svg (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://citywideaustin.com/ (`link[href]`)

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
