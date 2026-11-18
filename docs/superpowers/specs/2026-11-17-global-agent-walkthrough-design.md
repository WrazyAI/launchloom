# Global independent agent walkthroughs

## Approved intent

Provide a reusable OpenCode workflow across projects, not a LaunchLoom feature
or a hosted TestSprite clone. Agents suggest independent verification whenever
a change has a meaningful executable flow, including browser, API, CLI,
configuration, and integration behavior. They wait for approval before running.
The user approved this first version in conversation on 2026-11-17.

## Fixed decisions

- Use **DeepSeek V4.1 Flash, max**, pinned to
  `opencode/deepseek-v4.1-flash-free#max`, an available selector in this setup.
- Never silently substitute a provider, model, or reasoning variant. An
  unavailable model produces a blocked outcome and a request for direction.
- Install one global skill and one named verifier agent. Keep per-project
  requirements, fixtures, and evidence separate between runs.
- The main agent prepares a spec with prerequisites, exact environment and
  revision, safe fixture setup/cleanup, steps, expected results, and evidence.
- Delegate independently with original requirements and test access, not the
  implementer's assertion that the feature works. The verifier may inspect
  relevant code but must exercise the actual flow.
- Browser steps produce numbered screenshots with captions; nonvisual steps
  produce bounded, redacted command output, responses, or logs. Link evidence
  to the individual expectation it supports.
- Report each case as `passed`, `failed`, `blocked`, or `untested`; summarize
  limitations and skipped coverage. A screenshot or successful subprocess alone
  is not proof of correct behavior.
- The verifier does not edit application code or fix defects. Explicitly scoped
  evidence writes are allowed; fixture mutations require an approved disposable
  environment. Production writes, destructive operations, and external effects
  require explicit authorization.
- Existing repository gates remain mandatory. This workflow supplements rather
  than bypasses TestSprite or any other required check.

## Recommended implementation choices

Use a global `agent-walkthrough` skill, a `walkthrough-verifier` agent, and a
small global instruction block that makes primary agents suggest verification.
Suggestions are instruction-driven, not a guaranteed automatic hook. Suppress
duplicate offers after a decline in the same unchanged scope.

Keep runtime artifacts outside source checkouts, under
`~/.local/state/opencode/walkthroughs/<project-key>/<run-id>/`. Include
`spec.md`, `results.json`, `walkthrough.md`, and an `evidence/` directory.
Use Python standard-library scripts for evidence validation and synthetic
smoke fixtures, avoiding a new service, dependency stack, or CI integration.
These are implementation recommendations, not additional user requirements.

The report validator checks structural evidence integrity, not whether an
image proves an assertion. Test capture and screenshot understanding
separately. If the pinned model cannot interpret images, retain captured
screenshots for the user, rely on executable/DOM evidence only for supported
functional claims, and explicitly mark visual judgment blocked. Do not silently
add another model.

## Privacy and scope

Tool execution is local to the connected machine; model inference is remote.
Do not transmit credentials, private fixture data, or unredacted secrets in
reports or screenshots. Use synthetic fixtures and approved accounts. Pause
for login, MFA, CAPTCHA, or uncertain side effects.

## Implemented scoped runner

The first runner is evidence-review-driven. The host validates and writes a
hash-bound approval artifact for one loopback fixture manifest, then the pinned
child chooses exactly one listed scenario ID; the host records that selection
and the runner rejects an agent, session, provider, model, variant, or scenario
mismatch. A headless Chromium runs under
`bwrap --unshare-all` with no host home or project mounts; a stdio broker
fulfills only exact approved GET paths, without cookies, auth headers,
redirects, compression, WebSockets, popups, or arbitrary selectors. The host
writes screenshots and sanitized observations to a private run directory. A
run with blocked or untested steps exits nonzero. The child has no tools and
returns verdicts; it does not personally operate the browser. Server-side
fixture effects are not sandboxed, so fixtures must be disposable and
credential-free. CLI evidence remains a separate, parent-collected path.

This task does not authorize LaunchLoom application changes, generation,
deployment, or a push to its main branch. The isolated task branch holds the
recoverable design, plan, and eventual package source; the installed product
lives in the user's global OpenCode configuration.

## Acceptance evidence

1. Global agent/skill discovery and the exact model/variant are verified.
2. Contract/unit tests reject unsupported pass claims and unsafe evidence paths.
3. A fresh verifier exercises a disposable browser flow with screenshots, an
   API flow, and a CLI flow, producing actual versus expected evidence.
4. A deliberate regression is reported failed; an unavailable prerequisite is
   blocked; skipped steps are untested.
5. Screenshot interpretation is either demonstrated or explicitly unsupported.
6. Global installation preserves unrelated settings and existing instructions.
7. No implementation edits, silent fallback, or unauthorized external effects
   occur during verification.
