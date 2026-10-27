# Source foundation: trade-project-showcase

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `trade-project-showcase`
- Source: LaunchLoom owned design study
- Source URL: https://github.com/WrazyAI/launchloom/tree/main/data/reference-library/dossiers/trade-project-showcase
- Rights: `owned`
- License: owned
- Credit: Template adapted from LaunchLoom owned design study
- Source digest: `2f681df51dafaacac87063052537cc4d51e5189f7c45bab63ec881bc74bba09e`
- Entrypoint: `source/index.html`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: `needs-adaptation`
- Sections: 12
- Content slots: 29
- Interactions: 4

Blockers:

- `network-script`: Removed an inline script with a network, analytics, or tracking primitive. (`script`)
- `network-script`: Removed an inline script with a network, storage, navigation, or dynamic-code primitive. (`script`)

## Normalization removals

- `remote-stylesheet`: Removed a remote stylesheet: https://northline.example/ (`link[href]`)
- `remote-image`: Removed a remote image: https://images.unsplash.com/photo-1770756051811-1612ac8bedfa?auto=format&fit=crop&w=1600&q=85 (`img[src]`)
- `remote-image`: Removed a remote image: https://images.unsplash.com/photo-1571189437635-473398e910c1?auto=format&fit=crop&w=1200&q=85 (`img[src]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://northline.example/locations/fremont/ (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://northline.example/locations/newark/ (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://northline.example/locations/union-city/ (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://northline.example/services/garage-door-opener-service/ (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://northline.example/services/garage-door-repair/ (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://northline.example/services/garage-door-replacement/ (`link[href]`)
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
