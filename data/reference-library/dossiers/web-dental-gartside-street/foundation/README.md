# Source foundation: web-dental-gartside-street

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `web-dental-gartside-street`
- Source: Gartside Street Dental Lounge official website
- Source URL: https://gartsidestreetdental.com/
- Rights: `permission-cleared`
- License: permission-cleared
- Credit: Template adapted from Gartside Street Dental Lounge official website
- Source digest: `e206cd4c3ef48366ca4858ef4bb8139249ceb2f389911072886eb93bfe63ceae`
- Entrypoint: `source/index.html`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: `needs-adaptation`
- Sections: 12
- Content slots: 40
- Interactions: 1

Blockers:

- `unmapped-repeated-items`: Repeated unknown items in 'unknown' have no sealed content mapping. (`section`)
- `unmapped-section-content`: Section 'unknown-2' has no supported content role. (`section`)
- `unmapped-section-content`: Section 'unknown' has no supported content role. (`section`)

## Normalization removals

- `remote-stylesheet`: Removed a remote stylesheet: https://gartsidestreetdental.com (`link[href]`)
- `remote-image`: Removed a remote image: https://www.facebook.com/tr?id=643871998002081&ev=PageView&noscript=1 (`img[src]`)
- `remote-asset`: Removed a remote embedded asset: https://www.googletagmanager.com/ns.html?id=GTM-NVDBKCFC (`[src]`)
- `remote-asset`: Removed a remote embedded asset: https://fast.wistia.net/embed/iframe/jamdcmy6y8?seo=true&videoFoam=true (`[src]`)

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
