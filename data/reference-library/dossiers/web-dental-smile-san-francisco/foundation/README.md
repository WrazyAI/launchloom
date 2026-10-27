# Source foundation: web-dental-smile-san-francisco

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `web-dental-smile-san-francisco`
- Source: Smile! San Francisco official website
- Source URL: https://smilesanfrancisco.com/
- Rights: `permission-cleared`
- License: permission-cleared
- Credit: Template adapted from Smile! San Francisco official website
- Source digest: `da090522545581a22f7ca1fd138ffd57ba427266346d5bc8ed5e281e7d5dd3e2`
- Entrypoint: `source/index.html`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: `needs-adaptation`
- Sections: 12
- Content slots: 35
- Interactions: 1

Blockers:

- `unmapped-section-content`: Section 'schedule' preserves source composition that needs adaptation. (`#schedule`)
- `unmapped-section-content`: Section 'seasons' preserves source composition that needs adaptation. (`section`)
- `unmapped-section-content`: Section 'unknown-2' has no supported content role. (`section`)
- `unmapped-section-content`: Section 'unknown' has no supported content role. (`section`)

## Normalization removals

- `remote-asset`: Removed a remote embedded asset: https://www.googletagmanager.com/ns.html?id=GTM-TPHF46D (`[src]`)
- `remote-asset`: Removed a remote embedded asset: https://www.google.com/maps/embed/v1/place?q=place_id:ChIJOXkOOOWBhYARRm1vz1CFlrU&key=[redacted] (`[src]`)

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
