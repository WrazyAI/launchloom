# Focused cloud generation tests

Use the Generate client site manual workflow with `test_profile` set to
`seo-only`, `creative-only`, `full-preview`, or `access-only`. The `full` default retains
normal automatic/production generation. The reusable `test-generation.yml`
workflow is reached through test-profile dispatch. Manual dispatch exposes the
`test_profile` selector. The runner CLI also
accepts `--skip-creative-author-checks` for SEO-only and `--skip-seo-addon`
for creative-only. Conflicting choices fail before generation.

`access-only` requires no intake issue and runs no research, model authorship,
SEO, lead capture, email, or release checks. It creates a content-free noindex
probe and verifies anonymous Access denial plus service-token access through
the same Wrangler/Pages path used by private diagnostic previews.

`full-preview` runs SEO research, authors all three independent candidates,
evaluates creative quality, builds and verifies the rendered site, then runs
the SEO/content release checks. It is test-only and deploys its Access-protected
noindex preview only if both SEO and creative gates plus shared technical
checks pass.
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

Every attempt creates a separate private
`WrazyAI/llqa-<issue>-<seo|creative|full>-<run>-<attempt>` repository and
`qa/<profile>/<run>-<attempt>` branch. Cloud preview deployments use the
dedicated Pages project in `LAUNCHLOOM_TEST_PAGES_PROJECT` (default
`launchloom-pipeline-preview`), so one Pages preview Access policy protects all
test branches. The active business repository and `review/initial` remain
untouched. Diagnostic previews have `X-Robots-Tag: noindex`, an `Allow: /`
robots rule so crawlers can observe the noindex directive, and no sitemap.
Notification goes only to the developer. No signed client approval link is
created. Single-lane diagnostic preview delivery requires source safety,
browser verification and passing rendered contrast even when the tested SEO or
creative stage failed.

## One-time private preview setup

Cloudflare Pages preview deployments are public unless Access is enabled for
the Pages project. Before a generation can reach any paid stage, the runner
deploys a content-free `access-probe` branch and verifies that an anonymous
request is denied or sent to the Access login page while a service-token request
returns HTTP 200. It repeats those checks on the actual immutable deployment
before checking noindex or emailing a link. A failed access check stops the
run before client content is deployed or delivered.

Failed creative diagnostics from both the automatic intake workflow and the
single-repair workflow use this same dedicated Pages project. They first upload
only the content-free access probe, then require an anonymous Access challenge
and a successful service-token request before candidate files are uploaded.
The immutable candidate preview is checked again before its URL is returned.
The build is rejected unless it has a robots noindex meta tag, an
`X-Robots-Tag: noindex` response header, an `Allow: /` robots rule, and no
sitemap file. A missing or misconfigured Access policy stops before the
diagnostic site is uploaded; it never falls back to the per-client Pages
project.

Configure these once:

1. Use a dedicated Pages project for test previews. The configured project is
   `launchloom-pipeline-preview`; set the repository variable
   `LAUNCHLOOM_TEST_PAGES_PROJECT` only if its name changes. The Pages project
   and Access application are provisioned separately from the client projects.
2. Protect only `*.<project>.pages.dev` with a Cloudflare Access application.
   The current application allows the approved developer identity and has a
   **Service Auth** policy restricted to the CI service token. The apex
   `<project>.pages.dev` hostname and production/client projects are not covered
   by this wildcard application.
3. Store the Access service-token client ID and secret as GitHub repository
   secrets `CLOUDFLARE_ACCESS_CLIENT_ID` and
   `CLOUDFLARE_ACCESS_CLIENT_SECRET`. The Pages deployment step also needs the
   existing `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` secrets.
4. Run `Generate client site` manually with `test_profile=access-only` and no
   issue number to verify the content-free probe. Generation profiles still
   require an intake issue. The smoke must prove anonymous denial and a
   service-token HTTP 200 before any client content is uploaded. Do not run a
   generation profile until that smoke passes.

The wildcard Access application protects immutable Pages preview URLs without
changing access to the project's root `*.pages.dev` hostname. Do not add client
content or send a preview link until the workflow's anonymous/authenticated
checks pass.

Read `.launchloom/pipeline-test-report.json` in the private QA branch. Its
`verdict` and individual `passed`, `failed`, `not_run` stage statuses describe
the test. `previewDelivered` independently describes live diagnostic delivery;
a single-lane delivered preview can accompany a failed verdict. The full
preview is delivered only on a passing combined verdict. The report includes source
SHA, attempt, evidence paths, screenshots and provider cost evidence; missing
costs remain unreported. A failed verdict or failed notification/evidence push
fails the workflow. No report in this public repository proves a cloud pass.
