# Source foundation: attested-dapper-dental

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `attested-dapper-dental`
- Source: Dapper Dental official website
- Source URL: https://www.dapperdental.com/
- Rights: `permission-cleared`
- License: permission-cleared
- Credit: Template adapted from Dapper Dental official website
- Source digest: `df7eee07a098b53e987749ad53cea68fbf2aae09318820c864f98e37172135ca`
- Entrypoint: `source/index.html`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: `needs-adaptation`
- Sections: 5
- Content slots: 13
- Interactions: 1

Blockers:

- `css-parse-failed`: Could not scope inline style: <css input>:8:2: Unknown word calc (`style`)
- `missing-hero`: No hero section with an h1 was detected.

## Normalization removals

- `remote-stylesheet`: Removed a remote stylesheet: https://cdn.prod.website-files.com/692f763c5fd2eb43d3068bf1/6930a31648378e61c7ac9af0_Favicon.png (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://cdn.prod.website-files.com/692f763c5fd2eb43d3068bf1/6930a31d630f1a2ab8dd41a5_Webclip.png (`link[href]`)
- `remote-stylesheet`: Removed a remote stylesheet: https://www.dapperdental.com (`link[href]`)
- `remote-image`: Removed a remote image: https://cdn.prod.website-files.com/692f763c5fd2eb43d3068bf1/69307750be4f73b8972f2226_footerLogo.svg (`img[src]`)
- `remote-image`: Removed a remote image: https://cdn.prod.website-files.com/692f763c5fd2eb43d3068bf1/6949783233c24736852b7d23_1210_Dapper%20Dental-165.jpg (`img[src]`)
- `remote-image`: Removed a remote image: https://cdn.prod.website-files.com/692f763c5fd2eb43d3068bf1/69309dc7999a80d64f72dac0_Rectangle%2011.jpg (`img[src]`)
- `remote-image`: Removed a remote image: https://cdn.prod.website-files.com/692f763c5fd2eb43d3068bf1/69306719e0ebbe2e205785a8_Polygon%203.svg (`img[src]`)
- `remote-image`: Removed a remote image: https://cdn.prod.website-files.com/692f763c5fd2eb43d3068bf1/694978902a54a5e3a9359d40_1210_Dapper%20Dental-176.jpg (`img[src]`)
- `remote-image`: Removed a remote image: https://cdn.prod.website-files.com/692f763c5fd2eb43d3068bf1/694978e30a02c4b157de03a3_1210_Dapper%20Dental-180.jpg (`img[src]`)
- `remote-image`: Removed a remote image: https://cdn.prod.website-files.com/692f763c5fd2eb43d3068bf1/69307011dcdae9abba5ed75e_computer.svg (`img[src]`)
- `remote-image`: Removed a remote image: https://cdn.prod.website-files.com/692f763c5fd2eb43d3068bf1/69307011b1cb42d110cc2238_headphones.svg (`img[src]`)
- `remote-image`: Removed a remote image: https://cdn.prod.website-files.com/692f763c5fd2eb43d3068bf1/693070111e220ec48dec7dc6_chair.svg (`img[src]`)
- `remote-image`: Removed a remote image: https://cdn.prod.website-files.com/692f763c5fd2eb43d3068bf1/69307ca6c089021a68c4dad6_backgroundLogo.svg (`img[src]`)
- `remote-image`: Removed a remote image: https://cdn.prod.website-files.com/692f763c5fd2eb43d3068bf1/69497949b005f11ea38e0621_1210_Dapper%20Dental-143.jpg (`img[src]`)
- `remote-image`: Removed a remote image: https://cdn.prod.website-files.com/692f763c5fd2eb43d3068bf1/694979adde1a8e8b835d446c_1210_Dapper%20Dental-240%20(1).jpg (`img[src]`)
- `remote-asset`: Removed a remote embedded asset: https://s3.us-east-1.amazonaws.com/s8e8.client-assets/Dapper+Dental/Hero+Loop_1.webm (`[src]`)
- `remote-asset`: Removed a remote embedded asset: https://player.vimeo.com/video/1151670794 (`[src]`)
- `remote-asset`: Removed a remote embedded asset: https://www.google.com/recaptcha/api2/anchor?ar=1&k=6LfUlFosAAAAABtf2yozfIWGT16o6MV6rS1IShtc&co=aHR0cHM6Ly93d3cuZGFwcGVyZGVudGFsLmNvbTo0NDM.&hl=en&v=nY0xPItgwtlvjEjk2TqdwOQz&size=normal&anchor-ms=20000&execute-ms=30000&cb=89s08myqh38t (`[src]`)
- `remote-asset`: Removed a remote embedded asset: https://www.googletagmanager.com/ns.html?id=GTM-5CPF6KLP (`[src]`)
- `remote-asset`: Removed a remote embedded asset: https://www.google.com/recaptcha/api2/bframe?hl=en&v=nY0xPItgwtlvjEjk2TqdwOQz&k=6LfUlFosAAAAABtf2yozfIWGT16o6MV6rS1IShtc&bft=0dAFcWeA4u_2db2gzmcY1CgYigxakCHY4UtW5hM-Zq7unejd6Hh-O9qOLT02iQ708-SAHlc3OMNoMahq1kYw0iSZqhVpEjKog_xQ (`[src]`)
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
