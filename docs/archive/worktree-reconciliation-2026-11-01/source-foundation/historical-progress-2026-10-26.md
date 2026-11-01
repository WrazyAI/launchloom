
## 20:03 UTC - Source-foundation generation design and plan

- Task: replace per-run visual invention with a source foundation for every
  extracted dossier. The agent starts from the dossier's actual HTML, CSS,
  assets, and interaction mechanics, then binds sealed client content. A
  complete foundation can render deterministically as a pack.
- Branch/worktree: `codex/launchloom-source-foundation` at
  `/home/maigreeks/projects/.worktrees/launchloom-source-foundation`, based on
  `origin/main` `4483b0c2`. Nifty subtask `eZc!DzxMni` under parent
  `zazUiD6h1E`.
- User direction: all dossiers are licensed for internal use and source-derived
  adaptation; no dossier will be used verbatim; the source foundation must be
  intact when generation starts.
- Design:
  `docs/superpowers/specs/2026-10-26-pack-first-landscaping-design.md`.
- Plan:
  `docs/superpowers/plans/2026-10-26-source-foundation-generation.md`.
- The plan covers a deterministic foundation compiler, a foundation renderer,
  batch compilation of all extracted dossiers, a bounded agent adaptation
  stage, and an opt-in `foundation` workflow renderer. The Spicer landscaping
  dossier is the first rendered proof.
- Constraint discovered during the review: the OpenCode Go quota is exhausted,
  so the first foundation proof must be deterministic and must not depend on a
  model call. The Spicer source is static HTML/CSS with compiled Tailwind CSS,
  which makes it a suitable first proof.
- No product code has changed. The design and plan are awaiting approval before
  Phase 1.
