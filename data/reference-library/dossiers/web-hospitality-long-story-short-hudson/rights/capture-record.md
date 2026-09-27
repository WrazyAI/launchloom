# Browser capture record

Source: https://www.longstoryshortny.com/
Captured: 2026-09-26 UTC
Method: Playwright Chromium direct navigation. Each viewport loaded a separate page context. The browser scrolled through the full document in increments of about 80 percent of viewport height to trigger reveals and lazy images, returned to the top, waited for settling, then took a full-page PNG screenshot. The capture pass used a brief per-step pause and final settling wait. No page source, scripts, fonts, or standalone images were saved to the dossier.

| File | Viewport | Captured PNG | SHA-256 |
|---|---:|---:|---|
| `screenshots/desktop.png` | 1440 x 1000 | 1440 x 8551 | `a9005d8503745735baf843e7379594bcba02adae0fb847939063fffad122eea5` |
| `screenshots/mobile.png` | 390 x 844 | 390 x 6667 | `06497cd094b223a12e64bcb002ba70736995a07069add2ffea463aaab92e304f` |

Both browser responses were HTTP 200. PNG widths match the viewport widths and image heights exceed the viewport heights. Source marks and media visible inside screenshots remain source material only.
