# Browser capture record

Source: https://dentologie.com/
Captured: 2026-09-27 UTC
Method: Playwright Chromium direct navigation at desktop and mobile viewports. The page was scrolled through its full document to activate lazy loading and reveal animations. A temporary capture-only CSS rule set `content-visibility: visible` for offscreen sections so Chromium's native full-page screenshot would not omit content after scrolling. Images were switched to eager loading, decoded where available, and checked for completeness before capture. The browser returned to the top before the screenshot. The site's privacy notice was closed with its own Close button without recording a consent choice. No HTML, scripts, fonts, logos, or individual images were downloaded into this dossier.

| File | Viewport | Captured PNG | SHA-256 |
|---|---:|---:|---|
| `screenshots/desktop.png` | 1440 x 900 | 1440 x 8313 | `0c8c5aae4ef456911aaf892703a5ab9e2452cbb4d6e8987a445b2d60d306295c` |
| `screenshots/mobile.png` | 390 x 844 | 390 x 11402 | `cc010e1599f6f1238176fba1a2c065c01ec95fa7184cdd659b1473b07d52cb95` |

Both browser responses were HTTP 200. There were no page errors, unresolved images, or viewport-width overflow after lazy-load settling. Screenshot widths match the viewport widths and screenshot heights exceed the viewport heights. Captures are internal visual evidence only.
