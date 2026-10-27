# Source foundation: direct-robins-kaplan-law

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `direct-robins-kaplan-law`
- Source: Robins Kaplan official website
- Source URL: https://www.robinskaplan.com/
- Rights: `permission-cleared`
- License: permission-cleared
- Credit: Template adapted from Robins Kaplan official website
- Source digest: `5b899ff6bebd0eec43e4ed6371bb434bc743de4dc3bf78f5964fd36982d38b80`
- Entrypoint: `source/index.html`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: `needs-adaptation`
- Sections: 3
- Content slots: 12
- Interactions: 1

Blockers:

- `css-parse-failed`: Could not scope styles/01.css: <css input>:956:123: Unclosed comment (`styles/01.css`)
- `missing-services`: No services or portfolio section was detected.
- `unmapped-repeated-items`: Repeated hero items in 'header' have no sealed content mapping. (`#header`)

## Normalization removals

- `remote-stylesheet`: Removed a remote stylesheet: https://www.robinskaplan.com/ (`link[href]`)
- `remote-asset`: Removed a remote embedded asset: https://ftp.firmseek.com/robinskaplan-media/3_10_25 Homepage Video Update.mp4 (`[src]`)
- `remote-asset`: Removed a remote embedded asset:  https://www.googletagmanager.com/ns.html?id=GTM-MCHTQJ  (`[src]`)
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
