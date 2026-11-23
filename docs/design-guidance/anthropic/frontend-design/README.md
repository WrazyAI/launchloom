# Retained frontend-design guidance

`SKILL.md` and `LICENSE.txt` are unchanged upstream files from Anthropic's
[`anthropics/skills`](https://github.com/anthropics/skills) repository, retained
on 2026-10-12 at revision `41bbe19d1a1a7eaab5e7bb9050a417e5c6cffc8f`.

- Requested source: https://raw.githubusercontent.com/anthropics/skills/refs/heads/main/skills/frontend-design/SKILL.md
- Pinned source: https://raw.githubusercontent.com/anthropics/skills/41bbe19d1a1a7eaab5e7bb9050a417e5c6cffc8f/skills/frontend-design/SKILL.md
- License: Apache-2.0, retained in `LICENSE.txt`.
- SHA-256 (`SKILL.md`): `d91970639e9f5c37682ac7ab60094d35f1c7c1f38d731bd56396563aee10c1d3`.
- SHA-256 (`LICENSE.txt`): `0d542e0c8804e39aa7f37eb00da5a762149dc682d7829451287e11b938e94594`.

Use this as dossier-writing, copy-voice, and visual-craft guidance, not as
permission to replace an assigned reference with a new aesthetic. LaunchLoom's
factual, accessible, sealed-content, local-font, palette and runtime contracts
always take precedence. Unlike the general skill's placeholder-copy advice,
generated client pages may not invent business facts or author marketing text
outside sealed tokens.

Lane-scoped injection (implemented in `scripts/design-adherence-guidance.mjs`):

- **Upstream copy lane (`scripts/generate-site-config.mjs`)**: receives only
  the writing-in-design section via `frontendDesignCopyGuidanceBlock()`,
  constrained to verified client facts and LaunchLoom's no-em-dash policy.
- **Creative authoring (`scripts/author-production-experiences.mjs`)**:
  receives `designAdherencePromptBlock()` (`TEMPLATE_ADHERENCE_CONTRACT`, a
  trimmed visual-craft excerpt via `frontendDesignAuthoringGuidanceBlock()`
  that drops placeholder-copy invention and free-palette/typeface overrides,
  plus aesthetic-neutral `INTERFACE_CRAFT_GUIDANCE`).
- **Creative repair (`scripts/creative-repair-loop.mjs`)**: receives
  `designAdherencePromptBlock({ mode: "repair" })`, which adds structured
  triage, root-cause classification, and anti-slop critique verbs via
  `REPAIR_CRITIQUE_GUIDANCE`.
- **Dossier refinement (`scripts/refine-reference-design-prompts.mjs`)**:
  generates each dossier's **Agent implementation brief** from its manifest,
  clearly marked as contract-derived guidance rather than fresh measurements or
  a visual recuration. Hand-authored observations remain outside the managed
  block.

The full upstream `SKILL.md` is not injected verbatim into model requests (the
unscoped copy-invention and free-palette sections are stripped from authoring
and repair prompts) and is never copied into public client assets.
