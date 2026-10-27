# Source foundation: direct-brixton-cycles-community-workshop

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `direct-brixton-cycles-community-workshop`
- Source: Brixton Cycles official website
- Source URL: https://www.brixtoncycles.co.uk/
- Rights: `permission-cleared`
- License: permission-cleared
- Credit: Template adapted from Brixton Cycles official website
- Source digest: `640ab5857eaec3f05405270d2215f282003b7a36e1b5efa9ccdbfc4f5f6fead5`
- Entrypoint: `source/index.html`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: `needs-adaptation`
- Sections: 12
- Content slots: 38
- Interactions: 1

Blockers:

- `interactive-section-needs-adaptation`: Section 'workshop' preserves an interactive source composition that needs adaptation. (`#workshop`)
- `unmapped-repeated-items`: Repeated plans items in 'workshop' have no sealed content mapping. (`#workshop`)
- `unmapped-section-content`: Section 'community' has no supported content role. (`#community`)
- `unmapped-section-content`: Section 'shop' has no supported content role. (`#shop`)
- `unmapped-section-content`: Section 'top' has no supported content role. (`#top`)
- `unmapped-section-content`: Section 'unknown' has no supported content role. (`section`)
- `unmapped-section-content`: Section 'workshop' preserves source composition that needs adaptation. (`#workshop`)

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
