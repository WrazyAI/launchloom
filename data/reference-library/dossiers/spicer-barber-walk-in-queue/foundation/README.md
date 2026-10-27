# Source foundation: spicer-barber-walk-in-queue

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `spicer-barber-walk-in-queue`
- Source: Spicer Designs Barber Shop HTML template
- Source URL: https://www.spicerdesigns.com/templates/barber-shop
- Rights: `licensed`
- License: CC BY 4.0
- Credit: Template adapted from Spicer Designs Barber Shop HTML template
- Source digest: `7f401344bcdf23890b2370cd5d658c6a37efb8615af910706b95412997d5b5a6`
- Entrypoint: `source/index.html`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: `needs-adaptation`
- Sections: 10
- Content slots: 22
- Interactions: 2

Blockers:

- `missing-services`: No services or portfolio section was detected.
- `unmapped-repeated-items`: Repeated contact items in 'contact' have no sealed content mapping. (`section`)
- `unmapped-repeated-items`: Repeated plans items in 'when' have no sealed content mapping. (`#when`)
- `unmapped-section-content`: Section 'chairs' has no supported content role. (`#chairs`)
- `unmapped-section-content`: Section 'prices' has no supported content role. (`#prices`)
- `unmapped-section-content`: Section 'unknown-2' has no supported content role. (`section`)
- `unmapped-section-content`: Section 'unknown' has no supported content role. (`section`)
- `unmapped-section-content`: Section 'when' preserves source composition that needs adaptation. (`#when`)

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
