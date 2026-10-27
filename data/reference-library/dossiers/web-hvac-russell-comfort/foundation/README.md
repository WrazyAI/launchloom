# Source foundation: web-hvac-russell-comfort

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `web-hvac-russell-comfort`
- Source: Russell Comfort Solutions diagnostic HVAC official website
- Source URL: https://www.russellcomfort.com/
- Rights: `permission-cleared`
- License: permission-cleared
- Credit: Template adapted from Russell Comfort Solutions diagnostic HVAC official website
- Source digest: `827114cce489b869e41b81a4501d802a9e3849b19deb46d0a6244f152ce8ebe2`
- Entrypoint: `source/index.html`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: `needs-adaptation`
- Sections: 18
- Content slots: 44
- Interactions: 1

Blockers:

- `interactive-section-needs-adaptation`: Section 'quote-comparison' preserves an interactive source composition that needs adaptation. (`#quote-comparison`)
- `interactive-section-needs-adaptation`: Section 'seasons' preserves an interactive source composition that needs adaptation. (`section`)
- `unmapped-repeated-items`: Repeated about items in 'about' have no sealed content mapping. (`#about`)
- `unmapped-section-content`: Section 'quote-comparison' preserves source composition that needs adaptation. (`#quote-comparison`)
- `unmapped-section-content`: Section 'seasons' preserves source composition that needs adaptation. (`section`)
- `unmapped-section-content`: Section 'unknown' has no supported content role. (`section`)
- `unmapped-section-content`: Section 'why-choose-us' has no supported content role. (`#why-choose-us`)

## Normalization removals

- `remote-stylesheet`: Removed a remote stylesheet: https://russellcomfort.com (`link[href]`)
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
