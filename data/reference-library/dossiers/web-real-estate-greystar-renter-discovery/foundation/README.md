# Source foundation: web-real-estate-greystar-renter-discovery

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `web-real-estate-greystar-renter-discovery`
- Source: Greystar official website
- Source URL: https://www.greystar.com/
- Rights: `permission-cleared`
- License: permission-cleared
- Credit: Template adapted from Greystar official website
- Source digest: `c54db90d20e5190e38d06e4a10a21b2fdddf3135e4def76a6cd273260cbfd71d`
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

- `remote-stylesheet`: Removed a remote stylesheet: https://www.greystar.com (`link[href]`)
- `remote-image`: Removed a remote image: https://cdn.cookielaw.org/logos/1018a35e-3f7d-456d-9e22-1d0517248482/018f5ef2-9b8f-7f8f-b9e2-d835010d896d/972554f8-8f53-4d1a-92ca-8bef29fdb5d3/GreystarLogo_Navy_NoTagline.png (`img[src]`)
- `remote-image`: Removed a remote image: https://cdn.cookielaw.org/logos/static/powered_by_logo.svg (`img[src]`)
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
