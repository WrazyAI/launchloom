# Browser capture record

Source: https://www.leonsnyc.com/
Captured: 2026-09-26 UTC
Method: Playwright Chromium direct navigation. Each viewport loaded a separate page context. The browser scrolled through the full document in increments of about 80 percent of viewport height to trigger reveals and lazy images, returned to the top, waited for settling, then took a full-page PNG screenshot. The capture pass used a brief per-step pause and final settling wait. No page source, scripts, fonts, or standalone images were saved to the dossier.

| File | Viewport | Captured PNG | SHA-256 |
|---|---:|---:|---|
| `screenshots/desktop.png` | 1440 x 1000 | 1440 x 3182 | `b94a4186b0131f6d7603b5d42b274be093bc3fc64bc8adab2755d0d3cff1dd0c` |
| `screenshots/mobile.png` | 390 x 844 | 390 x 3624 | `5243a6776fb56ee403fb8fbeb4cf67a6ad88c1aae52c441a486f231b78f27926` |

Both browser responses were HTTP 200. PNG widths match the viewport widths and image heights exceed the viewport heights. Source marks and media visible inside screenshots remain source material only.
