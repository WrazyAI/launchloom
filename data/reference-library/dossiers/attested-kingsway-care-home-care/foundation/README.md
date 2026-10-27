# Source foundation: attested-kingsway-care-home-care

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `attested-kingsway-care-home-care`
- Source: Kingsway Care official website
- Source URL: https://kingswaycare.com/
- Rights: `permission-cleared`
- License: permission-cleared
- Credit: Template adapted from Kingsway Care official website
- Source digest: `e54742d8eca81319a266403802728e8ce7cb7d32e21a2f276c4d65351c7abe4d`
- Entrypoint: `source/index.html`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: `needs-adaptation`
- Sections: 12
- Content slots: 32
- Interactions: 2

Blockers:

- `missing-css`: Missing local stylesheet(s): /assets/css/site.css?v=1788877665 (`link[rel=stylesheet]`)
- `unmapped-repeated-items`: Repeated about items in 'about' have no sealed content mapping. (`section`)
- `unmapped-repeated-items`: Repeated contact items in 'contact' have no sealed content mapping. (`section`)
- `unmapped-repeated-items`: Repeated hero items in 'hero' have no sealed content mapping. (`header`)
- `unmapped-section-content`: Section 'unknown-2' has no supported content role. (`section`)
- `unmapped-section-content`: Section 'unknown' has no supported content role. (`section`)

## Normalization removals

- `remote-stylesheet`: Removed a remote stylesheet: https://kingswaycare.com/ (`link[href]`)

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
