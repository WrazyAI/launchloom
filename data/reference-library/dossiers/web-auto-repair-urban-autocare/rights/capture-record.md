# Browser capture record

Source: https://www.urbanautocare.com/
Captured: 2026-09-26 UTC
Method: Playwright Chromium direct navigation. Each viewport loaded a separate page context. The browser scrolled through the full document in increments of about 80 percent of viewport height to trigger reveals and lazy images, returned to the top, waited for settling, then took a full-page PNG screenshot. The capture pass used a brief per-step pause and final settling wait. No page source, scripts, fonts, or standalone images were saved to the dossier.

| File | Viewport | Captured PNG | SHA-256 |
|---|---:|---:|---|
| `screenshots/desktop.png` | 1440 x 1000 | 1440 x 11625 | `a72f8e55252baacbf3a9d426d064883ce49999f7351916de886808cc8109e9d9` |
| `screenshots/mobile.png` | 390 x 844 | 390 x 23070 | `2d9d5ec87608aa5415cc992ac019fe93449e7cb17e67254a3878aacc068cfd17` |

Both browser responses were HTTP 200. PNG widths match the viewport widths and image heights exceed the viewport heights. Source marks and media visible inside screenshots remain source material only.
