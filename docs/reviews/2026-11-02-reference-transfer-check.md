# Reference recovery transfer-integrity check

**Result: transfer verified; no transfer discrepancy found.** This compares my
own recovery output with controller integration, not an independent review of
my implementation. Controller target is the immutable commit
`6230638594e0d7506b1cf9f41ef0874347f87562`; no later formatting/fix commits or
mutable controller/creative files are included.

## Exact comparisons

- Compared with data commit `12f785f7b01775b5781e879b007667c0de5077c0`
  and implementation commit `0cf72a444e9b12df7556694c8cf2d4e2f7a70f48`.
  All **4,254 `data/` tree entries** at controller target equal the implementation
  commit byte-for-byte. The implementation commit changed no data from the data
  commit. No transfer-time rights, extracted source, foundation, screenshot,
  core collection or index edits are hidden by formatting.
- Compared with recovery baseline `bf3e78b9`: all **129 original registry records**
  and **133 original entries in each index** are structurally unchanged. Exactly
  the same 17 IDs were added to all three inventories: 146 registry records and
  150 entries per index. Both `htmlcodex-gardener-garden-services` and
  `orgarden-gardening-services` remain present.
- All **3,629 pre-existing dossier blobs** equal baseline, including the five
  previously investigated veterinary CSS files. No incidental CSS normalization
  reached the integrated result.
- Fresh checks on all 17 new datasets confirm matching dossier/extraction/
  foundation IDs, production eligibility, extraction status, source digest and
  foundation compatibility across manifests/indexes. Rehashed **291 retained
  template files** against their extraction metadata. Rights remain 15 licensed
  and two permission-cleared; coffee retains requester testimony explicitly
  distinguished from independent ownership/operation verification. Existing
  license evidence is byte-identical to the recovered commit: five HTML5 UP,
  seven Start Bootstrap and three TemplateMo sources.
- Foundation additions remain one `renderable` and 16 `needs-adaptation`, not
  promoted or visually accepted. Approved inventory remains 115 and core 98.
  Reused the earlier extraction/index, 34 screenshot digest, 118 freshly compiled
  foundation-source, rights and actual-selection proofs through byte-identical
  data. Rechecked the sealed prior evidence manifest and all 45 linked hashes;
  no compiler was rerun against real assets.
- Exactly four relevant files differ from my implementation commit:
  `scripts/inspiration-registry.mjs`, `scripts/sync-reference-library.mjs`,
  `tests/inspiration-registry.test.ts`, `tests/reference-dossier.test.ts`.
  Each controller blob is **exactly** the installed Prettier formatter's output
  from my original blob. No hand-written behavioral delta was found. The other
  recovered prompt test is byte-identical. An initial TypeScript-printer
  equality probe was unsuitable because it retains layout-sensitive printing;
  the successful check compares exact formatter output instead.
- Therefore the recovered selector contract transfers unchanged: complete
  canonical defaults stay authoritative; specifically named references or
  canonical coverage below six can admit eligible supplements. Generic style
  wording does not opt in; no alias/new mode or eligibility/independence relaxation
  was introduced during transfer. Earlier all-17 and coffee-without-foundations
  selection evidence is inherited, not newly independent behavioral proof.
- `tests/provider-free-reference-integration.test.ts` differs only by two exact
  replacements: the inventory test title and `toHaveLength(98)` to
  `toHaveLength(115)`. All per-dossier prompt-builder checks, network-denial stub
  and `fetch`-not-called assertions remain byte-identical. Separate core-98
  invariants elsewhere remain intact. Controller's reported 120 passing tests
  were not rerun or presented as this audit's execution evidence.

## Non-green diagnostics and required gates

1. **Retained-source whitespace:** fresh
   `git diff --check bf3e78b9 62306385 -- data` exits **2** and reports exactly
   **206 paths**, comprising 133 template-source and 73 foundation-source paths.
   A whole recovered-range whitespace-clean claim would be false. A manual
   integration requirement for that exact command remains non-green and needs
   an explicit retained-byte disposition; do not rewrite licensed bytes or
   weaken validators to conceal it.
2. **Sync formatting:** the two landscaping manifests are baseline-byte-identical
   but not the sync CLI's two-space JSON serialization. Its committed lines
   396–420 compare raw serialized bytes and throw for these manifests. Thus
   `npm run sync:reference-library -- --check` **and the default no-flag command**
   remain failing. The prior recorded failure applies to identical input data
   and formatting-equivalent code. This is formatting drift, not loss, rights
   failure or a changed parsed record. No write/normalization command was run.
3. **Configured PR checks:** inspected `.github/workflows/validate.yml` at target.
   These data changes classify as runtime **and routes**, enabling application
   tests, admin build, Worker tests, Astro/Worker checks, production build and
   the synthetic route matrix. The workflow does **not** invoke sync, Prettier
   check, or `git diff --check`. Repository workflow/script/test/package search
   found no indirect invocation of those failing CLIs from these commands;
   tests import the sync builder, not its raw-byte-checking CLI entrypoint.
   Therefore neither disclosed diagnostic is a configured PR CI failure by
   itself. This does not prove current combined CI passes or inspect external
   GitHub branch-protection rules.
4. **Build/release verification:** package `build` is `astro build`, with no
   formatting/sync lifecycle gate. `verify:reference-templates` validates retained
   metadata/files and index coherence, not source whitespace; its previous
   150-dossier/zero-problem result transfers through exact bytes. The committed
   `verify:local-release` builds the selected client template and runs rendered
   revision plus SEO gates, not these formatting checks. Neither issue alone
   makes those commands fail. Real rendered acceptance, required CI and final
   combined release gates are still controller responsibilities, not inferred
   from this transfer check.

## Evidence and remaining integration work

Private audit results/scripts:
`/home/zahemen/worktree-reconciliation-2026-11-02/validation/reference-transfer/`
(`check.py`, `results.json`, `code-comparison.json`, `data-whitespace.log`).
Prior sealed evidence:
`/home/zahemen/worktree-reconciliation-2026-11-01/validation/ops/`, manifest
SHA-256 `b39a0fe8701ff351759bcde7ba9fe33f8fcd3f3870686f72f188d49a35247fd1`.

No runtime/data edits, full tests, compiler, installs, paid/production calls,
original or excluded reliability-worktree access, agents, pushes or deletions.
Only this authorized report is changed in the ops branch. Work OS remains open.
Controller must finish combined validation, receive the independent reference
implementation review from DeepSeek, and resolve source-disposition/deployment/
cleanup requirements. Juniper fixes are deliberately outside this check and
will be reviewed only when an exact follow-up range is requested.
