# Near-miss harness verdict + DeepSeek V4.1 Flash migration

Approved 2026-10-17 (user message: "work on the harness-verdict change" and
"migrate to deepseek v4.1 flash max instead of gpt-6 luna"). Executed on
`codex/launchloom-creative-gate-recalibration`; Nifty creation was blocked by a
VPS outage (host unreachable), so this document is the pre-implementation
tracking record until the VPS returns.

## Change 1: creative-only runs conclude success when a near-miss preview is delivered

Current behavior: the creative stage records `previewed-with-open-findings`
with the near-miss block, the preview is delivered, but the technical stage's
contrast gate fails on the delivered candidate's unresolved states and the run
verdict (and workflow exit code) becomes `failed`. Run `39054754873` is the
reference case; `39054758530` shows the same delivery passing when the
candidate is cleaner.

Policy (user-approved): a near-miss delivery is the intended outcome for a
preview request, so a creative-only run that delivers
`previewed-with-open-findings` concludes as a successful run, and the
technical contrast result is recorded as open findings instead of a verdict
failure. Hard and structural checks stay absolute:

- Soften only when all of these hold: profile is `creative-only`; the
  creative stage was `passed` and carried a `nearMiss` block; the technical
  failure is a `PIPELINE_QUALITY_GATE` error whose failing gates are all the
  `contrast` gate.
- The rendered/route verification gate, browser errors, missing markers, and
  every other failure class still fail the run.
- `full-preview` (the production canary) is explicitly out of scope and keeps
  failing on contrast.
- The softened stage records `deliveryMode: "creative-near-miss"`,
  `openFindings: true`, the failing gate detail, and a note; the report gains
  `deliveryMode` at the top level so consumers can see why the contrast gate
  was not blocking.

Implementation lives in the `stage()` wrapper of `runPipelineTest` (the
tested boundary), not in the technical dependency, so the policy is covered by
the injected-dependency runner tests.

## Change 2: creative lane model `openai/gpt-6-luna` -> `opencode-go/deepseek-v4.1-flash` (max effort)

Live probes against the OpenCode Go Responses endpoint (2026-10-17, real key):

- `GET /v1/models` lists `deepseek-v4.1-flash`, `deepseek-v4-pro`, `glm-5.1`,
  `glm-5.2`, `glm-5.3`, and more; the slice is no longer luna-only.
- Structured output: strict `json_schema` completed.
- Vision: a base64 PNG probe answered `{"color":"red"}` correctly.
- Reasoning: `low`, `medium`, `high`, `xhigh`, and `max` all completed.

Steps:

1. `scripts/opencode-go.mjs`: extend `WIRE_MODELS` with
   `deepseek-v4.1-flash` (and the `opencode-go/` alias) plus `deepseek-v4-pro`;
   update the unsupported-model error text.
2. `scripts/creative-lane-inference.mjs`: add
   `creativeLaneDefaultModel(provider)` (go -> `opencode-go/deepseek-v4.1-flash`,
   openrouter -> `openai/gpt-6-luna`) and
   `creativeLaneDefaultEffort(provider)` (go -> `max`, openrouter -> the lane's
   existing default). `resolveGoLogicalModel`'s preferred default becomes the
   DeepSeek logical id.
3. Lane defaults switch to the shared helpers: authoring
   (`CREATIVE_EXPERIENCE_MODEL`), reference analyzer
   (`CREATIVE_REFERENCE_ANALYZER_MODEL`), rendered judge
   (`CREATIVE_REFERENCE_JUDGE_MODEL`), repairs, and the visual-gate Go
   substitution (`CREATIVE_EXPERIENCE_GO_MODEL`). Every explicit env override
   keeps working, and the OpenRouter fallback keeps the luna default.
4. Judge caching note: the judge model is part of the evidence cache key, so
   the first runs on DeepSeek re-judge every candidate; that is expected.
5. Docs and tests: update model references, the performance-doc switch table,
   and the Go-path tests that assert the wire model.
6. Validation: full battery, then a creative-only field pair (#158/#134) on
   the new model; near-miss delivery (or a strict selection) proves the
   migration. Integrate to `main` and verify the deployment afterwards.
