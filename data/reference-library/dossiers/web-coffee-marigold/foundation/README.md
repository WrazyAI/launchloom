# Source foundation: web-coffee-marigold

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `web-coffee-marigold`
- Source: Marigold Coffee official website
- Source URL: https://marigoldcoffee.com/
- Rights: `permission-cleared`
- License: permission-cleared
- Credit: Template adapted from Marigold Coffee official website
- Source digest: `93d4b9a21e6a5ecf16d3e77c2f9c85ef4ea75ef2457d94a2370ea7172e6adc75`
- Entrypoint: `source/index.html`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: `needs-adaptation`
- Sections: 1
- Content slots: 9
- Interactions: 1

Blockers:

- `missing-hero`: No hero section with an h1 was detected.
- `missing-services`: No services or portfolio section was detected.

## Normalization removals

- `remote-stylesheet`: Removed a remote stylesheet: //marigoldcoffee.com/cdn/shop/t/22/assets/utils.lib.js?v=83618938464516255631761718343 (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: //marigoldcoffee.com/cdn/shop/t/22/assets/motion.lib.js?v=110055894879790098521761718342 (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: //marigoldcoffee.com/cdn/shop/t/22/assets/store-data.js?v=103888310047655750601761718358 (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: //marigoldcoffee.com/cdn/shop/t/22/assets/section-newsletter.css?v=173773369300224144671761718343 (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: //marigoldcoffee.com/cdn/shop/t/22/assets/component-footer.css?v=139131216800184897271761718341 (`link[href]`)
- `remote-image`: Removed a remote image: //marigoldcoffee.com/cdn/shop/products/KALEIDOSCOPE.jpg?crop=center&height=300&v=1761716704&width=300 (`img[src]`)
- `remote-image`: Removed a remote image: //marigoldcoffee.com/cdn/shop/files/6_d320e980-0829-49aa-a2b8-6789dfd5a09a.png?crop=center&height=300&v=1777009705&width=300 (`img[src]`)
- `remote-image`: Removed a remote image: //marigoldcoffee.com/cdn/shop/products/DECAF_266dd294-af6e-4e28-b765-a96630fefc15.jpg?crop=center&height=300&v=1761716776&width=300 (`img[src]`)
- `remote-image`: Removed a remote image: //marigoldcoffee.com/cdn/shop/files/19.png?crop=center&height=300&v=1777009957&width=300 (`img[src]`)
- `remote-image`: Removed a remote image: https://cdn-app.sealsubscriptions.com/shopify/public/img/app/dwn.svg?v2 (`img[src]`)
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
