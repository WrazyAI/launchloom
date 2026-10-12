# OpenCode Go: bounded live coding example

## Scope

The user explicitly authorized a small live example with the existing private
`OPENCODE_GO_API_KEY` and TestSprite at its installed absolute path. The key was
read in memory using Node's `parseEnv`, never printed, shell-sourced, copied into
the worktree, passed in command-line arguments, or supplied to TestSprite.

This was a supervised personal coding experiment using a fictional gardening
business, **Alder & Fern Garden Care**. No real client facts, assets or private
contact details were sent. No subscription, balance/overflow setting, production
provider default, workflow secret, deployment or hosted-client workload changed.
The production workload-permission question remains separate.

Source under test: neutral caller implementation `ce4cbb44`. The example uses
`completeGeneration` and `parseGenerationOutput`, not the full seven-stage
author CLI, production prompt pack, frozen reasoning preflight or promotion loop.
This is not a LaunchLoom production-site acceptance certificate.

## Live API evidence

Official Go docs and the public model catalog were re-read before dispatch:

- https://opencode.ai/v2/docs/console/go
- https://opencode.ai/zen/go/v1/models

| Item | Observation |
| --- | --- |
| Model | `gpt-6-luna` |
| Endpoint | `https://opencode.ai/zen/go/v1/responses` |
| Auth | Explicit Bearer credential read privately |
| Client identity | `launchloom-coding-example/0.1` |
| Routing | Stable `x-opencode-session` |
| Output | Strict JSON schema: HTML body fragment, CSS, JavaScript, rationale |
| Reasoning | `low` |
| Output cap | 6,000 tokens |
| HTTP/result | 200 / completed |
| Requests | One, no automatic retry or provider fallback |
| Elapsed | 45,745 ms |
| Input tokens | 584 |
| Output tokens | 5,951, including 84 reasoning tokens |
| Cache read/write | 0 / 0 |
| Cost | Unreported; not fabricated as a cash cost |

The response contained reasoning and assistant-message blocks. The adapter
normalized visible output, excluded reasoning and passed the completed gate and
JSON/key/type checks. Native strict-schema fields, low reasoning and stateless
`store:false` worked for this one request. This does not prove support for all
schema keywords, images, large stage budgets, concurrency, cache hits or quotas.
The advertised GPT Luna retention is up to 30 days; this request used only
synthetic data.

## Rendered example and safety

Artifacts are local, not deployed:

- `/tmp/opencode/launchloom-go-example/public/`: generated HTML, CSS, JavaScript.
- `/tmp/opencode/launchloom-go-example/summary.json`: sanitized API evidence.
- `/tmp/opencode/launchloom-go-example/output.json`: original structured output.
- `/tmp/opencode/launchloom-go-example/desktop.png` and `mobile.png`.
- `/tmp/opencode/launchloom-go-example/browser-evidence.json`.

Generated code was inspected before browser execution. The local host serves
only the three generated public assets, never repository files, `.env`, API
reports or credentials. A restrictive CSP blocks external connections, form
delivery, frames and embedded objects. No external page requests or POSTs were
observed. The questions helper is scripted, visibly not AI; opening the website
cannot trigger another model request.

Direct Playwright evidence at 1536x864 and 390x844:

- No JavaScript page errors.
- Native FAQ expands and remains expanded when the assistant opens.
- Assistant input/submission renders a local service answer; close works.
- Contact form preserves entered values and displays the honest demo/no-send
  message without requests.
- Desktop hero ends at y=564, within the initial viewport; no desktop overflow.
- **Mobile layout fails**: scroll width394 exceeds viewport390. Contact section
  bounding box is left=-4/right=394/width398. As-generated CSS needs a bounded
  correction; no output was silently patched to disguise this failure.

Screenshots show a coherent cream/forest/terracotta gardening design with custom
SVG art rather than unrelated stock. It is usable draft material, not production
approved: a full factual/schema/source/contrast/reference audit was not run.
The generic example also adds decorative numbered service rows, which should
not be accepted under LaunchLoom's canonical service-copy/layout direction.

## TestSprite

The previous command-not-found conclusion was a PATH issue. Explicit
`/home/zahemen/.nvm/versions/node/v24.20.0/bin/testsprite --version` reports0.11.0;
authentication works and includes run:tunnel. Existing project:
`5499ee40-5117-4ba8-ac00-684bce48fe81` (LaunchLoom).

Reused existing test `c0a6e5ce-1d6f-451f-b9fb-0efaf89a8296`, **Current generated
site conversion smoke test**, with its original six steps: navigate, click FAQs,
open a question, open Got questions, verify expanded answer and assistant input.
No new test, changed assertion, private credential upload or production target.

Run command:

```text
testsprite test run c0a6e5ce-1d6f-451f-b9fb-0efaf89a8296 \
  --local 4207 --local-host 127.0.0.1 --timeout 600 --output json \
  --summary-file /tmp/opencode/launchloom-go-example/testsprite-summary.json
```

The run was executed against this actual Go-authored local example, not an older
production build. **Passed**, run `61b9f63b-2ac6-4759-a747-45f9a1b9f73e`,
six of six steps, finished2026-10-12T17:20:39Z. Read back steps pinned to that run:
all four actions were executed; the two assertions specifically verify the
expanded FAQ answer and assistant input after those actions. No omitted actions
or unrelated generic visibility substitute was observed. The original smoke plan
was not edited or retried.

[Inspect the TestSprite execution](https://www.testsprite.com/dashboard-v3/o/b749ca60-b769-5a40-8264-9a8f76ea7eda/projects/5499ee40-5117-4ba8-ac00-684bce48fe81/execution/a5bd15e6-2764-4dd3-a4c4-acc5d54ac797).

This smoke plan does not cover layout overflow, full author orchestration or live
provider conformance; the independent mobile layout failure remains a separate
blocking observation despite the TestSprite smoke pass.

## Assessment so far

Direct Go access and the neutral Responses path work for this bounded coding
task. Output is coherent enough for supervised iteration, but the mobile defect
demonstrates why model success/HTTP200 is not site-release success. Keep current
source/rendered/contrast/factual gates; resolve hosted workload permission and
role-specific acceptance before any production switch. No multimodel performance
comparison or conclusion about long unattended generation is supported by one
request.
