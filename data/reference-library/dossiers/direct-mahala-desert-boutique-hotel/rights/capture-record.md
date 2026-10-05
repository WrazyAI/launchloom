# Full-page capture record

This record transcribes existing capture metadata from `manifest.json` and the retained screenshot files. No new capture was made. It does not add observations beyond the recorded fields.

- Source recorded in the manifest: Mahala Palm Springs official hotel website (https://mahalahotel.com/).
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
    "screenshotHeight": 12524
  },
  "mobileViewport": {
    "width": 390,
    "height": 844,
    "deviceScaleFactor": 1,
    "fullPage": true,
    "screenshotHeight": 20772
  },
  "diagnostics": "The document width matched both viewports with no horizontal overflow. The looping hero video had a ready 1920 by 1080 frame. Eighteen of 39 image elements loaded; the remaining elements were CSS-hidden, zero-rectangle carousel/gallery content, with no image requests reporting failure. The screenshots preserve the current visible gallery state only. Original photo/video/logo files are not separately included in this dossier."
}
```

- desktop: `screenshots/desktop.png`; `full-page`; viewport 1536 x 864 CSS px; SHA-256 `508ea903274cdd79717f3338e4cb0659a3b8214913da8e4bb7cc7ce058a8433c`.
- mobile: `screenshots/mobile.png`; `full-page`; viewport 390 x 844 CSS px; SHA-256 `1c3aec7b242b7f654373e49c1ca96a9be95517b66df962c249e0603b23836ce4`.
