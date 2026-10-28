# Source foundation: quiet-care-consultation

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `quiet-care-consultation`
- Source: LaunchLoom owned design study
- Source URL: https://github.com/WrazyAI/launchloom/tree/main/data/reference-library/dossiers/quiet-care-consultation
- Rights: `owned`
- License: owned
- Credit: Template adapted from LaunchLoom owned design study
- Source digest: `13cdd1855b8328e55dc4ba341690db74330bf903bf552201c4e80b68a6f9c6d6`
- Entrypoint: `source/index.html`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: `needs-adaptation`
- Sections: 7
- Content slots: 14
- Interactions: 1

Blockers:

- `unmapped-section-content`: Section 'plans' preserves source composition that needs adaptation. (`section`)

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
