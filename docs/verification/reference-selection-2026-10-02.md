# Canonical reference selection runtime audit

Verified 2026-10-02 against source main `861e02d`, using the real
`buildInspirationPack` with `requireDossiers: true`. Nifty parent: `sXC08aTzwY`.

## Method

For each of the 16 canonical niches, perform six sequential selections with
seed `core-audit-${niche.id}-${round}`, the niche's `businessKind`, empty
`styleTerms`, and the accumulated previous selections as `recentLaunches`.
Each history entry uses the same business kind and the selected reference IDs.
Replay the first request unchanged and compare its ordered reference IDs.
Assert three distinct references per selection and canonical niche membership.

This reads the current dossiers, rights eligibility and evidence through the
production selector. It does not invoke models, generate imagery, render a
client site, send mail or change selection history.

Input SHA256:

- `data/inspiration-registry.json`: `cc99335c0594114f631879d0637bb8a8a265c689657050ad1510a6ab0203c2b1`
- `data/reference-library/core-collection.json`: `0e17a2dcb2b6d84cf77056fd325c0ab87d9dae7909c17a8f1fd0d4137fcb6edd`

## Observed results

All 96 selections passed niche-membership and three-distinct-reference checks.
Every niche exposed all six eligible references, produced six distinct unordered
trios, and reproduced its first ordered selection. Exposure counts below follow
the order of `referenceIds` in the canonical collection.

| Niche | Exposure counts over six selections |
| --- | --- |
| home-services-trades | 3,3,3,3,3,3 |
| dental-practices | 3,3,3,4,3,2 |
| home-care-providers | 3,3,3,3,3,3 |
| gyms-and-fitness-studios | 3,4,3,3,3,2 |
| restaurants-and-cafes | 3,3,3,4,3,2 |
| hotels-and-lodging | 3,3,3,2,4,3 |
| architecture-and-interiors | 3,2,3,3,4,3 |
| law-firms | 3,3,3,3,3,3 |
| beauty-and-grooming | 3,2,4,3,3,3 |
| accountants-and-bookkeepers | 3,3,3,3,3,3 |
| auto-repair-shops | 4,3,3,3,2,3 |
| hvac-contractors | 3,3,3,3,3,3 |
| roofing-contractors | 3,2,3,3,4,3 |
| painting-contractors | 3,3,3,3,3,3 |
| real-estate-and-property | 3,3,3,3,3,3 |
| veterinary-and-pet-care | 3,3,3,2,3,4 |

## Evidence boundary

This verifies deterministic, history-aware source selection over the retained
96-reference library. It does not prove that authors render those references
well, that final candidates are screenshot-diverse, or that a cloud intake,
developer email, SEO release and scoped feedback revision succeed. Those remain
separate end-to-end obligations. Permission-cleared records rely on requester
attestation, not an independent source-owner clearance investigation.
