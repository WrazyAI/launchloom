# Browser capture record

Source: https://www.veg.com/
Captured: 2026-09-29 UTC
Method: Playwright Chromium direct navigation, device scale factor 1. Each viewport used an isolated browser page. The OneTrust cookie notice was accepted in that disposable page context so it would not obscure the site; no business form was submitted. The page was progressively scrolled to activate lazy content, returned to the top, and captured as a full-page PNG. No source code, scripts, fonts, or standalone assets were saved.

| File | Viewport | Captured PNG | SHA-256 |
|---|---:|---:|---|
| `screenshots/desktop.png` | 1440 x 1000 | 1440 x 6643 | `9387878e93942d39cf3022c6593124ed26c8932af943ebaaa835066a9ba3eb1c` |
| `screenshots/mobile.png` | 390 x 844 | 390 x 8381 | `bb1c66501a341d79075a35948e37d4dad126185e5bd2b9f804f27f0112481abd` |

Both responses were HTTP 200, final URLs matched the official source, and page width matched each requested viewport. Main care images and page chapters are visible. Browser diagnostics logged source-side JavaScript errors (`onClick` not callable and a duplicate custom-element registration); a few empty image references resolved to the site root, while the primary photography and content rendered. These source implementation issues are recorded for transparency and are not part of the transferable design mechanics.
