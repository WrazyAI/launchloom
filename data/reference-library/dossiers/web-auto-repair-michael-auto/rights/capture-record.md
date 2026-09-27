# Browser capture record

Source: https://www.michaelauto.co.uk/
Captured: 2026-09-26 UTC
Method: Playwright Chromium direct navigation. Each viewport loaded a separate page context. The browser scrolled through the full document in increments of about 80 percent of viewport height to trigger reveals and lazy images, returned to the top, waited for settling, then took a full-page PNG screenshot. The capture pass used a brief per-step pause and final settling wait. No page source, scripts, fonts, or standalone images were saved to the dossier.

| File | Viewport | Captured PNG | SHA-256 |
|---|---:|---:|---|
| `screenshots/desktop.png` | 1440 x 1000 | 1440 x 5342 | `0f7d3898a2b6a651497a3bfdda798109697c2121e974ff249c69bb1a705ba812` |
| `screenshots/mobile.png` | 390 x 844 | 390 x 7468 | `e814135b68eefd9ef2d7e142aef2528ccc646cdb90a055e17553c80b3c5bc4da` |

Both browser responses were HTTP 200. PNG widths match the viewport widths and image heights exceed the viewport heights. Source marks and media visible inside screenshots remain source material only.
