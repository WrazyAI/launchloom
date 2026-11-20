# Clients workflow graph implementation plan

> For agentic workers: execute inline with `superpowers:executing-plans` and verify each task test-first.

**Goal:** Replace the desktop directory strip with a full-width, connected stage graph; preserve a compact mobile view; record missing final stage outcomes and useful failure evidence.

**Architecture:** Read explicit step outcomes from the already authenticated, attempt-specific GitHub reconciliation. Convert only named, source-controlled steps to stable LaunchLoom stages and failure codes. Do not read or retain raw GitHub log files. Use an allowlisted, bounded diagnostic excerpt rather than applying regex to arbitrary runner output. Reuse the existing Clients drawer and its authorized detail endpoint.

**Tech stack:** GitHub Actions, Node.js, Cloudflare ledger, React, CSS, Vitest, Playwright.

**Constraints:** No new dashboard route, release gate change, generation dispatch, or new access to GitHub logs. Legacy and Postgres operation identities remain separate.

- [x] Reconcile known stages: an exact match to a reported step yields pass, fail, skip, or cancellation. Missing/ambiguous steps do not inherit the run outcome; unknown input never enters the excerpt. Test via `tests/admin-history-reconciliation.test.ts`.
- [x] Render one plain-language run summary in each directory row; put the connected, named stage graph, failure output, and GitHub link only in the drawer. Test both widths in `tests/admin-workspace-browser.test.ts`.
- [x] Verify ingestion and directory projection, exact rerun identity, capability boundaries, responsive geometry, and keyboard selection with targeted tests.
