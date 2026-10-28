# Source foundation: web-legal-valemus-law

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `web-legal-valemus-law`
- Source: Valemus Law multidisciplinary practice official website
- Source URL: https://www.valemuslaw.com/
- Rights: `permission-cleared`
- License: permission-cleared
- Credit: Template adapted from Valemus Law multidisciplinary practice official website
- Source digest: `9cb00e1dd4056523472ea60dfaf2095969260f4e04abdb9d1a22cb01c84ed99d`
- Entrypoint: `source/index.html`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: `needs-adaptation`
- Sections: 7
- Content slots: 19
- Interactions: 1

Blockers:

- `unmapped-repeated-items`: Repeated hero items in 'hero' have no sealed content mapping. (`header`)
- `unmapped-section-content`: Section 'unknown' has no supported content role. (`section`)

## Normalization removals

- `remote-stylesheet`: Removed a remote stylesheet: https://www.valemuslaw.com/ (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://www.valemuslaw.com/feed/ (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://www.valemuslaw.com/comments/feed/ (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://www.valemuslaw.com/wp-content/uploads/2021/02/Valemusfav.png (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://www.valemuslaw.com/valemus-law/feed/ (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://www.valemuslaw.com/wp-json/oembed/1.0/embed?url=https%3A%2F%2Fwww.valemuslaw.com%2F (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://www.valemuslaw.com/wp-json/oembed/1.0/embed?url=https%3A%2F%2Fwww.valemuslaw.com%2F&format=xml (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://www.valemuslaw.com/wp-json/ (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://www.valemuslaw.com/wp-json/wp/v2/pages/8 (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://www.valemuslaw.com/xmlrpc.php?rsd (`link[href]`)
- `remote-image`: Removed a remote image: https://www.valemuslaw.com/wp-content/uploads/2022/03/Header-logo.svg (`img[src]`)
- `remote-image`: Removed a remote image: https://www.valemuslaw.com/wp-content/uploads/2021/02/gavel.png (`img[src]`)
- `remote-image`: Removed a remote image: https://www.valemuslaw.com/wp-content/uploads/2021/02/aries-icon3.png (`img[src]`)
- `remote-image`: Removed a remote image: https://www.valemuslaw.com/wp-content/uploads/2021/02/people.png (`img[src]`)
- `remote-image`: Removed a remote image: https://www.valemuslaw.com/wp-content/uploads/2022/03/practice.jpg (`img[src]`)
- `remote-image`: Removed a remote image: https://www.valemuslaw.com/wp-content/uploads/2022/11/tim-gouw-bwki71ap-y8-unsplash-300x200.jpg (`img[src]`)
- `remote-image`: Removed a remote image: https://www.valemuslaw.com/wp-content/uploads/2022/07/JULIA-CLULEY.jpg (`img[src]`)
- `remote-image`: Removed a remote image: https://www.valemuslaw.com/wp-content/uploads/2022/05/JOANNA-ABRAHAMS.jpg (`img[src]`)
- `remote-image`: Removed a remote image: https://www.valemuslaw.com/wp-content/uploads/2022/03/Footer-logo.svg (`img[src]`)
- `remote-form-action`: Removed a remote form action: https://www.valemuslaw.com/ (`form[action]`)
- `remote-asset`: Removed a remote embedded asset: https://cdn.yoshki.com/iframe/55845r.html (`[src]`)
- `remote-asset`: Removed a remote embedded asset: https://www.googletagmanager.com/ns.html?id=GTM-5392T93 (`[src]`)
- `remote-css-url`: Removed a remote CSS url() from an inline style. (`[style]`)
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
