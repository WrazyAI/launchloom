# Source foundation: nightjar-cinematic-salon

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `nightjar-cinematic-salon`
- Source: LaunchLoom owned prototype
- Source URL: https://nightjar-cinematic-prototype.pages.dev/
- Rights: `owned`
- License: owned
- Credit: Template adapted from LaunchLoom owned prototype
- Source digest: `4754f3dc8252938cad1960c4d723993466093ad7c9b6646defbfbee45d02d3d3`
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
- Interactions: 2

Blockers:

- `missing-hero`: No hero section with an h1 was detected.
- `missing-services`: No services or portfolio section was detected.
- `network-script`: Foundation script contains a network, analytics, or tracking primitive; the foundation needs adaptation. (`script`)
- `unsafe-script-path`: Removed a script path that escapes the foundation source: /assets/index-CyZ5WcZQ.js (`script[src]`)

## Normalization removals

- `remote-stylesheet`: Removed a remote stylesheet: https://nightjarrecords.example/ (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://fonts.googleapis.com (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://fonts.gstatic.com (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://fonts.googleapis.com/css2?family=Italiana&family=Manrope:wght@400;500;600&display=swap (`link[href]`)

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
