# Browser capture record

Source: https://bosaproperties.com/
Captured: 2026-09-29 UTC
Method: Playwright Chromium direct navigation at device scale factor 1. Each viewport loaded independently, scrolled incrementally to trigger lazy media, returned to the top, and was saved as a full-page PNG. No source page, script, font, or standalone image was saved separately.

| File | Viewport | Captured PNG | HTTP | SHA-256 |
|---|---:|---:|---:|---|
| `screenshots/desktop.png` | 1440 x 1000 | 1440 x 5970 | 200 | `f0190138336025dc1a4f99c893d7ff6b889ff8940a5433bfde0d26e555d3130b` |
| `screenshots/mobile.png` | 390 x 844 | 390 x 7565 | 200 | `caacb9395c0c121edd460efbe1df1d49628b620b6544e8de30cc3bbff41fc2e1` |

No broken content images were visible in either screenshot. The image diagnostic found one failed Bing tracking-pixel endpoint, not a page photograph or project render. Seven desktop and eight mobile lazy image elements remained unresolved. The mobile page logged a minified React hydration warning; the full-page visual content rendered and was inspected. No cookie-consent choice was presented in the capture.
