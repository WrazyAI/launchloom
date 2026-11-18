# Scoped walkthrough runner implementation plan

**Goal:** Let the exact pinned DeepSeek subagent choose approved functional test
scenarios and independently assess their results, without opening the desktop
browser or shell policy to the child.

**Architecture:** An operator-written and hash-approved JSON manifest defines a
single IPv4 loopback fixture, exact GET paths, and named scenarios. A host
runner accepts only a scenario ID from the verified child. A Playwright worker
runs in a fresh Bubblewrap network namespace; a stdio broker fulfills only the
manifest's GET requests, never redirects or forwards credentials. Evidence is
written by the host, not the model. No built-in browser denial is overridden.

- [ ] Validate manifest, exact target, hash, scenario ID, steps and size before
  browser launch or network access; run unit tests for rejected inputs.
- [ ] Demonstrate real isolated browser execution, screenshot capture, positive
  and failing states, and refusal of unapproved requests.
- [ ] Verify exact model metadata before accepting its scenario selection or
  verdict. Keep raw screenshots local by default; no pixel verdict without a
  separate image capability test.
- [ ] Independently review the permission boundary, run the package suite,
  install only task-owned files, and enable approval-gated suggestions only
  after a synthetic smoke succeeds.

Initial scope is Linux, synthetic/local disposable fixtures, browser actions
and bounded read-only HTTP assertions. Arbitrary CLI, external origins, auth,
production, and remote writes are not supported by this runner. CLI evidence
can still be reviewed separately. Server-side effects are not sandboxed:
approved fixtures must not have production credentials or network dependencies.
