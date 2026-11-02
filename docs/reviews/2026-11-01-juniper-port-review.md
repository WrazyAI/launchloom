# Independent Juniper port review

Reviewed exact committed range:
`2f7e8d51b2088d6a2a8a0f43663430c5d9c93c2a..8f4bd117bfefdcca7b61a92882e63303848428e2`.
Disposition: **request changes**. Two blocking regressions and one lower-priority
URL-binding issue are confirmed. No implementation changes were made.

## P1: Outward-ring shortcut passes invisible focus indicators

Location at reviewed head: `scripts/rendered-contrast.mjs:1517-1579`, especially
the strip backdrop collection and the exclusions for the control/descendants at
`1571-1572`. Related partial-plate exemption: `1177-1198`.

The new branch measures four axis-aligned strips from ancestor background boxes
but does not establish that the ring is visible or that those boxes describe
the actual paint behind it. A control's own box shadow extends outside its border
box and is excluded from the paint-overlap checks. Ancestor clipping is also not
checked against the ring extents. Once the DOM path returns `pass`, the existing
pixel-resolution fallback does not repair this false proof.

Two isolated Chromium reproductions using the exact base/head modules:

1. White square image-bearing button, `box-shadow:0 0 0 20px #111`,
   `outline:2px solid #111; outline-offset:3px`. The outline and adjacent shadow
   pixels are both RGB `[17,17,17]` (actual contrast 1:1). Base rejects; reviewed
   head returns whole-page `pass:true`, focus ratio `18.883060964594996`, no issues.
2. The same square button without the shadow, inside a matching 120x120 white
   wrapper with `overflow:hidden`. Its outward outline is completely clipped.
   Base rejects; head again returns `pass:true`, ratio 18.883, no issues.

Impact: deterministic contrast promotion can approve an invisible keyboard-focus
indicator. This is a regression in the promotion gate, not merely missing test
coverage. Existing added shadow tests cover a partially overlapping wrapper,
not the control's own shadow or complete ancestor clipping.

Minimum recommendation: take the shortcut only when full ring geometry,
visibility and paint are proven; keep own/descendant effects and clipping
unresolved otherwise, or measure the actual ring extents from rendered pixels.
Add negative cases for both reproductions without lowering thresholds or
converting uncertainty into a pass.

## P2: Shared output panels do not establish exclusive pressed-button groups

Location: `scripts/rendered-interaction-evidence.mjs:422-448` and `475-503`
(especially `sharedControls` and the choice of `selected[0]` to restore).

Two independent toggle buttons can legitimately share `aria-controls="output"`.
With the first initially pressed and the second initially unpressed, the new
heuristic assumes exclusivity solely because exactly one peer is currently
pressed and both control the same panel. It skips the first button, activates
the second, then restores by clicking the first instead of undoing the second.
The page ends in a different valid combination and the capture reports failure.

Confirmed with a shared panel displaying both independent states:

- Base: `true -> false -> true` on the first button, `status:passed`, restored.
- Head: second button `false -> true`, then first button is toggled off;
  `status:failed`, `restored:false`, reason
  `Original interaction content/state did not restore`. No unsafe effects or
  browser errors occurred.

Impact: valid client-requested independent filters/toggles fail the required
interaction gate and can trigger unnecessary repair. The added independent
toggle test deliberately lacks a shared panel and does not cover this case.

Minimum recommendation: distinguish true exclusive semantics/behavior from
independent controls. Shared `aria-controls` plus a single current selection is
insufficient; use an explicit exclusive contract or verify post-activation
selection behavior before choosing the restoration target. For independent
controls, restore the activated control itself. Test shared-panel independent
toggles with multiple initial combinations alongside the exclusive-selector cases.

## P3: URL normalization accepts raw keys that cannot be fulfilled exactly

Location: `scripts/client-image-snapshots.mjs:16-27,91-130` and
`scripts/rendered-interaction-evidence.mjs:314-326`.

`new URL()` normalizes dot segments before the pathname check, but the snapshot
map retains the original input string. For example:

```text
https://assets.launchloom.wrazyos.com/not-intakes/%2e%2e/intakes/synthetic/photo.webp
```

The helper accepts this spelling and performs one retrieval. The browser
requests the canonical `/intakes/synthetic/photo.webp`, which misses the raw map
key; capture then fails with `request-image-GET`. Empty trailing `#` and `?`
also pass the supposedly exact URL validator. The encoded-dot case was confirmed
through the real capture function with valid retained PNG bytes.

This is **not a demonstrated arbitrary-host SSRF or exfiltration path**: the
parsed origin remains pinned and the unmatched browser request is aborted. It
is a strict-input/exact-binding correctness gap. Reject ambiguous/noncanonical
spellings before fetching, and use a consistent canonical representation after
validation. Add encoded-dot and empty-fragment/query cases.

## Scope, evidence and limits

- Inspected all 16 changed files plus relevant committed backdrop/pixel logic,
  interaction guards, palette-finding producer, public preview/form flags and
  build-environment context. No mutable creative-worker files or later commits
  were reviewed. No original/excluded worktree was inspected.
- Other inspected paths retain the fixed HTTPS asset origin, credential/query/
  fragment checks for ordinary URLs, redirect errors, raster MIME and byte/set/
  cache caps, exact image-resource fulfillment, and blocked unmatched browser
  requests. No additional confirmed arbitrary-network or private-asset leak was
  found in this bounded review; this is not a comprehensive security certification.
- The guidance avoids the old opaque-per-line/control-paint instructions, and
  the banner change is gated by the existing judge flag without editing public
  disabled-form semantics. No new renderer/mode or threshold relaxation appears
  in the range. Public build/profile matrices were inspected, not independently
  rebuilt in this review. The palette producer test uses the real formatter;
  its "control-only" sample uses a synthetic selector `control`, so it does not
  establish that real body-rooted control findings remain locked.
- No full test suite, dependency installation, external review service, paid
  call, deployment, implementation, push, or task completion occurred. Existing
  own locked dependencies were referenced read-only for bounded reproductions.
- Private evidence:
  `/home/zahemen/worktree-reconciliation-2026-11-01/validation/juniper-review-8f4bd117/`.
  `reproduce.mjs`, `results.json`, `reproduction.log`, base/head shadow screenshots;
  `clipped-ring-results.json`/screenshots; `url-normalization.json`; and
  `noncanonical-binding.log`. Snapshot modules were read directly from the exact
  Git objects. Work OS subtask remains open; controller owns fixes, follow-up
  review and final integration claims.
