# Browser capture record

Source: https://www.wmfarmerandsons.com/
Captured: 2026-09-26 UTC
Method: Playwright Chromium direct navigation. Each viewport loaded a separate page context. The browser scrolled through the full document in increments of about 80 percent of viewport height to trigger reveals and lazy images, returned to the top, waited for settling, then took a full-page PNG screenshot. The capture pass used a brief per-step pause and final settling wait. No page source, scripts, fonts, or standalone images were saved to the dossier.

| File | Viewport | Captured PNG | SHA-256 |
|---|---:|---:|---|
| `screenshots/desktop.png` | 1440 x 1000 | 1440 x 4156 | `2e6c06161d38b0ff9287f689d664209634564529c7a3e58f26a89e02dae567e8` |
| `screenshots/mobile.png` | 390 x 844 | 390 x 4173 | `9d5585d64579cb622c0497f0847fe35e057c06e590b8cefb1c4eea6ab21b6216` |

Both browser responses were HTTP 200. PNG widths match the viewport widths and image heights exceed the viewport heights. Source marks and media visible inside screenshots remain source material only.
