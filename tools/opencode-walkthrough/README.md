# Global OpenCode walkthrough verifier

Ask “Use `agent-walkthrough` to independently verify this change” or accept an
agent’s offer. A host **scoped runner** exercises one approved browser scenario
inside an isolated Chromium, writes screenshots and observations privately, and
the pinned DeepSeek child is designed to select and judge that evidence when the
provider is available. The child has no browser, shell, API, or file tools.

## Boundaries

- Linux with Bubblewrap (`bwrap`), Node 22+, Playwright Core, and a Chromium
  headless shell. The worker runs with `bwrap --unshare-all`, an empty
  environment, and no host home or project mounts.
- Only `http://127.0.0.1:<port>` is accepted. The stdio broker fulfills exact
  approved GET paths only; it forwards no headers or cookies, refuses redirects
  and compressed responses, and caps request count, body size, and time. The
  page has no outbound network, service workers, WebSockets, downloads,
  credentials, or project access; popups are closed best-effort.
- Actions are declarative: open an approved path, click or assert a role/name,
  screenshot, or call an approved GET with an expected status/JSON body. There
  is no shell, eval, arbitrary selector, navigation outside the manifest, or
  CLI. Popups are closed best-effort rather than prevented from brief execution.
  Only status, content type, and body are forwarded; CSP, cookies, CORS, and
  other response headers are dropped.
- The sandbox exposes `/usr`, runtime libraries, and the runner mounts
  read-only. It does not expose the host home or project directories. Server
  side effects are not sandboxed. Use a disposable synthetic fixture with no
  production credentials or outbound dependencies. Production writes, external
  origins, authentication, and offensive security work are out of scope.
- A run with any blocked or untested step exits nonzero; passed and failed
  verdicts remain in the JSON result.
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
node runner/approve.mjs /private/path/plan.json --out /private/path/approval.json
```

The command validates every scenario, refuses an empty scenario set, and writes
an approval artifact binding the exact manifest, its SHA-256 digest, and the
approved scenario IDs. It prints the digest and scenario IDs. Show the origin,
paths, scenarios, expected results, digest, and approval artifact to the user.
The pinned child may then choose exactly one listed scenario ID.

## Run and report

```sh
node runner/run.mjs /private/path/plan.json /private/path/approval.json <scenario-id> ~/.local/state/opencode/walkthroughs
```

The runner reads the approval artifact and rejects a mismatched manifest,
digest, scenario set, or scenario ID. It creates a fresh private `scoped-*`
directory containing `evidence/observations.json` and numbered PNG screenshots.
A run with blocked or untested steps exits nonzero. The parent validates
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
