# Browser capture record

Source: https://www.cafecarmellini.com/
Captured: 2026-09-26 UTC
Method: Playwright Chromium direct navigation. Each viewport loaded a separate page context. The browser scrolled through the full document in increments of about 80 percent of viewport height to trigger reveals and lazy images, returned to the top, waited for settling, then took a full-page PNG screenshot. The capture pass used a brief per-step pause and final settling wait. No page source, scripts, fonts, or standalone images were saved to the dossier. Browser interaction: accepted the cookie notice before scrolling and capture.

| File | Viewport | Captured PNG | SHA-256 |
|---|---:|---:|---|
| `screenshots/desktop.png` | 1440 x 1000 | 1440 x 3230 | `d4935fc3b202d4f0bc2a4fb896a3e0ef522e966f22233918b5c376c5a8063d60` |
| `screenshots/mobile.png` | 390 x 844 | 390 x 2837 | `b02654e365ba8327271c963831f1e9434474ddabb69097e82831f3a067e4f136` |

Both browser responses were HTTP 200. PNG widths match the viewport widths and image heights exceed the viewport heights. Source marks and media visible inside screenshots remain source material only.
