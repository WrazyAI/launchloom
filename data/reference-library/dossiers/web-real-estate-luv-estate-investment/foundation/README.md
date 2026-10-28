# Source foundation: web-real-estate-luv-estate-investment

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `web-real-estate-luv-estate-investment`
- Source: LUV Estate official website
- Source URL: https://luv.estate/
- Rights: `permission-cleared`
- License: permission-cleared
- Credit: Template adapted from LUV Estate official website
- Source digest: `56b5e08341035bbd56bdda1a71530fe740ab827762cf416408bf52e78ee39472`
- Entrypoint: `source/index.html`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: `needs-adaptation`
- Sections: 16
- Content slots: 21
- Interactions: 1

Blockers:

- `missing-services`: No services or portfolio section was detected.
- `unmapped-repeated-items`: Repeated hero items in 'hero' have no sealed content mapping. (`header`)
- `unmapped-repeated-items`: Repeated unknown items in 'unknown-2' have no sealed content mapping. (`section`)
- `unmapped-section-content`: Section 'unknown-10' has no supported content role. (`article`)
- `unmapped-section-content`: Section 'unknown-2' has no supported content role. (`section`)
- `unmapped-section-content`: Section 'unknown-3' has no supported content role. (`article`)
- `unmapped-section-content`: Section 'unknown-4' has no supported content role. (`article`)
- `unmapped-section-content`: Section 'unknown-5' has no supported content role. (`article`)
- `unmapped-section-content`: Section 'unknown-6' has no supported content role. (`article`)
- `unmapped-section-content`: Section 'unknown-7' has no supported content role. (`article`)
- `unmapped-section-content`: Section 'unknown-8' has no supported content role. (`article`)
- `unmapped-section-content`: Section 'unknown-9' has no supported content role. (`article`)
- `unmapped-section-content`: Section 'unknown' has no supported content role. (`section`)

## Normalization removals

- `remote-stylesheet`: Removed a remote stylesheet: https://luv.estate (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://luv.estate/es (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://luv.estate/fr (`link[href]`)
- `remote-asset`: Removed a remote embedded asset: https://cdn.luv.studio/Estate-hero-video.mp4 (`[src]`)

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
