# Source foundation: spicer-roofing-storm-response

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `spicer-roofing-storm-response`
- Source: Spicer Designs Roofing website template
- Source URL: https://www.spicerdesigns.com/templates/roofing
- Rights: `licensed`
- License: licensed
- Credit: Template adapted from Spicer Designs Roofing website template
- Source digest: `cc928fb97cdf1eac03f5d2857b04bc78b2a5166d56257c439ed0f63449db0ffc`
- Entrypoint: `source/index.html`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: `needs-adaptation`
- Sections: 11
- Content slots: 32
- Interactions: 3

Blockers:

- `interactive-section-needs-adaptation`: Section 'quote' preserves an interactive source composition that needs adaptation. (`#quote`)
- `unmapped-repeated-items`: Repeated estimate items in 'quote' have no sealed content mapping. (`#quote`)
- `unmapped-repeated-items`: Repeated unknown items in 'unknown' have no sealed content mapping. (`section`)
- `unmapped-section-content`: Section 'damage' has no supported content role. (`#damage`)
- `unmapped-section-content`: Section 'quote' preserves source composition that needs adaptation. (`#quote`)
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
