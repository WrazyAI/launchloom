# Browser capture record

Source: https://fit-this.com/
Captured: 2026-09-26 UTC
Method: Playwright Chromium direct navigation. Each viewport loaded a separate page context. The browser scrolled through the full document in increments of about 80 percent of viewport height to trigger reveals and lazy images, returned to the top, waited for settling, then took a full-page PNG screenshot. The capture pass used a brief per-step pause and final settling wait. No page source, scripts, fonts, or standalone images were saved to the dossier.

| File | Viewport | Captured PNG | SHA-256 |
|---|---:|---:|---|
| `screenshots/desktop.png` | 1440 x 1000 | 1440 x 5538 | `b2bd2f7742a4f10624ab56b3f2b1efa04b3f98e179e0b5fcec541a360ea0748e` |
| `screenshots/mobile.png` | 390 x 844 | 390 x 8814 | `b6504736c85af7cf4c2068d674615cca226d57b9f8bbd9d404dbc46008a1de47` |

Both browser responses were HTTP 200. PNG widths match the viewport widths and image heights exceed the viewport heights. Source marks and media visible inside screenshots remain source material only.
