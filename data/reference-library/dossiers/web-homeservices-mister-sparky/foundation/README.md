# Source foundation: web-homeservices-mister-sparky

This foundation is a normalized copy of the retained reference template. It is
internal implementation material, not a client site. The agent starts from this
source and replaces the demo content with sealed client content.

## Source

- Dossier: `web-homeservices-mister-sparky`
- Source: Mister Sparky electrical services official website
- Source URL: https://www.mistersparky.com/
- Rights: `permission-cleared`
- License: permission-cleared
- Credit: Template adapted from Mister Sparky electrical services official website
- Source digest: `1a559539a8c5250c363a152af55a648d1904be880bafdcd8b11e59a934820237`
- Entrypoint: `source/index.html`

## Preservation contract

Keep the source's section order, CSS system, image roles, and native
interaction mechanics. Replace source copy, brand identity, demo facts, prices,
reviews, project names, people, and imagery with sealed client content. Do not
publish the source assets as client assets. Do not copy the source verbatim.

## Compatibility

- Status: `needs-adaptation`
- Sections: 12
- Content slots: 39
- Interactions: 3

Blockers:

- `css-parse-failed`: Could not scope inline style: <css input>:1:18027: Unexpected } (`style`)
- `unmapped-repeated-items`: Repeated hero items in 'mseheader' have no sealed content mapping. (`#mseHeader`)
- `unmapped-repeated-items`: Repeated unknown items in 'unknown-2' have no sealed content mapping. (`section`)
- `unmapped-repeated-items`: Repeated unknown items in 'unknown' have no sealed content mapping. (`section`)
- `unmapped-section-content`: Section 'ot-pc-lst' has no supported content role. (`#ot-pc-lst`)
- `unmapped-section-content`: Section 'plans' preserves source composition that needs adaptation. (`section`)
- `unmapped-section-content`: Section 'unknown-2' has no supported content role. (`section`)
- `unmapped-section-content`: Section 'unknown-3' has no supported content role. (`section`)
- `unmapped-section-content`: Section 'unknown' has no supported content role. (`section`)

## Normalization removals

- `remote-stylesheet`: Removed a remote stylesheet: https://www.mistersparky.com/ (`link[href]`)
- `remote-image`: Removed a remote image: https://lh3.googleusercontent.com/a/ACg8ocJKABlOT-LqN843aEPt14ZXsq8sj8OiAoMDzm2KL13jNftIGA=s128-c0x00000000-cc-rp-mo (`img[src]`)
- `remote-image`: Removed a remote image: https://lh3.googleusercontent.com/a/ACg8ocIj5rkZkGxFhPD-gvfSGY0tjLBolC5b-ORUQE5OGZ3jI2qlcg=s128-c0x00000000-cc-rp-mo (`img[src]`)
- `remote-image`: Removed a remote image: https://lh3.googleusercontent.com/a-/ALV-UjVbxLVfwiYf5ORsfvQ8V02rKoketND9o_8uqvvQInBuK-pyvrfq=s128-c0x00000000-cc-rp-mo (`img[src]`)
- `remote-image`: Removed a remote image: https://lh3.googleusercontent.com/a-/ALV-UjX8aLGdGvaLFXKc4jOVnQxLvxaaEteX_UHcP2WRN5fcnsEPfao=s128-c0x00000000-cc-rp-mo (`img[src]`)
- `remote-image`: Removed a remote image: https://cdn.cookielaw.org/logos/4eff64d7-87db-4e8c-9294-87c9841ee4d2/019d02f1-42de-7f60-afc1-d18345b2684f/7277a438-cdd1-4c0b-b66a-5514f279b4f6/MS_Logo_vA2_4c_f.png (`img[src]`)
- `remote-image`: Removed a remote image: https://cdn.cookielaw.org/logos/static/powered_by_logo.svg (`img[src]`)
- `remote-asset`: Removed a remote embedded asset: https://www.googletagmanager.com/ns.html?id=GTM-PPRZD5PQ (`[src]`)
- `remote-asset`: Removed a remote embedded asset: https://insight.adsrvr.org/track/cei?advertiser_id=o3xtxot&cookie_sync=1&upv=3.0.0&upid=lu3qbdr&ref=https%3A%2F%2Fwww.mistersparky.com%2F (`[src]`)
- `remote-asset`: Removed a remote embedded asset: https://insight.adsrvr.org/track/cei?advertiser_id=uj6y8k7&cookie_sync=1&upv=3.0.0&upid=27kyyoo&ref=https%3A%2F%2Fwww.mistersparky.com%2F (`[src]`)
- `remote-css-url`: Removed a remote CSS url() from an inline style. (`[style]`)
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
