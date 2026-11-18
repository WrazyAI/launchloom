# Global OpenCode walkthrough verifier

Ask “Use `agent-walkthrough` to independently verify this change” or accept an
agent’s offer. A host **scoped runner** exercises one approved browser scenario
inside an isolated Chromium, writes screenshots and observations privately, and
the pinned DeepSeek child independently selects and judges the evidence. The
child has no browser, shell, API, or file tools.

## Boundaries

- Linux with Bubblewrap (`bwrap`), Node 22+, Playwright Core, and a Chromium
  headless shell. The worker runs with `bwrap --unshare-all`, an empty
  environment, and no host home or project mounts.
- Only `http://127.0.0.1:<port>` is accepted. The stdio broker fulfills exact
  approved GET paths only; it forwards no headers or cookies, refuses redirects
  and compressed responses, and caps request count, body size, and time. The
  page has no outbound network, service workers, WebSockets, popups, downloads,
  files, credentials, or project access.
- Actions are declarative: open an approved path, click or assert a role/name,
  screenshot, or call an approved GET with an expected status/JSON body. There
  is no shell, eval, arbitrary selector, navigation outside the manifest, or
  CLI.
- Server-side effects are not sandboxed. Use a disposable synthetic fixture
  with no production credentials or outbound dependencies. Production writes,
  external origins, authentication, and offensive security work are out of
  scope.
- The child receives only sanitized observations by default. Screenshot
  understanding is a separate, unproven capability; never claim a pixel verdict
  without demonstrating it.
- Inference uses remote `opencode/deepseek-v4.1-flash-free#max`. Unavailable
  access or a model mismatch blocks the run; there is no automatic substitute.
- A tool denial is never permission to route around it. Never relay
  child-suggested commands or actions.

## Setup

Install the verifier agent and skill directories under the OpenCode V2 global
config directory (`opencode debug paths config`, normally
`~/.config/opencode`). Append `global-instructions.md` once to global
`AGENTS.md`; preserve any existing content and the `CLAUDE.md` fallback.

Set trusted absolute paths in the host environment (not in the manifest):

```sh
export WALKTHROUGH_PLAYWRIGHT_CORE=/absolute/path/to/node_modules/playwright-core
export WALKTHROUGH_CHROMIUM=/absolute/path/to/chrome-headless-shell
```

## Manifest and approval

```json
{
  "origin": "http://127.0.0.1:38211",
  "paths": ["/", "/health"],
  "scenarios": {
    "panel-filter": [
      {"type": "open", "path": "/"},
      {"type": "screenshot"},
      {"type": "click", "role": "button", "name": "Sites"},
      {"type": "visible", "role": "heading", "name": "Sites", "expected": true},
      {"type": "screenshot"},
      {"type": "http", "path": "/health", "status": 200, "json": {"ok": true}}
    ]
  }
}
```

Validate and approve it before running:

```sh
node runner/approve.mjs /private/path/plan.json
```

The command prints the SHA-256 digest and scenario IDs only if every scenario is
valid. Show the origin, paths, scenarios, expected results, and digest to the
user. The pinned child may then choose exactly one listed scenario ID.

## Run and report

```sh
node runner/run.mjs /private/path/plan.json <digest> <scenario-id> ~/.local/state/opencode/walkthroughs
```

The runner creates a fresh private `scoped-*` directory containing
`evidence/observations.json` and numbered PNG screenshots. The parent validates
`results.json`, writes the walkthrough, and links the evidence. Only the parent
writes the final report. Close the fixture yourself and delete obsolete runs
when they are no longer needed.

## Package tests

```sh
python3 -m unittest discover -s skills/agent-walkthrough/tests -v
WALKTHROUGH_CHROMIUM=/absolute/path/chrome-headless-shell \
WALKTHROUGH_PLAYWRIGHT_CORE=/absolute/path/playwright-core \
node --test skills/agent-walkthrough/runner/test.mjs
```
