# Admin workspace visual exploration

2026-10-19. Throwaway mockups only, with fictional data and no live API actions.
Nifty `ti9WNOpGL2`; no product design or implementation approved yet.

## Design plan

### A: Operations studio (recommended starting point)

- Palette: ink `#202337`, porcelain `#F7F8FC`, paper `#FFFFFF`, iris `#6254D9`, seam `#E5E7EF`, muted `#6C7084`. Status colors are semantic and always paired with text.
- Type: Manrope for workspace headings and brand, Source Sans 3 for readable operational data; system sans-serif fallback if fonts are unavailable.
- Layout: quiet fixed vertical navigation, left-aligned attempt ledger, persistent selected-run inspector. A stage progression strip represents real pipeline stages, not decoration.
- Personality: the connection between invitation, person and run is the visual identity; compact linked avatars, a woven brand mark and a single iris selection rail express it without gradients or ornamental charts.

```text
navigation | page title + shared workspace      | selected run
           | attention notice + stage progress  | failure + next step
           | filters                           | initiator / inviter
           | attempt ledger with clear actors  | stage timeline
profile    | all attempts, not only successes   | evidence links
```

### B: Client launch desk

- Palette: ink `#16354C`, canvas `#EEF3F6`, paper `#FFFFFF`, ocean `#176B8B`, seam `#D8E3EA`, muted `#627787`.
- Same deliberate type roles, with a more spacious client-first hierarchy.
- Layout: horizontal navigation and a client directory beside an expanded client dossier with complete attempt history. This prioritizes client relationships over scanning many concurrent runs.
- Same information and truthful states as A; a different navigation/density choice, not just a recolor.

## Brief review before building

- Rejected a giant welcome headline and four decorative KPI cards: neither helps find a failed generation or its responsible actor.
- Rejected a black-and-neon command-center theme: this is collaborative client operations, not an infrastructure terminal.
- Avoid all-caps eyebrows, ambiguous colored dots, fake charts and invented live metrics. Synthetic totals must be derived from the synthetic dataset.
- Both options expose client-initiated vs admin-initiated runs separately from invitation creator. Mock historic unknowns remain not recorded.
- GHL remains explicitly not connected and contains no functional-looking OAuth action or fabricated sync date.
- Interaction scope: switch visual directions and workspace sections, search/filter fictional records, select a run/client, inspect team/profile and view integration placeholders. No real links, dispatches, invitations, authentication, token handling or backend writes.

## Verification target

- Open actual local mockup in browser; inspect desktop/mobile, working switches, run failure detail, attribution, and GHL state.
- Browser checks validate the prototype only, not application authentication, persistence, generation tracking or production readiness.

## Actual preview verification

- Local Chromium prototype checks passed A/B desktop rendering, status/search/initiator filtering, selected-attempt failure details, profile/Escape, team, client history and disabled/not-connected GHL state.
- Both primary directions and their integration screen fit a 390px mobile viewport without body overflow. Attempt tables scroll within their own containers.
- No browser page errors. Desktop A/B and mobile A screenshots were visually inspected. Captures remain local in `/tmp/opencode/launchloom-admin-mockups/`.
- The prototype is open in the browser companion. Direction selection and any subsequent product design still await the user's feedback.

## User preference and palette iteration

- User prefers A (Operations studio). B is no longer the proposed layout.
- User requests brand consistency: either adapt A to the existing public-site colors or consider recoloring the public site to match A's iris palette. This is not authorization to change the live public site.
- Verified existing tokens in `src/styles/global.css`: forest ink `#10251f`, muted `#587069`, ivory canvas `#f4f2ea`, paper `#fffefa`, sage `#bad8c8`, lime `#d9f06b`, border `#d9ddd1`. BaseLayout theme-color is also forest `#10251f`.
- New local screen `admin-brand-palettes.html` reuses the accepted A prototype and adds two palette choices plus an illustrative homepage color study. The homepage study preserves source headline/body/process copy but simplifies its layout and uses explicitly fictional board data. It is not a production build or an exact screenshot of the current homepage.
- User subsequently selected the existing LaunchLoom colors. Final visual direction is A's operations layout with forest/ivory/sage/lime. Iris and B remain historical exploration only; do not rebrand the public site.
