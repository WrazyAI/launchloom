# Browser capture record

Source: https://fallsbrookmotors.co.uk/
Captured: 2026-09-26 UTC
Method: Playwright Chromium direct navigation. Each viewport loaded a separate page context. The browser scrolled through the full document in increments of about 80 percent of viewport height to trigger reveals and lazy images, returned to the top, waited for settling, then took a full-page PNG screenshot. The capture pass used a brief per-step pause and final settling wait. No page source, scripts, fonts, or standalone images were saved to the dossier.

| File | Viewport | Captured PNG | SHA-256 |
|---|---:|---:|---|
| `screenshots/desktop.png` | 1440 x 1000 | 1440 x 5692 | `17d30a2d59a83261aa600c151005920460e57b7504519c997849eac75d02f487` |
| `screenshots/mobile.png` | 390 x 844 | 390 x 8703 | `bf25a76d7e1fbda3ee0b2cb94b249a7e88ae82d4f9e85c184372638f5cde336c` |

Both browser responses were HTTP 200. PNG widths match the viewport widths and image heights exceed the viewport heights. Source marks and media visible inside screenshots remain source material only.
