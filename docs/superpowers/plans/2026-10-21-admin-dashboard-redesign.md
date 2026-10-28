# Admin dashboard redesign implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`. Steps use checkbox syntax.

**Goal:** Ship the approved blend: branded collapsible shell, Ledger default with Gallery toggle, authenticated generation screenshots, and a blurred side sheet.

**Architecture:** Keep the existing Astro/React/Worker stack. Replace the dashboard shell and Generations surface with new components and a scoped `redesign.css`. Use the existing authenticated `generation-hero` endpoint for screenshots. Add one additive `attention` filter to the attempts API, then redesign the remaining record lists.

**Tech Stack:** React 19, TypeScript, Astro, Cloudflare Worker, Durable Objects, Vitest, Playwright, existing Manrope/Source Sans fonts.

**Spec:** `docs/superpowers/specs/2026-10-21-admin-dashboard-redesign.md`

## Global Constraints

- Ledger is the default; Gallery remains available.
- Existing forest `#10251f`, ivory `#f4f2ea`, paper `#fffefa`, sage `#bad8c8`, lime `#d9f06b` and divider `#d9ddd1` remain the palette.
- Use the existing L mark and favicon. No new logo.
- No fake previews, actors, timestamps, failure reasons or delivery states.
- Existing admin auth, Access/Neon, invitation, generation and route-state semantics remain unchanged.
- No private review/signing tokens in UI payloads, HTML or logs.
- Mobile must not have body overflow.
- Preserve reduced-motion and keyboard support.

## Review Focus

- Attempts without `issueNumber` or hero images: must show a clear placeholder, not another client's image.
- Attempts with a hero that predates a revision: label as "Generation screenshot", not "current site".
- `attention` filtering with search/date/profile filters: counts and rows must use the same predicate.
- Gallery pagination: filtered results beyond the first page remain reachable.
- Side sheet focus/Escape/scrim/return focus: must not leave the page scrollable or trap focus after close.

---

### Task 1: Brand, favicon, collapsible shell and login

**Files:**
- Create: `src/admin/BrandMark.tsx`
- Modify: `worker/src/admin-dashboard.ts`
- Modify: `src/admin/WorkspaceShell.tsx`
- Modify: `src/admin/SignInView.tsx`
- Create: `src/admin/redesign.css`
- Modify: `src/admin/main.tsx`
- Test: `tests/admin-workspace-browser.test.ts`, `tests/admin-account-flows-browser.test.ts`, `worker/test/admin-assets.test.ts`

**Interfaces:**
- `BrandMark({ size?: number; showWordmark?: boolean })` renders the existing L path and optional LaunchLoom wordmark.
- `WorkspaceShell` keeps its current props and route behavior; adds rail collapse and mobile drawer state.
- `SignInView` keeps form labels and auth behavior; adds the brand panel.

- [ ] Add an inline SVG favicon data URI to `shellMarkup()` in `worker/src/admin-dashboard.ts`.
- [ ] Add `BrandMark` and use it in the rail, mobile drawer and login brand panel.
- [ ] Add rail collapse state (`admin-shell--rail-collapsed`) and mobile drawer state (`admin-shell--rail-open`) with Escape/close behavior.
- [ ] Add `redesign.css` imported after `styles.css`; include the approved shell, login, ledger, gallery, sheet and record-list styles.
- [ ] Update browser tests for the new toggle, mark and login structure while preserving keyboard reachability.
- [ ] Run focused browser tests and build.
- [ ] Commit.

### Task 2: Additive attention filter

**Files:**
- Modify: `src/lib/admin-contracts.ts`
- Modify: `worker/src/generation-attempts.ts`
- Modify: `worker/src/admin/workspace-api.ts`
- Test: `worker/test/admin-attempts.test.ts`, `tests/admin-api.test.ts`

**Interfaces:**
- `AttemptFilters` gains `attention?: boolean`.
- `GET /workspace/attempts?attention=true` matches failed/unknown execution, stale, or delivery `attention`/`diagnostic`.
- Existing filters and cursors keep working.

- [ ] Write failing tests for the predicate and invalid query value.
- [ ] Add the SQL clause using `json_extract(data,'$.deliveryStatus')` and `json_extract(data,'$.stale')`.
- [ ] Parse `attention` in `workspace-api.ts`; accept only `true`/`false`.
- [ ] Run Worker and API tests.
- [ ] Commit.

### Task 3: Generations toolbar, Ledger and Gallery

**Files:**
- Create: `src/admin/GenerationPreview.tsx`
- Create: `src/admin/AttemptLedger.tsx`
- Create: `src/admin/AttemptGallery.tsx`
- Modify: `src/admin/GenerationsView.tsx`
- Modify: `src/admin/WorkspaceShell.tsx` if the heading needs the new copy
- Test: `tests/admin-workspace-browser.test.ts`, `tests/admin-view-model.test.ts`

**Interfaces:**
- `generationHeroUrl(attempt)` returns the authenticated hero URL only when `issueNumber` is present; otherwise `null`.
- `GenerationPreview({ attempt, size })` renders an image with a labeled placeholder on 404/error.
- `AttemptLedger` props: attempts, selectedId, onSelect.
- `AttemptGallery` props: attempts, selectedId, onSelect.

- [ ] Add the hero URL helper and placeholder behavior.
- [ ] Replace the eight-column table with a five-column ledger grouped by local day.
- [ ] Add the top search, status chips and Filters disclosure; preserve advanced filters.
- [ ] Add `Ledger | Gallery` state with Ledger default; Gallery renders the same current page as cards.
- [ ] Add the quiet summary line and attention count using `attention=true`.
- [ ] Keep cursor pagination in both views.
- [ ] Update browser tests for row/card selection, filters, empty/loading/error states, and mobile overflow.
- [ ] Commit.

### Task 4: Generation side sheet

**Files:**
- Modify: `src/admin/AttemptInspector.tsx`
- Modify: `src/admin/GenerationsView.tsx`
- Modify: `src/admin/redesign.css`
- Test: `tests/admin-workspace-browser.test.ts`

**Interfaces:**
- `AttemptInspector` remains the selected-attempt component; it always renders as a right-side `dialog` with a blurred backdrop.
- It accepts the existing attempt/client/events props plus `previewUrl`/`productionUrl` derived from the client.
- Large image uses the authenticated hero URL; "Visit site" uses safe client preview or production URL.

- [ ] Move the inspector to a dialog sheet at all widths; remove the wide inline panel.
- [ ] Add the large browser-framed generation screenshot and placeholder.
- [ ] Add "Generation screenshot" explanatory copy, status, client, profile, attribution, completed time and duration.
- [ ] Add a technical details disclosure with request/run/issue/costs and the existing timeline.
- [ ] Preserve focus trap, Escape, scrim close, and trigger focus return.
- [ ] Update tests for sheet semantics, close paths and missing previews.
- [ ] Commit.

### Task 5: Clients, Invitations, Team record lists

**Files:**
- Modify: `src/admin/ClientsView.tsx`
- Modify: `src/admin/InvitationsView.tsx`
- Modify: `src/admin/TeamView.tsx`
- Modify: `src/admin/redesign.css`
- Test: `tests/admin-invite-flows-browser.test.ts`, `tests/admin-workspace-browser.test.ts`

**Interfaces:**
- Shared record-list classes (`.admin-record-list`, `.admin-record`, `.admin-record__primary`) replace wide table wrappers where the data is a list.
- Existing create/copy/revoke, role, team and profile actions keep their labels and behavior.

- [ ] Convert Clients and Invitations to record lists with readable hierarchy.
- [ ] Convert Team to a profile row list while preserving owner controls.
- [ ] Restyle Settings and Integrations with the same spacing regardless of markup changes.
- [ ] Update browser tests for visible labels and mobile widths.
- [ ] Commit.

### Task 6: Verification and deploy

- [ ] Run `npm run build:admin`.
- [ ] Run `npm run check` and `npm run check:worker`.
- [ ] Run `npm run build`.
- [ ] Run focused browser tests and Worker tests.
- [ ] Capture desktop/mobile Chromium screenshots; run WebKit smoke on the built bundle.
- [ ] Verify no body overflow at 1440/1024/390/320.
- [ ] Review contrast and focus states.
- [ ] Open PR, wait for `validate` and `route-fixtures`, merge, deploy.
- [ ] Verify production login, ledger, gallery, sheet, previews and favicon.
- [ ] Append progress ledger; list/reuse and complete the corresponding Work OS ledger task via the canonical tool in `AGENTS.md`, confirming readback. Historical Nifty `XpQJ6EQn4P` is context, not a current API target.
