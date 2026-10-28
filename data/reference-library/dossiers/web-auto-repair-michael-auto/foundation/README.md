# Source foundation: web-auto-repair-michael-auto

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `web-auto-repair-michael-auto`
- Source: Michael Auto official website
- Source URL: https://www.michaelauto.co.uk/
- Rights: `permission-cleared`
- License: permission-cleared
- Credit: Template adapted from Michael Auto official website
- Source digest: `48026e23a7e1f7a75541ce5fd91af4a764ce9497f27b6b84d79dfb7e14f7ae91`
- Entrypoint: `source/index.html`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: `needs-adaptation`
- Sections: 12
- Content slots: 29
- Interactions: 1

Blockers:

- `interactive-section-needs-adaptation`: Section 'top' preserves an interactive source composition that needs adaptation. (`#top`)
- `unmapped-section-content`: Section 'find-us' has no supported content role. (`#find-us`)
- `unmapped-section-content`: Section 'top' preserves source composition that needs adaptation. (`#top`)
- `unmapped-section-content`: Section 'unknown' has no supported content role. (`section`)

## Normalization removals

- `remote-image`: Removed a remote image: https://lh3.googleusercontent.com/3VY7SwP4Ux-XOUOxm20D0xawcgvHyx-TZFzRl58wh7T2rM9aUdHJDCyCcDcAbXd9AtccHzep4Wu7tA-8sKSxV19anMOd1cCel3SSnP6nTNygzvaa2STaPF9DLTFBpQ=w1024-nu-rw-e365 (`img[src]`)
- `remote-asset`: Removed a remote embedded asset: https://www.google.com/maps?q=Michael+Auto+Brixton+London&output=embed (`[src]`)
- `remote-css-url`: Removed a remote CSS url() from an inline style. (`[style]`)

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
