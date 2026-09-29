# Browser capture record

Captured from Future's official direct website `https://future.co/` on 2026-09-25 using the isolated agent-browser Chromium session. The browser scrolled through the page to trigger normal lazy-loaded sections before a full-page capture, then returned to the top. No gallery screenshot or thumbnail was stored.

| File | Browser viewport | Full-page image size | SHA-256 |
|---|---:|---:|---|
| `screenshots/desktop.png` | 1440 x 900 | 1440 x 5996 | `23d570239daee9fd76733c37a5ba0d037740346818897b8b82b08a3cfa339894` |
| `screenshots/mobile.png` | 390 x 844 | 390 x 5702 | `74c6668bd7cc8c44995c8db64c1694fed8fa993a8ee049224756b847957d3f96` |

Browser observations: document width matched the viewport at desktop and mobile, with no page-level horizontal overflow. Some source page image nodes did not load: four Cloudinary workout-card image requests plus an empty image source at desktop; one Cloudinary workout image request plus empty image sources at mobile. The source page's own product image fallback/empty nodes are left unmodified. Screenshots contain the direct page's own visible brand, member imagery, and copy under the requester attestation above. No separate source assets were downloaded.
