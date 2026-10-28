/**
 * Route-scoped hero-card contract for image-led references that float the
 * promise group in the photograph's negative space. A large bordered card is
 * a fidelity failure only for those routes; split, utility-panel, and text-led
 * references may legitimately frame their copy.
 */

const FLOATING_TOPOLOGIES = new Set([
  "media-overlay",
  "image-led-stage",
  "modular-image-field",
]);
const NON_FLOATING_TOPOLOGIES = new Set([
  "split-media",
  "utility-panel",
  "type-led-statement",
  "editorial-stack",
]);

export const HERO_CARD_THRESHOLDS = {
  // The observed failure card covers 19.8% of the desktop hero area but
  // 57.6% of its height, so height is the discriminating desktop signal.
  desktopArea: 0.3,
  desktopHeight: 0.55,
  mobileArea: 0.35,
};

export function routeRequiresFloatingHeroCopy(route = {}) {
  const topology =
    route.compositionTopology || route.referenceDna?.compositionTopology || {};
  const hero = String(topology.hero || "")
    .trim()
    .toLowerCase();
  const relation = String(topology.mediaRelation || "")
    .trim()
    .toLowerCase();
  const geometry = String(
    route.heroGeometry?.mode ||
      route.heroGeometry ||
      route.referenceDna?.heroGeometry?.mode ||
      "",
  )
    .trim()
    .toLowerCase();
  // A reference that explicitly frames its copy keeps that frame.
  if (/\b(?:bordered|framed|boxed)\s+(?:card|panel)\b/u.test(geometry))
    return false;
  if (NON_FLOATING_TOPOLOGIES.has(hero)) return false;
  if (FLOATING_TOPOLOGIES.has(hero)) return true;
  if (
    /copy-over-media|media-leads-copy|coordinated-image-windows/u.test(relation)
  )
    return true;
  if (!geometry) return false;
  if (
    /\b(?:split|side-by-side|utility panel|form panel|text-led|type-led)\b/u.test(
      geometry,
    )
  )
    return false;
  return /\b(?:image|photo|photograph|full-bleed|full bleed|cinematic|overlay)\b/u.test(
    geometry,
  );
}

function percent(value) {
  const number = Number(value);
  return `${Math.round((Number.isFinite(number) ? number : 0) * 100)}%`;
}

/**
 * Returns a fidelity finding when an image-led floating-copy route renders its
 * promise group as a large bordered or opaque card. Compact scrims behind text
 * only, and cards on routes that legitimately frame their copy, pass.
 */
export function heroCardCoverageFinding(
  evidence = {},
  { mobile = false, requiresFloatingCopy = false } = {},
) {
  if (!requiresFloatingCopy) return "";
  const hasBorder = evidence.heroCopyHasBorder === true;
  const hasOpaqueBackground = evidence.heroCopyHasOpaqueBackground === true;
  if (!hasBorder && !hasOpaqueBackground) return "";
  const mobileArea =
    Number(evidence.heroCopyMobileAreaRatio) ||
    Number(evidence.heroCopyAreaRatio);
  const area = mobile ? mobileArea : Number(evidence.heroCopyAreaRatio);
  const height = Number(evidence.heroCopyHeightRatio);
  const width = Number(evidence.heroCopyWidthRatio);
  const large = mobile
    ? area > HERO_CARD_THRESHOLDS.mobileArea
    : area > HERO_CARD_THRESHOLDS.desktopArea ||
      height > HERO_CARD_THRESHOLDS.desktopHeight;
  if (!large) return "";
  return `hero copy is a large bordered card covering ${percent(area)} of the hero area (${percent(width)} width, ${percent(height)} height); the assigned image-led reference floats the headline in the image's negative space. Replace the card with a floating promise group over a compact scrim.`;
}
