# Source foundation: web-restaurant-leons-new-york

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `web-restaurant-leons-new-york`
- Source: Leon's official website
- Source URL: https://www.leonsnyc.com/
- Rights: `permission-cleared`
- License: permission-cleared
- Credit: Template adapted from Leon's official website
- Source digest: `8016558a76ad3b67612705a487c537698bb22eaae934607b9635dfa95a002e52`
- Entrypoint: `source/index.html`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: `needs-adaptation`
- Sections: 9
- Content slots: 27
- Interactions: 1

Blockers:

- `css-parse-failed`: Could not scope inline style: <css input>:2:9: Unknown word <link (`style`)
- `unmapped-repeated-items`: Repeated hero items in 'hero' have no sealed content mapping. (`header`)
- `unmapped-section-content`: Section 'unknown' has no supported content role. (`section`)

## Normalization removals

- `remote-stylesheet`: Removed a remote stylesheet: https://media-cdn.getbento.com/accounts/01359332439a404c173142d8ce66adcf/media/images/33633LeonsFavicon.png (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://www.leonsnyc.com/ (`link[href]`)
- `remote-image`: Removed a remote image: https://images.getbento.com/accounts/01359332439a404c173142d8ce66adcf/media/images/68955LeonsLogo_Verdigris.png (`img[src]`)
- `remote-asset`: Removed a remote embedded asset: https://www.google.com/recaptcha/enterprise/anchor?ar=1&k=6Ldh0uwrAAAAABZNEucYwqZZ3oOahk4lRhONMg5a&co=aHR0cHM6Ly93d3cubGVvbnNueWMuY29tOjQ0Mw..&hl=en&v=nY0xPItgwtlvjEjk2TqdwOQz&size=invisible&anchor-ms=20000&execute-ms=30000&cb=vdu2h7cyspe9 (`[src]`)
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
