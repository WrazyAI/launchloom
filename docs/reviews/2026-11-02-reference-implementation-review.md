# Reference implementation review: controller 62306385 vs 65cae064

Date: 2026-11-02 UTC
Reviewer scope: read-only, reference-only
Reviewed commit: `6230638594e0d7506b1cf9f41ef0874347f87562`
Base: `65cae064`
Worktree used for the bounded reading: controller checkout and exact Git objects
No source, test, data, original-worktree, or reliability-worktree change was made.

## Verdict

**Request changes before merge.** One rights-data contradiction is blocking:
both recovered coffee manifests still carry an `Owned source` review note while
the authoritative rights fields and requester attestation say
`permission-cleared` and explicitly deny ownership or operation verification.
This is not currently surfaced in the reference selection prompt, but it
contradicts the rights policy and can mislead review, audit, or future exports.

One non-blocking sync hardening gap was found. It does not affect the committed
17 dossiers because their normalized source URLs are unique, but the sync guard
is narrower than the stated no-collision policy.

No current selection-authorization bypass, arbitrary-network path, duplicate
dossier ID, or source URL collision was found in the reviewed data.

## P1 blocking: coffee review notes assert ownership that the rights record denies

Exact files and lines at `62306385`:

- `data/reference-library/dossiers/web-coffee-ember-roast/manifest.json:181-186`
- `data/reference-library/dossiers/web-coffee-marigold/manifest.json:183-188`

Both manifests contain:

```json
"review": {
  "status": "reviewed",
  "reviewer": "LaunchLoom design QA",
  "date": "2026-10-23",
  "notes": "... Owned source; retained as internal design-mechanics reference only."
}
```

The same manifests contain:

```json
"source": {
  "rights": "permission-cleared",
  "rightsEvidencePath": "rights/requester-attestation.md"
}
```

The attestation says the requester answered "Yes, both are authorized", confirms
reuse authorization, and explicitly states that this is not independent
verification that LaunchLoom owns or operates either business. The review date
`2026-10-23` also predates the `2026-11-01` permission record.

Bounded readback against the controller checkout:

```text
web-coffee-ember-roast {"rights":"permission-cleared","rightsPath":"rights/requester-attestation.md","reviewNotes":"... Owned source; ..."}
web-coffee-marigold    {"rights":"permission-cleared","rightsPath":"rights/requester-attestation.md","reviewNotes":"... Owned source; ..."}
```

Impact: the authoritative data contains an invented ownership assertion in the
same object that carries the narrower permission. Current `referenceDossierPromptBlock`
does not include `review.notes`, and selection uses `source.rights`, so this is
not a current provider-free selection failure. It is still a rights-data blocker
because the user explicitly required no invented rights claims and the review
record would be used by human reviewers or future dossier tooling.

Test gap: `tests/reference-dossier.test.ts:18-45` checks the attestation and scans
`rights/business-verification.md` and `rights/capture-record.md` for ownership
phrases, but does not scan `manifest.review.notes`. The regression therefore
passes despite the contradiction.

Required fix, owned by the reference/data stream rather than this review:

1. Replace both review notes with wording such as "Permission-cleared source;
   requester authorized reuse for internal design study; no ownership or
   operation verification was performed."
2. Re-date the review or add a re-review note after the 2026-11-01 permission.
3. Add a regression that scans `review.notes` and all rights/provenance text for
   unsupported ownership phrases.
4. Recompute the dossier digest through the normal sync path after changing the
   data.

## P2 non-blocking: sync source-URL dedup does not seed existing non-core records

Location: `scripts/sync-reference-library.mjs:232-263` and `:309-330`.

`sourceByUrl` is populated only from canonical core manifests. Supplemental
discovery checks a candidate against that core map and previously discovered
supplementals, but it does not seed the map from existing non-core registry
records. A future supplemental could share a normalized URL with an existing
non-core registry record and still be added, despite the stated no-collision
policy. The current `tests/inspiration-registry.test.ts` source-reuse test uses
an actual core URL, so it does not cover this case.

Current data check: all 146 registry records have unique normalized IDs and
unique normalized source URLs, including the 17 additions. No current collision
exists. This is a future-data guard gap, not a blocker for the reviewed 17.

Recommended hardening: seed `sourceByUrl` from every registry record with a valid
dossier path, or validate the final merged registry for normalized URL reuse,
and add a test using an existing non-core record as the duplicate source.

## What the selection and registration logic gets right

- Supplemental dossiers are discovered only from non-core directories with an
  explicit `productionEligible: true` manifest and a matching dossier ID.
- Source URL reuse, mismatched directory IDs, missing rights evidence, invalid
  DNA, missing screenshots, and invalid prompts fail closed during registration.
- Supplemental selection is gated by `requireDossiers`, business matching, six
  eligible references, structural independence, and either a specific
  `styleText` request or a supplied core pool below six.
- Supplemental business eligibility is recomputed from the validated dossier
  `businessKinds` and tags. A spoofed registry industry label does not grant
  eligibility; the added test covers that exact attempt.
- The 98 canonical core IDs remain the ordinary selection pool. The literal
  `coffee-shop` category remains fail-closed at three eligible references.
- All 17 additions are `productionEligible: true`: 15 licensed and 2
  permission-cleared. The two coffee dossiers point to a requester attestation
  and do not claim ownership in their `source.rights` or attestation.

## Rights and foundation limits

- HTML5 UP entries carry CC BY 3.0 license text; Start Bootstrap entries carry
  MIT license text; TemplateMo entries carry the retained terms record. The
  permission-cleared coffee entries retain a specific requester attestation.
- The coffee `review.notes` contradiction is the only unsupported ownership
  phrase found in the 17 new manifest files.
- One new foundation is renderable (`startbootstrap-grayscale`); the other 16 are
  `needs-adaptation`. The library foundation summary is 2 renderable, 146 needs
  adaptation, and 2 blocked. This is not evidence that all client sites are
  ready, and no new renderer or paid run is implied.
- The committed inventory is 150 dossiers, 148 extracted and 2 failed, with 146
  registry records and 115 production-eligible references. The provider-free
  count was corrected from 98 to 115; controller reports the focused suite green.

## Residual non-blocking limits

- `buildSyncedLibraryState` reads existing registry `dossierPath` values without
  an explicit `within` guard before loading a manifest. Production selection uses
  `loadReferenceDossier`, which rejects absolute/escaping paths and symlinks.
  Current registry paths are valid. This is a pre-existing sync-tool hardening
  opportunity, not a new data failure.
- The production-dossier validator allows a licensed or permission-cleared
  dossier with only free-text `rightsEvidence` and no local evidence path. All 17
  additions provide controlled evidence paths, so current data satisfies the
  requirement; future additions should be checked for the same policy.
- `normalizedSourceUrl` treats `http` and `https` as different; no current data
  collision exists. The P2 guard is the more relevant future hardening item.

## Verification performed

- Read the exact controller commit through `git show` and compared only the
  reference paths listed in the task.
- Loaded all 17 new dossiers through `loadReferenceDossier` in the controller
  checkout; all returned `productionEligible: true`, with 15 licensed and 2
  permission-cleared rights, and only the two coffee review notes contained
  `Owned source`.
- Normalized all 146 registry source URLs and found no duplicate IDs or duplicate
  normalized URLs, including the 17 additions.
- Inspected the new registration/selection tests, the source URL reuse test, the
  rights spoof test, the literal coffee-shop fail-closed test, the foundation
  index, and the 115-count provider-free correction.
- Did not run the full suite, a whole-library compiler, or a paid/provider run.
  Controller reports 2,821 full-suite passes with one expected count failure and
  120 provider-free passes after the count correction.

## Required next action

Fix the two coffee `review.notes` ownership assertions and add the missing
regression before integrating the reference stream. Treat the sync dedup guard
as a follow-up hardening item or fix it in the same data stream. Re-run the
focused reference tests and the combined controller verification after the data
change. This report is limited to the reference implementation and does not
clear the separate creative focus-ring scope adjustment.

# Review receipt: controller fix f113276d

Date: 2026-11-02 UTC
Reviewed exact commit: `f113276d694257838ba5bcb628312e34997e9c5b`
Parent: `66f2941f12362a06d000be1b97bf9ef274054c0d`

**Disposition: no blockers. P1 and P2 are resolved. No new behavior regression
was found in the scoped fix.**

## P1 resolved

The exact diff changes only the two coffee manifests and the related tests:

- `data/reference-library/dossiers/web-coffee-ember-roast/manifest.json:181-186`
- `data/reference-library/dossiers/web-coffee-marigold/manifest.json:183-188`

Both now use `review.date: "2026-11-02"` and state that the October 23 review
was a historical capture review, followed by a November 2 rights review against
the November 1 requester authorization. They explicitly say
`permission-cleared, not independently verified ownership or operation`. The
source rights and `rights/requester-attestation.md` remain unchanged.

`tests/reference-dossier.test.ts:35-40` now asserts that `manifest.review.notes`
does not contain `owned source`, does contain `permission-cleared`, and has a
review date on or after `2026-11-01`. This closes the exact test gap identified
in the review.

## P2 resolved

`scripts/sync-reference-library.mjs:220-229` now seeds `sourceByUrl` from every
existing registry record and throws on a normalized duplicate before core or
supplemental discovery. The new test at
`tests/inspiration-registry.test.ts:146-171` finds an existing non-core,
non-production record, points a supplemental at the same source URL, and
expects the sync to reject it. This covers the non-core case that was previously
unchecked.

Current registry data has 146 records, 146 unique IDs, and no duplicate
normalized source URLs. The stricter seed therefore does not break the reviewed
inventory; a future duplicate now fails closed, which is the intended policy.

## Scope and limits

- `git diff --name-status 66f2941f..f113276d` contains only the two coffee
  manifests, the sync script, the two tests, and the daily progress file.
- No source, extraction, screenshot, rights-attestation, or index byte changed.
- `git diff --check 66f2941f..f113276d` is clean.
- Controller reports RED 3 expected failures then GREEN 5 related tests,
  `verify-reference-templates` at 150 dossiers, 148 extracted, 2 existing
  failed, 0 problems, and clean Prettier/diff checks. This receipt independently
  confirms the exact code and data changes but does not rerun the full suite or
  whole-library compiler.

This receipt supersedes the earlier "Required next action" section for the
controller fix. The original P1/P2 findings remain historical and are now
closed. The creative worktree remains at `dd7a3e0d`; no creative production file
was changed by this receipt.
