# Source foundation: web-beauty-fruittii-hair-art-lab

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `web-beauty-fruittii-hair-art-lab`
- Source: Fruittii London official website
- Source URL: https://fruittiilondon.com/
- Rights: `permission-cleared`
- License: permission-cleared
- Credit: Template adapted from Fruittii London official website
- Source digest: `45b4dc53f62bb5f15946f721194add9a74d6996e3c5cce496c7c382fa601adf9`
- Entrypoint: `source/index.html`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: `needs-adaptation`
- Sections: 6
- Content slots: 12
- Interactions: 1

Blockers:

- `css-parse-failed`: Could not scope inline style: <css input>:1:40136: Unknown word <br> (`style`)
- `css-parse-failed`: Could not scope inline style: <css input>:15:1: Unknown word -moz-transition (`style`)
- `unmapped-repeated-items`: Repeated hero items in 'hero' have no sealed content mapping. (`header`)
- `unmapped-section-content`: Section 'unknown' has no supported content role. (`section`)

## Normalization removals

- `remote-stylesheet`: Removed a remote stylesheet: https://fruittiilondon.com/feed/ (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://fruittiilondon.com/comments/feed/ (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://fruittiilondon.com/wp-json/oembed/1.0/embed?url=https%3A%2F%2Ffruittiilondon.com%2F (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://fruittiilondon.com/wp-json/oembed/1.0/embed?url=https%3A%2F%2Ffruittiilondon.com%2F&format=xml (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://fruittiilondon.com/wp-json/ (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://fruittiilondon.com/wp-json/wp/v2/pages/1531 (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://fruittiilondon.com/xmlrpc.php?rsd (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://fruittiilondon.com/ (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://fruittiilondon.com/wp-content/uploads/2026/02/Fruittii-London-Icon-150x150.png (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://fruittiilondon.com/wp-content/uploads/2026/02/Fruittii-London-Icon-300x300.png (`link[href]`)
- `remote-image`: Removed a remote image: https://fruittiilondon.com/wp-content/uploads/2026/02/fruittiilondon-Medium.png (`img[src]`)
- `remote-image`: Removed a remote image: https://fruittiilondon.com/wp-content/uploads/2026/02/unnamed-2.webp (`img[src]`)
- `remote-image`: Removed a remote image: https://fruittiilondon.com/wp-content/uploads/2026/02/unnamed-7.png (`img[src]`)
- `remote-image`: Removed a remote image: https://fruittiilondon.com/wp-content/uploads/2026/02/unnamed-1.webp (`img[src]`)
- `remote-image`: Removed a remote image: https://fruittiilondon.com/wp-content/uploads/2026/02/unnamed-6.png (`img[src]`)
- `remote-image`: Removed a remote image: https://fruittiilondon.com/wp-content/uploads/2026/02/unnamed-5.png (`img[src]`)
- `remote-image`: Removed a remote image: https://fruittiilondon.com/wp-content/uploads/2026/02/logo.webp (`img[src]`)
- `remote-asset`: Removed a remote embedded asset: https://www.youtube.com/embed/8Px8Q8orM2U?origin=https%3A%2F%2Ffruittiilondon.com&playsinline=true&enablejsapi=1&controls=0&showinfo=0&modestbranding=1&wmode=opaque&muted=true&html5=1&start=0&end=26&loop=1&rel=0&widgetid=1&forigin=https%3A%2F%2Ffruittiilondon.com%2F&aoriginsup=1&vf=6 (`[src]`)
- `remote-asset`: Removed a remote embedded asset: https://fruittii.shop.wisemarketer.net/wp-content/uploads/2026/03/Website-Loader-2.mp4#t=,8 (`[src]`)
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
