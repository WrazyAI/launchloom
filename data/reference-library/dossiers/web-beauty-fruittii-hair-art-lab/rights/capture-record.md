# Full-page capture record

- Source: https://fruittiilondon.com/
- Browser: Playwright Chromium, headless, device scale factor 1.
- Method: navigate to the first-party homepage; wait for document, fonts, and media; traverse the document in viewport-height increments to trigger lazy media; return to the top; save the full-page PNG. No site source or styles were altered. No source image, logo, font, or script was downloaded separately.
- The capture utility clipped the browser's raw full-page image to the requested viewport width because `document.body.scrollWidth` exceeded the viewport by 15 CSS pixels at both widths. The source defect is disclosed; it must not be reproduced in a generated site.
- Screenshot output dimensions are the actual viewport width and exceed viewport height, satisfying the full-page capture contract.

| File | Captured at (UTC) | Viewport | PNG dimensions | HTTP | SHA-256 |
| --- | --- | --- | --- | --- | --- |
| `screenshots/desktop.png` | 2026-09-27 03:24:17 | 1440 × 900 | 1440 × 4844 | 200 | `3a8775cc51afc84c8fb7e8e72e3030b38d92130be4634937b067bbe2b195e909` |
| `screenshots/mobile.png` | 2026-09-27 03:24:28 | 390 × 844 | 390 × 5256 | 200 | `9a6fbde0337ab9add78b48df88ccb38edc716b9c8968915b13ee9d97fb2ebcf5` |

Automated diagnostics recorded no broken or unresolved image requests, iframe failures, or page errors. The capture has 15 CSS pixels of source body overflow at both viewports and the original screenshots include any content that is visible within each declared viewport; no repair was applied to the source.
