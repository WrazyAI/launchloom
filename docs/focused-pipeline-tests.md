# Focused cloud generation tests

Use the Generate client site manual workflow with `test_profile` set to
`seo-only`, `creative-only`, or `full-preview`. The `full` default retains
normal automatic/production generation. The reusable `test-generation.yml`
workflow is reached through test-profile dispatch. Manual dispatch exposes the
`test_profile` selector. The runner CLI also
accepts `--skip-creative-author-checks` for SEO-only and `--skip-seo-addon`
for creative-only. Conflicting choices fail before generation.

`full-preview` runs SEO research, authors all three independent candidates,
evaluates creative quality, builds and verifies the rendered site, then runs
the SEO/content release checks. It is test-only and deploys its private noindex
preview only if both SEO and creative gates plus shared technical checks pass.
Any failed lane persists its diagnostic report but does not deploy or notify.

SEO-only refreshes coverage research, SEO research, canonical brief and real
site configuration. It first looks for a private same-issue business repository
with compatible authored evidence. Reuse requires frozen source/session/dossier
validation, identical sealed token definitions and current content source
validation. No compatible source means one authored route from the validated
three-route pack. This profile skips aesthetic evaluation and repair, while
keeping Astro, browser transition, painted contrast and SEO review checks.

Creative-only writes an explicit skipped SEO research artifact and keeps
`publishReady: false`. It authors the normal three candidates and runs the
normal rendered creative checks and bounded repair. It never calls external
SEO research. All profiles use authored rendering; there is no legacy fallback.

Every attempt creates a separate private `WrazyAI/llqa-<issue>-<seo|creative|full>-<run>-<attempt>`
repository, `qa/<profile>/<run>-<attempt>` branch and Pages project. The active
business repository and `review/initial` remain untouched. Diagnostic previews
have noindex headers and robots rules, and notification goes only to the
developer. No signed client approval link is created. Single-lane diagnostic
preview delivery requires source safety, browser verification and passing
rendered contrast even when the tested SEO or creative stage failed.

Read `.launchloom/pipeline-test-report.json` in the private QA branch. Its
`verdict` and individual `passed`, `failed`, `not_run` stage statuses describe
the test. `previewDelivered` independently describes live diagnostic delivery;
a single-lane delivered preview can accompany a failed verdict. The full
preview is delivered only on a passing combined verdict. The report includes source
SHA, attempt, evidence paths, screenshots and provider cost evidence; missing
costs remain unreported. A failed verdict or failed notification/evidence push
fails the workflow. No report in this public repository proves a cloud pass.
