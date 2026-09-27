# Full-page capture record

- Registry source URL: https://github.com/ColorlibHQ/bootstrap-templates/tree/f8b7fffcbee91bd8c24d4d57337c5cdb3435e1bf/bedrock
- Actual capture URL or local route: http://127.0.0.1:8765/bedrock/index.html
- Capture date: 2026-09-26 UTC.
- Browser: headless Chromium through Playwright; device scale factor 1.
- Desktop viewport: 1440 x 1000 CSS px; retained PNG screenshots/desktop.png is 1440 x 5555 px.
- Mobile viewport: 390 x 844 CSS px; retained PNG screenshots/mobile.png is 390 x 8750 px.
- Method: render the first-party page or pinned local template, scroll down in roughly 80 percent viewport increments to trigger lazy content, wait for the page, return to the top, then capture the full vertical document. Chromium beyond-viewport clipping was used only where source overflow expanded the image beyond the stated viewport width. The source's closed off-canvas drawer expands document scrollWidth on mobile; capture retains the visible 390 px viewport without changing source markup.

Only the two PNG captures and rights/provenance text were retained in this dossier. No source code, fonts, standalone media or original brand assets were copied into it.
