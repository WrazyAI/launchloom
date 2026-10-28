# Source foundation: web-architecture-indie-interiors

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `web-architecture-indie-interiors`
- Source: Indie Interiors residential portfolio official website
- Source URL: https://indieinteriors.co.uk/
- Rights: `permission-cleared`
- License: permission-cleared
- Credit: Template adapted from Indie Interiors residential portfolio official website
- Source digest: `bbd13c1c7c5f159194b859b4f67dc0febd97c734a7746608799a3c40db6a1b0e`
- Entrypoint: `source/index.html`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: `needs-adaptation`
- Sections: 15
- Content slots: 9
- Interactions: 1

Blockers:

- `missing-hero`: No hero section with an h1 was detected.
- `missing-services`: No services or portfolio section was detected.

## Normalization removals

- `remote-stylesheet`: Removed a remote stylesheet: //static.showit.co/200/fZffbKgmRqwybRyCMNIkog/323244/indie-interiors-favicon-2.png (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://indieinteriors.co.uk (`link[href]`)
- `remote-image`: Removed a remote image: https://www.facebook.com/tr?id=933041329081439&ev=PageView&noscript=1 (`img[src]`)
- `remote-image`: Removed a remote image: //static.showit.co/200/_sgcsSn0EcdCy4hs-Voi7Q/shared/ii_-_brown_logo.png (`img[src]`)
- `remote-image`: Removed a remote image: //static.showit.co/800/F0GLzq-YvHDQiY52SmSigw/shared/home_page_-_stairs.jpg (`img[src]`)
- `remote-image`: Removed a remote image: //static.showit.co/800/Iv9gLwTf40lwSpMeE39rRg/323244/windlesham-family-home.png (`img[src]`)
- `remote-image`: Removed a remote image: //static.showit.co/400/HK6485xvfmTwBhup5Ot8pg/shared/home_page_-_bathroom.jpg (`img[src]`)
- `remote-image`: Removed a remote image: //static.showit.co/400/JTf5ZasFsPN5H9SqvjcDSg/shared/home_page_-_kitchen.jpg (`img[src]`)
- `remote-image`: Removed a remote image: //static.showit.co/400/eNYun-dnf9ME5D3uJ1zoAg/shared/home_page_-_living_room.jpg (`img[src]`)
- `remote-image`: Removed a remote image: //static.showit.co/800/vT5jMRzWKML06-bBzDYKng/323244/indie-interiors-luxury-interiors-master_bedroom.jpg (`img[src]`)
- `remote-image`: Removed a remote image: //static.showit.co/200/cWCGPJwsuwF0TJXEpwfRuw/shared/group_1990.png (`img[src]`)
- `remote-image`: Removed a remote image: //static.showit.co/400/6ZBOuHvUZAzAj7eLpa2KPA/shared/group_1986.png (`img[src]`)
- `remote-image`: Removed a remote image: //static.showit.co/400/_48IsY4ELhNqWzBPwDg_Cw/shared/group_1988.png (`img[src]`)
- `remote-image`: Removed a remote image: //static.showit.co/200/InL7Tjl81RQU6TBn2wuGlg/shared/group_1987.png (`img[src]`)
- `remote-image`: Removed a remote image: //static.showit.co/800/N4hWcodk-U9FaEPKhjVj7A/shared/home_page_-_design_ellement.jpg (`img[src]`)
- `remote-image`: Removed a remote image: //static.showit.co/200/RbR-_hNnDH-oPbz4A9fq4g/shared/vector-3.png (`img[src]`)
- `remote-image`: Removed a remote image: //static.showit.co/400/_sgcsSn0EcdCy4hs-Voi7Q/shared/ii_-_brown_logo.png (`img[src]`)
- `remote-asset`: Removed a remote embedded asset: https://www.googletagmanager.com/ns.html?id=GTM-TVX85NFV (`[src]`)
- `remote-asset`: Removed a remote embedded asset: //static.showit.co/file/afXXbvhSxXzQuEDp3e942Q/shared/cover_video.mp4 (`[src]`)
- `remote-asset`: Removed a remote embedded asset: //player.vimeo.com/video/1126580778?api=1&loop=1&title=0&byline=0&portrait=0&autoplay=1&autopause=0&muted=1 (`[src]`)
- `remote-css-url`: Removed a remote CSS url() from an inline style. (`[style]`)

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
