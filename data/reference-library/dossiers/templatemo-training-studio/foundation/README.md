# Source foundation: templatemo-training-studio

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `templatemo-training-studio`
- Source: Training Studio by TemplateMo
- Source URL: https://templatemo.com/templates/templatemo_548_training_studio
- Rights: `licensed`
- License: TemplateMo free commercial-use terms
- Credit: Template adapted from Training Studio by TemplateMo
- Source digest: `4b9dea4dd0e4e30edd7c6205ba6ce162383a11011eee82a933c91b35dc0a6e96`
- Entrypoint: `source/index.html`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: `needs-adaptation`
- Sections: 9
- Content slots: 30
- Interactions: 1

Blockers:

- `unmapped-repeated-items`: Repeated hero items in 'hero' have no sealed content mapping. (`header`)
- `unmapped-repeated-items`: Repeated seasons items in 'our-classes' have no sealed content mapping. (`#our-classes`)
- `unmapped-repeated-items`: Repeated seasons items in 'schedule' have no sealed content mapping. (`#schedule`)
- `unmapped-repeated-items`: Repeated unknown items in 'trainers' have no sealed content mapping. (`#trainers`)
- `unmapped-section-content`: Section 'call-to-action' has no supported content role. (`#call-to-action`)
- `unmapped-section-content`: Section 'our-classes' preserves source composition that needs adaptation. (`#our-classes`)
- `unmapped-section-content`: Section 'schedule' preserves source composition that needs adaptation. (`#schedule`)
- `unmapped-section-content`: Section 'trainers' has no supported content role. (`#trainers`)

## Normalization removals

- `remote-asset`: Removed a remote embedded asset: https://maps.google.com/maps?q=Av.+L%C3%BAcio+Costa,+Rio+de+Janeiro+-+RJ,+Brazil&t=&z=13&ie=UTF8&iwloc=&output=embed (`[src]`)
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
