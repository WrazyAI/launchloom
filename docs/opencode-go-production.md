# OpenCode Go production slice (author + site copy)

Operator decisions approved 2026-10-14: the user confirmed Go hosted terms
permit unattended CI generation for client deliverables, selected the author
engine plus site-copy generation as the first production slice, kept
OpenRouter as a manual fallback, chose gpt-6-luna with the existing frozen
reasoning gate (xhigh, or max when the session gate selects it), authorized
reusing the existing `OPENCODE_GO_API_KEY` as a CI secret, and requires one
bounded unattended acceptance run on a synthetic client before the default
flips.

**Status 2026-10-14:** active in production. The acceptance run
(`38620904674`, intake #158, creative-only, Go forced) authored 3/3 candidates
on Go with 23/23 parsed responses, zero retries and a computed cash cost of
about $0.16 per three-route set; the pipeline verdict failed only at the
unchanged creative/technical promotion gates, which the same intake also fails
on OpenRouter-era runs (pre-existing, see the 2026-10-14 progress ledger for
the baseline). The `CREATIVE_EXPERIENCE_PROVIDER` and `SITE_COPY_PROVIDER`
repository variables were then set to `opencode-go` at 21:06Z.

## Scope

- In scope: `scripts/author-production-experiences.mjs` (all seven author
  stages and their existing bounded repairs) and `scripts/generate-site-config.mjs`
  (site copy plus its quality refinement).
- Out of scope and still on OpenRouter: hosted SEO/web search, reference
  analysis, visual judges, the creative repair loop, the revision engine, and
  non-coding Worker/visitor-AI paths.

## Provider switch

| Environment variable           | Default      | Values                      |
| ------------------------------ | ------------ | --------------------------- |
| `CREATIVE_EXPERIENCE_PROVIDER` | `openrouter` | `openrouter`, `opencode-go` |
| `SITE_COPY_PROVIDER`           | `openrouter` | `openrouter`, `opencode-go` |

- Production (`generate-client.yml`) reads `vars.CREATIVE_EXPERIENCE_PROVIDER`
  and `vars.SITE_COPY_PROVIDER`, falling back to `openrouter`. Flipping those
  repository variables is the switch; setting them back (or removing them) is
  the manual rollback. There is no automatic provider fallback.
- Focused test profiles (`test-generation.yml`) additionally honor the
  per-dispatch `inference_provider` input, which is the acceptance lever; the
  repository variables stay on `openrouter` until acceptance passes.
- The Go path requires `OPENCODE_GO_API_KEY`; the OpenRouter path still
  requires `OPENROUTER_API_KEY`. Both secrets are requested by the workflows;
  `generate-client.yml` fails early when a Go-selected run has no Go key.
- The frozen logical session model stays `openai/gpt-6-luna`; the wire model is
  `gpt-6-luna`. Reasoning-preflight allowlists, session provenance and reuse
  validators are unchanged.

## Verified wire contract

Verified against the live service on 2026-10-14 (small capability probes plus
the 2026-10-12 supervised runs; see the progress ledger):

- Endpoint `https://opencode.ai/inference/go/v1/responses` (documented), bearer
  auth, model `gpt-6-luna`, stable `x-opencode-session`, identifying
  `User-Agent` (`launchloom-production/0.1`), stateless `store:false`.
- Reasoning efforts `low` through `max` accepted. **`temperature` is rejected
  for gpt-6-luna**, so the Go request builders never send it.
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

1. Merge the migration PR with the repository variables still unset
   (production stays on OpenRouter).
2. Dispatch `generate-client.yml` on a synthetic client with a focused
   profile and `inference_provider: opencode-go`, then verify the authored
   candidate, build and browser evidence in the run artifacts.
3. On success, set `vars.CREATIVE_EXPERIENCE_PROVIDER=opencode-go` and
   `vars.SITE_COPY_PROVIDER=opencode-go`. Record the switch and the run IDs in
   the ledger.
4. Rollback: set either variable back to `openrouter` (or remove it). The
   OpenRouter paths remain wired and covered by tests.

## Verification

- `tests/opencode-go.test.ts` covers profile validation and wire
  serialization (including the temperature refusal), cash cost tiers, ledger
  metrics, image mapping, request builders, the site-copy Go round trip with a
  stubbed transport, and the author CLI provider gates.
- Existing OpenRouter-path suites (`site-config`, `openrouter-cache-integration`,
  `author-failure-evidence`, workflow-coupling tests) remain green.
- A bounded unattended acceptance run is required before the default flips;
  the capability probes above are not a substitute for it.
