# Source foundation: web-fitness-evolve-athletic

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `web-fitness-evolve-athletic`
- Source: Evolve Athletic official website
- Source URL: https://evolveathletic.com/
- Rights: `permission-cleared`
- License: permission-cleared
- Credit: Template adapted from Evolve Athletic official website
- Source digest: `a66603648ecd764a77d78725e11816d586767edd36542d56f9b59e4850aecfae`
- Entrypoint: `source/index.html`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: `needs-adaptation`
- Sections: 13
- Content slots: 28
- Interactions: 1

Blockers:

- `unmapped-repeated-items`: Repeated hero items in 'hero' have no sealed content mapping. (`header`)
- `unmapped-repeated-items`: Repeated unknown items in 'classes' have no sealed content mapping. (`#classes`)
- `unmapped-section-content`: Section 'classes' has no supported content role. (`#classes`)
- `unmapped-section-content`: Section 'estimate' preserves source composition that needs adaptation. (`section`)
- `unmapped-section-content`: Section 'train' has no supported content role. (`#train`)
- `unmapped-section-content`: Section 'unknown' has no supported content role. (`section`)

## Normalization removals

- `remote-stylesheet`: Removed a remote stylesheet: https://evolveathletic.com/ (`link[href]`)
- `remote-asset`: Removed a remote embedded asset: https://app.glofox.com/portal/#/branch/66a21f8034d47934ce0025f4/classes-day-view (`[src]`)
- `remote-asset`: Removed a remote embedded asset: https://maps.google.com/maps?q=loc:51.5550580,-0.0665046(Evolve+Athletic)&t=m&z=17&output=embed (`[src]`)
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
