# Browser capture record

Source: https://www.abeesautomotive.com/
Captured: 2026-09-26 UTC
Method: Playwright Chromium direct navigation. Each viewport loaded a separate page context. The browser scrolled through the full document in increments of about 80 percent of viewport height to trigger reveals and lazy images, returned to the top, waited for settling, then took a full-page PNG screenshot. The capture pass used a brief per-step pause and final settling wait. No page source, scripts, fonts, or standalone images were saved to the dossier.

| File | Viewport | Captured PNG | SHA-256 |
|---|---:|---:|---|
| `screenshots/desktop.png` | 1440 x 1000 | 1440 x 5917 | `9e51065af58af4d642eeeba735264aea59a97c0f71cc488f0cff1aa32b3360ef` |
| `screenshots/mobile.png` | 390 x 844 | 390 x 8758 | `711844c67b588080fc3108914e451ec1003e984bf986351a07fa7499cdf88a7b` |

Both browser responses were HTTP 200. PNG widths match the viewport widths and image heights exceed the viewport heights. Source marks and media visible inside screenshots remain source material only.
