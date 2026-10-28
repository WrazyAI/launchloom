# Source foundation: web-painting-av

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `web-painting-av`
- Source: AV Painting Seattle official website
- Source URL: https://www.avpainting.com/
- Rights: `permission-cleared`
- License: permission-cleared
- Credit: Template adapted from AV Painting Seattle official website
- Source digest: `f777adc0e5efdcaf98f97be6b9c5a4df1f8d9d2cb28af6428b0e16a2dd059437`
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

- `css-parse-failed`: Could not scope inline style: <css input>:1:24069: Unclosed block (`style`)
- `css-parse-failed`: Could not scope inline style: <css input>:1:277: Unknown word z-index (`style`)
- `missing-services`: No services or portfolio section was detected.
- `unmapped-repeated-items`: Repeated about items in 'about' have no sealed content mapping. (`header`)
- `unmapped-repeated-items`: Repeated hero items in 'hero' have no sealed content mapping. (`header`)

## Normalization removals

- `remote-stylesheet`: Removed a remote stylesheet: http://gmpg.org/xfn/11 (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://www.avpainting.com/favicon.ico (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://www.avpainting.com/ (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://www.avpainting.com/feed/ (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://www.avpainting.com/comments/feed/ (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://www.avpainting.com/wp-json/ (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://www.avpainting.com/wp-json/wp/v2/pages/85 (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://www.avpainting.com/xmlrpc.php?rsd (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://www.avpainting.com/wp-includes/wlwmanifest.xml (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://www.avpainting.com/wp-json/oembed/1.0/embed?url=https%3A%2F%2Fwww.avpainting.com%2F (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://www.avpainting.com/wp-json/oembed/1.0/embed?url=https%3A%2F%2Fwww.avpainting.com%2F&format=xml (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://www.avpainting.com/wp-content/uploads/2022/02/cropped-icon-32x32.png (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://www.avpainting.com/wp-content/uploads/2022/02/cropped-icon-192x192.png (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://www.avpainting.com/wp-content/uploads/2022/02/cropped-icon-180x180.png (`link[href]`)
- `remote-image`: Removed a remote image: https://www.avpainting.com/wp-content/uploads/2022/01/av-painting-logo-lt-green.png (`img[src]`)
- `remote-image`: Removed a remote image: https://www.avpainting.com/wp-content/themes/socius-theme-advantage/images/dummy.png (`img[src]`)
- `remote-image`: Removed a remote image: https://www.avpainting.com/wp-content/uploads/2022/02/logo-sticky.png (`img[src]`)
- `remote-form-action`: Removed a remote form action: https://sociusmarketing.wufoo.com/forms/z1lbl75n15s73an/ (`form[action]`)
- `remote-form-action`: Removed a remote form action: https://sociusmarketing.wufoo.com/forms/z1d8ruga07zz6bm/ (`form[action]`)
- `remote-asset`: Removed a remote embedded asset: https://www.googletagmanager.com/ns.html?id=GTM-PVVVB68 (`[src]`)
- `remote-asset`: Removed a remote embedded asset: https://api.leadconnectorhq.com/widget/survey/fG4bidapk0sPyzUDtBdh (`[src]`)
- `remote-asset`: Removed a remote embedded asset: https://sidebar.bugherd.com/sidebar/embed_html?apikey=[redacted] (`[src]`)
- `remote-css-url`: Removed a remote CSS url() from an inline style. (`[style]`)
- `source-form-removed`: Removed 2 source form(s); the shared lead form is the only conversion path.

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
