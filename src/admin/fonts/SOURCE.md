# Admin font provenance

These files are the Latin variable subsets served to the admin workspace only.
They are not used by the public site or generated client sites.

| File | Project | Source |
| --- | --- | --- |
| `manrope-latin.woff2` | Manrope | Google Fonts `manrope` v20 latin subset, https://fonts.gstatic.com/s/manrope/v20/xn7gYHE41ni1AdIRggexSg.woff2 |
| `source-sans-3-latin.woff2` | Source Sans 3 | Google Fonts `sourcesans3` v20 latin subset, https://fonts.gstatic.com/s/sourcesans3/v20/nwpStKy2OAdR1K-IwhWudF-R3w8aZQ.woff2 |

Both families are licensed under the SIL Open Font License 1.1. The corresponding
license texts are `LICENSE-Manrope.txt` and `LICENSE-SourceSans3.txt` and are
copied into the built admin assets alongside the font files.

Downloaded 2026-10-19. The build copies only the `.woff2` files and license
texts; it never fetches fonts at build or runtime.
