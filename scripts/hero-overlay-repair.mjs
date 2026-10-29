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
body[data-ll-route="/"] [data-hero-copy] {
  position: relative;
  z-index: 2;
  width: min(34rem, calc(100% - 2 * var(--ll-creative-gutter, 24px)));
  max-width: 34rem;
  margin: 0 auto clamp(24px, 4vw, 48px);
  padding: clamp(20px, 2.6vw, 32px);
  background: #0b1511;
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
    padding: 14px 16px;
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
