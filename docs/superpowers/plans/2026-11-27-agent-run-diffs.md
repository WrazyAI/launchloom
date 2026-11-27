# Agent Run Diffs Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement inline. Keep progress in the LaunchLoom ledger.

**Goal:** Inspect actual candidate edits as they happen and replay them with a final site-code comparison from client history.

**Architecture:** Reuse the admin-only activity stream. Record bounded candidate-source diffs at write boundaries and compute final totals from the run's starting commit and deployed source SHA. Reuse the Generations inspector for replay.

**Tech stack:** Git, Node.js, GitHub Actions, existing React admin workspace and Vitest.

## Constraints

- No changes to generation decisions, client-facing output, or trace retention.
- Scope inline source to authored candidate files; apply existing credential scrubbing and redact contact-shaped values. Final diffs stay on private GitHub repositories.
- A failed diagnostic comparison must not fail generation. Older or partial recordings must not imply zero changes.

## Tasks

- [x] Prove replacement, insertion, deletion, no-op, and size bound behavior; implement candidate snapshots and private committed comparison with Git.
- [x] Wire candidate write evidence into authoring and repair; attach final comparison to the existing finalizer. Verify a reverted intermediate edit does not affect the net total.
- [x] Verify browser replay from Client history and diff labels. Add a deep link and show compact per-action and final line totals, bounded live patch, and private final diff link.
- [ ] Run focused tests, dashboard build and browser checks, then review the full change.
