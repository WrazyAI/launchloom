# Browser capture record

Source: `https://www.olynroofing.com/`
Captured: 2026-09-26 UTC
Method: Playwright Chromium, direct home-page navigation with a separate context at each viewport. After DOM content loaded, the browser waited 1.5 seconds, scrolled from top through the full document in increments of about 80 percent of viewport height with a 350 ms pause to trigger reveal behavior and lazy images, returned to the top, waited 1.5 seconds for settling, then took a full-page PNG screenshot. No page source, scripts, fonts, or standalone source images were saved. The small source cookie notice visible in the capture was left as rendered.

| File | Browser viewport | Full-page PNG | SHA-256 |
|---|---:|---:|---|
| `screenshots/desktop.png` | 1440 x 1000 | 1440 x 9448 | `e930fafb78bc3cb40e764c93a9b1fcab98d23d00ce55020b2b2d8335c67ef3e3` |
| `screenshots/mobile.png` | 390 x 844 | 390 x 11614 | `48bf7ce2404053dcc6ddf37cc4fc6bb0c01a9df7365ccdc08963f0292d29592f` |

Both responses were HTTP 200. Browser document widths matched the two viewports, and each PNG height exceeds its viewport height. The captures were inspected as whole-page desktop and mobile images. Original branding, photographs and other media visible inside the screenshots are retained only under the requester attestation.
