# Source-first creative authoring

`authorExperienceCandidates` now resolves each route independently through
`source-first-authoring.mjs`, then runs the normal candidate orchestrator with a
source-aware generation adapter. This is not a deterministic pack fallback.

## Decision and scope

`source-first` requires extraction hash/path/rights validation, an owned or explicitly
credited license basis, a static HTML entrypoint, retained local CSS dependencies,
no source scripts/embedded execution, and editable files within the existing80k
character cap. External Google Fonts links are not executed or transferred; the
client typography host owns fonts. Unsupported external stylesheets are fallback.
Source code requiring arbitrary build/install steps is not executed.

`reference-authoring` records a reason for absent/unavailable, sanitized, unsupported
or not-yet-rights-qualified source. Identity, integrity and license mismatches throw.
This decision precedes model calls. A rejected source edit is not a fallback event.

## Adaptation contract

HTML is parsed with parse5, not regular-expression tag rewriting. DOM hierarchy,
classes and CSS survive mechanical JSX conversion. Inline styles become class rules;
CSS resource/font imports are removed, client imagery is bound during edits, and
rules are scoped to the source root. Original JS is never executed. A safe native
motion stage extends the source implementation and returns cleanup/reduced motion.

The `experience` and `styles` provider stages return their usual JSON envelope, but
`content` is a JSON string containing only an `edits` array. Each edit has exact
`find`/`replace` strings against the current snapshot. The adapter validates unique,
nonoverlapping windows and the unchanged12edit/6kfragment/24kpatch/80kfile limits.
It applies edits centrally and passes the resulting source through normal validators.
On retry the model receives the latest successfully patched snapshot and the actual
validation failure. No whole-file replacement, raw-source execution or gate bypass.

Contract/inner-page/motion stages still use their existing outputs with source
baseline context. Dossier design prompt and paired reference images remain attached
by the current serializer, including retry context. The design-guidance workstream
can enrich these inputs without changing the adapter API.

## Evidence and lifetime

Private `source-baseline.json` records source identity, extraction manifest/hash,
original HTML/CSS, mechanically normalized baseline, render observations and edit
receipts. Desktop/mobile PNGs use a loopback server, CSP and network denial; they
identify inherited issues, not a quality-pass claim. Bundled assets remain private
baseline evidence. Final source is checked separately by all existing production
gates. `source-license.txt` retains the applicable license.

Metadata retains `sourceStrategy`; promotion verifies its baseline binding and root
marker before writing selection. The site layout renders credit from a trusted
local allowlist, outside agent markup; revision sync carries that component/helper.
Rendered bakeoff checks the required source credit on homepage and inner-page
viewports, rejecting absent, hidden, altered, nofollow or unreadably small credits.

## Validation limits

Tests must exercise mixed source/fallback orchestration, patch rejection, unchanged
original files, retries, attribution and actual rendered source-derived components.
Provider-free controlled edits prove the mechanism, not future model fidelity. A
live-provider run is separate evidence and must never be inferred from fixture
success. Unsupported source types remain explicitly reported until adapters exist.
