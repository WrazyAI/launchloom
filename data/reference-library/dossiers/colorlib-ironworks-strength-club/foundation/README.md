# Source foundation: colorlib-ironworks-strength-club

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `colorlib-ironworks-strength-club`
- Source: Colorlib Bootstrap Templates Ironworks
- Source URL: https://github.com/ColorlibHQ/bootstrap-templates/tree/f8b7fffcbee91bd8c24d4d57337c5cdb3435e1bf/ironworks
- Rights: `licensed`
- License: MIT
- Credit: Template adapted from Colorlib Bootstrap Templates Ironworks
- Source digest: `178dfef14e777a646ad0afcb5fd6ef7a2086ac007bddfc3883cb53f8c9e807a9`
- Entrypoint: `source/index.html`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: `needs-adaptation`
- Sections: 9
- Content slots: 19
- Interactions: 2

Blockers:

- `missing-services`: No services or portfolio section was detected.
- `network-script`: Foundation script contains a network, analytics, or tracking primitive; the foundation needs adaptation. (`script`)
- `network-script`: Removed a local script with a network, storage, navigation, or dynamic-code primitive: assets/js/main.js (`script[src]`)
- `unmapped-repeated-items`: Repeated contact items in 'trial' have no sealed content mapping. (`#trial`)
- `unmapped-repeated-items`: Repeated hero items in 'hero' have no sealed content mapping. (`header`)
- `unmapped-repeated-items`: Repeated plans items in 'plans' have no sealed content mapping. (`#plans`)
- `unmapped-repeated-items`: Repeated unknown items in 'timetable' have no sealed content mapping. (`#timetable`)
- `unmapped-section-content`: Section 'classes' has no supported content role. (`#classes`)
- `unmapped-section-content`: Section 'coaches' has no supported content role. (`#coaches`)
- `unmapped-section-content`: Section 'plans' preserves source composition that needs adaptation. (`#plans`)
- `unmapped-section-content`: Section 'timetable' has no supported content role. (`#timetable`)
- `unmapped-section-content`: Section 'unknown' has no supported content role. (`section`)

## Normalization removals

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
