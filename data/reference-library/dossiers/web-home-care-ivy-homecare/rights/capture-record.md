# Browser capture record

Source: https://ivyhomecareservices.co.uk/
Captured: 2026-09-26 UTC
Method: Playwright Chromium direct navigation. Each viewport loaded a separate page context. The browser scrolled through the full document in increments of about 80 percent of viewport height to trigger reveals and lazy images, returned to the top, waited for settling, then took a full-page PNG screenshot. The capture pass used a brief per-step pause and final settling wait. No page source, scripts, fonts, or standalone images were saved to the dossier.

| File | Viewport | Captured PNG | SHA-256 |
|---|---:|---:|---|
| `screenshots/desktop.png` | 1440 x 1000 | 1440 x 6287 | `7bd67c9fb6ebc8083304e6d14f5df3e086abcca304c6fd60b1defbbfaacb4043` |
| `screenshots/mobile.png` | 390 x 844 | 390 x 11420 | `5fb537b8c18ee3d8941a31e2111846778076240c0aab2b93a3b4afb7a0419924` |

Both browser responses were HTTP 200. PNG widths match the viewport widths and image heights exceed the viewport heights. Source marks and media visible inside screenshots remain source material only.
