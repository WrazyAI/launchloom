# Browser capture record

Source: https://thesixbellshotel.com/
Captured: 2026-09-26 UTC
Method: Playwright Chromium direct navigation. Each viewport loaded a separate page context. The browser scrolled through the full document in increments of about 80 percent of viewport height to trigger reveals and lazy images, returned to the top, waited for settling, then took a full-page PNG screenshot. The capture pass used a brief per-step pause and final settling wait. No page source, scripts, fonts, or standalone images were saved to the dossier. Browser interaction: closed the newsletter prompt and acknowledged the cookie notice before scrolling and capture.

| File | Viewport | Captured PNG | SHA-256 |
|---|---:|---:|---|
| `screenshots/desktop.png` | 1440 x 1000 | 1440 x 6544 | `43fa506eba451bcc1dd59d37d76b8788fed8e6537a003c2b91e7f1acf59aa913` |
| `screenshots/mobile.png` | 390 x 844 | 390 x 6407 | `77fac29c1b8e133ee3844d2686f95978b7b611a52b7fb559898b7adf27511def` |

Both browser responses were HTTP 200. PNG widths match the viewport widths and image heights exceed the viewport heights. Source marks and media visible inside screenshots remain source material only.
