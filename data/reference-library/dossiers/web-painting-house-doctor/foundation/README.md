# Source foundation: web-painting-house-doctor

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `web-painting-house-doctor`
- Source: House Doctor Painting Bay Area official website
- Source URL: https://housedoctorpainting.com/
- Rights: `permission-cleared`
- License: permission-cleared
- Credit: Template adapted from House Doctor Painting Bay Area official website
- Source digest: `9982491956dad16d1bf418f035bd7bfafb9a9b1e882dc47b63897287be94bd05`
- Entrypoint: `source/index.html`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: `needs-adaptation`
- Sections: 18
- Content slots: 48
- Interactions: 3

Blockers:

- `interactive-section-needs-adaptation`: Section 'lead-chat-panel' preserves an interactive source composition that needs adaptation. (`#lead-chat-panel`)
- `unmapped-repeated-items`: Repeated about items in 'about' have no sealed content mapping. (`section`)
- `unmapped-repeated-items`: Repeated estimate items in 'estimate-2' have no sealed content mapping. (`section`)
- `unmapped-repeated-items`: Repeated estimate items in 'estimate' have no sealed content mapping. (`section`)
- `unmapped-repeated-items`: Repeated hero items in 'hero' have no sealed content mapping. (`header`)
- `unmapped-repeated-items`: Repeated plans items in 'plans' have no sealed content mapping. (`section`)
- `unmapped-section-content`: Section 'estimate-2' preserves source composition that needs adaptation. (`section`)
- `unmapped-section-content`: Section 'estimate-3' preserves source composition that needs adaptation. (`section`)
- `unmapped-section-content`: Section 'estimate' preserves source composition that needs adaptation. (`section`)
- `unmapped-section-content`: Section 'lead-chat-panel' preserves source composition that needs adaptation. (`#lead-chat-panel`)
- `unmapped-section-content`: Section 'plans-2' preserves source composition that needs adaptation. (`section`)
- `unmapped-section-content`: Section 'plans' preserves source composition that needs adaptation. (`section`)

## Normalization removals

- `remote-stylesheet`: Removed a remote stylesheet: https://housedoctorpainting.com/wp-content/uploads/2026/07/favicon-original.png (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://housedoctorpainting.com/wp-json/oembed/1.0/embed?url=https%3A%2F%2Fhousedoctorpainting.com%2F (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://housedoctorpainting.com/wp-json/oembed/1.0/embed?url=https%3A%2F%2Fhousedoctorpainting.com%2F&format=xml (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://housedoctorpainting.com/ (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://housedoctorpainting.com/wp-json/ (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://housedoctorpainting.com/wp-json/wp/v2/pages/4 (`link[href]`)
- `remote-image`: Removed a remote image: https://housedoctorpainting.com/wp-content/uploads/2026/07/house-doctor-logo.png (`img[src]`)
- `remote-image`: Removed a remote image: https://housedoctorpainting.com/wp-content/uploads/2026/07/interior.jpg (`img[src]`)
- `remote-image`: Removed a remote image: https://housedoctorpainting.com/wp-content/uploads/2026/07/residential.jpg (`img[src]`)
- `remote-image`: Removed a remote image: https://housedoctorpainting.com/wp-content/uploads/2026/07/commercial.jpg (`img[src]`)
- `remote-image`: Removed a remote image: https://housedoctorpainting.com/wp-content/uploads/2026/07/award-angies-2019.png (`img[src]`)
- `remote-image`: Removed a remote image: https://housedoctorpainting.com/wp-content/uploads/2026/07/award-homeadvisor-2020.png (`img[src]`)
- `remote-image`: Removed a remote image: https://housedoctorpainting.com/wp-content/uploads/2026/07/recent-project-15.jpg (`img[src]`)
- `remote-image`: Removed a remote image: https://housedoctorpainting.com/wp-content/uploads/2026/07/recent-project-1.jpg (`img[src]`)
- `remote-image`: Removed a remote image: https://housedoctorpainting.com/wp-content/uploads/2026/07/hayes-mansion-1.jpg (`img[src]`)
- `remote-image`: Removed a remote image: https://housedoctorpainting.com/wp-content/uploads/2026/07/commercial-crew.jpg (`img[src]`)
- `remote-image`: Removed a remote image: https://housedoctorpainting.com/wp-content/uploads/2026/07/recent-project-14.jpg (`img[src]`)
- `remote-image`: Removed a remote image: https://housedoctorpainting.com/wp-content/uploads/2026/07/toyota-project-1.jpg (`img[src]`)
- `remote-form-action`: Removed a remote form action: https://housedoctorpainting.com/wp-admin/admin-post.php (`form[action]`)
- `remote-css-url`: Removed a remote CSS url() from an inline style. (`[style]`)
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
