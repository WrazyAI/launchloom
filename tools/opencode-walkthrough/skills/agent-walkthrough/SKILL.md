---
name: agent-walkthrough
description: Use when a change has an executable browser, API, CLI, configuration, or integration flow, or when the user wants independent test evidence or a screenshot walkthrough.
---

# Independent walkthrough

Offer one concrete walkthrough when it would verify a meaningful behavior.
Example: “Want a walkthrough of the Sites filter with screenshots and an
independent DeepSeek review of the results?” An offer is not permission. Wait for
approval of the target environment, actions, and any fixture mutations before
running. Do not repeat a declined offer for unchanged scope. Mandatory project
tests and gates still apply.

1. **Specify.** Use `templates/spec.md`. Identify the exact checkout and
   revision (include dirty-change identity or explicit fixture version) and
   confirm it matches the running target. Specify original requirements,
   prerequisites, safe fixtures and cleanup owner, allowed origins and
   commands, actions, expected results and evidence. Include a meaningful
   negative case where applicable and the existing relevant test commands.
2. **Prepare.** Create a fresh private directory under
   `~/.local/state/opencode/walkthroughs/<project-key>/<run-id>/` with
   `spec.md` and `evidence/`. Use synthetic fixtures by default; disclose that
   model inference is remote. Redact secrets and private data before tool output
   or screenshots reach the model; if that is not practical, block the case.
3. **Check identity first.** In the target location, verify the effective skill source,
   the `walkthrough-verifier` definition and its deny-only permissions, and the
   exact `opencode/deepseek-v4.1-flash-free#max` pin. Block on same-ID overrides
   or mismatches. Launch a fresh named child with a harmless startup probe.
   Before submitting real test data, check that its completed assistant-message
   metadata identifies the named agent, provider `opencode`, model ID
   `deepseek-v4.1-flash-free`, and variant `max`. If identity or permissions
   cannot be confirmed, block with no fallback. Recheck the verdict message.
4. **Collect and review.** This build is evidence-review-only. If the user expects
   DeepSeek itself to operate tools, report that mode blocked. If the user approves
   separate evidence collection, the collector runs only fixed, approved actions
   before submitting bounded, redacted observations and original requirements
   to the verified child. Never execute actions suggested by the child or
   route around a denial. Attribute collection and review separately. Do not
   provide the implementer's verdict. Keep `spec.md` outside the child's control.
5. **Check and present.** The parent writes `results.json` and `walkthrough.md`.
   Compare verdicts to the approved spec, including
   expected case IDs and omitted coverage. Run
   `python3 <skill-dir>/scripts/check_evidence.py <run-directory>`. Inspect
   evidence and reject unsupported claims; the validator only checks structure.
   Use `templates/walkthrough.md` to present actual versus expected results and
   link real evidence. Distinguish screenshot capture and image understanding.
   If artifacts must be copied from the browser or written by the parent,
   preserve attribution and do not fabricate any missing results.
