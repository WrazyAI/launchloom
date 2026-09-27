# Browser capture record

Source: https://adeautorepairs.com/
Captured: 2026-09-26 UTC
Method: Playwright Chromium direct navigation. Each viewport loaded a separate page context. The browser scrolled through the full document in increments of about 80 percent of viewport height to trigger reveals and lazy images, returned to the top, waited for settling, then took a full-page PNG screenshot. The capture pass used a brief per-step pause and final settling wait. No page source, scripts, fonts, or standalone images were saved to the dossier.

| File | Viewport | Captured PNG | SHA-256 |
|---|---:|---:|---|
| `screenshots/desktop.png` | 1440 x 1000 | 1440 x 8124 | `826edaf6f85151e9d21eed9f577dba6fad98aa88f7821b045e1b82ab0cbc4e12` |
| `screenshots/mobile.png` | 390 x 844 | 390 x 12047 | `6148ffcf48a22867cca1071aeb1c4293f15f8d93c2704d56f0ac393bebe500d1` |

Both browser responses were HTTP 200. PNG widths match the viewport widths and image heights exceed the viewport heights. Source marks and media visible inside screenshots remain source material only.
