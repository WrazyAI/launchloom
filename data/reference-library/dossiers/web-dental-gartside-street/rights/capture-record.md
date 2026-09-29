# Browser capture record

Source: https://gartsidestreetdental.com/
Captured: 2026-09-26 UTC
Method: Playwright Chromium direct navigation. Each viewport loaded a separate page context. The browser scrolled through the full document in increments of about 80 percent of viewport height to trigger reveals and lazy images, returned to the top, waited for settling, then took a full-page PNG screenshot. The capture pass used a brief per-step pause and final settling wait. No page source, scripts, fonts, or standalone images were saved to the dossier.

| File | Viewport | Captured PNG | SHA-256 |
|---|---:|---:|---|
| `screenshots/desktop.png` | 1440 x 1000 | 1440 x 12098 | `185076b70af52a48f543287adf9bf06792b000baf71940fd004ba7c33a98b511` |
| `screenshots/mobile.png` | 390 x 844 | 390 x 21881 | `6450eeb7aded768eec7d74040f1db251b1ac969df87239a90389c1265f1c89dd` |

Both browser responses were HTTP 200. PNG widths match the viewport widths and image heights exceed the viewport heights. Source marks and media visible inside screenshots remain source material only.
