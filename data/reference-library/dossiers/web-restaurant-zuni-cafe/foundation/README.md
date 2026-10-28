# Source foundation: web-restaurant-zuni-cafe

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `web-restaurant-zuni-cafe`
- Source: Zuni Café official website
- Source URL: https://zunicafe.com/
- Rights: `permission-cleared`
- License: permission-cleared
- Credit: Template adapted from Zuni Café official website
- Source digest: `ec5c5b1e9c44ecd4305a9c6f12b74a0012b457922dfc7cc2e9f33af28286d8e7`
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
- Interactions: 1

Blockers:

- `unmapped-repeated-items`: Repeated hero items in 'masthead' have no sealed content mapping. (`#masthead`)
- `unmapped-section-content`: Section 'unknown' has no supported content role. (`section`)

## Normalization removals

- `remote-stylesheet`: Removed a remote stylesheet: https://zunicafe.com/wp-content/themes/zuni/assets/images/favicon.png (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: http://zunicafe.com/ (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://zunicafe.com/wp-json/ (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://zunicafe.com/wp-json/wp/v2/pages/2 (`link[href]`)
- `remote-image`: Removed a remote image: https://cdn.userway.org/widgetapp/images/spin_bl.svg (`img[src]`)
- `remote-image`: Removed a remote image: https://cdn.userway.org/widgetapp/images/body_bl.svg (`img[src]`)
- `remote-image`: Removed a remote image: https://zunicafe.com/wp-content/uploads/hero3-1400x934.jpg (`img[src]`)
- `remote-image`: Removed a remote image: https://zunicafe.com/wp-content/uploads/hero2-1400x940.jpg (`img[src]`)
- `remote-image`: Removed a remote image: https://zunicafe.com/wp-content/uploads/zuni-10-1400x934.jpg (`img[src]`)
- `remote-image`: Removed a remote image: https://zunicafe.com/wp-content/uploads/zuni-8-1400x934.jpg (`img[src]`)
- `remote-image`: Removed a remote image: https://zunicafe.com/wp-content/uploads/zuni-1-2-1400x934.jpg (`img[src]`)
- `remote-image`: Removed a remote image: https://zunicafe.com/wp-content/uploads/Zuni-Favorites-6-1400x934.jpg (`img[src]`)
- `remote-image`: Removed a remote image: https://zunicafe.com/wp-content/uploads/Adriene-e1544055937609.jpg (`img[src]`)
- `remote-image`: Removed a remote image: https://zunicafe.com/wp-content/uploads/zuni-12-1400x934.jpg (`img[src]`)
- `remote-image`: Removed a remote image: https://zunicafe.com/wp-content/uploads/Alej-apron.jpg (`img[src]`)
- `remote-image`: Removed a remote image: https://zunicafe.com/wp-content/uploads/zuni-gallery-1-2-1400x934.jpg (`img[src]`)
- `remote-image`: Removed a remote image: https://zunicafe.com/wp-content/uploads/zuni-11-1400x934.jpg (`img[src]`)
- `remote-image`: Removed a remote image: https://zunicafe.com/wp-content/uploads/Figs.jpg (`img[src]`)
- `remote-image`: Removed a remote image: https://zunicafe.com/wp-content/uploads/Zuni-Rose-600x800.webp (`img[src]`)
- `remote-image`: Removed a remote image: http://zunicafe.com/wp-content/uploads/ot.png (`img[src]`)
- `remote-image`: Removed a remote image: https://zunicafe.com/wp-content/uploads/Zuni-corner-inside-crop.jpg (`img[src]`)
- `remote-image`: Removed a remote image: https://zunicafe.com/wp-content/uploads/Gilbert-crop-600x702.jpg (`img[src]`)
- `remote-image`: Removed a remote image: https://zunicafe.com/wp-content/uploads/Quang-crop-600x806.jpg (`img[src]`)
- `remote-image`: Removed a remote image: https://zunicafe.com/wp-content/uploads/Zuni-outside-with-RG-crop-e1525309620884.jpg (`img[src]`)

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
