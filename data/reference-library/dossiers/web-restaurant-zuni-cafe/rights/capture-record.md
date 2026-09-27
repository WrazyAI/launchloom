# Browser capture record

Source: https://zunicafe.com/
Captured: 2026-09-26 UTC
Method: Playwright Chromium direct navigation. Each viewport loaded a separate page context. The browser scrolled through the full document in increments of about 80 percent of viewport height to trigger reveals and lazy images, returned to the top, waited for settling, then took a full-page PNG screenshot. The capture pass used a brief per-step pause and final settling wait. No page source, scripts, fonts, or standalone images were saved to the dossier.

| File | Viewport | Captured PNG | SHA-256 |
|---|---:|---:|---|
| `screenshots/desktop.png` | 1440 x 1000 | 1440 x 9310 | `6b4c1c1431d3178df036b64e7606b81a52ced4a35dfc89076ae897519591633b` |
| `screenshots/mobile.png` | 390 x 844 | 390 x 8774 | `830ac153a0479611581990be3d81b2fdc757bd3f1ff1703670ddda8d66437ff1` |

Both browser responses were HTTP 200. PNG widths match the viewport widths and image heights exceed the viewport heights. Source marks and media visible inside screenshots remain source material only.
