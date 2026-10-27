# Source-foundation generation implementation plan

Design: `docs/superpowers/specs/2026-10-26-pack-first-landscaping-design.md`
Date: 2026-10-26
Status: Draft for approval

## Outcome

Every extracted reference dossier can produce a source foundation. The
foundation preserves the dossier's actual HTML structure, CSS system, assets,
and interaction mechanics. Generation starts from that foundation, binds sealed
client content, and either renders deterministically or runs a bounded agent
adaptation. The Spicer landscaping dossier is the first rendered proof.

## Phase 0: Baseline and safety

### Task 0.1: Confirm the worktree and baseline

Files:

- `.github/agents/progress-update/UPDATE-2026-10-26.md`
- `.collab/task-complete.log`

Steps:

1. Confirm the worktree is
   `/home/maigreeks/projects/.worktrees/launchloom-pipeline-observability`
   on branch `codex/launchloom-pipeline-observability`, based on current
   `origin/main`.
2. Rebase or merge current `origin/main` before the first code change. Do not
   touch other agents' worktrees.
3. Read the latest progress entries and confirm no other agent owns
   `scripts/reference-*`, `templates/client-site/src/lib/experience-pack.ts`, or
   `.github/workflows/generate-client.yml`.
4. Append a progress section with the task, intended outcome, branch, and
   Nifty subtask `eZc!DzxMni`.
5. Run the baseline:

```bash
npm ci
npx vitest run tests/experience-pack.test.ts tests/reference-template.test.ts tests/reference-pack-converter.test.ts
npm run check
```

Acceptance:

- Baseline tests pass, or the exact pre-existing failures are recorded.
- No product code changed.

Commit: `chore(foundation): record baseline and task scope`

## Phase 1: Foundation compiler

### Task 1.1: Define the foundation schema and manifest

Files:

- `scripts/foundation-schema.mjs` (new)
- `tests/foundation-schema.test.ts` (new)

Interface:

```js
export const FOUNDATION_SCHEMA_VERSION = 1;

export function buildFoundationManifest(input) {
  // returns a frozen, validated manifest
}

export function validateFoundationManifest(value) {
  // throws with an exact field path on invalid input
}
```

Manifest shape:

```json
{
  "schemaVersion": 1,
  "id": "spicer-landscaping-season-wheel",
  "dossierId": "spicer-landscaping-season-wheel",
  "sourceDigest": "sha256",
  "entrypoint": "source/index.html",
  "sourceClass": "licensed",
  "license": {
    "name": "CC BY 4.0",
    "url": "https://www.spicerdesigns.com",
    "credit": "Template adapted from Spicer Designs"
  },
  "sections": [
    {
      "id": "hero",
      "sourceSelector": "header",
      "order": 1,
      "role": "hero",
      "required": true
    }
  ],
  "slots": [
    {
      "id": "hero.heading",
      "selector": "header h1",
      "kind": "text",
      "contentPath": "hero.heading",
      "required": true
    }
  ],
  "assets": [
    {
      "source": "hero.webp",
      "target": "assets/hero.webp",
      "role": "reference-only",
      "required": false
    }
  ],
  "interactions": [
    {
      "id": "season-selector",
      "source": "button[aria-pressed]",
      "primitive": "native-buttons",
      "reducedMotion": "static"
    }
  ],
  "preservedMechanics": ["section-order", "css-system", "image-roles"],
  "prohibitedSourceMaterial": ["brand", "copy", "prices", "reviews", "projects"],
  "compatibility": "renderable",
  "blockers": [],
  "fingerprint": "sha256"
}
```

Tests:

- Rejects a missing `sourceDigest`, `license`, `sections`, or `fingerprint`.
- Rejects a slot with an unknown `kind`.
- Rejects a `renderable` foundation with a required slot that has no
  `contentPath`.
- Accepts a valid manifest and freezes it.

Commit: `feat(foundation): define manifest schema`

### Task 1.2: Normalize the extracted template

Files:

- `scripts/compile-source-foundation.mjs` (new)
- `tests/compile-source-foundation.test.ts` (new)

Steps:

1. Load the dossier through `loadReferenceTemplate`.
2. Copy the entrypoint HTML, CSS, JS, and local assets into
   `foundation/source/`.
3. Rewrite relative asset paths to the foundation source root.
4. Reject remote images, fonts, scripts, and stylesheets. Record each rejection
   in `blockers` or remove it with a note.
5. Remove source analytics, tracking pixels, external form actions, and demo
   endpoints.
6. Keep the source bytes under `template/` untouched. Assert the digest before
   and after.

Tests:

- A fixture with a remote image is marked `needs-adaptation` with the exact
  remote URL.
- A fixture with a local image copies the image and rewrites the path.
- A fixture with a remote form action removes the action and records it.
- The source `template/` digest is unchanged.

Commit: `feat(foundation): normalize extracted templates`

### Task 1.3: Detect sections and content slots

Files:

- `scripts/foundation-sections.mjs` (new)
- `tests/foundation-sections.test.ts` (new)

Steps:

1. Parse the normalized HTML with `linkedom` or an equivalent server-side DOM.
2. Detect header, hero, services, proof, process, coverage, FAQ, contact, and
   footer by element, id, class, and heading text.
3. Assign each section an order and role.
4. For each section, create content slots for headings, body text, links,
   images, and repeated cards.
5. Map slots to `ExperienceContent` paths. Do not invent a path. If a slot
   cannot be mapped, mark the foundation `needs-adaptation` and record the
   selector.
6. Preserve the source's section order in the manifest.

Tests:

- The Spicer fixture produces the expected section order: header, hero,
  services/portfolio, seasons, plans, estimate, coverage, proof, FAQ, contact,
  footer.
- A source with an unrecognized section is marked `needs-adaptation` with the
  selector.
- A repeated card list produces an `each` slot with the correct item path.

Commit: `feat(foundation): detect sections and content slots`

### Task 1.4: Scope the source CSS

Files:

- `scripts/foundation-css.mjs` (new)
- `tests/foundation-css.test.ts` (new)

Steps:

1. Parse the source CSS with PostCSS.
2. Remove remote `@import` and `@font-face` URLs.
3. Flatten `@layer` blocks into their containing order.
4. Rewrite `:root`, `html`, `body`, `*`, `::before`, and `::after` to the
   foundation root selector.
5. Prefix every other selector with `.xp-foundation`.
6. Keep `@media`, `@supports`, `@keyframes`, and `@property`.
7. Rewrite local `url(...)` paths to the foundation asset root.
8. Write `foundation/source/foundation.css`.

Tests:

- A rule `body { color: red }` becomes `.xp-foundation { color: red }`.
- A rule `.card` becomes `.xp-foundation .card`.
- A remote `@import` is removed and recorded.
- A local `url(hero.webp)` is rewritten.
- The output parses with PostCSS and contains no remote URL.

Commit: `feat(foundation): scope source css`

### Task 1.5: Extract safe interactions

Files:

- `scripts/foundation-interactions.mjs` (new)
- `tests/foundation-interactions.test.ts` (new)

Steps:

1. Detect inline event handlers and inline `<script>` blocks.
2. Move simple, local interactions into `foundation/source/foundation.js`.
3. Reject network calls, dynamic code, remote imports, and source form
   submissions.
4. Record the interaction primitive and a reduced-motion equivalent in the
   manifest.
5. If an interaction cannot be isolated, mark the foundation
   `needs-adaptation` with the exact selector and reason.

Tests:

- A local `onclick` toggle is extracted and preserved.
- A `fetch()` call is rejected and recorded.
- A `<script src="https://...">` is rejected.
- The manifest lists the interaction and its reduced-motion behavior.

Commit: `feat(foundation): extract safe interactions`

### Task 1.6: Add the compiler CLI and batch mode

Files:

- `scripts/compile-source-foundation.mjs`
- `scripts/compile-source-foundations.mjs` (new batch entry)
- `package.json`
- `tests/compile-source-foundations.test.ts` (new)

Commands:

```bash
node scripts/compile-source-foundation.mjs --dossier <id> --write
node scripts/compile-source-foundations.mjs --all --write
node scripts/compile-source-foundations.mjs --all --check
```

Steps:

1. Single-dossier mode writes `foundation/` and the manifest.
2. Batch mode reads `data/reference-library/core-collection.json` and every
   dossier manifest, not just the core.
3. Batch mode writes `data/reference-library/foundation-index.json`.
4. `--check` fails if any foundation is stale against its source digest.
5. The batch report includes counts for `renderable`, `needs-adaptation`, and
   `blocked`, and the exact blocker for each non-renderable dossier.

Tests:

- Batch mode compiles a fixture set and writes the index.
- `--check` fails on a stale digest.
- A blocked dossier appears in the index with its reason.
- The source `template/` digest is unchanged.

Commit: `feat(foundation): add compiler cli and batch index`

### Task 1.7: Compile the Spicer foundation

Files:

- `data/reference-library/dossiers/spicer-landscaping-season-wheel/foundation/`
- `data/reference-library/foundation-index.json`

Steps:

1. Run the compiler for `spicer-landscaping-season-wheel`.
2. Inspect the manifest, normalized HTML, scoped CSS, and assets.
3. Confirm the section order and the content slots.
4. Confirm no source image, font, or remote URL remains in the renderable
   output.
5. Confirm the CC BY 4.0 credit is recorded.

Acceptance:

- `compatibility: "renderable"` or an exact blocker list.
- The foundation source is deterministic and digest-bound.

Commit: `feat(foundation): compile spicer landscaping foundation`

## Phase 2: Foundation renderer

### Task 2.1: Add the foundation renderer component

Files:

- `templates/client-site/src/components/FoundationExperience.astro` (new)
- `templates/client-site/src/lib/foundation-render.mjs` (new)
- `templates/client-site/src/styles/foundation-runtime.css` (new)
- `tests/foundation-render.test.ts` (new)

Interface:

```js
export function renderFoundation({ html, manifest, content }) {
  // returns { html, diagnostics }
}
```

Steps:

1. Parse the foundation HTML with `linkedom`.
2. Replace text slots with escaped `ExperienceContent` values.
3. Replace image slots with approved local asset URLs. If a required image is
   missing, use the foundation's graphic fallback, not a source asset.
4. Replace repeated slots with the sealed list.
5. Rewrite links to real client routes.
6. Insert the shared `LeadForm` markup at the contact slot. The component must
   render exactly one lead form.
7. Serialize the HTML and pass it to `set:html`.
8. Add `data-experience-pack`, `data-experience-variant`, and
   `data-layout-fingerprint`.
9. Add the attribution credit in the footer.

Tests:

- Text slots are escaped, not injected as HTML.
- A missing required slot throws with the slot ID.
- A repeated service list renders the correct count.
- The output contains exactly one lead form.
- The attribution credit is present.
- No source image path remains.

Commit: `feat(foundation): render sealed content into source markup`

### Task 2.2: Wire the renderer into the client site

Files:

- `templates/client-site/src/pages/index.astro`
- `templates/client-site/src/components/ExperiencePage.astro`
- `templates/client-site/src/lib/experience-pack.ts`
- `templates/client-site/src/lib/site.ts`
- `tests/experience-pack.test.ts`

Steps:

1. Add `renderer: "foundation"` and `foundationId` to the experience config
   type.
2. In `index.astro`, choose `FoundationExperience` when the renderer is
   `foundation`.
3. Keep the creative and pack branches unchanged.
4. Add a `compileFoundationExperience(site)` helper that loads the foundation
   manifest and content.
5. Add the foundation to `ExperiencePage.astro` dispatch only if the foundation
   is promoted to a pack. Otherwise, use the dedicated branch.

Tests:

- A foundation config renders the foundation component.
- A creative config still renders `CreativeExperience`.
- A pack config still renders `ExperiencePage`.
- An unknown foundation ID fails closed with a clear error.

Commit: `feat(foundation): wire renderer into client site`

### Task 2.3: Add the Spicer pack definition

Files:

- `templates/client-site/src/lib/experience-pack.ts`
- `scripts/visual-quality-gate-lib.mjs`
- `scripts/build-experience-pack-demos.mjs`
- `tests/experience-pack.test.ts`
- `tests/experience-pack-internal.test.ts`

Steps:

1. Add `season-wheel` to `ExperiencePackId`.
2. Add the pack definition with the Spicer reference binding.
3. Add `modular-image-field` and `seasonal-ledger` to the blueprint unions.
4. Add the pack to `EXPERIENCE_CONTRACTS`.
5. Add a demo fixture for landscaping.
6. Add the pack to the demo matrix.
7. Keep it `internalOnly: true` until the rendered matrix and live proof pass.

Tests:

- The pack is listed as internal.
- A requested internal pack compiles only with `internal: true`.
- The contract and blueprint match.
- The demo matrix includes the pack.

Commit: `feat(foundation): add season-wheel pack definition`

### Task 2.4: Render and inspect the Spicer foundation

Files:

- `artifacts/experience-pack-demos/` (ignored output)
- `.github/agents/progress-update/UPDATE-2026-10-26.md`

Steps:

1. Build the client-site dependencies if needed.
2. Run the demo matrix for `season-wheel`:

```bash
npm run build:experience-packs -- --only season-wheel --out /tmp/opencode/season-wheel-demos
```

3. Inspect desktop, compact, mobile, and 320px screenshots.
4. Check hero fit, contrast, overflow, one H1, nav, services, FAQs, contact,
   lead form, attribution, and no em dashes.
5. Check the season selector, filter, plan comparison, and estimator in a real
   browser, including reduced motion.
6. Record the exact evidence paths.

Acceptance:

- All viewport/palette checks pass.
- The rendered composition visibly preserves the Spicer chapter order and
  signatures.
- No source image, copy, or demo fact appears.
- The attribution credit is visible and followed.

Commit: `test(foundation): verify spicer pack rendering`

## Phase 3: Batch compilation

### Task 3.1: Compile all extracted dossiers

Files:

- `data/reference-library/foundation-index.json`
- `.github/agents/progress-update/UPDATE-2026-10-26.md`

Steps:

1. Run `node scripts/compile-source-foundations.mjs --all --write`.
2. Record the counts: renderable, needs-adaptation, blocked.
3. List every blocked dossier with its exact reason.
4. Retry the three failed and two pending extractions once. If they still fail,
   record the exact blocker and proceed with the 128 extracted dossiers.
5. Do not silently skip a dossier.

Acceptance:

- The index covers every dossier in the library.
- Every non-renderable dossier has a reason.
- The 128 extracted sources are unchanged.

Commit: `feat(foundation): compile all extracted dossiers`

### Task 3.2: Fix common compiler gaps

Files:

- `scripts/foundation-*.mjs`
- `tests/foundation-*.test.ts`

Steps:

1. Group the `needs-adaptation` reasons by pattern.
2. Fix the three most common deterministic gaps.
3. Add a regression fixture for each fix.
4. Re-run the batch and compare the counts.
5. Leave genuinely ambiguous cases in `needs-adaptation`.

Acceptance:

- The renderable count increases.
- No new blocked dossier appears.
- Every fix has a test.

Commit: `fix(foundation): close common compiler gaps`

### Task 3.3: Add a representative rendered matrix

Files:

- `scripts/build-foundation-demos.mjs` (new or extend the pack demo builder)
- `tests/foundation-demos.test.ts` (new)

Steps:

1. Select one renderable foundation from each niche, plus every static
   HTML/CSS foundation.
2. Render at 1536x864, 1366x768, 390x844, and 320px.
3. Run the same contrast, overflow, hero-fit, navigation, form, and attribution
   checks as the pack demo.
4. Record the matrix and failures.

Acceptance:

- The matrix covers all 16 niches or documents the missing ones.
- Every rendered foundation passes the gates or has an exact blocker.

Commit: `test(foundation): add representative rendered matrix`

## Phase 4: Workflow foundation path

### Task 4.1: Add the renderer input and config precedence

Files:

- `.github/workflows/generate-client.yml`
- `scripts/generate-site-config.mjs`
- `tests/generation-workflow-preview.test.ts`
- `tests/generate-site-config.test.ts`

Steps:

1. Add `renderer` to `workflow_dispatch` inputs and the repository dispatch
   payload.
2. Add `FOUNDATION_ID` and `FOUNDATION_POLICY` env values.
3. Define precedence: explicit workflow input, then intake payload, then
   `creative`.
4. When `renderer=foundation`, write the foundation config into
   `design.experience`:
   - `renderer: "foundation"`
   - `foundationId`
   - `dossierId`
   - `blueprintVersion: 2`
   - `selectionMode: "foundation-preview"`
   - `fingerprint`
5. Keep the creative config unchanged.

Tests:

- `renderer=foundation` produces the foundation config.
- `renderer=creative` produces the existing config.
- Missing `foundationId` fails closed.
- An unknown foundation ID fails closed.

Commit: `feat(workflow): add foundation renderer config`

### Task 4.2: Gate the creative steps and add foundation steps

Files:

- `.github/workflows/generate-client.yml`
- `tests/generation-workflow-preview.test.ts`

Steps:

1. Add `if: renderer == 'creative'` to authoring, authored evidence, creative
   render, creative recovery, and creative-only failure steps.
2. Add foundation steps:
   - `Select foundation` (reads the manifest, validates compatibility).
   - `Adapt foundation` when `foundationPolicy=allow-adaptation`.
   - `Render foundation` (build the client site).
   - `Verify foundation preview` (markers, attribution, form, routes).
3. Record stage events: `foundation_select`, `foundation_adapt`,
   `foundation_render`, `preview_deploy`, `preview_ready`.
4. Keep the existing preview deploy, screenshot, hero upload, and launch
   signature steps.
5. Add the foundation fingerprint to `design.experience.fingerprint`.

Tests:

- The workflow YAML parses.
- The creative path still contains every existing step.
- The foundation path contains the foundation steps and stage events.
- The foundation preview assertion rejects creative and legacy markers.

Commit: `feat(workflow): add foundation renderer path`

### Task 4.3: Add foundation preview assertions

Files:

- `.github/workflows/generate-client.yml`
- `scripts/verify-rendered-revision.mjs`
- `tests/generation-workflow-preview.test.ts`

Steps:

1. In the preview build step, branch on the renderer.
2. For foundation:
   - assert `data-foundation="<id>"` or `data-experience-pack="<id>"`;
   - reject `data-creative-candidate`;
   - reject `legacy-design-family`;
   - assert the attribution credit;
   - assert exactly one lead form;
   - assert the required section IDs.
3. Keep the creative assertions unchanged.
4. Ensure the screenshot capture and hero upload run for both renderers.

Tests:

- A fixture foundation build passes the assertions.
- A creative build still passes the creative assertions.
- A foundation build with a missing credit fails.
- A foundation build with a creative marker fails.

Commit: `test(workflow): assert foundation preview identity`

## Phase 5: Live proof

### Task 5.1: Run the fictional landscaping intake

Files:

- Intake issue and client repository (external)
- `.github/agents/progress-update/UPDATE-2026-10-26.md`

Steps:

1. Create a fresh admin invitation for a clearly fictional landscaping
   business and test email.
2. Submit the client form with the real coverage lookup.
3. Dispatch the workflow with `renderer=foundation`,
   `foundationId=spicer-landscaping-season-wheel`, and
   `foundationPolicy=renderable-only`.
4. Follow the run to completion.
5. If it fails, stop and record the exact blocker. Do not fall back to the
   creative path silently.

Acceptance:

- The run reaches a preview or fails with an exact foundation blocker.
- No production publication.

Commit: none (external run).

### Task 5.2: Verify the live preview and admin evidence

Files:

- `.github/agents/progress-update/UPDATE-2026-10-26.md`

Steps:

1. Open the preview and verify the pack identity, attribution, navigation,
   services, FAQs, contact, and lead form.
2. Verify desktop, compact, and mobile layouts.
3. Open the admin Ledger, Gallery, and side sheet. Confirm the hero thumbnail
   loads with `naturalWidth > 0`.
4. Open the attempt timeline. Confirm the foundation stages and no generic
   failure.
5. Capture screenshots and record the evidence paths.
6. Complete the Nifty subtask with readback.

Acceptance:

- Live preview passes.
- Admin thumbnail and stage timeline are proven.
- The report distinguishes local, rendered, and live evidence.

Commit: `docs(progress): record foundation live proof`

## Verification commands

Run after each phase:

```bash
npx vitest run tests/foundation-*.test.ts tests/experience-pack.test.ts tests/reference-template.test.ts
npm run check
npm run build
```

Before the live run:

```bash
node scripts/compile-source-foundations.mjs --all --check
npm run build:experience-packs -- --only season-wheel
npx vitest run tests/generation-workflow-preview.test.ts tests/admin-generation-tracking.test.ts
```

## Rollback

- The foundation path is opt-in. Revert the workflow input to keep all intakes
  on the creative path.
- The foundation compiler is additive. Remove `foundation/` directories and the
  index to roll back without touching `template/`.
- The `season-wheel` pack stays `internalOnly` until the rendered matrix and
  live proof pass.
- No production client site is migrated automatically.

## Open questions

1. Approve the Spicer foundation as the first live proof, with batch
   compilation immediately after.
2. Approve the opt-in foundation renderer until the batch matrix is green.
3. Approve bounded structural changes when the client brief or accessibility
   requires them.
