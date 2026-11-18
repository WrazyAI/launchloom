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

1. **Specify and approve.** Use `templates/spec.md`. Identify the exact checkout
   and revision (include dirty-change identity or explicit fixture version) and
   confirm it matches the running target. Write a manifest containing one
   loopback origin, exact GET paths, and up to 16 scenarios. Run
   `node <skill-dir>/runner/approve.mjs <manifest.json> --out <approval.json>`;
   it validates every scenario, refuses zero scenarios, and writes an approval
   artifact containing the exact manifest, its digest, and the approved scenario
   IDs. Show the user the origin, paths, scenarios, expected results, digest, and
   approval artifact before running.
   The runner is Linux-only and deliberately narrow: synthetic disposable
   fixtures, browser actions, bounded unauthenticated loopback GETs, screenshots,
   and observations. It does not run arbitrary CLI commands, reach external
   origins, handle auth, or authorize production writes. Server-side effects
   are not sandboxed, so the fixture must have no production credentials or
   outbound dependencies.
2. **Prepare.** Create a fresh private directory under
   `~/.local/state/opencode/walkthroughs/<project-key>/<run-id>/` with mode 700,
   `spec.md`, the approved manifest, and the digest. Keep `spec.md` outside the
   child's control. Use synthetic fixtures by default; disclose that model
   inference is remote. Never send secrets, private data, headers, cookies, or
   raw page content to the child.
3. **Check identity first.** In the target location, verify the effective skill source,
   the `walkthrough-verifier` definition, and its deny-only permissions.
   Block on same-ID overrides or mismatches. Launch a fresh named child with a
   harmless startup probe. Before sending a scenario list, verify the completed
   assistant-message metadata names the agent, provider `opencode`, model ID
   `deepseek-v4.1-flash-free`, and variant `max`. On any mismatch, block with
   no fallback and recheck identity on the verdict turn.
4. **Let the child select one scenario.** Send only original requirements,
   environment label, expected results, and the approved scenario IDs. Never
   send the implementer's verdict, page content, or artifact paths. Require
   exactly one ID from that list. Reject any other value and do not invent steps.
   Record the child’s selection with its agent, session ID, provider, exact
   model ID, and variant in a `selection.json` artifact. The runner rejects a
   selection whose scenario or identity does not match the approval artifact.
5. **Run the scoped runner.** From the host, run
   `node <skill-dir>/runner/run.mjs <manifest> <approval.json> <selection.json> <private-run-root>`.
   The runner reads the approval and selection artifacts and rejects a missing,
   tampered, or mismatched manifest, digest, scenario set, scenario ID, agent,
   session, provider, model, or variant. It creates an isolated Chromium under
   `bwrap --unshare-all` with an empty environment. It fulfills only exact
   approved GET paths through a stdio broker, caps requests and body sizes,
   refuses redirects and encoded responses, closes WebSockets and popups, and
   writes screenshots plus `observations.json` into a fresh private run
   directory. The page has no outbound network, credentials, or host home/project
   data. It cannot run arbitrary commands, selectors, or eval fragments. Only
   `/usr`, runtime libraries, and the runner mounts are visible. Popups are
   closed best-effort rather than prevented from brief execution; response
   headers other than status, content type, and body are not forwarded. A run
   with blocked or untested steps exits nonzero. If the runner reports blocked
   or the environment is unavailable, report that case blocked.
6. **Ask for independent verdicts.** Send the child only sanitized observations:
   step number, action type, expected result, status, HTTP status. It cannot see
   screenshots by default. If image understanding has been separately proven,
   pixel judgments may be included under a distinct capability; otherwise mark
   visual judgments blocked while keeping captures for the user. If the child is
   unavailable, keep captures for the user but mark the independent verdict
   blocked. The child must not claim it operated the browser.
7. **Check and present.** The parent writes `results.json` and `walkthrough.md`
   using known artifact paths from the runner, never paths emitted by the child.
   Compare the report to the approved spec, including expected case IDs and
   omitted coverage. Run
   `python3 <skill-dir>/scripts/check_evidence.py <run-directory>`. Inspect
   evidence and reject unsupported claims; the validator only checks structure.
   Use `templates/walkthrough.md` to present actual versus expected results and
   link real evidence. Attribute collection (scoped runner) and review
   (DeepSeek) separately, and state remaining mandatory project gates.
