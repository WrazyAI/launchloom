# OpenCode Go production slice (author + site copy)

Operator decisions approved 2026-10-14: the user confirmed Go hosted terms
permit unattended CI generation for client deliverables, selected the author
engine plus site-copy generation as the first production slice, kept
OpenRouter as a manual fallback, chose gpt-6-luna with the existing frozen
reasoning gate (xhigh, or max when the session gate selects it), authorized
reusing the existing `OPENCODE_GO_API_KEY` as a CI secret, and requires one
bounded unattended acceptance run on a synthetic client before the default
flips.

**Status 2026-11-17:** OpenRouter is disabled for production; every inference
lane runs on OpenCode Go. The Work OS ledger entry for the cutover is
`17b43745-ee8d-47d9-aa8e-d47f8c1b65c3`.

**Status 2026-10-14:** active in production. The acceptance run
(`38620904674`, intake #158, creative-only, Go forced) authored 3/3 candidates
on Go with 23/23 parsed responses, zero retries and a computed cash cost of
about $0.16 per three-route set; the pipeline verdict failed only at the
unchanged creative/technical promotion gates, which the same intake also fails
on OpenRouter-era runs (pre-existing, see the 2026-10-14 progress ledger for
the baseline). The `CREATIVE_EXPERIENCE_PROVIDER` and `SITE_COPY_PROVIDER`
repository variables were then set to `opencode-go` at 21:06Z.

## 2026-10-26 production model policy

All non-trivial production lanes use DeepSeek V4.1 Flash:

- OpenCode Go: `opencode-go/deepseek-v4.1-flash` (wire
  `deepseek-v4.1-flash`).
- OpenRouter: `deepseek/deepseek-v4.1-flash`.

This covers authoring and repair, site copy, revision operations, SEO query
planning, SEO fallback search, reference DNA analysis and its fallback,
rendered reference and diversity judges, the visual quality gate, and generated
asset review. GLM-5.3 and GLM-5.3-Flash are not approved for production use.
GPT-6 Luna remains only for frozen legacy sessions. The defaults are guarded by
`tests/production-model-policy.test.ts`.

## Scope

- In scope: every non-trivial production generation lane listed above.
- Out of scope: Worker and visitor-AI paths, plus the explicit model-evaluation
  labs that intentionally compare multiple models.

## Provider switch

OpenRouter is disabled for production. Both selectors default to
`opencode-go` and the code rejects `openrouter` with an explicit error, so a
stale repository variable or inherited environment cannot redirect a run.
OpenRouter transport code remains only for the manual model-evaluation labs.

| Environment variable           | Default       | Accepted values |
| ------------------------------ | ------------- | --------------- |
| `CREATIVE_EXPERIENCE_PROVIDER` | `opencode-go` | `opencode-go`   |
| `SITE_COPY_PROVIDER`           | `opencode-go` | `opencode-go`   |

- Production (`generate-client.yml`) and focused test profiles
  (`test-generation.yml`) pin both variables to `opencode-go`. There is no
  per-dispatch provider lever and no automatic provider fallback.
- The only production key is `OPENCODE_GO_API_KEY`. `generate-client.yml`,
  the revision workflows, and the platform deploy fail early when it is
  missing. The Worker receives the same key for intake service suggestions and
  the visitor AI assistant.
- OpenRouter has no hosted web-search equivalent on OpenCode Go, so measured
  SEO stays on DataForSEO and the deterministic query path. The SEO intent
  planner runs on OpenCode Go.
- The default creative-lane logical model is
  `deepseek/deepseek-v4.1-flash`; on OpenCode Go it resolves to the wire model
  `deepseek-v4.1-flash`. The legacy `openai/gpt-6-luna` session model remains
  supported only for frozen legacy sessions. Reasoning-preflight allowlists,
  session provenance and reuse validators accept DeepSeek V4.1 Flash.

## Verified wire contract

Verified against the live service on 2026-10-14 (small capability probes plus
the 2026-10-12 supervised runs; see the progress ledger):

- Endpoint `https://opencode.ai/inference/go/v1/responses` (documented), bearer
  auth, the resolved wire model, stable `x-opencode-session`, identifying
  `User-Agent` (`launchloom-production/0.1`), stateless `store:false`.
- Reasoning efforts `low` through `max` accepted. **`temperature` is rejected
  for the Go slice's models**, so the Go request builders never send it.
- Base64 image inputs with `detail: high`, strict JSON schema and schema-free
  JSON mode were proven in the 2026-10-12 author run and the bounded example.
- Responses report `input_tokens` (including cached reads and cache writes),
  `output_tokens`, `input_tokens_details.cached_tokens`,
  `input_tokens_details.cache_write_tokens` and
  `output_tokens_details.reasoning_tokens`. No per-request cost is returned.
- Privacy (Go docs): GPT 6 Luna is not used for training; abuse-monitoring
  retention is up to 30 days.

## Cash accounting and quota

`scripts/opencode-go.mjs` computes cash cost from the published Go price table
for GPT 6 Luna (per 1M tokens, prompt ≤ 272K): input $0.10, output $0.50,
cached read $0.01, cached write $0.125; above 272K input tokens the prices
double. The fresh input portion is `inputTokens - cached reads - cache writes`.
The same figures determine how usage counts toward the plan limits, so the
computed cost is also the quota spend. Ledger rows are emitted as
`opencode_go_cache label=... prompt_tokens=... cached_tokens=...
cache_write_tokens=... hit_percent=... cost=...` and usage records carry the
computed cost with `costSource: "computed-from-published-prices"`.

Operational note: the Go plan's monthly limit for GPT 6 Luna is $15 (5-hour
20%, weekly 50%); a Node/Next-scale client run currently costs on the order of
$0.03-$0.06 in published token prices. The console's "Use balance" overflow is
an account setting, not changed by this migration.

## Acceptance and rollback

1. Production and focused workflows pin both selectors to `opencode-go`; the
   code rejects `openrouter`, and every production job requires
   `OPENCODE_GO_API_KEY`.
2. Dispatch `generate-client.yml` on a focused profile and verify the authored
   candidate, site copy, build, and browser evidence in the run artifacts.
3. Rollback requires a reviewed code change that restores the OpenRouter
   selector and its key. There is no environment-variable rollback.

## Verification

- `tests/opencode-go.test.ts` covers profile validation and wire
  serialization (including the temperature refusal), cash cost tiers, ledger
  metrics, image mapping, request builders, the site-copy Go round trip with a
  stubbed transport, and the author CLI provider gates.
- OpenRouter transport unit suites remain for the evaluation labs, but no
  production workflow selects that provider.
- A bounded unattended acceptance run is still required to prove the cutover
  end to end; the capability probes above are not a substitute for it.
