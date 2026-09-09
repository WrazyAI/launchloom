# Open-weight model selection for LaunchLoom

Research date: 2026-09-09. Prices are the lowest token prices returned by the live [OpenRouter models API](https://openrouter.ai/api/v1/models) on that date. They may reflect temporary provider discounts and can change with routing or caching. This is a research recommendation, not a production change.

## Decision

Keep `z-ai/glm-5.3-flash` as the default for initial copy/config generation and feedback planning. It is currently the best price/performance fit for this pipeline, and a fresh run of LaunchLoom's own fixed evaluation did not justify paying for full GLM-5.3.

Add a separate multimodal review stage before considering a default-model replacement. The current model is capable of image understanding, but LaunchLoom never sends it an image. Start by evaluating the same GLM-5.3-Flash endpoint on desktop and mobile screenshots. Use `qwen/qwen3.6-27b` as the self-hostable independent challenger and `moonshotai/kimi-k2.6` as the design-specialized challenger. Reserve `moonshotai/kimi-k3` for difficult redesigns or periodic benchmark runs because its output price is much higher.

This is a routed recommendation:

1. Text generation and ordinary revision planning: GLM-5.3-Flash.
2. Screenshot critique: GLM-5.3-Flash first, with Qwen3.6-27B and Kimi K2.6 as challengers.
3. Human approval and deterministic rendered checks remain the promotion gate.

## Current-generation design challengers

Three newer open-weight endpoints are especially relevant to frontend work:

| Model                  |    Live OpenRouter input / output per 1M | Why it matters                                                                                                                                                                             | Recommended role                                                                |
| ---------------------- | ---------------------------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `qwen/qwen3.6-27b`     |                            $0.30 / $2.00 | Apache-2.0 multimodal model. Its official card reports 1,487 on QwenWebBench, an internal rendered frontend benchmark covering web design, applications, animation, visualization, and 3D. | Independent screenshot and layout challenger; practical self-hosting candidate. |
| `moonshotai/kimi-k2.6` | $0.5795 / $2.44 at the lowest live route | Open-weight multimodal model explicitly trained for coding-driven design and converting prompts plus visual input into interfaces.                                                         | Premium review or redesign pass when Flash is uncertain.                        |
| `moonshotai/kimi-k3`   |  $2.50 / $14.00 at the lowest live route | Moonshot's latest 2.8T open-weight multimodal flagship, explicitly positioned for frontend visual design and vision-in-the-loop engineering.                                               | Escalation and benchmark model, not routine generation.                         |

Sources: [Qwen3.6-27B official model card](https://huggingface.co/Qwen/Qwen3.6-27B), [Kimi K2.6 official model card](https://huggingface.co/moonshotai/Kimi-K2.6), [Kimi K3 official model card](https://huggingface.co/moonshotai/Kimi-K3), and the live [OpenRouter model catalog](https://openrouter.ai/api/v1/models).

## What the pipeline actually asks the model to do

Initial generation in [`scripts/generate-site-config.mjs`](../scripts/generate-site-config.mjs) makes a text-only OpenRouter chat-completions request. It asks GLM-5.3-Flash for a JSON object containing copy and typed configuration, normalizes facts and fields, scores a draft with local heuristics, and may make one refinement call. The model does not write HTML, CSS, or unrestricted frontend code.

Feedback planning in [`scripts/revision-engine.mjs`](../scripts/revision-engine.mjs) is also text-only. Deterministic handlers take known requests first; the model maps remaining feedback to an allowlisted operation set. Unsupported or unsafe operations are rejected later.

Rendered desktop and mobile screenshots are produced in [`scripts/verify-rendered-revision.mjs`](../scripts/verify-rendered-revision.mjs), after generation. They are not attached to either model request. Consequently, the current system can select a design recipe and write design-related configuration, but it cannot see whether the result has poor hierarchy, mismatched imagery, awkward spacing, weak contrast, overlap, or a requested visual artifact that is technically present but visually ineffective.

The existing evaluator in [`scripts/evaluate-models.mjs`](../scripts/evaluate-models.mjs) compares only GLM-5.3-Flash with GLM-5.3 on the 12 cases in [`fixtures/model-evaluation.json`](../fixtures/model-evaluation.json). It creates a blinded worksheet for manual 1-to-5 scoring. It does not calculate those rubric scores, retain token usage or latency, test screenshots, repeat runs for variance, or block a candidate that fabricates plausible details.

## Terminology and license boundary

The vendors often call these models open source, and the weights can be downloaded. This report calls them **open-weight** unless a complete training-data description and training code are also available. The [Open Source AI Definition 1.0](https://opensource.org/ai/open-source-ai-definition) requires the preferred form for modification to include sufficient data information, complete training and data-processing code, and model parameters. The reviewed model cards publish weights and inference instructions, but do not provide enough training material to establish that stronger standard.

License terms still differ materially:

- GLM-5.3-Flash uses MIT; Qwen3.5 and Qwen3-VL use Apache-2.0. See the official [GLM-5.3-Flash card](https://huggingface.co/zai-org/GLM-5.3-Flash), [Qwen3.5-35B-A3B card](https://huggingface.co/Qwen/Qwen3.5-35B-A3B), and [Qwen3-VL-30B-A3B-Instruct card](https://huggingface.co/Qwen/Qwen3-VL-30B-A3B-Instruct).
- Kimi K2.5 uses a modified MIT license that adds a display-name condition for products above stated revenue or monthly-active-user thresholds. See its [official license](https://huggingface.co/moonshotai/Kimi-K2.5/blob/main/LICENSE).
- Full GLM-5.3 uses a custom license with a security-review condition for very large model-as-a-service businesses. See its [official license](https://huggingface.co/zai-org/GLM-5.3/blob/main/LICENSE).

None of those terms is a blocker for the present hosted-API experiment, but GLM-5.3-Flash and Qwen carry the simplest permissive licensing if self-hosting becomes relevant. This is a technical reading, not legal advice.

## Price and capability ranking

The indicative request cost assumes 10,000 input tokens and 5,000 output tokens. Actual calls are tokenizer- and response-dependent. All listed OpenRouter endpoints advertise `response_format`; the live catalog also advertised structured outputs for these candidates. OpenRouter recommends strict JSON Schema plus `require_parameters: true` when schema enforcement is required, which is stronger than LaunchLoom's current `{type: "json_object"}` request ([OpenRouter structured-output documentation](https://openrouter.ai/docs/guides/features/structured-outputs)).

| Price rank | OpenRouter model                 | Input / output per 1M | Indicative request | Input              | Weight license | Pipeline judgment                                                                                                                                     |
| ---------: | -------------------------------- | --------------------: | -----------------: | ------------------ | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
|          1 | `qwen/qwen3.5-9b`                |         $0.10 / $0.15 |            $0.0018 | text, image, video | Apache-2.0     | Cheapest usable challenger; attractive for bulk JSON, but a 9B model should not be promoted without fixture-specific truthfulness and revision tests. |
|          2 | `z-ai/glm-5.3-flash`             |        $0.075 / $0.25 |            $0.0020 | text, image, video | MIT            | Best overall value and current default; 320B total/18B active, native multimodal, controllable reasoning effort.                                      |
|          3 | `qwen/qwen3-vl-30b-a3b-instruct` |         $0.15 / $0.60 |            $0.0045 | text, image        | Apache-2.0     | Low-cost dedicated visual challenger; official materials emphasize GUI grounding, OCR, and visual coding.                                             |
|          4 | `qwen/qwen3.5-35b-a3b`           |       $0.3125 / $1.25 |            $0.0094 | text, image, video | Apache-2.0     | Best balanced independent reviewer candidate; strong instruction-following and vision at moderate cost.                                               |
|          5 | `moonshotai/kimi-k2.5`           |         $0.45 / $2.25 |            $0.0158 | text, image        | Modified MIT   | Best premium visual-design challenger from the reviewed open-weight set, but unnecessary for every text request.                                      |
|          6 | `qwen/qwen3.5-397b-a17b`         |         $0.55 / $3.50 |            $0.0230 | text, image, video | Apache-2.0     | Strong flagship, but poor marginal value here relative to Qwen35B or Kimi because the pipeline is narrow and heavily normalized.                      |
|          7 | `z-ai/glm-5.3`                   |         $1.40 / $4.40 |            $0.0360 | text only          | Custom GLM-5.3 | Highest cost, no screenshot input, and no demonstrated LaunchLoom advantage over Flash. Do not use as the default or design judge.                    |

The OpenRouter catalog's modality and parameter metadata is documented in its [models API reference](https://openrouter.ai/docs/guides/overview/models). Model-specific prices can move, so production should record the response `usage` and provider rather than treating this table as permanent.

## Performance ranking by LaunchLoom task

These are decision rankings, not universal leaderboards. Vendor benchmarks use different prompts, reasoning settings, harnesses, and comparison sets. They identify plausible challengers, while LaunchLoom's sealed fixtures and screenshot review must make the promotion decision.

| Task                         | Rank 1        | Rank 2            | Rank 3          | Reason                                                                                                                                                                                                                                                                          |
| ---------------------------- | ------------- | ----------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Structured copy/config       | GLM-5.3-Flash | Qwen3.5-35B-A3B   | Qwen3.5-9B      | Flash already clears the pipeline's parser/normalizer at very low cost. Qwen35B reports 91.9 IFEval, while Qwen9B is a cost-first candidate, not yet a quality winner.                                                                                                          |
| Feedback-following revisions | GLM-5.3-Flash | Qwen3.5-397B-A17B | Qwen3.5-35B-A3B | Revisions are small allowlisted plans, and Flash handled all six current revision fixtures. Qwen397 reports 92.6 IFEval, 76.5 IFBench, and 67.6 MultiChallenge, but costs over eleven times more than Flash on the indicative request.                                          |
| Visual/design understanding  | Kimi K2.5     | Qwen3.5-35B-A3B   | GLM-5.3-Flash   | Kimi's card specifically covers code from UI designs and reports 78.5 MMMU-Pro and 92.3 OCRBench. Qwen35B reports 75.1 MMMU-Pro, 91.0 OCRBench, and strong GUI grounding. Flash is the value choice, but its public card gives less directly comparable screenshot/UI evidence. |
| Overall production value     | GLM-5.3-Flash | Qwen3.5-35B-A3B   | Kimi K2.5       | Keep the proven cheap default, test an independent mid-tier visual reviewer, and reserve the premium visual model for escalation.                                                                                                                                               |

Primary model evidence:

- [GLM-5.3-Flash official card](https://huggingface.co/zai-org/GLM-5.3-Flash): MIT, 320B total/18B active, native multimodal, 30T-token multimodal pretraining, and `low`, `high`, or `max` reasoning effort.
- [Qwen3.5-35B-A3B official card](https://huggingface.co/Qwen/Qwen3.5-35B-A3B): Apache-2.0, 35B total/3B active, native vision-language, 262K native context, language instruction-following and visual benchmark tables.
- [Qwen3.5-397B-A17B official card](https://huggingface.co/Qwen/Qwen3.5-397B-A17B): Apache-2.0 flagship with published instruction-following and vision tables.
- [Kimi K2.5 official card](https://huggingface.co/moonshotai/Kimi-K2.5): 1T total/32B active, native image-text model, 256K context, visual coding, and published benchmark protocols.
- [Qwen3-VL-30B-A3B-Instruct official card](https://huggingface.co/Qwen/Qwen3-VL-30B-A3B-Instruct): Apache-2.0 image-text model focused on visual agents, GUI operation, OCR, and grounding.

## Fresh LaunchLoom A/B result

On 2026-09-09, the unchanged evaluator was run against its six initial-generation and six revision fixtures, writing only temporary output outside the repository.

- Both models returned usable results for all 12 cases.
- GLM-5.3-Flash received the local heuristic score 100 on five of six initial cases and 88 on one; full GLM-5.3 received 100 on all six.
- That numerical result is misleading. On the dental fixture, full GLM-5.3 produced `"..."` for the tagline and description, then normalization supplied generic fallback copy; the heuristic still scored it 100. Flash produced specific dental copy but also introduced unsupported details such as exams, cleanings, medication preparation, and anxiety handling.
- Both models handled the six revision cases equivalently at the operation level: deterministic proof and brand operations applied, requested headline/contact copy was produced, and unsupported exact pricing/calendar work produced no operation.
- Flash's headline revision added an unsupported implication that the door would be restored "quickly" after being asked for same-day wording. Both models expanded a requested free-assessment revision with procedural details not present in the approved config.

The correct conclusion is not that full GLM-5.3 wins 100 to 88. It is that the current heuristic is too shallow to select a model. It rewards safe normalization and field presence, misses placeholder-quality fallbacks, and does not reliably detect unsupported but plausible business details. The blinded human worksheet is closer to the intended gate, but it still has no recorded scores in the generated artifact.

## Is the current model good for design?

For **design selection from text**, yes within the present bounded architecture. It can choose and populate a recipe, and the recipe/template system owns the actual layout.

For **design understanding of the rendered website**, not as currently integrated. The endpoint can accept images and video according to both Z.ai's model card and OpenRouter's live metadata, but every LaunchLoom call supplies strings only. The model cannot judge an output it never sees.

For **design generation**, also only indirectly. It is not creating free-form layouts; it supplies JSON that chooses among established sections, variants, density, typography, palette, imagery metadata, and copy. That constraint is a safety and consistency strength, not a model weakness.

## Promotion experiment

Before changing a production slug, extend the evaluation evidence in this order:

1. Add explicit factual-support assertions and placeholder/generic-copy rejection to the current 12 text fixtures, then store model, provider, latency, prompt tokens, completion tokens, and cost.
2. Add at least 12 screenshot pairs across the three recipes at 1440px and 390px. Ask for strict JSON findings covering hierarchy, contrast, image relevance, overflow/overlap, CTA clarity, requested-artifact visibility, and unrelated regression.
3. Compare GLM-5.3-Flash, Qwen3.6-27B, and Kimi K2.6 blindly. Run Kimi K3 on the hardest subset as a premium ceiling. Require repeated runs and score factuality separately from visual usefulness.
4. Promote only if a challenger materially improves the sealed rubric without increasing fabrication or missing supported operations. Do not weaken the existing build, browser, or human approval gates.

The immediate model-selection action is therefore to retain GLM-5.3-Flash and make the first new experiment a multimodal screenshot critique, not a wholesale model swap.

## Addendum: reproducible visual bakeoff contract

Verification date: 2026-09-09. This addendum records the request contract and scoring rules for the first screenshot bakeoff. It does not change the production model or evaluator.

### Verified endpoint capabilities

The live OpenRouter catalog and model pages agree on the capabilities needed by this experiment:

| OpenRouter slug        | OpenRouter input and output    | `response_format` | `structured_outputs` | Upstream visual evidence                                                                                                                                                                       |
| ---------------------- | ------------------------------ | ----------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `z-ai/glm-5.3-flash`   | text, image, and video to text | advertised        | advertised           | The official GLM card demonstrates multimodal chat with image content.                                                                                                                         |
| `qwen/qwen3.6-27b`     | text, image, and video to text | advertised        | advertised           | The official Qwen card demonstrates an OpenAI-compatible `image_url` content item.                                                                                                             |
| `moonshotai/kimi-k2.6` | text and image to text         | advertised        | advertised           | The official Kimi card demonstrates URL and base64 image input. Its upstream card also demonstrates video, but OpenRouter currently exposes this endpoint as image-capable, not video-capable. |

Sources: the live [OpenRouter models API](https://openrouter.ai/api/v1/models), OpenRouter pages for [GLM-5.3-Flash](https://openrouter.ai/z-ai/glm-5.3-flash), [Qwen3.6-27B](https://openrouter.ai/qwen/qwen3.6-27b), and [Kimi K2.6](https://openrouter.ai/moonshotai/kimi-k2.6), plus the official model cards for [GLM-5.3-Flash](https://huggingface.co/zai-org/GLM-5.3-Flash), [Qwen3.6-27B](https://huggingface.co/Qwen/Qwen3.6-27B), and [Kimi K2.6](https://huggingface.co/moonshotai/Kimi-K2.6).

Use the same OpenRouter chat-completions shape for every candidate. OpenRouter accepts either a public URL or a base64 data URL in each `image_url.url`, supports multiple image content items, and recommends putting prompt text before images. Strict schema enforcement requires `response_format.type: "json_schema"`, `strict: true`, and `provider.require_parameters: true`; without the provider requirement, routing may select a provider that ignores an unsupported parameter. See the official [image-input guide](https://openrouter.ai/docs/guides/overview/multimodal/image-understanding), [structured-output guide](https://openrouter.ai/docs/guides/features/structured-outputs), and [provider-routing guide](https://openrouter.ai/docs/guides/routing/provider-selection).

The reproducible request body is:

```json
{
  "model": "MODEL_SLUG",
  "messages": [
    {
      "role": "system",
      "content": "Inspect only visible evidence and the supplied verified-fact manifest. Do not invent business facts, assets, measurements, or copy. Return only the requested schema."
    },
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "CASE_PROMPT_WITH_VERIFIED_FACTS. Images are ordered desktop, then mobile. Report at most eight distinct findings."
        },
        {
          "type": "image_url",
          "image_url": { "url": "data:image/png;base64,DESKTOP_PNG" }
        },
        {
          "type": "image_url",
          "image_url": { "url": "data:image/png;base64,MOBILE_PNG" }
        }
      ]
    }
  ],
  "temperature": 0,
  "seed": 20260909,
  "max_tokens": 1800,
  "provider": { "require_parameters": true },
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "launchloom_visual_critique",
      "strict": true,
      "schema": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "schema_version": { "type": "string", "enum": ["1.0"] },
          "case_id": { "type": "string", "maxLength": 80 },
          "verdict": { "type": "string", "enum": ["pass", "revise", "block"] },
          "summary": { "type": "string", "maxLength": 240 },
          "findings": {
            "type": "array",
            "maxItems": 8,
            "items": {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "id": { "type": "string", "pattern": "^F[1-8]$" },
                "category": {
                  "type": "string",
                  "enum": [
                    "overflow_overlap",
                    "contrast_readability",
                    "hierarchy_cta",
                    "responsive_layout",
                    "image_relevance",
                    "content_density",
                    "recipe_coherence",
                    "factual_integrity",
                    "requested_artifact"
                  ]
                },
                "viewport": {
                  "type": "string",
                  "enum": ["desktop", "mobile", "both"]
                },
                "severity": {
                  "type": "string",
                  "enum": ["blocker", "major", "minor"]
                },
                "region": {
                  "type": "string",
                  "enum": [
                    "header",
                    "hero",
                    "proof",
                    "services",
                    "about",
                    "process",
                    "gallery",
                    "coverage",
                    "faq",
                    "form",
                    "footer",
                    "overlay",
                    "page"
                  ]
                },
                "observation": { "type": "string", "maxLength": 180 },
                "visible_evidence": { "type": "string", "maxLength": 180 },
                "fact_ids": {
                  "type": "array",
                  "maxItems": 4,
                  "uniqueItems": true,
                  "items": { "type": "string", "maxLength": 60 }
                },
                "recommended_operation": {
                  "type": "string",
                  "enum": [
                    "none",
                    "set_copy",
                    "set_service_copy",
                    "set_process",
                    "set_faqs",
                    "set_section_enabled",
                    "reorder_section",
                    "set_section_variant",
                    "set_design_treatment",
                    "set_conversion_feature",
                    "manual_review"
                  ]
                },
                "confidence": {
                  "type": "string",
                  "enum": ["high", "medium", "low"]
                }
              },
              "required": [
                "id",
                "category",
                "viewport",
                "severity",
                "region",
                "observation",
                "visible_evidence",
                "fact_ids",
                "recommended_operation",
                "confidence"
              ]
            }
          }
        },
        "required": [
          "schema_version",
          "case_id",
          "verdict",
          "summary",
          "findings"
        ]
      }
    }
  }
}
```

The case prompt must contain immutable screenshot IDs, viewport sizes, the selected recipe, requested artifacts, verified facts with stable IDs, and an asset manifest with provenance. A `factual_integrity` finding must cite at least one supplied `fact_id`. If the screenshot suggests a concern that the manifest cannot prove, the model must use `none` or `manual_review`, not propose replacement facts. Recommended operations are intentionally bounded to the existing revision vocabulary; an image replacement or interaction repair therefore requires `manual_review` until a typed operation exists.

### Critique scoring rubric

Score the critique against a sealed human annotation set, not against the model's own `verdict`. One desktop and mobile pair is one case. Normalize each category across the sealed cohort before comparing models.

| Criterion             | Points | Measurement                                                                                                                                                                                               |
| --------------------- | -----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Seeded-defect recall  |     30 | Severity-weighted recall of annotated visible defects: blocker 5, major 3, minor 1. A finding matches only when category, viewport, and region agree.                                                     |
| Finding precision     |     20 | Severity-weighted precision against annotations. Duplicates count as false positives, so extra prose or more findings cannot improve the score.                                                           |
| Evidence grounding    |     15 | The observation names a visible, correctly located symptom. Unsupported CSS values, measurements, or off-screen assumptions receive no credit.                                                            |
| Severity calibration  |     10 | Severity matches user impact: blocker prevents use or violates a hard constraint, major materially harms comprehension or action, minor is polish.                                                        |
| Bounded actionability |     10 | The operation addresses the finding, is supported by the typed pipeline, and does not broaden the requested revision.                                                                                     |
| Factual safety        |     15 | Claims use supplied `fact_id` values correctly; uncertain claims are escalated; no new review, credential, price, guarantee, location, timeline, staff identity, result, or asset provenance is invented. |

Promotion also has hard gates. A candidate is ineligible if any response is invalid against the schema after one identical retry, if it invents a business fact or asset provenance in a proposed fix, if it misses a seeded blocker, or if it recommends weakening LaunchLoom's deterministic checks. Keep the numeric score for diagnosis, but do not average away a hard-gate failure.

Use exactly the same prompt bytes, images, schema, provider policy, seed, and token cap for all three models. Run each case three times and report median rubric score, hard-gate failures, exact model and provider, latency, prompt and completion tokens, and billed cost. Blind model names during annotation. The finding cap and fixed field lengths are deliberate: reviewers score correctness, grounding, and usefulness, never writing volume or stylistic elaboration.

## First visual bakeoff result

Run date: 2026-09-09. The experiment used full-page 1440 by 1000 and 390 by 844 captures of the live Mike Seeders Plumbing and Lumière Artisan Bakery review sites. Screenshot hashes, raw structured audits, latency, usage, and cost are stored in the ignored `artifacts/visual-bakeoff-2026-09-09*` directories. The reusable runner is `scripts/evaluate-visual-models.mjs`, and the two cases are declared in `fixtures/visual-model-evaluation.json`.

The first pass identified a response-budget problem. The runner was then bounded to eight findings, a 5,000-token completion allowance, a 1,000-token hidden-reasoning allowance, and a 180-second timeout. GLM and Qwen were run three times per site. Kimi was not repeated across the full cohort after failing to return final JSON twice on the Lumière case; one failure consumed all 5,000 completion tokens as hidden reasoning despite the requested reasoning cap.

| Model                  |                            Valid responses |              Median latency |                                                                    Recorded cost | Seeded-focus recall                                                                         | Hard-gate result                                  |
| ---------------------- | -----------------------------------------: | --------------------------: | -------------------------------------------------------------------------------: | ------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `z-ai/glm-5.3-flash`   |                                      6 / 6 |                      26.5 s |                                               $0.0136 total, about $0.0023/audit | Median 4/5 focus areas per case                                                             | Eligible                                          |
| `qwen/qwen3.6-27b`     |                                      5 / 6 |                      78.0 s |                         $0.0658 across successful responses, about $0.0132/audit | Strong on Lumière; unstable on Mike because duplicate card-level findings exhausted the cap | Ineligible under the strict invalid-response gate |
| `moonshotai/kimi-k2.6` | 1 valid Mike audit; no valid Lumière audit | 162.0 s for the valid audit | $0.0358 for the valid audit; failed-call cost not retained in the first artifact | Detected Mike copy corruption but missed important conversion issues                        | Ineligible                                        |

GLM consistently detected the highest-value cross-page defects: mid-word truncation, service-description mismatches, healthcare language on the bakery site, obstructive floating controls, weak or irrelevant conversion wording, and mobile cropping. It sometimes raised unhelpful concerns about a supplied Gmail address or unavailable proof; a production critic must map findings to verified facts and supported operations before changing content.

Qwen was appropriately severe and consistently recognized the bakery's industry-language leakage and service-copy corruption. On Mike, however, it sometimes emitted duplicate findings or treated each clipped card as a separate issue. That reduced recall of composition, hierarchy, and conversion defects under the fixed finding cap. One of six repeated responses returned no usable content.

Kimi's valid Mike response found the copy corruption but labeled the page `pass` despite reporting critical issues. On Lumière it twice returned no final audit. This combination of weak verdict calibration, latency, cost, and response reliability makes it unsuitable as the current production visual gate.

Decision from this cohort: use GLM-5.3-Flash as both the ordinary text model and the first screenshot critic. Keep Qwen3.6-27B as an offline challenger after adding duplicate-finding normalization. Do not route production review to Kimi K2.6 without first resolving its reasoning-budget behavior. This is a small two-site cohort, so it supports an integration decision, not a permanent universal model ranking.
