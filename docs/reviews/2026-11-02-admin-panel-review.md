# Admin panel deployment review

Independent reviewer inspected `origin/main...264189b3` after the owner approved the designs and authorized deployment. The earlier review attempt never ran due to account usage limits; session `ses_e62bf4a98ffeSbcI02Ab85VRkL` performed the actual read-only review and focused reproductions.

## Findings and disposition

- No critical findings; nothing declined as outside scope.
- Important: deep JSON fell through to recursive pretty-printing. The reviewer reproduced 31,776,695 bytes of rendered HTML from a 7,981-byte payload and a render-time RangeError at greater depth. The author independently reproduced both failures in `tests/admin-detail-value.test.ts` before fixing the renderer.
- Correction: iterative global preflight limits structural depth, width and total nodes before rendering. Over-budget input is displayed exactly once as escaped original evidence. Safe array/object remainders use compact JSON only after passing the preflight, never unbounded pretty printing. SSR and real-browser regressions check size, no throw, original evidence retention, escaping and panel dismissal. The focused six-file admin suite passed 136 tests after correction.
- Minor, deferred: the focused-attempt capture caption says “Captured for this attempt” even when the image placeholder says no capture is available. This wording polish is not part of the blocking fix; capture availability remains explicit in the placeholder.

The independent verdict was “not ready” until the Important finding and required CI were addressed. No second review or final clean verdict is claimed; the covering RED/GREEN regressions and release checks verify the one correction pass.

## Separately approved release-gate repair

CI on the pre-correction candidate exposed three failures inherited from main's dossier fallback change. The owner first approved updating obsolete expectations, then explicitly approved a narrow production guard after inspection showed a wrapped quota error was being masked.

The repair preserves quota/auth access failures, including diagnostic wrappers, while retaining the existing marked dossier fallback for malformed model output and exhausted transient retries. Tests assert original route/DNA preservation, explicit fallback provenance, retained provider diagnostics and exact bounded retry counts. This is separate from the reviewed UI diff; no independent review of this small follow-on error-classification fix is claimed.
