# Source foundation: web-painting-novak

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `web-painting-novak`
- Source: Novak Painting Group Phoenix official website
- Source URL: https://www.novakpaintinggroup.com/
- Rights: `permission-cleared`
- License: permission-cleared
- Credit: Template adapted from Novak Painting Group Phoenix official website
- Source digest: `d8ecd97440e67e25bcce00652f71289330c05bba392bc10b6e28934f0b8291a4`
- Entrypoint: `source/index.html`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: `renderable`
- Sections: 14
- Content slots: 43
- Interactions: 2

Blockers:

- None.

## Normalization removals

- `remote-stylesheet`: Removed a remote stylesheet: https://novakpaintinggroup.com/ (`link[href]`)
- `remote-image`: Removed a remote image: https://ktunuekthpaqbvijarql.supabase.co/storage/v1/object/public/editor-uploads/novak-painting-group/1786725168256-logo_novak.png (`img[src]`)
- `remote-image`: Removed a remote image: https://ktunuekthpaqbvijarql.supabase.co/storage/v1/object/public/editor-uploads/novak-painting-group/1786737854619-image.png (`img[src]`)
- `remote-image`: Removed a remote image: https://ktunuekthpaqbvijarql.supabase.co/storage/v1/object/public/editor-uploads/novak-painting-group/1786739591469-image.png (`img[src]`)
- `remote-image`: Removed a remote image: https://ktunuekthpaqbvijarql.supabase.co/storage/v1/object/public/editor-uploads/novak-painting-group/1786739594882-image.png (`img[src]`)
- `remote-image`: Removed a remote image: https://ktunuekthpaqbvijarql.supabase.co/storage/v1/object/public/editor-uploads/novak-painting-group/1786739598520-image.png (`img[src]`)
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
