# LaunchLoom admin workspace redesign

Date: 2026-10-21. Nifty: `XpQJ6EQn4P` (TAS-5514), parent `ti9WNOpGL2`.
Status: approved visual direction from the interactive mockups. Implementation
is authorized. This document records the agreed product and design decisions
before implementation planning.

## Intent

The workspace should answer one question in the first five seconds: what has
LaunchLoom generated recently, by whom, did it work, and when? The current
dashboard is structurally complete but visually flat: an eight-column table,
nine always-visible filters, two large attention cards and a separate inspector
card compete for attention.

The redesign keeps every operational fact, but changes the hierarchy. The
recent generation list becomes the home screen. Opening a generation opens a
large preview and its evidence in a side sheet over a blurred backdrop.

## Confirmed decisions

- Direction: a blend. **Ledger is the default view; Gallery remains available
  as a first-class toggle.** The user selected this from the interactive
  mockups on 2026-10-21.
- Preserve the existing LaunchLoom palette: forest, ivory, paper, sage, lime.
- Preserve Manrope for headings and Source Sans 3 for data and body copy.
- Restore the existing LaunchLoom L mark and wordmark. Do not invent a new
  company logo.
- Restore the favicon on the admin sign-in and workspace pages.
- Make the desktop rail collapsible, with an off-canvas drawer on mobile.
- Replace the inline generation inspector card with a right-side sheet over a
  blurred backdrop.
- Show real visual previews of generated sites in the ledger, gallery and side
  sheet. Never use a fake screenshot or a private review token.
- Redesign the other record surfaces (Clients, Invitations, Team) with the same
  hierarchy and spacing discipline.

## Goals

- Recent generations are immediately scannable: client, visual preview, status,
  initiator, finished time, attempt profile.
- The current attention state is available without becoming the dominant UI.
- Advanced filtering is available but does not occupy half the page.
- A selected generation presents a large generation screenshot, attribution,
  timing and stage evidence in one focused surface.
- The shell feels like a designed operations product: calm, confident and
  specific to LaunchLoom, not a generic card dashboard.
- The same information remains accessible by keyboard and on small screens.
- Mobile never requires horizontal page scrolling.

## Non-goals and anti-goals

- Do not redesign the public site or generated client templates as part of this
  work.
- Do not change generation dispatch, model selection, review tokens, client
  intake or publication semantics.
- Do not invent preview images, client activity, metrics or failure reasons.
- Do not expose private review/signing URLs in the browser bundle, API payloads,
  progress logs or screenshots.
- Do not make the page dependent on loading dozens of live third-party sites.
- Do not add a second design system or replace the public brand.
- Do not put every row inside an identical rounded card.

## Visual system

### Palette

| Role | Value |
| --- | --- |
| Forest ink | `#10251f` |
| Muted forest | `#587069` |
| Ivory canvas | `#f4f2ea` |
| Paper surface | `#fffefa` |
| Sage support | `#bad8c8` |
| Lime highlight | `#d9f06b` |
| Divider | `#d9ddd1` |
| Failure | `#a14333` |
| Success | `#2d7758` |
| Attention | `#9b6a1d` |

Lime is reserved for the active rail marker, live/running emphasis and focus
confirmation. Status always has a text label.

### Type

- Manrope: brand, headings, nav, client names, buttons.
- Source Sans 3: body, metadata, table values, form fields.
- Display heading: 28-38px Manrope 800 with tight tracking.
- Section heading: 20-24px Manrope 800.
- Record title: 14-15px Manrope 800.
- Metadata: 11-12.5px Source Sans 3.
- Avoid all-caps eyebrows and decorative numbered labels.

### Layout

```text
┌───────────────┬─────────────────────────────────────────────────────────┐
│ brand + rail  │ page title                    search  filters  action  │
│               ├─────────────────────────────────────────────────────────┤
│ Generations   │ quiet summary line                                      │
│ Clients       │ status chips                         Ledger / Gallery │
│ Invitations   ├─────────────────────────────────────────────────────────┤
│ Team          │ Today                                                   │
│ Integrations  │ [thumb] Client       Status    Actor      Finished      │
│ Settings      │ [thumb] Client       Status    Actor      Finished      │
│               │                                                         │
│ account       │ [side sheet opens from right over blurred backdrop]     │
└───────────────┴─────────────────────────────────────────────────────────┘
```

- Expanded rail: 252px. Collapsed: 76px icons only. Mobile: 278px off-canvas
  drawer with a scrim; the main content remains full width.
- Main content max width: 1460px, 36px desktop gutters, 22px tablet, 16px phone.
- Ledger rows are separated by hairlines, not wrapped in cards. A 104x65
  thumbnail leads each row.
- Gallery is a 3-column image wall at desktop, 2 at tablet, 1 at phone.
- One memorable visual moment: the large, authentic site preview opening in the
  side sheet. Everything around it stays quiet.

### Interaction

- Rail collapse is remembered as a local UI preference only; it never stores
  identity or auth data.
- View choice (Ledger/Gallery) is remembered independently of filters.
- Side sheet: 220ms slide/fade, `backdrop-filter: blur(9px)`, close on Escape,
  scrim click, or close button. Focus enters the sheet; focus returns to the
  originating row. Body scroll locks while open.
- Reduced-motion users get an immediate state change.
- Filter chips apply immediately. Advanced filters live in a popover/panel.
- Rows are keyboard-activatable and remain real table semantics on desktop.
  Mobile uses a stacked record layout, not a horizontal table.

## Screen specifications

### Sign in

Use a split layout. The left forest panel carries the L mark, wordmark,
"Operations workspace" and a short statement. The right ivory panel carries the
existing email/password form and reset link. On mobile, the brand panel collapses
into a compact logo above the form. Keep the current auth error and enrollment
behavior.

### Generations: Ledger

- Top bar: "Recent generations"; search; Filters; New invitation.
- Quiet summary line: "5 generations today · 2 need attention · Review
  failures · Updated just now."
- Status chips: All, Succeeded, Running, Needs attention. Counts are scoped to
  the active search, profile, actor and date filters, but not the selected
  status chip. Add an additive `attention` filter and count to the attempts API
  so the chip filters and the summary line use the same predicate.
- Columns: Generation, Status, Initiated by, Finished, Preview.
- Group by Today and Yesterday, with exact-time tooltips and relative labels.
- Status includes the execution state plus the actual delivery state
  (`Published`, `Preview ready`, `Diagnostic`, `Needs attention`, or
  `No delivery`). Do not claim that a review link was sent or that a
  particular creative pass happened unless that fact was recorded. The
  mockup's "Review link sent" and "Creative pass 2" strings are illustrative
  only.
- "Needs attention" means an attempt that is failed, unknown, stale, or has a
  delivery state of diagnostic or attention. The same predicate powers the
  summary, the chip and its count.
- Failure rows retain a visible preview when one exists, but remain visibly
  failed and are never presented as approved.
- The row action is always "Preview" and opens the side sheet.

### Generations: Gallery

Same filters and summary. Six most recent attempts in a 3-column image wall.
Each card has a large site preview, client name, status, actor, time and
profile. The featured class in the mockup is not required; all cards should
carry equal weight. Opening a card uses the same side sheet.

### Generation side sheet

- Header: profile/attempt reference, client name, status and substatus.
- Site preview: captured image; browser chrome; "Visit site" opens the safe
  client preview or production URL in a new tab.
- Site preview label: "Generation screenshot" when using the existing
  generation hero. It may predate later revisions; say so in the sheet.
  "Preview not captured" when no hero exists.
- Attempt summary: client, profile, initiator, invitation creator, completed
  time, duration.
- Technical details disclosure: request ID, repository, workflow run/attempt,
  issue number, and actual/estimated/unreported costs stay available. They are
  secondary to the visual preview, not removed.
- Stage timeline: real recorded events only.
- Failure section: category, stage, summary and next step when recorded. A
  diagnostic preview is explicitly labeled as diagnostic.
- Footer: Open client dossier and Visit site.
- If no preview asset exists, show a labeled "Preview not captured" placeholder;
  do not reuse another client's image.

### Clients, Invitations, Team and Settings

- Clients: record list with business/contact, current site state, latest attempt
  and invitation context; no dense eight-column table.
- Invitations: recipient, creator, status/expiry and creation time; actions stay
  explicit and copy-once behavior is preserved.
- Team: profile rows, role/active state and owner-only controls; readable at
  mobile widths.
- Settings: profile and password controls in a calm two-column form.
- Integrations: keep the truthful "Not connected / Planned" placeholder.

## Preview data and security

The existing generation ledger already stores a full-page desktop screenshot
(hero) for a generation issue and serves it through the authenticated
`/api/admin/onboarding-invites/generation-hero?id=...` endpoint. Use that real
screenshot as the initial attempt preview rather than inventing a new capture
pipeline.

- Attempts with an `issueNumber` use the authenticated generation hero as their
  thumbnail and side-sheet image. Label it "Generation screenshot" and note
  that it can predate later revisions. It is not presented as an exact
  attempt-time capture or as the current live site.
- The side-sheet "Visit site" link uses the client `previewUrl` or
  `productionUrl` after the existing client lookup. It never receives a signed
  review token.
- Attempts without a hero show a labeled "Preview not captured" placeholder.
  Never reuse another client's image.
- No new R2 upload path, backfill endpoint or mobile capture is required for
  this release. Per-attempt historical captures can be added later without
  changing the UI contract.
- The generation-hero endpoint remains protected by the existing admin guard.
  No R2 keys, signed URLs or private review links appear in API payloads or
  rendered HTML.

This is deliberately a real screenshot of the current generated site, not a
fabricated attempt history. The side sheet also keeps the existing technical
facts and costs in a secondary disclosure.

## Component plan

- `BrandMark`: inline L mark plus wordmark; reused in the rail and login.
- `WorkspaceShell`: collapsible rail, mobile drawer, top bar, account block.
- `GenerationToolbar`: search, status chips, advanced filter panel, view toggle.
- `AttemptLedger`: table-semantic desktop rows, stacked mobile rows.
- `AttemptGallery`: responsive image wall.
- `AttemptPreview`: authenticated thumbnail with placeholder/error fallback.
- `AttemptSheet`: replaces the current `AttemptInspector`; focus and scroll
  management, authenticated image preview, safe site link.
- `RecordList`: shared visual pattern for clients/invitations/team.
- `SignInView`: split brand layout without changing auth semantics.

## Acceptance criteria

1. Logo, wordmark and favicon render on login and in the workspace, including on
   the branded API origin.
2. Rail collapses/expands on desktop and opens as a drawer on mobile without
   body overflow; preference persists only as a UI preference.
3. Generations defaults to Ledger. Gallery is reachable with one control and
   remains usable on phone widths.
4. Recent rows show client, status, initiator, completion time and a real
   preview thumbnail when one is available.
5. Clicking a row/card opens a right side sheet over a blurred backdrop; Escape,
   scrim click and close return focus to the trigger.
6. The side sheet shows an actual current-site screenshot, attribution, timing,
   real stage events and Visit site.
7. Unavailable previews are labeled; no fake image, actor, date or failure
   evidence is shown.
8. Clients, Invitations and Team no longer rely on wide equal-weight tables that
   require horizontal scrolling at desktop or mobile widths.
9. Keyboard navigation, focus, reduced motion and contrast pass; 1440/1024/390/
   320 widths have no body overflow.
10. Authenticated preview endpoints reject unauthenticated access; no tokenized
    URLs or private links appear in payloads, logs or rendered HTML.
11. Existing admin API behavior, route state, filters, pagination, account forms
    and Access/Neon auth boundaries remain intact.
12. Relevant unit, Worker, browser, Astro/TypeScript and production build checks
    pass, with desktop Chromium and WebKit rendered evidence.

## Implementation slices

1. Brand, login and shell: favicon, mark, collapsible rail, mobile drawer.
2. Generations Ledger and Gallery with toolbar, preview placeholders and side
   sheet using available client previews where truthful.
3. Wire the authenticated generation hero into ledger, gallery and sheet;
   test placeholder/error behavior and safe site links.
4. Client, Invitations and Team record-list refresh.
5. Visual review, full validation, deploy and ledger.

Existing behavior and data semantics win over visual convenience. Any preview
that cannot be proven is shown as unavailable, not filled in.
