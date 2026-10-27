# Source foundation: direct-fogo-island-inn-hospitality

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `direct-fogo-island-inn-hospitality`
- Source: Fogo Island Inn official website
- Source URL: https://fogoislandinn.ca/
- Rights: `permission-cleared`
- License: permission-cleared
- Credit: Template adapted from Fogo Island Inn official website
- Source digest: `b7bd83586695e71cd2fdf166353b578736bbca30f57b2caf1250b1ba9a2a1f0d`
- Entrypoint: `source/index.html`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: `needs-adaptation`
- Sections: 1
- Content slots: 10
- Interactions: 1

Blockers:

- `css-parse-failed`: Could not scope styles/11.css: <css input>:1:31357: Unknown word display (`styles/11.css`)
- `missing-hero`: No hero section with an h1 was detected.
- `missing-services`: No services or portfolio section was detected.

## Normalization removals

- `remote-stylesheet`: Removed a remote stylesheet: https://fogoislandinn.ca/feed/ (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://fogoislandinn.ca/comments/feed/ (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://fogoislandinn.ca/wp-json/oembed/1.0/embed?url=https%3A%2F%2Ffogoislandinn.ca%2F (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://fogoislandinn.ca/wp-json/oembed/1.0/embed?url=https%3A%2F%2Ffogoislandinn.ca%2F&format=xml (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://fogoislandinn.ca/wp-json/ (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://fogoislandinn.ca/wp-json/wp/v2/pages/20 (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://fogoislandinn.ca/xmlrpc.php?rsd (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://fogoislandinn.ca/ (`link[href]`)
- `remote-image`: Removed a remote image: https://fogoislandinn.ca/wp-content/uploads/2026/09/P.FII_Alf_Coffen_In_the_Garden_Radish_Roots_1.jpg (`img[src]`)
- `remote-image`: Removed a remote image: https://fogoislandinn.ca/wp-content/uploads/2026/09/P.Fogo-Island-Inn-Exterior_Northern-Lights.jpg (`img[src]`)
- `remote-image`: Removed a remote image: https://fogoislandinn.ca/wp-content/uploads/2025/06/P.FII_Caribou-Herd_Rocky-Hills.jpg (`img[src]`)
- `remote-image`: Removed a remote image: https://fogoislandinn.ca/wp-content/uploads/2026/07/P.FII_Inn_Exterior_and_Coastline.jpg (`img[src]`)
- `remote-image`: Removed a remote image: https://fogoislandinn.ca/wp-content/uploads/2026/06/P.SF_Wade_Collins_Lobster_in_Trap_7.jpg (`img[src]`)
- `remote-image`: Removed a remote image: https://fogoislandinn.ca/wp-content/uploads/2026/06/Fogo_Island_Landscapes_2854.jpg (`img[src]`)
- `remote-image`: Removed a remote image: https://fogoislandinn.ca/wp-content/uploads/2024/07/relais-white-logo-288x300.png (`img[src]`)
- `remote-image`: Removed a remote image: https://fogoislandinn.ca/wp-content/uploads/2026/09/Michelin-2026-Three-Keys-Fogo-Island-Inn-Red-600x600.png (`img[src]`)
- `remote-image`: Removed a remote image: https://fogoislandinn.ca/wp-content/uploads/2024/02/Fogo-Island-Inn-Logo-White.svg (`img[src]`)
- `remote-asset`: Removed a remote embedded asset: https://www.google.com/recaptcha/api2/anchor?ar=1&k=6LeMBgMrAAAAACkSsgbmgI-FGPXyGlGzwrbq-33x&co=aHR0cHM6Ly9mb2dvaXNsYW5kaW5uLmNhOjQ0Mw..&hl=en&v=nY0xPItgwtlvjEjk2TqdwOQz&size=invisible&anchor-ms=20000&execute-ms=30000&cb=19vjhxi1wv7i (`[src]`)
- `remote-asset`: Removed a remote embedded asset: https://app.namastay.io/en/413468e3731e4ffdb548f609392cdcbchxtlqll0y4jpnu2n? (`[src]`)
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
