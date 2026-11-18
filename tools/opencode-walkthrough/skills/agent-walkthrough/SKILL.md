---
name: agent-walkthrough
description: Use when a change has an executable browser, API, CLI, configuration, or integration flow, or when the user wants independent test evidence or a screenshot walkthrough.
---

# Independent walkthrough

Offer one concrete independent walkthrough when it would verify a meaningful
behavior. Example: “Want DeepSeek to open the Sites panel, change its filter,
and show screenshots of each state?” An offer is not permission. Wait for
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
3. **Delegate.** Verify discovery of `walkthrough-verifier` and its exact
   `opencode/deepseek-v4.1-flash-free#max` pin; check for project overrides.
   Launch a fresh named child with the spec and run paths, not the implementer's
   verdict. Confirm the actual selector from runtime metadata, not self-report.
   If the pin, identity, or required permission cannot be confirmed, block the
   affected run with no fallback. Never silently swap agents or models.
4. **Check and present.** Compare `results.json` to the approved spec, including
   expected case IDs and omitted coverage. Run
   `python3 <skill-dir>/scripts/check_evidence.py <run-directory>`. Inspect
   evidence and reject unsupported claims; the validator only checks structure.
   Use `templates/walkthrough.md` to present actual versus expected results and
   link real evidence. Distinguish screenshot capture and image understanding.
   If artifacts must be copied from the browser or written by the parent,
   preserve attribution and do not fabricate any missing results.
