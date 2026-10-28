# Source foundation: web-restaurant-cafe-carmellini

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `web-restaurant-cafe-carmellini`
- Source: Café Carmellini official website
- Source URL: https://www.cafecarmellini.com/
- Rights: `permission-cleared`
- License: permission-cleared
- Credit: Template adapted from Café Carmellini official website
- Source digest: `384459d8aad5c3b6b31aa3ada9f31c21fdff7b92639124ad5f514b25a592a87e`
- Entrypoint: `source/index.html`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: `needs-adaptation`
- Sections: 8
- Content slots: 24
- Interactions: 1

Blockers:

- `unmapped-repeated-items`: Repeated hero items in 'hero' have no sealed content mapping. (`header`)
- `unmapped-section-content`: Section 'unknown-2' has no supported content role. (`section`)
- `unmapped-section-content`: Section 'unknown-3' has no supported content role. (`section`)
- `unmapped-section-content`: Section 'unknown' has no supported content role. (`section`)

## Normalization removals

- `remote-stylesheet`: Removed a remote stylesheet: https://media-cdn.getbento.com/accounts/b2adc7202c613d8d32788fbe45e0627f/media/images/61527cc-favi.png (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://www.cafecarmellini.com/ (`link[href]`)
- `remote-image`: Removed a remote image: https://images.getbento.com/accounts/b2adc7202c613d8d32788fbe45e0627f/media/images/31179cc-cream.png (`img[src]`)
- `remote-image`: Removed a remote image: https://images.getbento.com/accounts/b2adc7202c613d8d32788fbe45e0627f/media/images/231027_CafeCarmellini_MainLogoANIM_Crop.gif (`img[src]`)
- `remote-image`: Removed a remote image: https://images.getbento.com/accounts/b2adc7202c613d8d32788fbe45e0627f/media/images/80883Lobster_Cannelloni_au_Caviar_ES.jpg?w=1200&fit=crop&auto=compress,format&cs=origin&crop=focalpoint&fp-x=0.5&fp-y=0.5 (`img[src]`)
- `remote-image`: Removed a remote image: https://images.getbento.com/accounts/b2adc7202c613d8d32788fbe45e0627f/media/images/31382CafeÌ_Carmellini_Interior_Hero_WA.jpeg?w=1200&fit=crop&auto=compress,format&cs=origin&crop=focalpoint&fp-x=0.5&fp-y=0.5 (`img[src]`)
- `remote-image`: Removed a srcset with a remote image candidate. (`[srcset]`)
- `remote-asset`: Removed a remote embedded asset: https://www.google.com/recaptcha/enterprise/anchor?ar=1&k=6Ldh0uwrAAAAABZNEucYwqZZ3oOahk4lRhONMg5a&co=aHR0cHM6Ly93d3cuY2FmZWNhcm1lbGxpbmkuY29tOjQ0Mw..&hl=en&v=nY0xPItgwtlvjEjk2TqdwOQz&size=invisible&anchor-ms=20000&execute-ms=30000&cb=x22ceg95junb (`[src]`)
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
