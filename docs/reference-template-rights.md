# Reference template rights and use policy

This record explains why source templates are retained in
`data/reference-library/dossiers/<id>/template/`, what each rights basis
covers, and the limits that apply until a separate attribution decision.

## Retention bases

- **owned**: LaunchLoom original studies and prototypes. Retained from local
  build artifacts. No third-party rights apply.
- **licensed**: HTML5UP (CC BY 3.0), Colorlib bootstrap-templates (MIT), and
  Spicer Designs (CC BY 4.0). The retained template copies the source package
  under the license recorded in each dossier's `rights/` folder.
- **permission-cleared**: direct business sites and gallery-discovered sites.
  The LaunchLoom requester confirmed on 2026-10-08 that rights were obtained
  to extract and retain each reference's direct source template and to use it
  for internal pipeline refinement. This extends the earlier
  screenshot-and-prompt attestations to template source retention.

Every non-owned extraction records a local
`rights/template-extraction.md` attestation and a source-level license or
permission evidence path. The template loader fails closed when the
attestation is missing.

## Use limits

The retained templates are internal reference material for pipeline
refinement, renderer-pack development, and design-mechanics study. Until the
attribution decision is settled:

- Source branding, copy, imagery, fonts, and code must not be transferred
  into client sites.
- Template-derived renderer output must not be published on a client site.
- Spicer Designs templates carry a footer-attribution condition in their
  CC BY 4.0 license; MIT and CC BY 3.0 sources require attribution if
  substantial portions are reused. Any future publication of derived output
  must resolve these obligations first.

## Extraction integrity

Each `template/extraction.json` records the method, source revision or capture
date, per-file SHA-256 values, excluded media, and an independent digest.
`npm run verify:reference-templates` re-verifies every retained byte against
the committed index without network access.

## Pack derivation status

Pilot wave 1 converts three licensed references into internal experience
packs: `stage-index` (HTML5UP Dimension), `editorial-ledger` (Colorlib
Caseworth), and `results-ledger` (Spicer Designs law template). The packs are
registered with `internalOnly: true`, never selected by production generation,
and render only for internal demo builds. No template-derived output serves a
client site until the attribution decision above is settled.
