# Source foundation: spicer-accountant-deadline-calendar

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `spicer-accountant-deadline-calendar`
- Source: Spicer Designs Accountant template
- Source URL: https://www.spicerdesigns.com/templates/accountant
- Rights: `licensed`
- License: licensed
- Credit: Template adapted from Spicer Designs Accountant template
- Source digest: `b5faae4659204b9e0bd8ebb9f40ff04ca6aa486ae5a884c9c0c4a023e65d5703`
- Entrypoint: `source/index.html`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: `needs-adaptation`
- Sections: 12
- Content slots: 27
- Interactions: 2

Blockers:

- `missing-services`: No services or portfolio section was detected.
- `unmapped-repeated-items`: Repeated about items in 'about-3' have no sealed content mapping. (`section`)
- `unmapped-repeated-items`: Repeated seasons items in 'calendar' have no sealed content mapping. (`#calendar`)
- `unmapped-section-content`: Section 'calendar' preserves source composition that needs adaptation. (`#calendar`)
- `unmapped-section-content`: Section 'switching' has no supported content role. (`#switching`)
- `unmapped-section-content`: Section 'unknown' has no supported content role. (`section`)

## Normalization removals

- `remote-stylesheet`: Removed a remote stylesheet: https://fonts.googleapis.com (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://fonts.gstatic.com (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400;1,9..144,500&display=swap (`link[href]`)
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
