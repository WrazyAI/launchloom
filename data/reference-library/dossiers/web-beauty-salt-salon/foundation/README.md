# Source foundation: web-beauty-salt-salon

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `web-beauty-salt-salon`
- Source: SALT contemporary salon official website
- Source URL: https://www.saltsalonlondon.com/
- Rights: `permission-cleared`
- License: permission-cleared
- Credit: Template adapted from SALT contemporary salon official website
- Source digest: `23baee6c99fd177b649afa7e5199aebc1c0d72ba566c30f9e202e2d2f79115c5`
- Entrypoint: `source/index.html`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: `needs-adaptation`
- Sections: 4
- Content slots: 14
- Interactions: 1

Blockers:

- `missing-services`: No services or portfolio section was detected.

## Normalization removals

- `remote-stylesheet`: Removed a remote stylesheet: https://images.squarespace-cdn.com/content/v1/65e856860f86596eb7d464e5/bd83aae9-a2d2-403c-8db2-3144c945b16a/favicon.ico?format=100w (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://images.squarespace-cdn.com/content/v1/65e856860f86596eb7d464e5/89934367-0f8f-4c20-b8af-62d8e4e178cb/favicon.ico?format=100w (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://www.saltsalonlondon.com (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: http://static1.squarespace.com/static/65e856860f86596eb7d464e5/t/65e85aee43a1a10cee725b73/1709726446617/Asset+22%402x.png?format=1500w (`link[href]`)
- `remote-image`: Removed a remote image: //images.squarespace-cdn.com/content/v1/65e856860f86596eb7d464e5/5bb49cec-a22c-4a4f-b6c1-8fee21a362e3/Asset+22%402x.png?format=1500w (`img[src]`)
- `remote-image`: Removed a remote image: //images.squarespace-cdn.com/content/v1/65e856860f86596eb7d464e5/2fa1b96f-2504-4243-b0b5-e7b3e900548a/Asset+22%402x.png?format=1500w (`img[src]`)
- `remote-image`: Removed a srcset with a remote image candidate. (`[srcset]`)
- `remote-asset`: Removed a remote embedded asset: blob:https://www.saltsalonlondon.com/ba45a799-5eff-44c2-baaa-af65673174e0 (`[src]`)

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
