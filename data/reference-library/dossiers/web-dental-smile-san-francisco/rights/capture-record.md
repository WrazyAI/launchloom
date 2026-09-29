# Browser capture record

Source: https://smilesanfrancisco.com/
Captured: 2026-09-26 UTC
Method: Playwright Chromium direct navigation. Each viewport loaded a separate page context. The browser scrolled through the full document in increments of about 80 percent of viewport height to trigger reveals and lazy images, returned to the top, waited for settling, then took a full-page PNG screenshot. The capture pass used a brief per-step pause and final settling wait. No page source, scripts, fonts, or standalone images were saved to the dossier.

| File | Viewport | Captured PNG | SHA-256 |
|---|---:|---:|---|
| `screenshots/desktop.png` | 1440 x 1000 | 1440 x 7902 | `133dd8180ae13882658842df7b7b082b7e1914fcc614653020cd91ddc394cffa` |
| `screenshots/mobile.png` | 390 x 844 | 390 x 11116 | `43cd363a35b97f920ba2c283f7bf4c10892f39d27e6e446562b2981356a0ccc3` |

Both browser responses were HTTP 200. PNG widths match the viewport widths and image heights exceed the viewport heights. Source marks and media visible inside screenshots remain source material only.
