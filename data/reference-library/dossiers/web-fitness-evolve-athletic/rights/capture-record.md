# Browser capture record

Source: https://evolveathletic.com/
Captured: 2026-09-26 UTC
Method: Playwright Chromium direct navigation. Each viewport loaded a separate page context. The browser scrolled through the full document in increments of about 80 percent of viewport height to trigger reveals and lazy images, returned to the top, waited for settling, then took a full-page PNG screenshot. The capture pass used a brief per-step pause and final settling wait. No page source, scripts, fonts, or standalone images were saved to the dossier.

| File | Viewport | Captured PNG | SHA-256 |
|---|---:|---:|---|
| `screenshots/desktop.png` | 1440 x 1000 | 1440 x 9937 | `33bce2046e04459c414716a0ff57308cd12ac40586edd8abdd6086b8ff8a67f5` |
| `screenshots/mobile.png` | 390 x 844 | 390 x 14965 | `67ba8f2cdf390904b03a235bc74deef355495f38dbe3ab6eeb4077c8d8c111c8` |

Both browser responses were HTTP 200. PNG widths match the viewport widths and image heights exceed the viewport heights. Source marks and media visible inside screenshots remain source material only.
