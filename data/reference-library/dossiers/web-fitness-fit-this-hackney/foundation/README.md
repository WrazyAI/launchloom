# Source foundation: web-fitness-fit-this-hackney

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `web-fitness-fit-this-hackney`
- Source: Fit This official website
- Source URL: https://fit-this.com/
- Rights: `permission-cleared`
- License: permission-cleared
- Credit: Template adapted from Fit This official website
- Source digest: `282fa771d921eb1708126c63ad69f322f556dd79e24f5fd8f8a16b54c429d245`
- Entrypoint: `source/index.html`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: `needs-adaptation`
- Sections: 11
- Content slots: 23
- Interactions: 1

Blockers:

- `missing-services`: No services or portfolio section was detected.
- `unmapped-repeated-items`: Repeated about items in 'about-2' have no sealed content mapping. (`section`)
- `unmapped-repeated-items`: Repeated about items in 'about' have no sealed content mapping. (`section`)
- `unmapped-repeated-items`: Repeated hero items in 'hero' have no sealed content mapping. (`header`)
- `unmapped-repeated-items`: Repeated unknown items in 'unknown-2' have no sealed content mapping. (`section`)
- `unmapped-section-content`: Section 'unknown-2' has no supported content role. (`section`)
- `unmapped-section-content`: Section 'unknown-3' has no supported content role. (`section`)
- `unmapped-section-content`: Section 'unknown' has no supported content role. (`section`)

## Normalization removals

- `remote-stylesheet`: Removed a remote stylesheet: https://fit-this.com/ (`link[href]`)
- `remote-image`: Removed a remote image: https://cdn.sanity.io/images/33u9c8jf/production/fc4a6e6813680bd88c6b3d1c9e64f8e679f1c1c4-1920x1080.png?w=2560&h=1440&q=80&auto=format (`img[src]`)
- `remote-image`: Removed a remote image: https://cdn.sanity.io/images/33u9c8jf/production/923a4bc0e8a26fda7246fb637284b1c1717e7098-2832x4240.jpg?w=1280&q=80&auto=format (`img[src]`)
- `remote-image`: Removed a remote image: https://cdn.sanity.io/images/33u9c8jf/production/2cd61613a71d742e23f9e95a50308469950cccaa-440x480.png?w=1280&q=80&auto=format (`img[src]`)
- `remote-image`: Removed a remote image: https://cdn.sanity.io/images/33u9c8jf/production/e13383ad6cabf432bf1c4039ae58c862905802cb-440x480.png?w=1280&q=80&auto=format (`img[src]`)
- `remote-image`: Removed a remote image: https://cdn.sanity.io/images/33u9c8jf/production/198501665d5f87dda36db7c56c7d6db59be3ecb6-3840x2160.jpg?w=2560&q=80&auto=format (`img[src]`)
- `remote-image`: Removed a remote image: https://cdn.sanity.io/images/33u9c8jf/production/70134d0780df00d05ce6413f36f47d6d8696cf11-1382x1906.png?w=640&q=80&auto=format (`img[src]`)
- `remote-image`: Removed a remote image: https://cdn.sanity.io/images/33u9c8jf/production/98f9dbdc5e22b11d825a324bfbda0e1bf5ffe69b-1436x1898.png?w=640&q=80&auto=format (`img[src]`)
- `remote-image`: Removed a remote image: https://cdn.sanity.io/images/33u9c8jf/production/06d3bebcb448294e908841be78013f8a92dc522a-2000x2994.jpg?w=640&q=80&auto=format (`img[src]`)
- `remote-image`: Removed a remote image: https://cdn.sanity.io/images/33u9c8jf/production/76ff3eab51a644e55797681046cce7ac25c9f983-1571x2352.png?w=640&q=80&auto=format (`img[src]`)
- `remote-image`: Removed a remote image: https://cdn.sanity.io/images/33u9c8jf/production/6637700763e796b59863db3f842dfe5c38732206-1334x1944.png?w=640&q=80&auto=format (`img[src]`)
- `remote-image`: Removed a remote image: https://cdn.sanity.io/images/33u9c8jf/production/3f32264984125ab7900fbb8d224ee34fc7cda4ee-1438x1976.png?w=640&q=80&auto=format (`img[src]`)
- `remote-asset`: Removed a remote embedded asset: https://www.googletagmanager.com/ns.html?id=GTM-PDRVFK23 (`[src]`)

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
