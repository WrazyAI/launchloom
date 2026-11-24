/**
 * Deterministic, route-scoped correction for an image-led homepage whose
 * promise group renders as a full-width plate instead of a floating copy
 * group over the image. The authoring and repair prompts describe this
 * pattern, but a model can keep returning the same stacked plate; this
 * correction makes the structural change once, then lets the existing
 * rendered gates decide whether it is acceptable.
 */

export const HERO_OVERLAY_CORRECTION_START =
  "/* launchloom: bounded hero overlay correction */";
export const HERO_OVERLAY_CORRECTION_END =
  "/* launchloom: end bounded hero overlay correction */";

export function heroOverlayRepairCss() {
  return `${HERO_OVERLAY_CORRECTION_START}
body[data-ll-route="/"] [data-hero] {
  position: relative;
  display: grid;
  align-items: end;
  min-height: min(720px, calc(100svh - 120px));
  padding: 0;
  overflow: hidden;
}
body[data-ll-route="/"] [data-hero-media] {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
}
body[data-ll-route="/"] [data-hero-media] img,
body[data-ll-route="/"] [data-hero-media] video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
}
/* A scrim, not a card. Painting the copy group itself was the failure this
   correction was meant to remove: the opaque plate covered 27% of the desktop
   hero and 58% of mobile, so the gate reported the same large-card finding
   after every repair round. Keep the text over the photograph's dark lower
   band instead. */
body[data-ll-route="/"] [data-hero]::after {
  content: "";
  position: absolute;
  inset: auto 0 0 0;
  z-index: 1;
  height: min(62%, 34rem);
  background: linear-gradient(
    to top,
    rgba(6, 14, 11, 0.92) 0%,
    rgba(6, 14, 11, 0.78) 45%,
    rgba(6, 14, 11, 0) 100%
  );
  pointer-events: none;
}
/* The copy group is often a data-hero-copy div inside a figcaption that owns
   the opaque plate. Clearing only the inner div left the card in place, the
   repair loop restored the pre-repair state, and every round re-applied the
   same correction. Clear the media caption that contains the copy group. */
body[data-ll-route="/"] [data-hero-media] figcaption:has([data-hero-copy]) {
  position: relative;
  z-index: 2;
  width: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  box-shadow: none;
  background: transparent;
  background-color: transparent;
  color: #f7f3e8;
}
body[data-ll-route="/"] [data-hero-copy] {
  position: relative;
  z-index: 2;
  width: min(34rem, calc(100% - 2 * var(--ll-creative-gutter, 24px)));
  max-width: 34rem;
  margin: 0 auto clamp(24px, 4vw, 48px);
  padding: 0;
  background: transparent;
  border: 0;
  box-shadow: none;
  color: #f7f3e8;
  text-align: left;
}
body[data-ll-route="/"] [data-hero-copy] :is(h1, h2, h3, p, .hero-kicker) {
  color: #f7f3e8;
}
body[data-ll-route="/"] [data-hero-copy] :is(.hero-body, .hero-kicker) {
  color: #dadcd1;
}
body[data-ll-route="/"] [data-hero-copy] :is(a, button) {
  flex: 0 1 auto;
}
body[data-ll-route="/"] [data-hero-copy] :is(.outline-action, .outline-action-light, .secondary-action) {
  color: #f7f3e8;
  border-color: rgba(247, 243, 232, 0.85);
  background: #0b1511;
}
body[data-ll-route="/"] [data-hero-copy] :is(a, button):focus-visible {
  background: #0b1511;
  color: #f7f3e8;
  border-color: #f7f3e8;
  outline: 2px solid #f7f3e8;
  outline-offset: -3px;
}
@media (min-width: 768px) and (max-width: 1439px) {
  body[data-ll-route="/"] [data-hero-copy] {
    padding: 20px 24px;
  }
  body[data-ll-route="/"] [data-hero-copy] h1 {
    font-size: clamp(2rem, 3.6vw, 2.8rem);
  }
  body[data-ll-route="/"] [data-hero-copy] .hero-body {
    font-size: 0.92rem;
    line-height: 1.5;
  }
}
@media (max-width: 767px) {
  body[data-ll-route="/"] [data-hero] {
    min-height: min(620px, calc(100svh - 180px));
  }
  body[data-ll-route="/"] [data-hero-copy] {
    width: calc(100% - 32px);
    max-width: none;
    margin: 0 auto 16px;
    padding: 0;
  }
  body[data-ll-route="/"] [data-hero-copy] h1 {
    font-size: clamp(1.5rem, 7vw, 1.9rem);
    line-height: 1.05;
  }
  body[data-ll-route="/"] [data-hero-copy] .hero-body {
    font-size: 0.82rem;
    line-height: 1.4;
  }
}
${HERO_OVERLAY_CORRECTION_END}
`;
}

export const MEDIA_FOCUS_CORRECTION_START =
  "/* launchloom: bounded media focus plate */";
export const MEDIA_FOCUS_CORRECTION_END =
  "/* launchloom: end bounded media focus plate */";

/**
 * A white focus ring disappears over bright photograph areas, and an accent
 * focus color can fall below the 3:1 indicator bar. The gate must be able to
 * measure one opaque paint pair, so the focused control gets its own dark
 * plate and an inset light ring. Form notes get a light plate for the same
 * reason: their inherited color was unreadable on a dark mobile surface.
 */
export function mediaFocusRepairCss() {
  return `${MEDIA_FOCUS_CORRECTION_START}
/* Inner pages resolve the display stack directly; the homepage h1 inherits a
   different family, so the identity gate reports a typeface drift even though
   the visible wordmark uses the display face. Anchor the homepage heading to
   the same token the authored inner pages use. */
body[data-ll-route="/"] [data-hero] h1 {
  font-family: var(--ll-creative-display, Georgia, serif) !important;
  font-weight: 400 !important;
}
body[data-ll-route="/"] [data-hero] :is(a, button, summary):focus-visible {
  position: relative;
  z-index: 4;
  background: #0b1511 !important;
  color: #f7f3e8 !important;
  border-width: 0 !important;
  outline: 2px solid #f7f3e8 !important;
  outline-offset: -3px !important;
  box-shadow: none !important;
  text-decoration-color: #f7f3e8 !important;
}
body[data-ll-route^="/services"] form small {
  display: inline-block;
  padding: 2px 6px;
  background: #f7f3e8 !important;
  color: #14201d !important;
}
${MEDIA_FOCUS_CORRECTION_END}
`;
}

/** Replace any previous managed media-focus block, preserving authored CSS. */
export function withMediaFocusCorrection(
  existing,
  block = mediaFocusRepairCss(),
) {
  let text = String(existing ?? "");
  let guard = 0;
  while (guard++ < 20) {
    const start = text.indexOf(MEDIA_FOCUS_CORRECTION_START);
    if (start === -1) break;
    const end = text.indexOf(MEDIA_FOCUS_CORRECTION_END, start);
    text =
      end === -1
        ? text.slice(0, start)
        : text.slice(0, start) +
          text.slice(end + MEDIA_FOCUS_CORRECTION_END.length);
  }
  const base = text.replace(/\n{3,}/g, "\n\n").trimEnd();
  return base ? `${base}\n${block}` : block.trimStart();
}

/** Replace any previous managed block in place, preserving authored CSS. */
export function withHeroOverlayCorrection(
  existing,
  block = heroOverlayRepairCss(),
) {
  let text = String(existing ?? "");
  let guard = 0;
  while (guard++ < 20) {
    const start = text.indexOf(HERO_OVERLAY_CORRECTION_START);
    if (start === -1) break;
    const end = text.indexOf(HERO_OVERLAY_CORRECTION_END, start);
    text =
      end === -1
        ? text.slice(0, start)
        : text.slice(0, start) + text.slice(end + HERO_OVERLAY_CORRECTION_END.length);
  }
  const base = text.replace(/\n{3,}/g, "\n\n").trimEnd();
  return base ? `${base}\n${block}` : block.trimStart();
}
