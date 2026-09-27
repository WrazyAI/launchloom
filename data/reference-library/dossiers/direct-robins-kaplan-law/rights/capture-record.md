# Capture record

The official homepage was recaptured with Playwright Chromium on 2026-09-27. In both fresh browser contexts, the visible cookie banner was dismissed using its **Decline** control, which avoids opting into non-essential cookies. The banner was absent from the retained screenshots.

| File | Viewport | Retained full-page image | HTTP | Captured at (UTC) | SHA-256 |
| --- | --- | --- | --- | --- | --- |
| `screenshots/desktop.png` | 1440 × 900 CSS px | 1440 × 2892 px | 200 | 03:23:31 UTC, 2026-09-27 | `5328b810da6f821178c895b59bdce560f89f349bc49ab4e9973aaa6fbde8fd32` |
| `screenshots/mobile.png` | 390 × 844 CSS px | 390 × 3850 px | 200 | 03:23:51 UTC, 2026-09-27 | `f8ab2b8010ade819cf94c4f19b79118b6915cbd3faecbea893f6ecd7de522bf6` |

Capture method: navigate to the first-party homepage, decline optional cookies, wait for fonts and page content, scroll through the document to trigger lazy media, return to the top, and take a full-page PNG at device scale 1. The source body still overflows horizontally: the full-page captures were 1673 px wide at desktop and 885 px wide at mobile before clipping to the declared viewport widths. `document.documentElement.scrollWidth` equaled the viewport width while `document.body.scrollWidth` exposed the overflow. This source defect is not a design requirement. The mobile capture now shows the image-first menu state without the cookie banner. No source image, logo, font, or script was downloaded separately. Screenshots are reference evidence, not assets for generated sites.
