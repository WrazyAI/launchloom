# Three extracted source dossiers: local rendered verification

## Follow-up: six previews restored, 2026-10-11 23:28 UTC

The original three-site review below remains historical evidence. The current
gallery has **six** source previews, adding:

- `html5up-home-care-story` (upstream Story, not the care adaptation)
- `colorlib-tavola-restaurant`
- `spicer-plumber-dispatch-console`

The prior server was no longer running: GET returned connection refused, no
port listener or matching process existed, and the built index was intact.
Exact termination cause is unknown. Restarted with a separate process session:

```sh
setsid -f python3 scripts/serve-dossier-source-previews.py < /dev/null > artifacts/dossier-source-previews/server.log 2>&1
```

Fresh verification: gallery HTTP 200 with six original-source links; all six
entrypoints HTTP 200, form-blocking CSP retained; twelve desktop/mobile
Playwright renders with no page errors, failed requests or missing fragment
targets. All bundles passed extraction hash checks. Full library verifier
still returns zero integrity problems. Evidence:
`artifacts/dossier-source-previews/render-report-six.json` and screenshots.

Caseworth and Tavola both have mobile document width 718px at a 390px viewport.
The other four have no horizontal overflow in these checks. Story creates an
empty image inside its initially transparent lightbox modal; the image count
reports it, but it is not a failed visible asset request. Scroll-reveal behavior
can leave content transparent in full-page screenshots; these are not evidence
that the underlying source sections are absent. Story's original blurred image
placeholders and generic copy are retained, not substituted with care content.
Spicer plumbing visibly has a dark hero headline against a dark background;
layout/resource checks passing is not a contrast pass. No contrast measurement
or repair is claimed. Originals are unchanged, and forms were not submitted.

The gallery and three added sites were opened in the browser Review pane.
TestSprite remains unverified (CLI unavailable in this session). No publication,
merge or deployment. The separate server session avoids dependence on the
foreground tool call; this is not a managed auto-restarting service.

## Outcome

Three original source bundles are locally visitable at <http://127.0.0.1:4327/>.
This is an extraction review, not a client generation, adapted experience-pack
demo, production deployment, or claim that the entire library is runnable.
Retained source was copied byte-for-byte. No source layout defects were patched.

| Dossier | Source result | Dossier correspondence |
| --- | --- | --- |
| `html5up-dental-dimension` | Original Dimension renders at 1440 and 390px; navigation opens Intro and Escape closes it at both widths. No broken images, unresolved fragment targets, runtime errors, or horizontal overflow. | **Mismatch of artifact type:** dossier screenshots and design DNA describe the Linden Dental Atelier adaptation. Extracted source is upstream Dimension, with original typography, background and Intro/Work/About/Contact panels. The original structural mechanism is retained, but this source cannot reproduce the dental screenshot. |
| `colorlib-caseworth-legal-ledger` | Desktop renders cleanly. Mobile document width is **718px at a 390px viewport**. Closed `#navDrawer.drawer.drawer-end` extends to x=718. Fee filtering returns one row for “Shareholder”; native accordion opens; navigation drawer opens. No broken images, missing fragments, runtime errors or failed resource requests. | Main section order, typography, imagery and content correspond to the dossier. Its provenance explicitly documents hiding the closed drawer for the earlier mobile screenshot. The raw source retains that upstream defect; the screenshot workaround does not prove mobile source correctness. |
| `spicer-law-firm-results-ledger` | Desktop/mobile render cleanly with one H1, six H2 sections, no broken images, missing fragments, runtime errors, failed requests or horizontal overflow. | Visual inspection shows the same hero/results panel, practice ledger, results table, attorney cards, process, consultation form and FAQ structure. Desktop render and dossier both measure 1440×8356. Not claimed pixel-identical. |

## Limits and safety

- Packaged sources are static HTML/CSS/JS, so the local build copies and verifies
  them rather than regenerating them with an application framework.
- All three bundles passed their extraction file size and SHA-256 checks; the
  complete library verifier reports **131 dossiers, 128 extracted, 3 failed,
  0 integrity problems**. Byte integrity is not rendered fidelity or usability.
- Index methods: 98 live-site, 11 owned-artifact, 12 pinned-git, 10 zip-download
  (these include failed records). Inspected live-site records explicitly strip
  scripts and inline event handlers and exclude media. Do not describe all 128
  extractions as complete runnable application source.
- Some original typography relies on external Google Fonts. These previews
  were locally served with network available, not proved fully offline.
- Forms were inspected, **not submitted**. The loopback-only preview server adds
  `form-action 'none'` and `connect-src 'none'` and noindex headers. There is no
  backend integration or delivery claim. Original license credits remain.
- This is targeted structural/visual verification, not a full accessibility,
  contrast, security, or all-route audit. Dimension panel behavior and Caseworth
  filter/accordion/drawer were exercised; Spicer was verified as a static render.

## Reproduce

```sh
node scripts/build-dossier-source-previews.mjs
node scripts/verify-reference-templates.mjs
python3 scripts/serve-dossier-source-previews.py
```

Open the index to visit each original and its retained desktop/mobile evidence.
Local review artifacts (ignored by git) are in
`artifacts/dossier-source-previews/`: `build-report.json`, `render-report.json`,
`interaction-report.json`, six full-page screenshots and two Dimension panel
screenshots. Browser checks used installed Playwright from the compatible
demo-generation checkout, without modifying its dependencies.

## Follow-up, not applied

1. Bind adaptation screenshots to their exact adaptation source, separately
   from the upstream source (Dimension).
2. Keep the Caseworth raw source immutable; if a corrected study is needed,
   retain it separately and verify closed/open drawer bounds at mobile widths.
3. Classify runnable bundles separately from sanitized live-page captures.

No main merge, push, deployment, or paid generation was performed.

Tooling syntax checks and preview HTTP/header assertions passed. TestSprite
was unavailable in this session (`testsprite --version`: command not found);
no TestSprite result is claimed. Render evidence above is direct Playwright
execution and image inspection, not an automated TestSprite verdict.
