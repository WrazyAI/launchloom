# Adaptive reasoning preflight

LaunchLoom chooses the Luna reasoning effort once per creative session, after
Reference DNA exists and before the first Luna authoring request.

The reasoning preflight is deliberately a semantic judgment layer, not an
execution agent. Jev classifies design difficulty; LaunchLoom owns thresholds,
fallbacks, session identity, OpenRouter calls, quality gates, promotion, and
cost policy.

## Rollout modes

`REASONING_PREFLIGHT_MODE` supports:

- `shadow` — default. Jev records the effort it would recommend, while the
  frozen production session executes at `xhigh`.
- `enforce` — the frozen production session executes the Jev-backed
  deterministic routing result: `xhigh` or `max`.

The initial production workflow defaults to shadow mode. Do not change the
default to enforce until paired xhigh/max evaluation has calibrated the routing
policy against LaunchLoom's rendered quality and cost outcomes.

## TypeSafe / Jev

The selector uses the direct TypeSafe System One HTTP API with the pinned model
`jev-1.13.0`.

Environment:

- `TYPESAFE_API_KEY` — optional at workflow level because selector failure
  must not block generation.
- `TYPESAFE_BASE_URL` — defaults to `https://api.typesafe.ai`.
- `REASONING_PREFLIGHT_MODEL` — defaults to `jev-1.13.0`.
- `REASONING_PREFLIGHT_TIMEOUT_MS` — defaults to 4000 ms.
- `TYPESAFE_INPUT_USD_PER_MILLION` — defaults to the currently configured
  accounting rate of 0.042 USD per million input tokens.

The selector makes one request with five independent Score judgments:

1. reference translation difficulty;
2. composition novelty;
3. responsive recomposition difficulty;
4. interaction/motion coupling;
5. constraint coupling.

The request state is derived only from Reference DNA and route mechanics. It
excludes screenshots, screenshot paths, business contact details, authored
source, compiler prompts, and cache metadata.

## Deterministic routing

Jev does not output the final LaunchLoom action. Its typed scores,
probabilities, and confidence values are normalized, then LaunchLoom applies the
versioned `adaptive-reasoning-v1` policy.

The provisional shadow policy has:

- hard Max triggers for strong level-3 probabilities on translation,
  composition, responsive, or interaction difficulty;
- a weighted composite threshold;
- a confidence floor;
- a Max bias for borderline decisions.

These thresholds are intentionally versioned and provisional. They must be
calibrated against paired xhigh/max LaunchLoom runs before enforce mode becomes
the production default.

## Failure behavior

TypeSafe is not a generation dependency.

If the selector is unavailable, times out, returns an invalid envelope, or
returns invalid score distributions:

- the recommendation becomes `max`;
- `fallbackUsed` is recorded;
- enforce mode executes `max`;
- shadow mode still executes its fixed `xhigh` baseline.

There is no selector retry cascade.

## Frozen session

The preflight writes `.launchloom/reasoning-preflight.json` (or the supplied
output path) with:

- selector/model versions;
- state digest;
- typed judgments;
- policy snapshot;
- recommendation;
- actual session effort;
- reason codes;
- fallback state;
- selector latency and token/cost telemetry;
- a hashed `launchloom:creative:...` session id.

Once the session is created, authoring and rendered creative repair use the
same `reasoningEffort` and `sessionId`. The author no longer downgrades
reasoning effort on validation-repair retries when an adaptive session is
present.

Bounded developer/client revisions reuse the persisted session artifact.
Structural redesigns that rebuild Reference DNA should create a new preflight
session instead.

## Cache behavior

The selected effort and reasoning policy version are included in OpenRouter
session/cache identity for authoring and repairs. This keeps xhigh and max
sessions in separate cache families while preserving the existing stable
compiler and route/reference cache boundaries.

## Evidence and evaluation

The production workflow stores the preflight artifact alongside authored
experience evidence and copies it into the generated client's
`.launchloom/reasoning-preflight.json`.

Before enforce mode is promoted to the default, run paired evaluations using
the same intake, content, references, and assets at xhigh and max. Compare:

- rendered reference fidelity;
- final visual-gate result;
- first-pass promotion rate;
- repair cycles;
- latency;
- OpenRouter prompt/cache/reasoning cost;
- cost per successful promoted candidate.

The router should be tuned for quality-adjusted generation cost, not for the
percentage of sessions assigned to either effort.
