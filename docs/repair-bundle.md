# Private repair bundle

The local design repair agent receives one directory containing the selected
build evidence it needs to repair a delivered preview without asking the
pipeline for more context.

The bundle is private. It can contain private client source, screenshots, and
configuration. Do not publish it, commit it to a public repository, attach it
to a client-visible review, or upload it as a workflow artifact. The generation
workflow intentionally does not use `actions/upload-artifact`; the operations
workflow privacy test forbids that.

## Build

Run from the LaunchLoom repository with a checkout of the private client site:

```bash
npm run repair:bundle -- \
  --out /tmp/launchloom-repair-<attempt> \
  --attempt-id <attempt-id> \
  --repo WrazyAI/<client-repo> \
  --project <pages-project> \
  --sha <40-character-build-sha> \
  --renderer creative \
  --candidate-id candidate-a \
  --preview-url https://review-initial.<pages-project>.pages.dev \
  --candidate-dir .launchloom/generated-experiences/candidate-a \
  --screenshots-dir .launchloom/creative-repair/final/screenshots \
  --config src/site.config.json \
  --findings .launchloom/delivery-warnings.json \
  --findings .launchloom/creative-bakeoff.json \
  --findings .launchloom/creative-repair/final/visual-gate.json
```

All paths after `--candidate-dir` are relative to the client checkout when you
run the command there. `--screenshots-dir` and `--findings` may be omitted when
the evidence is not present. The script rejects unsafe repository, candidate,
and attempt identifiers, and it never reads credentials into the manifest.

## Contents

- `manifest.json`: attempt, repository, project, build SHA, renderer,
  candidate, preview URL, copied file list, and the exact redeploy command.
- `candidate/`: selected candidate source, excluding `node_modules`, `.git`,
  `dist`, and `.astro`.
- `screenshots/`: PNG, JPEG, or WebP evidence only.
- `site.config.json`: the selected site configuration.
- `findings/`: gate, bakeoff, and warning evidence.
- `README.md`: the privacy warning and redeploy command.

## Redeploy

The manifest carries the exact command:

```bash
git clone https://github.com/<owner>/<repo>.git <project> \
  && cd <project> \
  && git checkout <sha> \
  && npm ci \
  && npm run build \
  && npx wrangler pages deploy dist --project-name <project> \
       --branch review-initial --commit-hash <sha>
```

Repairs must preserve verified facts, client assets, licensing, forms,
navigation, and accessibility. Never invent reviews, prices, guarantees, staff,
or credentials, and do not introduce em dashes.
