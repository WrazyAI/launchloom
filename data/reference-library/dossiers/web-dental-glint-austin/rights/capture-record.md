# Browser capture record

Source: https://glintatx.com/
Captured: 2026-09-26 UTC
Method: Playwright Chromium direct navigation. Each viewport loaded a separate page context. The browser scrolled through the full document in increments of about 80 percent of viewport height to trigger reveals and lazy images, returned to the top, waited for settling, then took a full-page PNG screenshot. This site received a slower 350 ms per-step recapture because the initial pass left later reveal sections blank; the retained capture is the corrected result. No page source, scripts, fonts, or standalone images were saved to the dossier.

| File | Viewport | Captured PNG | SHA-256 |
|---|---:|---:|---|
| `screenshots/desktop.png` | 1440 x 1000 | 1440 x 8801 | `9dae5400c63fd9eb1c1b318c73f8912e3064ed0085f709fa995f34e822aa9794` |
| `screenshots/mobile.png` | 390 x 844 | 390 x 13274 | `d925f5bf0fa02a8997c4c4b7d84bc1168c5bd331bc3219c6f58088ec057b9a44` |

Both browser responses were HTTP 200. PNG widths match the viewport widths and image heights exceed the viewport heights. Source marks and media visible inside screenshots remain source material only.
