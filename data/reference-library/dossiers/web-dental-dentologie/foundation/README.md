# Source foundation: web-dental-dentologie

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `web-dental-dentologie`
- Source: Dentologie official website
- Source URL: https://dentologie.com/
- Rights: `permission-cleared`
- License: permission-cleared
- Credit: Template adapted from Dentologie official website
- Source digest: `e508df945406aa881e1df6ca62e18b12cb6f4d19816493f84cbb402a8a35ad6d`
- Entrypoint: `source/index.html`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: `needs-adaptation`
- Sections: 14
- Content slots: 30
- Interactions: 1

Blockers:

- `interactive-section-needs-adaptation`: Section 'plans-2' preserves an interactive source composition that needs adaptation. (`section`)
- `interactive-section-needs-adaptation`: Section 'plans' preserves an interactive source composition that needs adaptation. (`section`)
- `unmapped-repeated-items`: Repeated plans items in 'plans' have no sealed content mapping. (`section`)
- `unmapped-section-content`: Section 'plans-2' preserves source composition that needs adaptation. (`section`)
- `unmapped-section-content`: Section 'plans' preserves source composition that needs adaptation. (`section`)
- `unmapped-section-content`: Section 'unknown-2' has no supported content role. (`section`)
- `unmapped-section-content`: Section 'unknown' has no supported content role. (`section`)

## Normalization removals

- `remote-stylesheet`: Removed a remote stylesheet: https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700&display=swap (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://dentologie.com/ (`link[href]`)
- `remote-image`: Removed a remote image: https://d17exwsfn34axd.cloudfront.net/dentologie-logo.webp (`img[src]`)
- `remote-image`: Removed a remote image: https://d17exwsfn34axd.cloudfront.net/sanity/hero-main.webp (`img[src]`)
- `remote-image`: Removed a remote image: https://d17exwsfn34axd.cloudfront.net/sanity/about-hero.jpg (`img[src]`)
- `remote-image`: Removed a remote image: https://d17exwsfn34axd.cloudfront.net/sanity/service-first-visit.webp (`img[src]`)
- `remote-image`: Removed a remote image: https://d17exwsfn34axd.cloudfront.net/sanity/service-invisalign.webp (`img[src]`)
- `remote-image`: Removed a remote image: https://d17exwsfn34axd.cloudfront.net/sanity/service-emergency.webp (`img[src]`)
- `remote-image`: Removed a remote image: https://d17exwsfn34axd.cloudfront.net/sanity/insurance-bcbs.png (`img[src]`)
- `remote-image`: Removed a remote image: https://d17exwsfn34axd.cloudfront.net/sanity/insurance-aetna.png (`img[src]`)
- `remote-image`: Removed a remote image: https://d17exwsfn34axd.cloudfront.net/sanity/insurance-cigna.png (`img[src]`)
- `remote-image`: Removed a remote image: https://d17exwsfn34axd.cloudfront.net/sanity/insurance-delta.png (`img[src]`)
- `remote-image`: Removed a remote image: https://d17exwsfn34axd.cloudfront.net/sanity/insurance-guardian.png (`img[src]`)
- `remote-image`: Removed a remote image: https://d17exwsfn34axd.cloudfront.net/sanity/insurance-humana.png (`img[src]`)
- `remote-image`: Removed a remote image: https://d17exwsfn34axd.cloudfront.net/sanity/insurance-metlife.png (`img[src]`)
- `remote-image`: Removed a remote image: https://d17exwsfn34axd.cloudfront.net/sanity/insurance-principal.png (`img[src]`)
- `remote-image`: Removed a remote image: https://d17exwsfn34axd.cloudfront.net/sanity/insurance-united-concordia.webp (`img[src]`)
- `remote-image`: Removed a remote image: https://d17exwsfn34axd.cloudfront.net/sanity/insurance-uhc.webp (`img[src]`)
- `remote-image`: Removed a remote image: https://d17exwsfn34axd.cloudfront.net/sanity/locations-grid-1.webp (`img[src]`)
- `remote-image`: Removed a remote image: https://d17exwsfn34axd.cloudfront.net/sanity/locations-grid-2.webp (`img[src]`)
- `remote-image`: Removed a remote image: https://d17exwsfn34axd.cloudfront.net/sanity/locations-grid-3.webp (`img[src]`)
- `remote-image`: Removed a remote image: https://d17exwsfn34axd.cloudfront.net/sanity/locations-grid-4.webp (`img[src]`)
- `remote-image`: Removed a remote image: https://d17exwsfn34axd.cloudfront.net/sanity/fresh-approach.webp (`img[src]`)
- `remote-image`: Removed a remote image: https://d17exwsfn34axd.cloudfront.net/sanity/service-whitening.webp (`img[src]`)
- `remote-image`: Removed a remote image: https://d17exwsfn34axd.cloudfront.net/sanity/service-fillings.webp (`img[src]`)
- `remote-image`: Removed a remote image: https://d17exwsfn34axd.cloudfront.net/sanity/service-extractions.webp (`img[src]`)
- `remote-image`: Removed a remote image: https://d17exwsfn34axd.cloudfront.net/sanity/service-implants.webp (`img[src]`)
- `remote-image`: Removed a remote image: https://d17exwsfn34axd.cloudfront.net/sanity/service-scaling.webp (`img[src]`)
- `remote-asset`: Removed a remote embedded asset: https://www.googletagmanager.com/ns.html?id=GTM-MLDPHC3 (`[src]`)

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
