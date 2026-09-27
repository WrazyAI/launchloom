# Browser capture record

Source: https://www.oneldn.com/
Captured: 2026-09-26 UTC
Method: Playwright Chromium direct navigation. Each viewport loaded a separate page context. The browser scrolled through the full document in increments of about 80 percent of viewport height to trigger reveals and lazy images, returned to the top, waited for settling, then took a full-page PNG screenshot. The capture pass used a brief per-step pause and final settling wait. No page source, scripts, fonts, or standalone images were saved to the dossier.

| File | Viewport | Captured PNG | SHA-256 |
|---|---:|---:|---|
| `screenshots/desktop.png` | 1440 x 1000 | 1440 x 4009 | `9954c06ce5b2fd3f8f15a6641cdc128791e4d03d1323ec5e69991421fb214319` |
| `screenshots/mobile.png` | 390 x 844 | 390 x 4421 | `c8ce75e90d699051bff9362a505766dc2f4ac1e7cfc7509f106e662c01b28125` |

Both browser responses were HTTP 200. PNG widths match the viewport widths and image heights exceed the viewport heights. Source marks and media visible inside screenshots remain source material only.
