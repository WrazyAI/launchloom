# Browser capture record

Captured from the official direct website `https://omp.dentist/` on 2026-09-25 using the isolated agent-browser Chromium session. The browser scrolled through the page to trigger normal lazy-loaded sections before a full-page capture, then returned to the top. No Lapa page, OG image, gallery thumbnail, or gallery screenshot was stored.

| File | Browser viewport | Full-page image size | SHA-256 |
|---|---:|---:|---|
| `screenshots/desktop.png` | 1440 x 900 | 1440 x 8044 | `c002cdf2522d17246fa7d65bf50cead4b0182b7070982323acbc4b27a6a7b1b8` |
| `screenshots/mobile.png` | 390 x 844 | 390 x 8374 | `86d11fb5d2f81eb81ef4d548ff46401afb4a74d55ae52a36cea7ca353e244e4d` |

Browser observations: document width matched viewport width at 1440 and 390 px; there was no page-level horizontal overflow. One image resource returned a broken placeholder URL, `https://via.placeholder.com/500x400`, in both viewports. The broken resource belongs to the live source and is recorded, not patched. Screenshots contain the direct page's own visible brand, people, and copy under the requester attestation above. No direct source images were downloaded separately.
