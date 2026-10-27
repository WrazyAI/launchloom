# Source foundation: care-wellness-journal

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `care-wellness-journal`
- Source: LaunchLoom owned design study
- Source URL: https://github.com/WrazyAI/launchloom/tree/main/data/reference-library/dossiers/care-wellness-journal
- Rights: `owned`
- License: owned
- Credit: Template adapted from LaunchLoom owned design study
- Source digest: `563789072da1dee6623733961633685e3413028ca266c698a1a1be84028f3481`
- Entrypoint: `source/index.html`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: `needs-adaptation`
- Sections: 12
- Content slots: 28
- Interactions: 4

Blockers:

- `network-script`: Removed an inline script with a network, analytics, or tracking primitive. (`script`)
- `network-script`: Removed an inline script with a network, storage, navigation, or dynamic-code primitive. (`script`)
- `unmapped-repeated-items`: Repeated about items in 'care-hero' have no sealed content mapping. (`#care-hero`)

## Normalization removals

- `remote-stylesheet`: Removed a remote stylesheet: https://willowhearth.example/ (`link[href]`)
- `remote-image`: Removed a remote image: https://images.unsplash.com/photo-1543333995-a78aea2eee50?auto=format&fit=crop&w=1600&q=85 (`img[src]`)
- `remote-image`: Removed a remote image: https://images.unsplash.com/photo-1762955911431-4c44c7c3f408?auto=format&fit=crop&w=1200&q=85 (`img[src]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://willowhearth.example/services/companion-care/ (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://willowhearth.example/services/personal-care/ (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://willowhearth.example/services/respite-care/ (`link[href]`)
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
