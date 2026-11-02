# Independent Juniper correction review and retest

**Disposition: request changes.** The original fixtures are corrected, but P1
focus proof is not yet safely closed. Two related false passes remain confirmed.

Exact reviewed/tested head:
`3ce39aeedbe426ba33d058f3733d9ce8e0207d53`.
Inspected all changes in `8f4bd117bfefdcca7b61a92882e63303848428e2..3ce39aeedbe426ba33d058f3733d9ce8e0207d53`:
three runtime scripts, four test files, and three report/progress files. The
original review/report at `f9bd2053` remains historical. No mutable creative
files, later commits, original worktrees or excluded reliability sources were
read. This review does not adopt the implementer's full-suite/build claims as
independent evidence.

## P1: Descendant effects escape the new outward-ring paint guard

Location at corrected head: `scripts/rendered-contrast.mjs:1587-1598`, especially
the border-box intersection early return at `1590-1593` before effect inspection.

Reproduction: use the original 120x120 square image button on white, with its
80x80 image centered inside. Keep `outline:2px solid #111;outline-offset:3px` on
`:focus-visible`, but put `box-shadow:0 0 0 50px #111` on **the image**, not the
button. The image's border box stays entirely inside the button while its shadow
extends over the outward ring. The guard returns before inspecting the shadow;
the earlier unrelated-paint loop also intentionally excludes descendants.

Independent Chromium result at exact head: **whole report passes**, focus
`status:pass`, ratio **18.883060964594996**, no issues. Actual outline pixel and
adjacent shadow pixel both equal RGB **[17,17,17]**, actual contrast **1:1**.
The screenshot confirms no distinguishable ring. This is the same promotion-gate
false proof as the original finding, now through a descendant rather than the
control's own effect. The added crossing-descendant test only covers a descendant
whose border box itself crosses the strips; that negative passes correctly.

Minimum recommendation: do not require border-box intersection before assessing
effects that can paint beyond that box. Prove effect extents or keep relevant
descendant effects unresolved; do not turn an unmeasured effect into a pass.
Add this centered-image-shadow negative alongside the existing descendant test.

Evidence: `descendant-shadow.png`, `descendant-shadow-report.json`, `retest.log`
and `results.json` under the private evidence root below.

## P1: Scroll-container clipping is omitted from the clipping guard

Location: `scripts/rendered-contrast.mjs:1602-1618`, especially `1605`.

Reproduction: original matching 120x120 wrapper/button clipping fixture, with
`overflow:auto` or `overflow:scroll` instead of `overflow:hidden`. Both establish
clipping for the child's outward outline. The new guard only recognizes
`hidden|clip` and therefore never tests their ring extents.

Independent Chromium result for **both** values: **whole report passes**, focus
ratio **18.883060964594996**, no issues, even though the outline is completely
clipped. Pixels at the outline and adjacent area are both **[255,255,255]**;
the inspected `ancestor-auto-clipping.png` confirms only the green image remains.

Minimum recommendation: account for all effective axis-specific clipping/scroll
overflow modes (`auto`/`scroll` included), using the actual clip geometry or
conservative uncertainty. Add both scroll-container negative cases; retain the
positive square-logo controls and do not relax thresholds.

Evidence: `ancestor-auto-clipping{.png,-report.json}` and
`ancestor-scroll-clipping{.png,-report.json}` plus the main results/log.

## Original findings retested

| Case | Independent exact-head result |
| --- | --- |
| Original own-button black shadow | Correctly fails; ratio 1, control-effect issue and pixel evidence |
| Original `overflow:hidden` clipping | Correctly fails; ratio 1, clipping issue and pixel evidence |
| Square outward logo, desktop/compact/mobile | All pass at 18.883, visible dark ring on white |
| Rounded white ring on white | Fails |
| Inset white ring on white | Fails |
| Positioned descendant crossing ring | Fails |
| Actual visible different wrapper paint | Fails |
| Unrelated overlay occluding control/ring | Fails |
| Independent shared-panel toggles | All four initial combinations pass and restore |
| Explicit `shared-selector` exclusive shared panel | Passes, switches useful content and restores |
| True exclusive selector without explicit contract | Honestly fails activation proof; no false passed evidence |
| Encoded-dot raw URL from original report | Throws before any retrieval; no broken raw/canonical snapshot map is created |
| Empty trailing `?` and `#` | Both reject before retrieval |
| Credentials, uppercase host, explicit default port, encoded filename | All reject before retrieval |
| Wrong scheme, foreign host, wrong asset path | Never accepted or fetched; non-target origins remain ignored inventory strings |
| Positive canonical asset | Exactly one synthetic retrieval with redirect policy `error`; real capture fulfills retained image, passes/restores, no unsafe effects |

**P2 and P3 are resolved for the tested conditions. P1 is only partially resolved.**
No URL origin/path widening appears in the correction: raw equality is added
before the existing pinned HTTPS origin/credential/path/query/fragment checks.
URL inventory traversal completes before retrieval; invalid same-origin spellings
throw instead of making a browser-unfulfillable key. No real asset network call
was made; the positive retrieval uses a synthetic PNG response.

The exclusive-marker convention is consistently implemented across capture,
selection and restoration and described in the correction report. One remaining
guidance limitation: production/repair author prompts and normative guidelines
still request generic `data-purposeful-interaction` without explaining the
`...-selector` value required for exclusive pressed groups. An undeclared true
exclusive control now fails honestly (tested), so this is not a false-proof
safety finding, but the convention should be made explicit in author-facing
guidance rather than being discoverable only from implementation/report/tests.

## Later-test changes and review limits

- Raising the interaction test helper from 350ms to **1500ms** matches the
  existing production capture default; no runtime timeout or promotion threshold
  was relaxed. Added 120-second multi-viewport test budget covers multiple browser
  captures, not a weaker assertion. Existing pass/restoration assertions remain.
- Snapshot test changes correctly replace the old silent-ignore expectation for
  malformed same-origin URLs with explicit pre-fetch rejection checks. My own
  credential rejection test passes despite that individual URL having been
  removed from the implementer's array.
- The image-beacon test changed from an activation-time `new Image()` to a static
  query-bearing image. Static rejection alone would not prove activation-time
  protection. I independently reran **both** forms: both captures fail with
  `request-image-GET`. No safety regression was reproduced, but retaining both
  regression forms would cover different event timing.
- Optional test evidence writes are local opt-in screenshots/geometry. No new
  renderer/mode, network allowance, normative paint exception, or broad palette
  relaxation appears in this follow-up range. The focus guards are insufficient,
  not authorization to ignore uncertainty elsewhere.
- No full application suite, Astro/Worker checks/builds, external CodeRabbit
  service, dependency install or shared-dependency write was run. No merge,
  production/paid call, push, source deletion, implementation or new agent.

## Commands and retained evidence

Used `git diff 8f4bd117 3ce39aee -- scripts tests` and numbered `git show` reads;
copied only five necessary modules directly from exact-head Git objects and
verified every copied byte against those objects. Used own existing ops
Playwright/sharp dependencies read-only through a dependency symlink.

Executed with Node v22.20.0:

```text
node <evidence-root>/retest.mjs > <evidence-root>/retest.log 2>&1
node <evidence-root>/additional-checks.mjs > <evidence-root>/additional-checks.log 2>&1
```

Both commands exited 0 as **observation drivers**, not all-green gate assertions.
Actual coverage: **14 focus fixtures, nine interaction captures, 11 URL cases**.
A separate Python readback verified the reported positives, negatives and false
passes, byte equality of copied modules, and wrote `summary.json`/manifest.

An exploratory `different-wrapper-paint` case in the main results retains an
initial `expectedPass:false` label, but its wrapper is completely covered by the
button; actual pass there is valid, not a finding. The separate
`real-different-wrapper` case exposes dark paint behind the ring and correctly
fails. Both records are retained transparently rather than rewriting evidence.

Private evidence root:
`/home/zahemen/worktree-reconciliation-2026-11-02/validation/juniper-followup-3ce39aee/`.
Directories 0700, files 0600; `head/node_modules` is the only intentional external
dependency symlink and is excluded from hashing. `evidence-manifest.json` SHA-256:
`a7dcff9dcb10aa61fbbc668f791174e0f87912530ac1a0f32f9820dbe2b5a1d7`.
Only this report is changed in the ops worktree. Work OS remains open; controller
owns further fixes, exact follow-up review, combined verification and integration.
