# Source foundation: web-hospitality-wm-farmer-and-sons

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `web-hospitality-wm-farmer-and-sons`
- Source: Wm. Farmer & Sons official website
- Source URL: https://www.wmfarmerandsons.com/
- Rights: `permission-cleared`
- License: permission-cleared
- Credit: Template adapted from Wm. Farmer & Sons official website
- Source digest: `790c38d69c269ea306c38bb7fe70446deef1186d16de3d89e0454e5fb97ad354`
- Entrypoint: `source/index.html`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: `needs-adaptation`
- Sections: 8
- Content slots: 15
- Interactions: 1

Blockers:

- `css-parse-failed`: Could not scope inline style: <css input>:2:9: Unknown word <link (`style`)
- `unmapped-repeated-items`: Repeated hero items in 'hero' have no sealed content mapping. (`header`)
- `unmapped-section-content`: Section 'unknown-2' has no supported content role. (`section`)
- `unmapped-section-content`: Section 'unknown-3' has no supported content role. (`section`)
- `unmapped-section-content`: Section 'unknown' has no supported content role. (`section`)

## Normalization removals

- `remote-stylesheet`: Removed a remote stylesheet: https://media-cdn.getbento.com/accounts/6526603c6cb8aa9cd98f92fa409e3836/media/images/16209favicon.png (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://www.wmfarmerandsons.com/ (`link[href]`)
- `remote-image`: Removed a remote image: https://images.getbento.com/accounts/6526603c6cb8aa9cd98f92fa409e3836/media/images/33765logo-new.png (`img[src]`)
- `remote-image`: Removed a remote image: https://images.getbento.com/accounts/6526603c6cb8aa9cd98f92fa409e3836/media/images/1747688408820.png?w=1000&fit=max&auto=compress,format&cs=origin&h=1000 (`img[src]`)
- `remote-asset`: Removed a remote embedded asset: https://www.google.com/recaptcha/enterprise/anchor?ar=1&k=6Ldh0uwrAAAAABZNEucYwqZZ3oOahk4lRhONMg5a&co=aHR0cHM6Ly93d3cud21mYXJtZXJhbmRzb25zLmNvbTo0NDM.&hl=en&v=nY0xPItgwtlvjEjk2TqdwOQz&size=invisible&anchor-ms=20000&execute-ms=30000&cb=4in9i01fqe9f (`[src]`)
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
