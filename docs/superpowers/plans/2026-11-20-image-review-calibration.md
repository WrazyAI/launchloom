# Generated-image review calibration

**Goal:** keep the integrity gate that blocks fake interfaces and text, while making relevance scene-aware, people policy niche-aware, text rejection threshold-based, and retries targeted.

**Constraints:** no relaxation without evidence; keep the reviewer conservative on UI, fake copy, logos, and watermarks; do not change publication or public authorization; no client-facing change.

1. [ ] Add `scripts/image-review-policy.mjs` with version `visual-review-v2`: policy per business kind and placement, scene-aware relevance, text threshold, people mode, reason codes, targeted retry directives, and review session keys that include policy and scene.
2. [ ] Wire it into `scripts/generate-contextual-assets.mjs`; retain every reason code (including people) in the manifest and make retries use the actual rejection reasons.
3. [ ] Run focused tests, then a bounded calibration set of generated images across two niches, and report machine verdicts against human inspection before any threshold is treated as settled.
