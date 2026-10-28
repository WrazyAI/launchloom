# Source foundation: web-roofing-joe-hall

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `web-roofing-joe-hall`
- Source: Joe Hall Roofing and Contracting official website
- Source URL: https://joehallroofing.com/
- Rights: `permission-cleared`
- License: permission-cleared
- Credit: Template adapted from Joe Hall Roofing and Contracting official website
- Source digest: `7ce2cf141af93c3e6e89371765f5105e4471516863096884501e9f77e451559e`
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
- Interactions: 1

Blockers:

- `missing-hero`: No hero section with an h1 was detected.
- `missing-services`: No services or portfolio section was detected.

## Normalization removals

- `remote-image`: Removed a remote image: https://joehallroofing.com/wp-content/uploads/2026/03/Joe-Hall-Roofing-Team-North-Texas-scaled.jpg (`img[src]`)
- `remote-image`: Removed a remote image: https://joehallroofing.com/wp-content/uploads/2025/09/Best-Companies-2025.png (`img[src]`)
- `remote-image`: Removed a remote image: https://joehallroofing.com/wp-content/uploads/2025/09/Best-Companies-2024.png (`img[src]`)
- `remote-image`: Removed a remote image: https://joehallroofing.com/wp-content/uploads/2021/08/Nextdoor_logo_@2x.png (`img[src]`)
- `remote-image`: Removed a remote image: https://joehallroofing.com/wp-content/uploads/2021/08/Green-Best-of-2021-Logo_@2x.jpg (`img[src]`)
- `remote-image`: Removed a remote image: https://joehallroofing.com/wp-content/uploads/2021/08/Best-of-2020-Logo_@2x.png (`img[src]`)
- `remote-image`: Removed a remote image: https://joehallroofing.com/wp-content/plugins/instagram-feed-pro/img/placeholder.png (`img[src]`)
- `remote-asset`: Removed a remote embedded asset: https://www.googletagmanager.com/ns.html?id=GTM-M7CHXZC (`[src]`)
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
