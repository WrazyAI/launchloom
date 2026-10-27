# Source foundation: web-painting-mfl

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `web-painting-mfl`
- Source: MFL Painting San Diego official website
- Source URL: https://mflpainting.com/
- Rights: `permission-cleared`
- License: permission-cleared
- Credit: Template adapted from MFL Painting San Diego official website
- Source digest: `d582f8e6f219229d4f125192301f82fd6c5b2163b9beba9da7cb0d4d4e2e0c68`
- Entrypoint: `source/index.html`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: `needs-adaptation`
- Sections: 16
- Content slots: 49
- Interactions: 2

Blockers:

- `unmapped-repeated-items`: Repeated hero items in 'hero' have no sealed content mapping. (`header`)
- `unmapped-section-content`: Section 'estimate' preserves source composition that needs adaptation. (`section`)
- `unmapped-section-content`: Section 'unknown' has no supported content role. (`section`)

## Normalization removals

- `remote-stylesheet`: Removed a remote stylesheet: https://mflpainting.com/ (`link[href]`)
- `remote-asset`: Removed a remote embedded asset: https://www.localmarketingmanager.com/api/local-posts/mfl-painting-local-posts-widget (`[src]`)
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
