# Archived synthetic rate-limit demonstration

Recovered 2026-11-01 from the hash-verified private snapshot of
`launchloom-rate-limit-lead-coverage` (HEAD `791d73e9`). This folder is inert
historical evidence, not a registered TestSprite plan or production fixture.
Nothing in this recovery starts its server or invokes its endpoints.

- `rate-limit-fixture.mjs` is a separate HTTP server with copied demonstration
  HTML and an in-memory synthetic limiter. It accepts two submissions before
  returning 429 and exposes a forced-quota/reset switch. It does **not** execute
  the production Worker, Durable Object sliding-window limiter or production
  LeadForm. Its description of “sliding-window” protection and “exact” Worker
  response is historical demonstration wording, not a verified equivalence.
- `rate-limit-lead-form.json` is an unexecuted historical test plan targeting
  that demonstration's controls. Its project ID is historical and must not be
  reused to register or run a test without fresh target/ownership validation.
- No run verdict is present. These files do not verify deployed visitor/project
  quotas, durable state, coverage lookups, real lead delivery, or current UI.
- The archive preserves content with trailing whitespace removed from the
  fixture for repository whitespace hygiene. Byte-exact originals remain in
  the private snapshot; no original worktree file was altered.

Private source:
`/home/zahemen/worktree-reconciliation-2026-11-01/ops/launchloom-rate-limit-lead-coverage/`.
The manifest records original hashes; see the reconciliation report for its
manifest SHA-256. Original relative paths were
`.testsprite/fixtures/rate-limit-fixture.mjs` and
`.testsprite/plans/rate-limit-lead-form.json`.

Any future production-verification test is separate work: exercise the real
UI/API and durable limiter with authorized synthetic data, validate exact
429/Retry-After behavior, and record an actual terminal verdict. Do not treat
this archived demo as that evidence.
