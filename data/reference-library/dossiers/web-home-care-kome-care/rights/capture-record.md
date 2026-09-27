# Browser capture record

Source: https://www.komecare.co.uk/
Captured: 2026-09-26 UTC
Method: Playwright Chromium direct navigation. Each viewport loaded a separate page context. The browser scrolled through the full document in increments of about 80 percent of viewport height to trigger reveals and lazy images, returned to the top, waited for settling, then took a full-page PNG screenshot. The capture pass used a brief per-step pause and final settling wait. No page source, scripts, fonts, or standalone images were saved to the dossier.

| File | Viewport | Captured PNG | SHA-256 |
|---|---:|---:|---|
| `screenshots/desktop.png` | 1440 x 1000 | 1440 x 10399 | `a874d0287f9bb3e61cd159f2750eccf886d6e3577c5647942bbac953947d6915` |
| `screenshots/mobile.png` | 390 x 844 | 390 x 20277 | `ca0bd0c1f60012e0ece8777dc35e8ba804236c78911a90ab003067fc97ebec67` |

Both browser responses were HTTP 200. PNG widths match the viewport widths and image heights exceed the viewport heights. Source marks and media visible inside screenshots remain source material only.
