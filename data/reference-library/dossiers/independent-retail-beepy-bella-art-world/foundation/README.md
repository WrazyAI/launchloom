# Source foundation: independent-retail-beepy-bella-art-world

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `independent-retail-beepy-bella-art-world`
- Source: Beepy Bella official website
- Source URL: https://beepybella.world/
- Rights: `permission-cleared`
- License: permission-cleared
- Credit: Template adapted from Beepy Bella official website
- Source digest: `05ea28933904197a847489365338a0ad0c05ab16a3a9df6de78e009fe7d42e7a`
- Entrypoint: `source/index.html`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: `needs-adaptation`
- Sections: 5
- Content slots: 14
- Interactions: 1

Blockers:

- `css-parse-failed`: Could not scope inline style: <css input>:7:10: Unknown word --plyr-video-progress-buffered-background (`style`)
- `css-parse-failed`: Could not scope styles/08.css: <css input>:1:41248: Unknown word background-color (`styles/08.css`)
- `missing-services`: No services or portfolio section was detected.
- `unmapped-repeated-items`: Repeated hero items in 'hero' have no sealed content mapping. (`header`)

## Normalization removals

- `remote-stylesheet`: Removed a remote stylesheet: //beepybella.world/cdn/shop/files/smiley_32x32.png?v=1625582181 (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://beepybella.world/ (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://beepybella.world/en-nz (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://cdn.shopify.com (`link[href]`)
- `remote-image`: Removed a remote image: //beepybella.world/cdn/shop/files/Screenshot_2026-03-26_at_12.56.19_AM_600x600.png?v=1774483005 (`img[src]`)
- `remote-image`: Removed a remote image: //beepybella.world/cdn/shop/files/Screenshot_2026-03-26_at_12.56.19_AM_300x300.png?v=1774483005 (`img[src]`)
- `remote-image`: Removed a remote image: //beepybella.world/cdn/shop/files/hat_600x600.gif?v=1658887421 (`img[src]`)
- `remote-image`: Removed a remote image: //beepybella.world/cdn/shop/files/hat_300x300.gif?v=1658887421 (`img[src]`)
- `remote-image`: Removed a remote image: //beepybella.world/cdn/shop/files/c97324f97ab17e6f019256770f631c2e_600x600.gif?v=1781298210 (`img[src]`)
- `remote-image`: Removed a remote image: //beepybella.world/cdn/shop/files/c97324f97ab17e6f019256770f631c2e_300x300.gif?v=1781298210 (`img[src]`)
- `remote-image`: Removed a remote image: //beepybella.world/cdn/shop/products/img2_b483d05d-6262-405a-99fd-5c29fa3b97b1_1024x.jpg?v=1658855139 (`img[src]`)
- `remote-image`: Removed a remote image: //beepybella.world/cdn/shop/products/img1_ec713ca2-0708-4815-8f2c-eb4a842a7dd9_1024x.jpg?v=1658855047 (`img[src]`)
- `remote-image`: Removed a remote image: //beepybella.world/cdn/shop/products/img3_7_1024x.jpg?v=1670002632 (`img[src]`)
- `remote-image`: Removed a remote image: //beepybella.world/cdn/shop/files/img16_1024x.jpg?v=1688772746 (`img[src]`)
- `remote-image`: Removed a remote image: //beepybella.world/cdn/shop/files/2c72f83eedbbcc593ca71389729bbe98_600x600.jpg?v=1781298193 (`img[src]`)
- `remote-image`: Removed a remote image: //beepybella.world/cdn/shop/files/2c72f83eedbbcc593ca71389729bbe98_300x300.jpg?v=1781298193 (`img[src]`)
- `remote-image`: Removed a remote image: //beepybella.world/cdn/shopifycloud/storefront/assets/no-image-2048-a2addb12_600x600.gif (`img[src]`)
- `remote-image`: Removed a remote image: //beepybella.world/cdn/shop/files/hand_copy_300x300.jpg?v=1773138506 (`img[src]`)
- `remote-image`: Removed a remote image: //beepybella.world/cdn/shop/files/IMG_3502_300x300.jpg?v=1638390148 (`img[src]`)
- `remote-image`: Removed a remote image: //beepybella.world/cdn/shop/files/low_re1s_300x300.jpg?v=1644263942 (`img[src]`)
- `remote-image`: Removed a remote image: //beepybella.world/cdn/shop/files/Screen_Shot_2021-12-01_at_4.03.18_PM_300x300.png?v=1638392642 (`img[src]`)
- `remote-image`: Removed a remote image: //beepybella.world/cdn/shop/t/4/assets/fairy.png?v=97330272554682913021638948790 (`img[src]`)
- `remote-image`: Removed a srcset with a remote image candidate. (`[srcset]`)
- `remote-asset`: Removed a remote embedded asset: https://player.vimeo.com/video/733846013?loop=true&autoplay=true&muted=false&gesture=media&playsinline=true&byline=false&portrait=false&title=false&speed=true&transparent=false&customControls=true (`[src]`)
- `remote-asset`: Removed a remote embedded asset: https://beepybella.world/web-pixels@7ec887c8w14f9f074p854094e1m1370c602/custom/web-pixel-shopify-custom-pixel@0530/sandbox/modern/ (`[src]`)
- `source-form-removed`: Removed 4 source form(s); the shared lead form is the only conversion path.

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
