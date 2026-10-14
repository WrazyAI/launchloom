# Dossier design guidance: provider-free verification

## Result and scope

The retained skill and refined dossier prompts work through the existing local
pipeline. No provider credentials (including dummy keys) were configured for
the new integration tests. No model request or paid verification tool was used.
Production provider wiring remains unchanged for the user's later migration.

This verifies prompt plumbing, evidence attachment, safety, reproducibility and
existing renderer compatibility. It does not claim that a future model will
produce good designs or follow every instruction. Prebuilt renderer fixture
screenshots are not newly model-authored designs from the refined prompts.

## Evidence

- All **131 dossiers** load and retain their required headings, source-specific
  brief, character budget and production/archive status (**96 production, 35
  archive**). Managed-block refresh preserves surrounding curator notes and is
  idempotent; malformed/duplicated markers and excessive prompts fail closed.
- Fresh selection across **16 niches / 48 bound routes** includes the exact new
  prompts. Old prompt bindings are rejected, not silently rewritten. Original
  source prose is unchanged in 129 dossiers; only Studio Peake and City Wide
  HVAC received paired-capture-informed clarification. No manifests, topology,
  rights, screenshots or extracted source templates were changed.
- `tests/provider-free-reference-integration.test.ts` evaluates the actual pure
  functions extracted by TypeScript AST from
  `scripts/author-production-experiences.mjs`, not duplicate test serializers.
  It intentionally does not import or execute the credential-gated CLI entrypoint.
  All **96 production dossiers x seven stages (672 contexts)** retain their exact
  brief, curated topology and prompt budget. Retry context retains the same brief.
- Actual `requestRepair` execution for Studio Peake, City Wide HVAC and Fixwell
  uses an in-memory replacement for the entire provider adapter. Global `fetch`
  throws on any attempted network use. Each request contains its exact refined
  brief and two images byte-identical to preparation of its real retained
  desktop/mobile captures. Missing reference evidence fails before the adapter.
  These deterministic responses test transport and response plumbing, not design
  intelligence or rendered fidelity of newly generated source.
- Archive regeneration's `buildArchiveDesignPrompt` uses the same refinement
  helper, preserving archive exclusion and the implementation brief.

## Commands and results

Node v24.16.0 was reused from the local toolchain. With its bin directory on
`PATH`, the final local run was:

```sh
npm test -- --maxWorkers=2 \
  tests/provider-free-reference-integration.test.ts \
  tests/refine-reference-design-prompts.test.ts \
  tests/production-experience-author.test.ts \
  tests/reference-dossier.test.ts \
  tests/reference-archive-index.test.ts \
  tests/reference-mobile-topology.test.ts \
  tests/materialize-a1-archive-dossiers.test.ts \
  tests/creative-compiler.test.ts \
  tests/inspiration-registry.test.ts \
  tests/page-recipe.test.ts tests/site-config.test.ts \
  tests/enrich-site-config.test.ts tests/prompt-evidence.test.ts \
  tests/author-prompt-budget.test.ts tests/creative-authoring-output.test.ts
```

**546/546 tests passed across 15 files** (126.65s). Each dossier is now a
separate case rather than one aggregate hashing/serialization case competing
with the five-second per-test timeout. No timeout or assertion gate was relaxed.
The first missing-evidence probe incorrectly retained a valid absolute-path
fallback; the corrected probe removes that fallback and passes. This was a test
setup issue, not a production change.

`npm run check`: **327 files, 0 errors, 0 warnings, 5 pre-existing hints**.
Root and client production builds/checks passed during implementation. The
refinement dry-run reports 131 briefs and zero changes.

```sh
TMPDIR=/tmp/opencode npm run build:experience-packs -- \
  --out /tmp/opencode/dossier-provider-free-demos
```

**45/45 renderer checks passed**: all six existing experience packs, their
registered light variants and primary dark variants, at 1536x864, 1366x768 and
390x844. The checker verifies pack/variant identity, one H1, navigation,
conversion placement, desktop hero fit, overflow, broken images/fragments,
browser errors, rendered em dashes and sampled text contrast (including an
activated qualifier option). No lead delivery or live client workflow is claimed.

Direct visual inspection: desktop/mobile screenshots for `stage-index`,
`editorial-ledger` and `results-ledger` light fixtures. Text, imagery, responsive
stacking and form/qualification regions render legibly without evident clipping.
These are unchanged prebuilt adapters, not a visual recuration of all 131 sources.

Local artifacts:
- `/tmp/opencode/dossier-provider-free-demos/index.html`
- `/tmp/opencode/dossier-provider-free-demos/screenshots/`
- `/tmp/opencode/dossier-design-guidance/fresh-pack-check.json`

No push, merge, deployment or provider migration was performed as part of this
verification. The lack of a provider key is not a blocker for the user's requested
local verification and should not be treated as a requirement to proceed.
