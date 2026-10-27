# Source foundation: a1-craft-collage-field

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `a1-craft-collage-field`
- Source: Craft product website
- Source URL: https://www.craft.do/
- Rights: `permission-cleared`
- License: permission-cleared
- Credit: Template adapted from Craft product website
- Source digest: `024bef64b96fe89575ef4d9a482d0ba97ea95278d9615aebcbce82b857b82302`
- Entrypoint: `source/index.html`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: `needs-adaptation`
- Sections: 10
- Content slots: 36
- Interactions: 1

Blockers:

- `interactive-section-needs-adaptation`: Section 'plans' preserves an interactive source composition that needs adaptation. (`section`)
- `unmapped-repeated-items`: Repeated hero items in 'mobile-header-content' have no sealed content mapping. (`#mobile-header-content`)
- `unmapped-repeated-items`: Repeated unknown items in 'unknown-4' have no sealed content mapping. (`section`)
- `unmapped-section-content`: Section 'plans' preserves source composition that needs adaptation. (`section`)
- `unmapped-section-content`: Section 'unknown-2' has no supported content role. (`section`)
- `unmapped-section-content`: Section 'unknown-3' has no supported content role. (`section`)
- `unmapped-section-content`: Section 'unknown-4' has no supported content role. (`section`)
- `unmapped-section-content`: Section 'unknown-5' has no supported content role. (`section`)
- `unmapped-section-content`: Section 'unknown' has no supported content role. (`section`)

## Normalization removals

- `remote-stylesheet`: Removed a remote stylesheet: https://www.craft.do (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://www.craft.do/ja (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://www.craft.do/vi (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://www.craft.do/zh-CN (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://www.craft.do/zh-TW (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://www.craft.do/it (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://www.craft.do/es (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://www.craft.do/de (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://www.craft.do/ko (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://www.craft.do/fr (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://www.craft.do/pl (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://www.craft.do/pt-BR (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://www.craft.do/feed/blog.xml (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://www.craft.do/favicons/light/favicon-light.ico (`link[href]`)

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
