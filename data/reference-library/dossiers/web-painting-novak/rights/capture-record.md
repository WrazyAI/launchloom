# Full-page capture record

Captured 2026-09-26 directly from https://www.novakpaintinggroup.com/ with a local Playwright Chromium browser. Both first-party navigations returned HTTP 200. The browser waited for the document and fonts, scrolled through the entire page in viewport-sized increments to trigger lazy images and scroll reveals, paused at the bottom, returned to the top, and captured the complete vertical page with animations disabled and reduced motion requested. A standardized desktop recapture was made at 1440 x 900; the retained mobile image remains the earlier same-day 390 x 844 capture. The source mobile page contains 7 pixels of off-canvas horizontal overflow; its screenshot is clipped to the exact 390-pixel viewport width.

- Desktop viewport: 1440 x 900 CSS pixels at device scale 1. Full-page PNG: 1440 x 8204 pixels at screenshots/desktop.png. Recapture time: 23:17:14 UTC.
- Mobile viewport: 390 x 844 CSS pixels at device scale 1. Full-page PNG: 390 x 11856 pixels at screenshots/mobile.png.
- The retained PNG dimensions were read from their saved image headers. Both files cover the opening through the visible footer. A fresh source recheck measured the mobile document at 397 px and reproduced the 7 px overflow. The live page emitted React hydration errors #425 and #423; these are source-page diagnostics, not capture-script errors. Hidden carousel slides and third-party widgets may defer their own off-screen images.
- No source HTML, stylesheet, script, standalone photo, logo, or font was retained. These screenshots are reference evidence, not client assets.

## Screenshot checksums (SHA-256, verified 2026-09-29 UTC)

| File | SHA-256 |
|---|---|
| `screenshots/desktop.png` | `0f8ddf6e6d37c4029ebb32c8b4254ccc95e1768f0d5c9f69061a9406f2657b3a` |
| `screenshots/mobile.png` | `58d320319fdc39cc7bf0b80a0f185506845c22b06e658d08991bdb1c1ab17807` |
