# Source foundation: attested-one-manor-place-dental

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `attested-one-manor-place-dental`
- Source: One Manor Place official website
- Source URL: https://omp.dentist/
- Rights: `permission-cleared`
- License: permission-cleared
- Credit: Template adapted from One Manor Place official website
- Source digest: `fe8d416d7b1769e1ddccc2560ddf445d6818ab04e644cf7da773df3680070ede`
- Entrypoint: `source/index.html`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: `needs-adaptation`
- Sections: 9
- Content slots: 15
- Interactions: 1

Blockers:

- `unmapped-repeated-items`: Repeated about items in 'team' have no sealed content mapping. (`#team`)
- `unmapped-repeated-items`: Repeated contact items in 'contact' have no sealed content mapping. (`#contact`)
- `unmapped-repeated-items`: Repeated hero items in 'hero' have no sealed content mapping. (`header`)
- `unmapped-section-content`: Section 'unknown-2' has no supported content role. (`section`)
- `unmapped-section-content`: Section 'unknown' has no supported content role. (`section`)

## Normalization removals

- `remote-stylesheet`: Removed a remote stylesheet: https://omp.dentist/media/site/cd8631c95e-1709905366/favicon.png (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://omp.dentist (`link[href]`)
- `remote-image`: Removed a remote image: https://omp.dentist/media/pages/home/7cfc7f84bc-1707221487/omp-banner-1200x-q80.webp (`img[src]`)
- `remote-image`: Removed a remote image: https://omp.dentist/media/pages/home/63c70a7f5e-1707299228/dental-practice-stoneybatter-1200x-q80.webp (`img[src]`)
- `remote-image`: Removed a remote image: https://omp.dentist/media/pages/home/39145ee410-1708941534/chris-hogg-dentist-stoneybatter-one-manor-place-1200x-q80.webp (`img[src]`)
- `remote-image`: Removed a remote image: https://omp.dentist/media/pages/home/c8a4cbbecc-1710167764/eithne-1200x-q80.webp (`img[src]`)
- `remote-image`: Removed a remote image: https://omp.dentist/media/pages/home/be95a4a209-1708941541/cathy-1-1200x-q80.webp (`img[src]`)
- `remote-image`: Removed a remote image: https://via.placeholder.com/500x400 (`img[src]`)
- `remote-image`: Removed a remote image: https://omp.dentist/media/pages/home/b4bfeee991-1708966499/chris-1.5-1200x-q80.webp (`img[src]`)
- `remote-image`: Removed a remote image: https://omp.dentist/media/pages/home/fcae4ba926-1710173213/staff-03-1200x-q80.webp (`img[src]`)
- `remote-image`: Removed a remote image: https://omp.dentist/media/pages/home/38915a6439-1707298858/testimonial-1-1200x-q80.webp (`img[src]`)
- `remote-image`: Removed a remote image: https://omp.dentist/media/pages/home/4b2e6dbac0-1707298932/testimonial-2-1200x-q80.webp (`img[src]`)
- `remote-image`: Removed a remote image: https://omp.dentist/media/site/496ba7d15b-1709121272/logotype-white.svg (`img[src]`)

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
