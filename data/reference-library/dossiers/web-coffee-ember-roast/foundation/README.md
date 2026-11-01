# Source foundation: web-coffee-ember-roast

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `web-coffee-ember-roast`
- Source: Ember Roast Coffee Co. official website
- Source URL: https://emberroastcoffee.com/
- Rights: `permission-cleared`
- License: permission-cleared
- Credit: Template adapted from Ember Roast Coffee Co. official website
- Source digest: `1a65e2078fdbde075f8ffaa38dd19547a7726fafb6646f97c9e6984439b3512a`
- Entrypoint: `source/index.html`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: `needs-adaptation`
- Sections: 12
- Content slots: 34
- Interactions: 1

Blockers:

- `missing-css`: Missing local stylesheet(s): styles.css (`link[rel=stylesheet]`)
- `missing-services`: No services or portfolio section was detected.
- `unmapped-repeated-items`: Repeated hero items in 'hero' have no sealed content mapping. (`header`)
- `unmapped-repeated-items`: Repeated unknown items in 'subscription' have no sealed content mapping. (`#subscription`)
- `unmapped-section-content`: Section 'coffee' has no supported content role. (`#coffee`)
- `unmapped-section-content`: Section 'home' has no supported content role. (`#home`)
- `unmapped-section-content`: Section 'subscription' has no supported content role. (`#subscription`)
- `unmapped-section-content`: Section 'unknown' has no supported content role. (`section`)

## Normalization removals

- `remote-stylesheet`: Removed a remote stylesheet: https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Playfair+Display:wght@600;700;800&display=swap (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css (`link[href]`)
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
