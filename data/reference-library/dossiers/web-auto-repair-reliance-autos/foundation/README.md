# Source foundation: web-auto-repair-reliance-autos

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `web-auto-repair-reliance-autos`
- Source: Reliance Autos official website
- Source URL: https://www.relianceautos.co.uk/
- Rights: `permission-cleared`
- License: permission-cleared
- Credit: Template adapted from Reliance Autos official website
- Source digest: `15612089f2c4095a8f486620fb50d216b6a155af04c6e805fc22cf588674dc59`
- Entrypoint: `source/index.html`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: `needs-adaptation`
- Sections: 9
- Content slots: 24
- Interactions: 1

Blockers:

- `missing-hero`: No hero section with an h1 was detected.
- `unmapped-section-content`: Section 'plans' preserves source composition that needs adaptation. (`section`)

## Normalization removals

- `remote-stylesheet`: Removed a remote stylesheet: https://www.relianceautos.co.uk (`link[href]`)
- `remote-image`: Removed a remote image: https://res.cloudinary.com/dxvbes11v/image/upload/q_auto/f_auto/v1781012789/ChatGPT_Image_May_20_2026_at_12_10_31_PM_ny4ggs-removebg-preview_jiehf7.png (`img[src]`)
- `remote-image`: Removed a remote image: https://res.cloudinary.com/dxvbes11v/image/upload/q_auto/f_auto/v1779216028/Reliance_3_dxofcn.webp (`img[src]`)
- `remote-image`: Removed a remote image: https://res.cloudinary.com/dxvbes11v/image/upload/q_auto/f_auto/v1779216021/Reliance_1_fbhhdf.webp (`img[src]`)
- `remote-image`: Removed a remote image: https://res.cloudinary.com/dxvbes11v/image/upload/q_auto/f_auto/v1779216025/Reliance_2_uhyydn.webp (`img[src]`)
- `remote-asset`: Removed a remote embedded asset: https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2482.8!2d-0.022!3d51.528!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x48761b4fe91a0001%3A0x0!2s553+Arnold+Rd%2C+Bow%2C+London+E3+4NR!5e0!3m2!1sen!2suk!4v1 (`[src]`)

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
