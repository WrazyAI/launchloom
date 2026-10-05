# Full-page capture record

This record transcribes existing capture metadata from `manifest.json` and the retained screenshot files. No new capture was made. It does not add observations beyond the recorded fields.

- Source recorded in the manifest: Amrit Palace official restaurant website (https://amritpalace.com/).
- Recorded capturedAt: 2026-09-25.
- Capture detail is transcribed from `manifest.provenance.capture`:

```text
{
  "method": "Rendered the official website directly in an isolated agent-browser Chromium session; full-page screenshots were captured from the live source page, not from a gallery or third-party screenshot.",
  "desktopViewport": {
    "width": 1536,
    "height": 864,
    "deviceScaleFactor": 1,
    "fullPage": true,
    "screenshotHeight": 10310
  },
  "mobileViewport": {
    "width": 390,
    "height": 844,
    "deviceScaleFactor": 1,
    "fullPage": true,
    "screenshotHeight": 9461
  },
  "diagnostics": "All 69 img elements reported loaded at both final capture viewports; no broken images, no horizontal document overflow. The screenshots contain the original site's branding, copy, and photographs under the requester's attested internal capture/model-reference scope only. None of those original image files is included separately in this dossier."
}
```

- desktop: `screenshots/desktop.png`; `full-page`; viewport 1536 x 864 CSS px; SHA-256 `13a319bbdae9b0305b9d9dfdaa2bd4a7a0e1299ed40288d6ca2149a86b88b3f4`.
- mobile: `screenshots/mobile.png`; `full-page`; viewport 390 x 844 CSS px; SHA-256 `b42297d59b2e4daf798bcbb718acc8ba8479ed7b598a8c4ca3b1e462d95666cd`.
