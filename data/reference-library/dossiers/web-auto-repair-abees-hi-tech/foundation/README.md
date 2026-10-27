# Source foundation: web-auto-repair-abees-hi-tech

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `web-auto-repair-abees-hi-tech`
- Source: Abee's Hi-Tech Auto Service official website
- Source URL: https://www.abeesautomotive.com/
- Rights: `permission-cleared`
- License: permission-cleared
- Credit: Template adapted from Abee's Hi-Tech Auto Service official website
- Source digest: `4e68ae13415a07813c22cf884c1a9eb10e9aaa3b055e941ac41e282d00dc91e1`
- Entrypoint: `source/index.html`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: `needs-adaptation`
- Sections: 11
- Content slots: 24
- Interactions: 1

Blockers:

- `unmapped-repeated-items`: Repeated estimate items in 'estimate' have no sealed content mapping. (`section`)
- `unmapped-section-content`: Section 'estimate' preserves source composition that needs adaptation. (`section`)
- `unmapped-section-content`: Section 'plans' preserves source composition that needs adaptation. (`section`)
- `unmapped-section-content`: Section 'unknown' has no supported content role. (`section`)

## Normalization removals

- `remote-stylesheet`: Removed a remote stylesheet: https://abeesautomotive.com/ (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://booking.tekmetric.com/iframe/modal.css?time=1791490891025 (`link[href]`)
- `remote-asset`: Removed a remote embedded asset: https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3444.5!2d-97.7013!3d30.3707!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2s811+McPhaul+St%2C+Austin%2C+TX+78758!5e0!3m2!1sen!2sus!4v1721760000000 (`[src]`)

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
