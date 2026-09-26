# Browser capture record

Captured from Dapper Dental's official direct website `https://www.dapperdental.com/` on 2026-09-25 using the isolated agent-browser Chromium session. The browser scrolled through the page to trigger normal lazy-loaded sections before a full-page capture, then returned to the top. No gallery screenshot or thumbnail was stored.

| File | Browser viewport | Full-page image size | SHA-256 |
|---|---:|---:|---|
| `screenshots/desktop.png` | 1440 x 900 | 1440 x 8744 | `85d1b2d17c3072debe23075f3f0e83fea2d6681973365153eec59484177d71b2` |
| `screenshots/mobile.png` | 390 x 844 | 390 x 7415 | `783d41829667063efff63064eff70b5bc8cbeeef7cd44c21708f399d504a2a61` |

Browser observations: document width matched the viewport at desktop and mobile, with no page-level horizontal overflow. Several image elements exposed empty `src` values and did not load; an embedded story iframe showed the host's anti-bot/security restriction in the browser DOM. These live-source issues are preserved as captured, not patched. Screenshots contain the direct page's brand, people, copy, and other original media under the requester attestation above. No source assets were separately downloaded.
