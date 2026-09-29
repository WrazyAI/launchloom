# Browser capture record

Source: https://www.relianceautos.co.uk/
Captured: 2026-09-26 UTC
Method: Playwright Chromium direct navigation. Each viewport loaded a separate page context. The browser scrolled through the full document in increments of about 80 percent of viewport height to trigger reveals and lazy images, returned to the top, waited for settling, then took a full-page PNG screenshot. The capture pass used a brief per-step pause and final settling wait. No page source, scripts, fonts, or standalone images were saved to the dossier.

| File | Viewport | Captured PNG | SHA-256 |
|---|---:|---:|---|
| `screenshots/desktop.png` | 1440 x 1000 | 1440 x 6649 | `697e77fafdb645c7d19a09805b30bfaad6fbf626603d535261703064ed247943` |
| `screenshots/mobile.png` | 390 x 844 | 390 x 11616 | `439a91781ba2f43461330be1fd960a2cd737d739839136ed667653c00b62c6c6` |

Both browser responses were HTTP 200. PNG widths match the viewport widths and image heights exceed the viewport heights. Source marks and media visible inside screenshots remain source material only.
