# Browser capture record

Source: https://www.vividdental.ca/
Captured: 2026-09-27 UTC
Method: Playwright Chromium direct navigation at desktop and mobile viewports. Direct browser responses were HTTP 200. The page was scrolled through its full document to activate lazy loading and reveal animations. A temporary capture-only CSS rule set `content-visibility: visible` for offscreen sections so Chromium's native full-page screenshot would not omit content after scrolling. Images were switched to eager loading, decoded where available, and checked for completeness before capture. The browser returned to the top before the screenshot. No HTML, scripts, fonts, logos, or individual images were downloaded into this dossier.

| File | Viewport | Captured PNG | SHA-256 |
|---|---:|---:|---|
| `screenshots/desktop.png` | 1440 x 900 | 1440 x 11537 | `4d0672b444a1d6ce47dbac6c22dc421b0df1905ef0dff5d0b7a381b388c20b1a` |
| `screenshots/mobile.png` | 390 x 844 | 390 x 17998 | `b281f572de6af0949632480b0cd5db4fa2f65af5d309b4240fab1b7797e9e4de` |

Both browser responses were HTTP 200. There were no page errors, unresolved images, or viewport-width overflow after lazy-load settling. Screenshot widths match the viewport widths and screenshot heights exceed the viewport heights. Captures are internal visual evidence only.
