# Global OpenCode walkthrough verifier

Ask “Use `agent-walkthrough` to independently verify this change” or accept an
agent's offer. Specify the environment and allowable actions; the agent builds
a test spec, starts a fresh `walkthrough-verifier`, and links the walkthrough.
Browser, API, CLI, configuration and integration checks are supported when
the corresponding tools and environment are available.

## Installation and removal

Use the OpenCode V2 global config directory (`opencode debug paths config`,
normally `~/.config/opencode`). Copy `agents/walkthrough-verifier.md` and
`skills/agent-walkthrough/` to the corresponding locations. Do not overwrite
existing definitions blindly. Append `global-instructions.md` once to global
`AGENTS.md`; if this file does not exist, preserve any active global `CLAUDE.md`
fallback when creating it. Check for project-level definitions overriding the
global IDs. Remove those installed definitions and only the marked instruction
block to uninstall; if you created `AGENTS.md` over a fallback, restore its
previous state rather than leaving an empty overriding file.

## Evidence and limitations

Runs live under `~/.local/state/opencode/walkthroughs/`; delete obsolete runs
manually when no longer needed. Keep sensitive data out of artifacts. Inference
uses remote `opencode/deepseek-v4.1-flash-free#max`; unavailable access blocks
the run, not an automatic substitute. Browser capture does not establish image
understanding. A tool denial is not permission to route around it. Shell
approval delegates host authority to that precise command, not a sandbox.
Never approve a command you have not reviewed, or save a broad approval.

Run package tests from this directory with:

```sh
python3 -m unittest discover -s skills/agent-walkthrough/tests -v
```
