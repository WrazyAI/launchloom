# Browser capture record

Source: https://www.hphomecare.co.uk/
Captured: 2026-09-26 UTC
Method: Playwright Chromium direct navigation. Each viewport loaded a separate page context. The browser scrolled through the full document in increments of about 80 percent of viewport height to trigger reveals and lazy images, returned to the top, waited for settling, then took a full-page PNG screenshot. The capture pass used a brief per-step pause and final settling wait. No page source, scripts, fonts, or standalone images were saved to the dossier.

| File | Viewport | Captured PNG | SHA-256 |
|---|---:|---:|---|
| `screenshots/desktop.png` | 1440 x 1000 | 1440 x 13516 | `72f9abdab0bae8c31987163b0ed17cfea1a7bb8ff85834ca76279019683b3100` |
| `screenshots/mobile.png` | 390 x 844 | 390 x 22274 | `d7c0909ac704333d0176f4d13c2b98e2d6808cc8984d290aa5456f054df5627a` |

Both browser responses were HTTP 200. PNG widths match the viewport widths and image heights exceed the viewport heights. Source marks and media visible inside screenshots remain source material only.
