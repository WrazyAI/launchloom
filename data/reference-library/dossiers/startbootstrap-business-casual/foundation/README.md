# Source foundation: startbootstrap-business-casual

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `startbootstrap-business-casual`
- Source: Business Casual by Start Bootstrap
- Source URL: https://startbootstrap.github.io/startbootstrap-business-casual/
- Rights: `licensed`
- License: MIT
- Credit: Template adapted from Business Casual by Start Bootstrap
- Source digest: `69c5dc4eaffb401c0f29b99a834f778f30859ecd2579dcc0f8f483a4d989cd03`
- Entrypoint: `source/index.html`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: `needs-adaptation`
- Sections: 7
- Content slots: 20
- Interactions: 1

Blockers:

- `unmapped-section-content`: Section 'unknown' has no supported content role. (`section`)

## Normalization removals

- None.

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
