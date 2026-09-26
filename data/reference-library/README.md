# LaunchLoom reference dossiers

This directory stores the production reference dossiers used by the creative
compiler. `core-collection.json` is the source of truth for the curated local
SEO set: exactly 30 unique references across 10 business niches, three per
niche. The production randomizer test verifies each group against the live
selector. Production compilation keys selection from the generated specific
`businessKind` ahead of broad intake buckets such as wellness or professional
services.

Preview the 30 opening compositions in
[`core-collection-hero-contact-sheet.png`](core-collection-hero-contact-sheet.png).
It is a thumbnail index only; each dossier's full-page desktop/mobile captures
and `design-prompt.md` are the authoritative references.

## Current inventory

Every dossier has:

- `manifest.json`: provenance, rights, full-page capture metadata, complete
  Reference DNA, supported business kinds, and curation status.
- `design-prompt.md`: an implementation brief describing the visual mechanics
  and how to translate them without copying source branding, copy, or assets.
- `screenshots/desktop.png` and `screenshots/mobile.png`: full-page captures
  at the viewport widths recorded in that dossier's manifest (desktop and
  compact mobile).

The 30 core IDs are enumerated in `core-collection.json`. Historical
LaunchLoom-owned studies and rejected or out-of-scope references remain in
legacy discovery folders and registry archive records; they are not
materialized in this production directory or selectable by the randomizer.
Their migration or disposition is a separate library-expansion task. The core includes home services,
dental, home care, fitness, restaurants, lodging, architecture/interior design,
law firms, beauty/grooming, and accounting.

Licensed references retain the applicable license and asset credits. Direct
site references retain a requester attestation for screenshot retention,
derived prompts, and model-reference use. For those attestations, no
source-owner grant was uploaded; the repository records the requester’s claim
and does not represent it as independently verified. Reference screenshots
are internal visual evidence, never client imagery or copy.

## Retention rule

Only owned, licensed, or explicitly permission-cleared references may be
materialized here. A1 Gallery, Lapa Ninja, MotionSites, Norrly, Godly, and
Awwwards remain discovery/research sources unless rights for the exact
screenshots and prompts allow persistent storage. Do not copy gallery assets,
source code, or source prompts into the core without that grant. Prompts extract
transferable layout and interaction mechanics; client sites use their own
verified facts and assets.

For licensed or permission-cleared references, include a local rights record
and point to it with `source.rightsEvidencePath`; list license/asset evidence
in `source.assetEvidencePaths`. The loader refuses a dossier with only a
descriptive rights claim. The dossier digest includes screenshots and rights
evidence.

## Add a dossier

1. Confirm the exact screenshot and prompt rights before storing them.
2. Capture the entire desktop page and entire mobile page. Keep capture
   viewport dimensions in `manifest.json` and use the matching local files.
3. Write a `design-prompt.md` with visual hierarchy, page sequence, interaction,
  responsive translation, signature elements, prohibited patterns, and
  local-SEO/conversion constraints.
4. Add complete Reference DNA, provenance, rights evidence, business kinds, and
   the dossier path to `data/inspiration-registry.json`. Add a source to the
   30-entry collection only if it genuinely matches a niche; do not fill gaps
   with unrelated business types.
5. Run the tests and compile a production-style pack:

   ```sh
   npm test
   npm run compile:inspiration -- --config templates/client-site/src/site.config.json --out /tmp/inspiration-pack.json
   ```

   The compiler fails closed when a registered dossier is incomplete or its
   evidence differs from the registry source. Production selection also fails
   closed when fewer than three matching references are available.

`scripts/materialize-owned-reference-dossiers.mjs` is a migration helper for
those historical internal studies. It defaults to dry-run and never overwrites
existing dossier folders. New production references must be added separately,
with source license or explicit permission evidence recorded in the manifest
and its local rights folder. A requester attestation must be labeled as such;
do not imply it is an independently verified owner grant.
