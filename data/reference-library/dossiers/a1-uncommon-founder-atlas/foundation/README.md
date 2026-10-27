# Source foundation: a1-uncommon-founder-atlas

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `a1-uncommon-founder-atlas`
- Source: The Uncommon Founder coaching and advisory website
- Source URL: https://www.theuncommonfounder.com/
- Rights: `permission-cleared`
- License: permission-cleared
- Credit: Template adapted from The Uncommon Founder coaching and advisory website
- Source digest: `d303225b9aa8ddec4d1416cfd023beb13e1174c0499b9e85615085f2f1261bcf`
- Entrypoint: `source/index.html`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: `needs-adaptation`
- Sections: 13
- Content slots: 26
- Interactions: 1

Blockers:

- `unmapped-repeated-items`: Repeated about items in 'about' have no sealed content mapping. (`header`)
- `unmapped-section-content`: Section 'unknown' has no supported content role. (`section`)

## Normalization removals

- `remote-stylesheet`: Removed a remote stylesheet: https://www.theuncommonfounder.com/ (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://framerusercontent.com/images/eC6oFkDrrLkFgFlmLx2xb3A2tI.png (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://framerusercontent.com/images/lUAD6KLgHF78UKWIvJCz52IfwBM.png (`link[href]`)
- `remote-image`: Removed a remote image: https://framerusercontent.com/images/6tTbkXggWgQCAJ4DO2QEdXXmgM.svg?arrow=left (`img[src]`)
- `remote-image`: Removed a remote image: https://framerusercontent.com/images/11KSGbIZoRSg4pjdnUoif6MKHI.svg?arrow=right (`img[src]`)
- `remote-image`: Removed a remote image: https://framerusercontent.com/images/m5AQ4kXAq4hwQsoBrGoafFqEj4.png?width=220&height=80 (`img[src]`)
- `remote-image`: Removed a remote image: https://framerusercontent.com/images/GwQccfvj3nHPOTEB5LWdXtbICXM.png?width=400&height=443 (`img[src]`)
- `remote-image`: Removed a remote image: https://framerusercontent.com/images/e4LgPiJdOTl6bExzGh3RES28YzU.jpg?width=656&height=873 (`img[src]`)
- `remote-image`: Removed a remote image: https://i.ytimg.com/vi_webp/H5h_6tc1YMU/maxresdefault.webp (`img[src]`)
- `remote-image`: Removed a remote image: https://i.ytimg.com/vi_webp/8kWLcmfD4Fg/maxresdefault.webp (`img[src]`)
- `remote-asset`: Removed a remote embedded asset: https://www.youtube.com/embed/H5h_6tc1YMU?iv_load_policy=3&rel=0&modestbranding=1&playsinline=1&autoplay=0&color=white (`[src]`)
- `remote-asset`: Removed a remote embedded asset: https://www.youtube.com/embed/8kWLcmfD4Fg?iv_load_policy=3&rel=0&modestbranding=1&playsinline=1&autoplay=0&color=white (`[src]`)
- `remote-asset`: Removed a remote embedded asset: https://framer.com/edit?framerSiteId=1fabb8b5ae9d5c88e08b2a1776b3d928281ab6346bbf1aaeec98401b137d6860&source=www.theuncommonfounder.com&features=%7B%22editorBarDisableFrameAncestorsSecurity%22%3Afalse%2C%22onPageLocalizationSupport%22%3Atrue%2C%22onPageMoveTool%22%3Atrue%2C%22onPageRichTextBlockSelection%22%3Atrue%7D&loadStart=1791490331281 (`[src]`)
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
